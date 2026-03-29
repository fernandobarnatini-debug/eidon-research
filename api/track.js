// Vercel serverless function: POST /api/track
// Receives analytics events from the live site tracking script.
// In production on Vercel, we log events to stdout (queryable via Vercel logs).
// For persistent storage, connect Vercel KV or an external DB.

const VALID_EVENTS = new Set([
  'page_view', 'product_view', 'product_click', 'add_to_cart', 'remove_from_cart',
  'cart_open', 'checkout_start', 'checkout_step', 'checkout_complete', 'checkout_abandon',
  'scroll_depth', 'time_on_page', 'exit_intent', 'search', 'email_signup', 'coupon_applied'
]);

export default function handler(req, res) {
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

  for (const evt of events) {
    if (!evt.vid || !evt.sid || !evt.event || !evt.ts) continue;
    if (!VALID_EVENTS.has(evt.event)) continue;

    // Log to stdout — queryable via `vercel logs`
    console.log(JSON.stringify({
      _type: 'analytics',
      vid: String(evt.vid).slice(0, 64),
      sid: String(evt.sid).slice(0, 64),
      event: evt.event,
      page: String(evt.page || '/').slice(0, 256),
      ts: Number(evt.ts),
      ua: String(evt.ua || '').slice(0, 256),
      ref: String(evt.ref || '').slice(0, 512),
      utm: evt.utm || {},
      data: evt.data || {},
    }));
    accepted++;
  }

  res.json({ ok: true, accepted });
}
