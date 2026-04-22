require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const app = express();

// ====== CORS for admin dashboard on different port ======
// Must be FIRST middleware — before json, static, everything
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (origin.startsWith('http://localhost:') || origin.startsWith('https://localhost:'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());
app.use(express.static('.'));

const ORDERS_FILE = path.join(__dirname, 'orders.json');
const ANALYTICS_FILE = path.join(__dirname, 'analytics.json');
const STOCK_FILE = path.join(__dirname, 'stock.json');

// Load existing orders
function loadOrders() {
  try { return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8')); }
  catch { return []; }
}

// ====== STOCK ======
const TRACKED_SKUS = new Set(['RT5', 'CP10', 'CU100', 'MT2']);
const BUNDLE_COMPOSITION = {
  'summer-cut': ['RT5', 'CU100'],
  'gym-gains':  ['CP10'],
  'shred-max':  ['RT5', 'MT2'],
  'the-triple': ['RT5', 'CP10', 'CU100'],
  'everything': ['RT5', 'CP10', 'CU100', 'MT2'],
};
function loadStock() {
  try { return JSON.parse(fs.readFileSync(STOCK_FILE, 'utf8')); }
  catch { return { RT5: 0, CP10: 0, CU100: 0, MT2: 0 }; }
}
function saveStock(s) { fs.writeFileSync(STOCK_FILE, JSON.stringify(s, null, 2)); }
function computeStockDeltas(lineItems) {
  const d = {};
  for (const item of (lineItems || [])) {
    const qty = Number(item?.qty) || 1;
    const sku = item?.sku;
    if (!sku) continue;
    if (BUNDLE_COMPOSITION[sku]) {
      for (const comp of BUNDLE_COMPOSITION[sku]) d[comp] = (d[comp] || 0) + qty;
    } else if (TRACKED_SKUS.has(sku)) {
      d[sku] = (d[sku] || 0) + qty;
    }
  }
  return d;
}

// ====== ANALYTICS ENGINE ======
let analyticsBuffer = [];
let recentSessions = new Map(); // sid → { lastSeen, page, vid }

function loadAnalytics() {
  try { return JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf8')); }
  catch { return []; }
}

function flushAnalytics() {
  if (analyticsBuffer.length === 0) return;
  const existing = loadAnalytics();
  existing.push(...analyticsBuffer);
  // Prune events older than 90 days
  const cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000);
  const pruned = existing.filter(e => e.ts > cutoff);
  fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(pruned, null, 2));
  analyticsBuffer = [];
}

// Flush buffer every 5 seconds
setInterval(flushAnalytics, 5000);
// Flush on shutdown
process.on('SIGINT', () => { flushAnalytics(); process.exit(); });
process.on('SIGTERM', () => { flushAnalytics(); process.exit(); });

// Clean stale sessions every 60s
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [sid, data] of recentSessions) {
    if (data.lastSeen < cutoff) recentSessions.delete(sid);
  }
}, 60000);

// Save order locally
function saveOrder(order) {
  const orders = loadOrders();
  orders.unshift(order);
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

// View all orders (admin — requires token)
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
app.get('/api/orders', (req, res) => {
  const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token || token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json(loadOrders());
});

// ====== MANUAL PAYMENT ORDER (Zelle/PayPal) ======
app.post('/api/order', (req, res) => {
  const { amount, email, name, paymentMethod, shipping, coupon, affiliateCode, lineItems, orderNumber: clientOrderNumber } = req.body;

  if (!email || !name || !shipping || !lineItems) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const isValidCode = typeof clientOrderNumber === 'string' && /^EIDON-[A-Z0-9]{4,10}$/.test(clientOrderNumber);
  const orderNumber = isValidCode
    ? clientOrderNumber
    : 'EIDON-' + crypto.randomUUID().slice(0, 8).toUpperCase();

  saveOrder({
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
  });

  console.log(`📋 Order ${orderNumber} — $${(amount || 0).toFixed(2)} — ${paymentMethod} — ${name}`);

  res.json({
    success: true,
    orderNumber,
    amount: amount || 0,
    status: 'PENDING_VERIFICATION',
  });
});

// ====== ORDER STATUS (public, keyed by orderNumber) ======
app.get('/api/order-status', (req, res) => {
  const orderNumber = req.query.orderNumber;
  if (!orderNumber || typeof orderNumber !== 'string') {
    return res.status(400).json({ error: 'Missing orderNumber' });
  }
  const orders = loadOrders();
  const order = orders.find(o => o.orderNumber === orderNumber);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json({ orderNumber: order.orderNumber, status: order.status });
});

// ====== STOCK (public read) ======
app.get('/api/stock', (req, res) => {
  const stock = loadStock();
  const out = {};
  for (const sku of TRACKED_SKUS) out[sku] = Number(stock[sku] ?? 0);
  res.json({ stock: out });
});

// ====== STOCK UPDATE (admin) ======
app.post('/api/stock-update', (req, res) => {
  const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token || token !== ADMIN_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  const { sku, count } = req.body || {};
  if (!TRACKED_SKUS.has(sku)) return res.status(400).json({ error: 'Invalid SKU' });
  const n = Number(count);
  if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'Invalid count' });
  const stock = loadStock();
  stock[sku] = Math.floor(n);
  saveStock(stock);
  res.json({ success: true, sku, count: Math.floor(n) });
});

