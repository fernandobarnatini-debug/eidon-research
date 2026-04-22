// Vercel serverless function: GET /api/stock
// Returns current stock counts for tracked SKUs. Public — used by the site
// to paint out-of-stock / low-stock states on product cards.

import { kv } from '@vercel/kv';

const TRACKED_SKUS = ['RT5', 'CP10', 'CU100', 'MT2'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=5'); // tiny cache, still near-real-time
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const stock = {};
    for (const sku of TRACKED_SKUS) {
      const v = await kv.get(`stock:${sku}`);
      stock[sku] = v === null || v === undefined ? null : Number(v);
    }
    res.json({ stock });
  } catch (e) {
    console.error('Stock read error:', e);
    res.status(500).json({ error: 'Failed to read stock' });
  }
}
