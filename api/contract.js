import { inspectContract } from '../lib/contract.js';

/**
 * POST /api/contract
 * Body: { address: string, abi?: string }
 *
 * Contract inspection without any "verified source" claim: read bytecode straight
 * from the node, then report the read-only surface the user's own ABI describes.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'JSON body required' });
  }

  const address = body.address;
  if (typeof address !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(address.trim())) {
    return res.status(400).json({ error: 'Field "address" must be a 20-byte 0x address' });
  }

  const abi = body.abi;
  if (abi !== undefined && abi !== null && typeof abi !== 'string') {
    return res.status(400).json({ error: 'Field "abi" must be a JSON string' });
  }
  if (typeof abi === 'string' && abi.length > 200_000) {
    return res.status(413).json({ error: 'ABI too large (max 200 KB)' });
  }

  try {
    const report = await inspectContract(address.trim(), { abi: abi ?? undefined });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(report);
  } catch (err) {
    return res.status(502).json({ error: `Contract inspection failed: ${err.message}` });
  }
}