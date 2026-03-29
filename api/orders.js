// Vercel serverless function: GET /api/orders
// Returns order data for the admin dashboard
// Orders are stored via the /api/pay endpoint

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

  // On Vercel, orders aren't stored in a file — they go through Square.
  // For now return empty array. In the future, store orders in KV too.
  // The dashboard still works fully from analytics data.
  res.json([]);
}
