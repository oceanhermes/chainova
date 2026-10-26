import { investigate } from '../lib/chain.js';

/**
 * POST /api/investigate
 * Body: { question: string }
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

  const question = body?.question;
  if (typeof question !== 'string' || question.trim().length === 0) {
    return res.status(400).json({ error: 'Field "question" is required' });
  }
  if (question.length > 2000) {
    return res.status(413).json({ error: 'Question too long (max 2000 chars)' });
  }

  try {
    const investigation = await investigate(question);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(investigation);
  } catch (err) {
    return res.status(502).json({ error: `Investigation failed: ${err.message}` });
  }
}
