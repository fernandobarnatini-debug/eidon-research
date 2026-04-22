// Vercel serverless function: GET /api/order-status?orderNumber=EIDON-XXXXXX
// Returns { orderNumber, status } so the checkout confirmation can poll and
// advance its progress stepper when the admin marks the order PAID / SHIPPED.

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const orderNumber = req.query.orderNumber;
  if (!orderNumber || typeof orderNumber !== 'string') {
    return res.status(400).json({ error: 'Missing orderNumber' });
  }

  try {
    const rows = await kv.lrange('orders', 0, -1);
    for (const raw of rows) {
      const order = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (order && order.orderNumber === orderNumber) {
        return res.json({ orderNumber: order.orderNumber, status: order.status });
      }
    }
  } catch (e) {
    console.error('KV error:', e);
    return res.status(500).json({ error: 'Storage error' });
  }

  return res.status(404).json({ error: 'Order not found' });
}
