// Vercel serverless function: POST /api/stock-update
// Admin-only. Set absolute stock count for a single tracked SKU.

import { kv } from '@vercel/kv';

const TRACKED_SKUS = new Set(['RT5', 'CP10', 'CU100', 'MT2']);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }

  const { sku, count } = body;
  if (!TRACKED_SKUS.has(sku)) return res.status(400).json({ error: 'Invalid SKU' });
  const n = Number(count);
  if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'Invalid count' });

  try {
    const floor = Math.floor(n);
    await kv.set(`stock:${sku}`, floor);
    res.json({ success: true, sku, count: floor });
  } catch (e) {
    console.error('Stock update error:', e);
    res.status(500).json({ error: 'Failed to update stock' });
  }
}
