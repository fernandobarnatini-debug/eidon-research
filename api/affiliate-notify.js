export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { affiliateCode, orderTotal, commission, orderNumber } = req.body;

  if (!affiliateCode || !orderTotal) {
    return res.status(400).json({ error: 'Missing affiliate data' });
  }

  // Log the affiliate sale (visible in Vercel function logs)
  console.log(`[AFFILIATE SALE] Code: ${affiliateCode} | Order: ${orderNumber} | Total: $${orderTotal} | Commission: $${commission}`);

  // Send notification email via Resend (if API key is configured)
  const RESEND_KEY = process.env.RESEND_API_KEY;
  const NOTIFY_EMAIL = process.env.AFFILIATE_NOTIFY_EMAIL || 'research@eidonresearch.com';

  if (RESEND_KEY) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'EIDON Research <noreply@eidonresearch.com>',
          to: [NOTIFY_EMAIL],
          subject: `Affiliate Sale: ${affiliateCode} earned $${commission} commission`,
          html: `
            <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #0B1426;">Affiliate Sale Notification</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; color: #666;">Affiliate Code:</td><td style="padding: 8px 0; font-weight: bold;">${affiliateCode}</td></tr>
                <tr><td style="padding: 8px 0; color: #666;">Order Number:</td><td style="padding: 8px 0;">${orderNumber}</td></tr>
                <tr><td style="padding: 8px 0; color: #666;">Order Total:</td><td style="padding: 8px 0;">$${orderTotal}</td></tr>
                <tr><td style="padding: 8px 0; color: #666;">Commission (10%):</td><td style="padding: 8px 0; font-weight: bold; color: #D4AF37;">$${commission}</td></tr>
              </table>
              <p style="color: #999; font-size: 12px; margin-top: 20px;">This commission should be paid out to the affiliate during the next payout cycle.</p>
            </div>
          `,
        }),
      });
    } catch (emailErr) {
      console.error('Email notification failed:', emailErr);
    }
  }

  res.json({ success: true, message: 'Affiliate sale recorded' });
}