// ====== ORDER UPDATE (admin) — decrements stock on VERIFIED, mirrors api/order-update.js ======
app.post('/api/order-update', (req, res) => {
  const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token || token !== ADMIN_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  const { orderNumber, status, notes, trackingNumber } = req.body || {};
  if (!orderNumber || !status) return res.status(400).json({ error: 'Missing orderNumber or status' });
  if (!['VERIFIED', 'DENIED', 'SHIPPED', 'PENDING_VERIFICATION'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const orders = loadOrders();
  const idx = orders.findIndex(o => o.orderNumber === orderNumber);
  if (idx < 0) return res.status(404).json({ error: 'Order not found' });

  const prevStatus = orders[idx].status;
  orders[idx].status = status;
  if (notes) orders[idx].notes = notes;
  if (trackingNumber) orders[idx].trackingNumber = trackingNumber;
  orders[idx].updatedAt = new Date().toISOString();

  // Stock side-effects (idempotent)
  const deltas = computeStockDeltas(orders[idx].items);
  if (status === 'VERIFIED' && !orders[idx].stockDeducted) {
    const stock = loadStock();
    for (const [sku, qty] of Object.entries(deltas)) {
      stock[sku] = Number(stock[sku] ?? 0) - qty;
    }
    saveStock(stock);
    orders[idx].stockDeducted = true;
  } else if (status !== 'VERIFIED' && prevStatus === 'VERIFIED' && orders[idx].stockDeducted) {
    const stock = loadStock();
    for (const [sku, qty] of Object.entries(deltas)) {
      stock[sku] = Number(stock[sku] ?? 0) + qty;
    }
    saveStock(stock);
    orders[idx].stockDeducted = false;
  }

  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
  console.log(`📋 Order ${orderNumber} → ${status}`);
  res.json({ success: true, order: orders[idx] });
});

// ====== ANALYTICS: Receive tracking events ======
const VALID_EVENTS = new Set([
  'page_view', 'product_view', 'product_click', 'add_to_cart', 'remove_from_cart',
  'cart_open', 'checkout_start', 'checkout_step', 'checkout_complete', 'checkout_abandon',
  'scroll_depth', 'time_on_page', 'exit_intent', 'search', 'email_signup', 'coupon_applied'
]);

// Simple rate limiting: IP → { count, resetTime }
const rateLimits = new Map();

app.post('/api/track', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();

  // Rate limit: 100 events/min per IP
  let rl = rateLimits.get(ip);
  if (!rl || now > rl.resetTime) {
    rl = { count: 0, resetTime: now + 60000 };
    rateLimits.set(ip, rl);
  }
  rl.count++;
  if (rl.count > 100) {
    return res.status(429).json({ error: 'Rate limited' });
  }

  const events = Array.isArray(req.body) ? req.body : [req.body];

  for (const evt of events) {
    if (!evt.vid || !evt.sid || !evt.event || !evt.ts) continue;
    if (!VALID_EVENTS.has(evt.event)) continue;

    analyticsBuffer.push({
      vid: String(evt.vid).slice(0, 64),
      sid: String(evt.sid).slice(0, 64),
      event: evt.event,
      page: String(evt.page || '/').slice(0, 256),
      ts: Number(evt.ts),
      ua: String(evt.ua || '').slice(0, 256),
      ref: String(evt.ref || '').slice(0, 512),
      utm: evt.utm || {},
      data: evt.data || {},
    });

    // Update realtime session tracking
    recentSessions.set(evt.sid, {
      lastSeen: now,
      page: evt.page || '/',
      vid: evt.vid,
    });
  }

  res.json({ ok: true });
});

// ====== ANALYTICS: Serve data to admin dashboard ======
app.get('/api/analytics', (req, res) => {
  const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token || token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const range = req.query.range || '30d';
  const now = Date.now();
  let cutoff = 0;
  if (range === 'today') cutoff = now - 24 * 60 * 60 * 1000;
  else if (range === '7d') cutoff = now - 7 * 24 * 60 * 60 * 1000;
  else if (range === '30d') cutoff = now - 30 * 24 * 60 * 60 * 1000;
  else if (range === '90d') cutoff = now - 90 * 24 * 60 * 60 * 1000;
  // 'all' → cutoff stays 0

  const allEvents = [...loadAnalytics(), ...analyticsBuffer];
  const filtered = cutoff > 0 ? allEvents.filter(e => e.ts > cutoff) : allEvents;

  res.json(filtered);
});

// ====== ANALYTICS: Realtime active visitors ======
app.get('/api/analytics/realtime', (req, res) => {
  const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token || token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const cutoff = Date.now() - 5 * 60 * 1000;
  const active = [];
  const uniqueVisitors = new Set();
  for (const [sid, data] of recentSessions) {
    if (data.lastSeen > cutoff) {
      active.push({ sid, page: data.page, lastSeen: data.lastSeen });
      uniqueVisitors.add(data.vid);
    }
  }

  res.json({
    activeSessions: active.length,
    activeVisitors: uniqueVisitors.size,
    sessions: active,
  });
});

// ====== AI CHAT (DeepSeek V3 via OpenRouter) ======
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const CHAT_MODEL = process.env.CHAT_MODEL || 'deepseek/deepseek-chat-v3-0324';

const SYSTEM_PROMPT = `You are Adam, the 24/7 AI support assistant for EIDON Research — a premium research peptide supplier based in the Sacramento, California area.

PERSONALITY: Professional but approachable. Confident and knowledgeable. You speak like a trusted advisor, not a salesman. Keep responses concise (2-4 sentences unless they ask for detail). Use markdown bold for key terms.

CRITICAL RULES:
- NEVER say "inject," "dose," "cycle," "pharmacy," "medication," "drug," or any term implying human use
- ALL products are for RESEARCH AND LABORATORY USE ONLY — not for human consumption
- If anyone asks about human use, dosing for humans, or medical advice, firmly redirect: "Our products are strictly for research purposes. We cannot provide guidance on human use. Please consult a licensed professional for medical questions."
- Must be 18+ to order
- You are NOT a doctor. Never give medical advice.
- If someone needs human support, direct them to email **support@eidonresearch.com** — available Mon–Fri, 9AM–5PM PST.

PRODUCTS:
1. Retatrutide 5mg — $60 (SKU: RT5)
   Triple-receptor GLP-1/GIP/Glucagon research compound. Lyophilized powder. >99% HPLC verified purity.

2. CJC-1295 + Ipamorelin 10mg — $60 (SKU: CP10)
   Growth hormone secretagogue research compound. Dual-peptide lyophilized powder. >99% HPLC verified purity.

3. GHK-Cu 100mg — $50 (SKU: CU100)
   Copper-bound tripeptide research compound. Lyophilized powder. >99% HPLC verified purity.

4. Melanotan 2 10mg — $45 (SKU: MT2)
   Melanocortin receptor agonist research compound. Lyophilized powder. >99% HPLC verified purity.

5. BAC Water 10ml — $20 (SKU: WA3)
   USP-grade bacteriostatic water with 0.9% benzyl alcohol. Required for reconstitution of all lyophilized peptides.

BUNDLES:
- Summer Cut Protocol — $120 (Save $10): Retatrutide + GHK-Cu + BAC Water
- Growth Factor Protocol — $75 (Save $5): CJC-1295/IPA + BAC Water
- Recomp Protocol — $130: Retatrutide + Melanotan 2 + BAC Water
- Tri-Compound Protocol — $160 (Save $30): Retatrutide + CJC-1295/IPA + GHK-Cu + BAC Water
- Complete Research Protocol — $200 (Save $35): ALL 4 peptides + BAC Water — BEST VALUE

SHIPPING:
- FREE shipping on orders $60+
- $8 flat rate shipping under $60
- FREE local pickup — Sacramento/Placer County area
- Orders before 1PM PST ship same day
- Local deliveries typically arrive same day or next day

PAYMENT:
- Zelle (primary method)
- Cryptocurrency (Bitcoin/Ethereum) via Coinbase Commerce — 5% OFF entire order when paying crypto

PURITY & QUALITY:
- All peptides undergo third-party purity testing
- >99% purity guaranteed on all compounds
- Certificates of Analysis available upon request
- Properly sealed, shipped in appropriate conditions

RECONSTITUTION (for research):
Using bacteriostatic water and a sterile syringe, slowly add water into the vial along the glass wall. Gently swirl — never shake. Store reconstituted peptides refrigerated.

RETURNS:
All sales final due to nature of research compounds. Damaged or incorrect products replaced within 48 hours of contact.

LEGAL:
- Products not evaluated by FDA
- Not intended to diagnose, treat, cure, or prevent any disease
- Legal to purchase in US for research purposes
- Buyer assumes responsibility for compliance with local regulations

PEPTIDE SCIENCE KNOWLEDGE:
- Peptides are short chains of amino acids (2-50 amino acids) linked by peptide bonds
- GLP-1 receptor agonists like Retatrutide work by mimicking incretin hormones that regulate glucose metabolism and appetite in research
- GHK-Cu is a naturally occurring tripeptide (Gly-His-Lys) with copper binding that activates tissue remodeling genes
- CJC-1295 is a modified GHRH analog with DAC (Drug Affinity Complex) for extended half-life in research
- Ipamorelin is a selective growth hormone secretagogue that doesn't significantly affect cortisol or prolactin levels
- Melanotan 2 is a synthetic analog of alpha-melanocyte-stimulating hormone (α-MSH)
- Lyophilization (freeze-drying) preserves peptide stability for long-term storage
- Reconstituted peptides should be stored at 2-8°C and used within recommended timeframes
- Peptide purity is typically measured via HPLC (High-Performance Liquid Chromatography) and mass spectrometry

When asked about specific peptide mechanisms, explain the science clearly but always frame it in research context. You're knowledgeable about biochemistry and can discuss receptor binding, signaling pathways, and research applications.

If someone asks something you don't know, say so honestly and suggest they email the team for more specialized questions.

STRICT TOPIC BOUNDARIES:
- You ONLY discuss peptides, EIDON products, shipping, payments, orders, and peptide-related science
- If someone asks about ANYTHING unrelated (politics, sports, coding, math, personal questions, jokes, other products, other companies, general chat), politely redirect: "I'm here specifically to help with EIDON Research products and peptide-related questions. Is there anything I can help you with regarding our peptides, shipping, or orders?"
- Do NOT engage with off-topic conversation even if the user is persistent
- Do NOT answer general knowledge questions, trivia, or anything outside peptides/EIDON
- You are a specialist, not a general assistant`;

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Missing messages array' });
  }

  if (!OPENROUTER_KEY) {
    return res.status(500).json({ error: 'Chat not configured' });
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://eidonresearch.com',
        'X-Title': 'EIDON Research Support',
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages.slice(-20), // Keep last 20 messages for context
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('OpenRouter error:', JSON.stringify(data, null, 2));
      return res.status(500).json({ error: 'AI service error' });
    }

    const reply = data.choices?.[0]?.message?.content || 'Sorry, I couldn\'t generate a response. Please try again.';
    res.json({ reply });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Chat service unavailable' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`EIDON server running on http://localhost:${PORT}`);
});
