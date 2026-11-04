import { investigate } from '../lib/chain.js';

/**
 * POST /api/investigate
 * Body: { question: string, abi?: string }
 *
 * `abi` is optional. When present it is used only to name the function behind a
 * transaction's 4-byte selector. An invalid ABI degrades to a warning inside the
 * response — it never fails the investigation.
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

  const question = body.question;
  if (typeof question !== 'string' || question.trim().length === 0) {
    return res.status(400).json({ error: 'Field "question" is required' });
  }
  if (question.length > 2000) {
    return res.status(413).json({ error: 'Question too long (max 2000 chars)' });
  }

  const abi = body.abi;
  if (abi !== undefined && abi !== null && typeof abi !== 'string') {
    return res.status(400).json({ error: 'Field "abi" must be a JSON string' });
  }
  if (typeof abi === 'string' && abi.length > 200_000) {
    return res.status(413).json({ error: 'ABI too large (max 200 KB)' });
  }

  try {
    const investigation = await investigate(question, { abi: abi ?? undefined });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(investigation);
  } catch (err) {
    return res.status(502).json({ error: `Investigation failed: ${err.message}` });
  }
}