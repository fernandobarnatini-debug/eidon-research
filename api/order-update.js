// Vercel serverless function: POST /api/order-update
// Update order status (verify/deny) + send email notification + add notes
// On transition TO VERIFIED: decrement stock (idempotent via stockDeducted flag).
// On transition AWAY from VERIFIED (e.g. DENIED after verify): restock and clear flag.

import { kv } from '@vercel/kv';

const TRACKED_SKUS = new Set(['RT5', 'CP10', 'CU100', 'MT2']);
const BUNDLE_COMPOSITION = {
  'summer-cut': ['RT5', 'CU100'],
  'gym-gains':  ['CP10'],
  'shred-max':  ['RT5', 'MT2'],
  'the-triple': ['RT5', 'CP10', 'CU100'],
  'everything': ['RT5', 'CP10', 'CU100', 'MT2'],
};

function computeStockDeltas(lineItems = []) {
  const deltas = {}; // sku -> total qty across all items
  for (const item of (lineItems || [])) {
    const qty = Number(item?.qty) || 1;
    const sku = item?.sku;
    if (!sku) continue;
    if (BUNDLE_COMPOSITION[sku]) {
      for (const comp of BUNDLE_COMPOSITION[sku]) {
        deltas[comp] = (deltas[comp] || 0) + qty;
      }
    } else if (TRACKED_SKUS.has(sku)) {
      deltas[sku] = (deltas[sku] || 0) + qty;
    }
    // Unknown or untracked SKUs (e.g. WA10 BAC Water) are ignored
  }
  return deltas;
}

