// Vercel serverless function: GET /api/analytics
// Returns analytics events from Vercel KV for the admin dashboard

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

  const range = req.query.range || '30d';
  const now = Date.now();
  let daysBack = 30;
  if (range === 'today') daysBack = 1;
  else if (range === '7d') daysBack = 7;
  else if (range === '30d') daysBack = 30;
  else if (range === '90d') daysBack = 90;
  else if (range === 'all') daysBack = 365;

  // Generate date keys to query
  const dateKeys = [];
  for (let i = 0; i < daysBack; i++) {
    const d = new Date(now - i * 86400000);
    dateKeys.push(`analytics:${d.toISOString().split('T')[0]}`);
  }

  // Fetch all events from those date keys
  const allEvents = [];
  // Batch in groups of 10 to avoid too many concurrent requests
  for (let i = 0; i < dateKeys.length; i += 10) {
    const batch = dateKeys.slice(i, i + 10);
    const results = await Promise.all(
      batch.map(key => kv.zrange(key, 0, -1).catch(() => []))
    );
    for (const events of results) {
      for (const evt of events) {
        try {
          allEvents.push(typeof evt === 'string' ? JSON.parse(evt) : evt);
        } catch {}
      }
    }
  }

  // Sort by timestamp descending
  allEvents.sort((a, b) => b.ts - a.ts);

  res.json(allEvents);
}
