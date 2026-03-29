// Vercel serverless function: POST /api/order
// Records a manual payment order (Zelle/PayPal) — no payment processing
// Stores order in Vercel KV for admin dashboard visibility

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }

  const { amount, email, name, paymentMethod, shipping, coupon, affiliateCode, lineItems } = body;

  if (!email || !name || !shipping || !lineItems) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const orderNumber = 'EIDON-' + Math.random().toString(36).substring(2, 10).toUpperCase();

  const order = {
    orderNumber,
    date: new Date().toISOString(),
    amount: amount || 0,
    status: 'PENDING_VERIFICATION',
    paymentMethod: paymentMethod || 'unknown',
    email: email || '',
    name: name || '',
    shipping: shipping || {},
    coupon: coupon || null,
    items: lineItems || [],
  };

  // Store in KV
  try {
    await kv.lpush('orders', JSON.stringify(order));
  } catch (e) {
    console.error('KV error:', e);
  }

  console.log(`Order ${orderNumber} — $${(amount || 0).toFixed(2)} — ${paymentMethod} — ${name}`);

  res.json({
    success: true,
    orderNumber,
    amount: amount || 0,
    status: 'PENDING_VERIFICATION',
  });
}
