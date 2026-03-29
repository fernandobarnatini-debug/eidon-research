// Vercel serverless function: GET /api/analytics/realtime
// Returns active sessions from last 5 minutes

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

  // Get all realtime sessions
  const sessions = await kv.hgetall('realtime:sessions').catch(() => ({})) || {};
  const cutoff = Date.now() - 5 * 60 * 1000;
  const active = [];
  const uniqueVisitors = new Set();

  for (const [sid, raw] of Object.entries(sessions)) {
    try {
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (data.lastSeen > cutoff) {
        active.push({ sid, page: data.page, lastSeen: data.lastSeen });
        uniqueVisitors.add(data.vid);
      }
    } catch {}
  }

  res.json({
    activeSessions: active.length,
    activeVisitors: uniqueVisitors.size,
    sessions: active,
  });
}
