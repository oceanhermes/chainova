import { health } from '../lib/chain.js';

/** GET /api/health — RPC status for the UI pill and uptime monitors. */
export default async function handler(req, res) {
  const result = await health();
  res.setHeader('Cache-Control', 'no-store');
  return res.status(result.ok ? 200 : 503).json(result);
}
