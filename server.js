require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static('.'));

const SQUARE_API = 'https://connect.squareup.com';
const ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
const LOCATION_ID = process.env.SQUARE_LOCATION_ID;
const ORDERS_FILE = path.join(__dirname, 'orders.json');

// Load existing orders
function loadOrders() {
  try { return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8')); }
  catch { return []; }
}

// Save order locally
function saveOrder(order) {
  const orders = loadOrders();
  orders.unshift(order);
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

// Process a Square payment
app.post('/api/pay', async (req, res) => {
  const { sourceId, amount, email, name, shipping, coupon, lineItems } = req.body;

  if (!sourceId || !amount) {
    return res.status(400).json({ error: 'Missing sourceId or amount' });
  }

  const amountCents = Math.round(amount * 100);
  const idempotencyKey = crypto.randomUUID();

  // Build note with shipping info
  const shippingNote = shipping
    ? `Ship to: ${name}, ${shipping.address}, ${shipping.city}, ${shipping.state} ${shipping.zip}`
    : '';
  const itemsNote = lineItems
    ? lineItems.map(i => `${i.name} x${i.qty}`).join(', ')
    : '';
  const note = [
    `EIDON Research Order`,
    shippingNote,
    `Email: ${email || 'N/A'}`,
    `Items: ${itemsNote}`,
    coupon ? `Coupon: ${coupon}` : '',
  ].filter(Boolean).join(' | ');

  try {
    const response = await fetch(`${SQUARE_API}/v2/payments`, {
      method: 'POST',
      headers: {
        'Square-Version': '2024-01-18',
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source_id: sourceId,
        idempotency_key: idempotencyKey,
        amount_money: {
          amount: amountCents,
          currency: 'USD',
        },
        location_id: LOCATION_ID,
        buyer_email_address: email || undefined,
        note: note.slice(0, 500), // Square note max 500 chars
        shipping_address: shipping ? {
          address_line_1: shipping.address,
          locality: shipping.city,
          administrative_district_level_1: shipping.state,
          postal_code: shipping.zip,
          country: 'US',
          first_name: shipping.firstName,
          last_name: shipping.lastName,
        } : undefined,
        statement_description_identifier: 'EIDON',
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Square API error:', JSON.stringify(data, null, 2));
      const errMsg = data.errors?.[0]?.detail || 'Payment failed';
      return res.status(response.status).json({ error: errMsg });
    }

    const payment = data.payment;
    const orderNumber = 'EIDON-' + payment.id.slice(-8).toUpperCase();

    // Save order locally
    saveOrder({
      orderNumber,
      paymentId: payment.id,
      date: new Date().toISOString(),
      amount: payment.amount_money.amount / 100,
      status: payment.status,
      email: email || '',
      name: name || '',
      shipping: shipping || {},
      coupon: coupon || null,
      items: lineItems || [],
    });

    console.log(`✅ Order ${orderNumber} — $${(payment.amount_money.amount / 100).toFixed(2)} — ${name}`);

    res.json({
      success: true,
      orderNumber,
      paymentId: payment.id,
      amount: payment.amount_money.amount / 100,
      status: payment.status,
    });
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Server error processing payment' });
  }
});

// View all orders (admin)
app.get('/api/orders', (req, res) => {
  res.json(loadOrders());
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

PRODUCTS:
1. Retatrutide 5mg — $60 (SKU: RT5)
   Triple-receptor GLP-1/GIP/Glucagon research compound. The most advanced weight management peptide available. Targets three receptors simultaneously for superior fat loss, appetite regulation, and lean mass preservation in research settings. MOST POPULAR product.

2. CJC-1295 + Ipamorelin 10mg — $60 (SKU: CP10)
   Synergistic growth hormone secretagogue stack. Promotes deep restorative sleep, accelerated recovery, anti-aging properties, and lean muscle development in research models.

3. GHK-Cu 100mg — $50 (SKU: CU100)
   Copper peptide for tissue regeneration research. Promotes collagen synthesis, skin tightening, hair follicle stimulation, and accelerated wound healing. One of the most researched regenerative peptides.

4. Melanotan 2 10mg — $45 (SKU: MT2)
   Melanocortin receptor agonist. Stimulates melanogenesis for enhanced pigmentation without UV exposure. Additional research applications include appetite regulation.

5. BAC Water 3ml — $20 (SKU: WA3)
   USP-grade bacteriostatic water with 0.9% benzyl alcohol. Required for reconstitution of all lyophilized peptides.

BUNDLES:
- Summer Cut Stack — $120 (Save $10): Retatrutide + GHK-Cu + BAC Water
- Gym Gains Stack — $75 (Save $5): CJC-1295/IPA + BAC Water
- Summer Shred MAX — $130: Retatrutide + Melanotan 2 + BAC Water
- The Triple — $160 (Save $30): Retatrutide + CJC-1295/IPA + GHK-Cu + BAC Water
- The Everything Stack — $200 (Save $35): ALL 4 peptides + BAC Water — BEST VALUE

SHIPPING:
- FREE shipping on orders $150+
- $8 flat rate shipping under $150
- FREE local pickup — Sacramento/Placer County area
- Orders before 1PM PST ship same day
- Local deliveries typically arrive same day or next day

PAYMENT:
- Credit/debit cards via Square
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
