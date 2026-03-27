export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { sourceId, amount, email, name, shipping, coupon, affiliateCode, lineItems } = req.body;
  if (!sourceId || !amount) return res.status(400).json({ error: 'Missing sourceId or amount' });

  const SQUARE_API = 'https://connect.squareup.com';
  const ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
  const LOCATION_ID = process.env.SQUARE_LOCATION_ID;
  const amountCents = Math.round(amount * 100);
  const idempotencyKey = crypto.randomUUID();

  const shippingNote = shipping ? `Ship to: ${name}, ${shipping.address}, ${shipping.city}, ${shipping.state} ${shipping.zip}` : '';
  const itemsNote = lineItems ? lineItems.map(i => `${i.name} x${i.qty}`).join(', ') : '';
  const affiliateNote = affiliateCode ? `AFFILIATE: ${affiliateCode} (10% commission = $${(amount * 0.10).toFixed(2)})` : '';
  const note = [`EIDON Research Order`, shippingNote, `Email: ${email || 'N/A'}`, `Items: ${itemsNote}`, coupon ? `Coupon: ${coupon}` : '', affiliateNote].filter(Boolean).join(' | ');

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
        amount_money: { amount: amountCents, currency: 'USD' },
        location_id: LOCATION_ID,
        buyer_email_address: email || undefined,
        note: note.slice(0, 500),
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
      const errMsg = data.errors?.[0]?.detail || 'Payment failed';
      return res.status(response.status).json({ error: errMsg });
    }

    const payment = data.payment;
    const orderNumber = 'EIDON-' + payment.id.slice(-8).toUpperCase();

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
}
