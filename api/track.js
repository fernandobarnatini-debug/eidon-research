// Vercel serverless function: POST /api/track
// Receives analytics events and stores in Vercel KV (Redis)

import { kv } from '@vercel/kv';

const VALID_EVENTS = new Set([
  'page_view', 'product_view', 'product_click', 'add_to_cart', 'remove_from_cart',
  'cart_open', 'checkout_start', 'checkout_step', 'checkout_complete', 'checkout_abandon',
  'scroll_depth', 'time_on_page', 'exit_intent', 'search', 'email_signup', 'coupon_applied'
]);

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const events = Array.isArray(req.body) ? req.body : [req.body];
  let accepted = 0;

  const pipeline = kv.pipeline();

  for (const evt of events) {
    if (!evt.vid || !evt.sid || !evt.event || !evt.ts) continue;
    if (!VALID_EVENTS.has(evt.event)) continue;

    const clean = {
      vid: String(evt.vid).slice(0, 64),
      sid: String(evt.sid).slice(0, 64),
      event: evt.event,
      page: String(evt.page || '/').slice(0, 256),
      ts: Number(evt.ts),
      ua: String(evt.ua || '').slice(0, 256),
      ref: String(evt.ref || '').slice(0, 512),
      utm: evt.utm || {},
      data: evt.data || {},
    };

    // Store in a sorted set keyed by date: analytics:YYYY-MM-DD
    // Score = timestamp for range queries
    const dateKey = new Date(clean.ts).toISOString().split('T')[0];
    pipeline.zadd(`analytics:${dateKey}`, { score: clean.ts, member: JSON.stringify(clean) });

    // Track realtime sessions (expire after 5 min)
    pipeline.hset('realtime:sessions', { [clean.sid]: JSON.stringify({ vid: clean.vid, page: clean.page, lastSeen: Date.now() }) });
    pipeline.expire('realtime:sessions', 300);

    // Track all date keys so we can query them
    pipeline.sadd('analytics:dates', dateKey);

    accepted++;
  }

  if (accepted > 0) {
    await pipeline.exec();
  }

  res.json({ ok: true, accepted });
}