async function applyStockDelta(deltas, direction /* -1 decrement, +1 increment */) {
  const pipeline = kv.pipeline();
  for (const [sku, qty] of Object.entries(deltas)) {
    if (direction === -1) pipeline.decrby(`stock:${sku}`, qty);
    else pipeline.incrby(`stock:${sku}`, qty);
  }
  await pipeline.exec();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth
  const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }

  const { orderNumber, status, notes, trackingNumber } = body;
  if (!orderNumber || !status) {
    return res.status(400).json({ error: 'Missing orderNumber or status' });
  }

  if (!['VERIFIED', 'DENIED', 'SHIPPED', 'PENDING_VERIFICATION'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    // Get all orders from KV
    const raw = await kv.lrange('orders', 0, -1);
    const orders = raw.map(item => {
      try { return typeof item === 'string' ? JSON.parse(item) : item; }
      catch { return null; }
    }).filter(Boolean);

    // Find and update the order
    let updatedOrder = null;
    let prevStatus = null;
    const updatedOrders = orders.map(o => {
      if (o.orderNumber === orderNumber) {
        prevStatus = o.status;
        o.status = status;
        if (notes) o.notes = notes;
        if (trackingNumber) o.trackingNumber = trackingNumber;
        o.updatedAt = new Date().toISOString();
        updatedOrder = o;
      }
      return o;
    });

    if (!updatedOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // ====== STOCK DEDUCTION (idempotent) ======
    const deltas = computeStockDeltas(updatedOrder.items);
    if (status === 'VERIFIED' && !updatedOrder.stockDeducted) {
      try {
        await applyStockDelta(deltas, -1);
        updatedOrder.stockDeducted = true;
      } catch (stockErr) {
        console.error('Stock decrement failed:', stockErr);
        // Continue — order status still updates; admin can reconcile via stock panel
      }
    } else if (status !== 'VERIFIED' && prevStatus === 'VERIFIED' && updatedOrder.stockDeducted) {
      // Reversal (e.g. mistaken verify → deny): return units to the pool
      try {
        await applyStockDelta(deltas, +1);
        updatedOrder.stockDeducted = false;
      } catch (stockErr) {
        console.error('Stock restock failed:', stockErr);
      }
    }

    // Rewrite orders list in KV
    await kv.del('orders');
    if (updatedOrders.length > 0) {
      const pipeline = kv.pipeline();
      updatedOrders.forEach(o => pipeline.rpush('orders', JSON.stringify(o)));
      await pipeline.exec();
    }

    // Send email notification to customer
    const RESEND_KEY = process.env.RESEND_API_KEY;
    if (RESEND_KEY && updatedOrder.email) {
      let subject, html;

      if (status === 'VERIFIED') {
        subject = `Order Confirmed — ${orderNumber}`;
        html = `
          <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; background: #f8f9fa; border-radius: 12px;">
            <div style="text-align: center; margin-bottom: 20px;">
              <h1 style="font-size: 20px; color: #0B1426; margin: 0;">EIDON Research</h1>
            </div>
            <div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
              <div style="text-align: center; margin-bottom: 16px;">
                <span style="display: inline-block; background: #dcfce7; color: #16a34a; padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: 600;">Payment Verified</span>
              </div>
              <h2 style="color: #0B1426; font-size: 18px; margin: 0 0 16px;">Your order has been confirmed!</h2>
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <tr><td style="padding: 8px 0; color: #666;">Order Number</td><td style="padding: 8px 0; font-weight: bold; text-align: right;">${orderNumber}</td></tr>
                <tr><td style="padding: 8px 0; color: #666;">Total</td><td style="padding: 8px 0; font-weight: bold; text-align: right;">$${(updatedOrder.amount || 0).toFixed(2)}</td></tr>
                <tr><td style="padding: 8px 0; color: #666;">Items</td><td style="padding: 8px 0; text-align: right;">${(updatedOrder.items || []).map(i => i.name + ' x' + i.qty).join(', ')}</td></tr>
              </table>
              ${trackingNumber ? '<p style="margin-top: 16px; padding: 12px; background: #f0f9ff; border-radius: 6px; font-size: 13px;"><strong>Tracking:</strong> ' + trackingNumber + '</p>' : ''}
              ${notes ? '<p style="margin-top: 12px; font-size: 13px; color: #666;">' + notes + '</p>' : ''}
              <p style="margin-top: 16px; font-size: 14px; color: #0B1426;">Your order will ship same-day. You'll receive tracking info once shipped.</p>
            </div>
            <p style="font-size: 11px; color: #999; text-align: center;">EIDON Research · Sacramento, CA · Products are for research use only.</p>
          </div>`;
      } else if (status === 'DENIED') {
        subject = `Order Update — ${orderNumber}`;
        html = `
          <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; background: #f8f9fa; border-radius: 12px;">
            <div style="text-align: center; margin-bottom: 20px;">
              <h1 style="font-size: 20px; color: #0B1426; margin: 0;">EIDON Research</h1>
            </div>
            <div style="background: white; border-radius: 8px; padding: 24px;">
              <div style="text-align: center; margin-bottom: 16px;">
                <span style="display: inline-block; background: #fef2f2; color: #dc2626; padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: 600;">Payment Issue</span>
              </div>
              <h2 style="color: #0B1426; font-size: 18px; margin: 0 0 12px;">There was an issue with your order</h2>
              <p style="font-size: 14px; color: #333;">We were unable to verify payment for order <strong>${orderNumber}</strong>.</p>
              ${notes ? '<p style="font-size: 14px; color: #333; margin-top: 8px;">' + notes + '</p>' : ''}
              <p style="font-size: 14px; color: #333; margin-top: 12px;">Please contact us at <a href="sms:9162149660" style="color: #D4AF37;">(916) 214-9660</a> to resolve this.</p>
            </div>
            <p style="font-size: 11px; color: #999; text-align: center; margin-top: 16px;">EIDON Research · Sacramento, CA</p>
          </div>`;
      } else if (status === 'SHIPPED') {
        subject = `Order Shipped — ${orderNumber}`;
        html = `
          <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; background: #f8f9fa; border-radius: 12px;">
            <div style="text-align: center; margin-bottom: 20px;">
              <h1 style="font-size: 20px; color: #0B1426; margin: 0;">EIDON Research</h1>
            </div>
            <div style="background: white; border-radius: 8px; padding: 24px;">
              <div style="text-align: center; margin-bottom: 16px;">
                <span style="display: inline-block; background: #eff6ff; color: #2563eb; padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: 600;">Order Shipped</span>
              </div>
              <h2 style="color: #0B1426; font-size: 18px; margin: 0 0 12px;">Your order is on the way!</h2>
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <tr><td style="padding: 8px 0; color: #666;">Order Number</td><td style="padding: 8px 0; font-weight: bold; text-align: right;">${orderNumber}</td></tr>
                ${trackingNumber ? '<tr><td style="padding: 8px 0; color: #666;">Tracking</td><td style="padding: 8px 0; font-weight: bold; text-align: right;">' + trackingNumber + '</td></tr>' : ''}
              </table>
              ${notes ? '<p style="margin-top: 12px; font-size: 13px; color: #666;">' + notes + '</p>' : ''}
            </div>
            <p style="font-size: 11px; color: #999; text-align: center; margin-top: 16px;">EIDON Research · Sacramento, CA · Products are for research use only.</p>
          </div>`;
      }

      if (subject && html) {
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'EIDON Research <noreply@eidonresearch.com>',
              to: [updatedOrder.email],
              subject,
              html,
            }),
          });
        } catch (emailErr) {
          console.error('Email failed:', emailErr);
        }
      }
    }

    res.json({ success: true, order: updatedOrder });
  } catch (e) {
    console.error('Order update error:', e);
    res.status(500).json({ error: 'Failed to update order' });
  }
}
