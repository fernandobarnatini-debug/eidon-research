// Vercel serverless function: GET /api/orders
// Returns all orders from Vercel KV for the admin dashboard

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth
  const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const raw = await kv.lrange('orders', 0, -1);
    const orders = raw.map(item => {
      try { return typeof item === 'string' ? JSON.parse(item) : item; }
      catch { return null; }
    }).filter(Boolean);
    res.json(orders);
  } catch (e) {
    console.error('KV error:', e);
    res.json([]);
  }
}
