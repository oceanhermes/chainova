/**
 * Grounded explainer — the only place an LLM is allowed to touch a claim.
 *
 * Contract with the model:
 *   1. It receives ONLY the already-verified findings, never raw chain access.
 *   2. It may restate, connect, and order those facts.
 *   3. It is explicitly forbidden from adding facts, values, hashes, or names
 *      that are not present in the input.
 *
 * If the provider is missing, slow, or the reply fails a grounding check, the
 * caller falls back to deterministic wording. Chainova must never answer from
 * a model when the model is unavailable — it answers from the chain instead.
 */

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_SUMMARY_CHARS = 900;

/** Phrases that signal the model invented chain facts instead of explaining them. */
const SPECULATION_MARKERS = [
  'probably',
  'likely',
  'i think',
  'i believe',
  'might be',
  'could be',
  'possibly',
  'it seems',
  'seems to be',
  'presumably',
];

export function isConfigured() {
  return Boolean(process.env.CHAINOVA_AI_BASE_URL && process.env.CHAINOVA_AI_MODEL);
}

/** @returns {{baseUrl: string, model: string, apiKey: string, timeoutMs: number} | null} */
function config() {
  const baseUrl = process.env.CHAINOVA_AI_BASE_URL?.trim();
  const model = process.env.CHAINOVA_AI_MODEL?.trim();
  if (!baseUrl || !model) return null;
  const timeout = Number(process.env.CHAINOVA_AI_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    model,
    apiKey: process.env.CHAINOVA_AI_API_KEY?.trim() ?? '',
    timeoutMs: Number.isFinite(timeout) && timeout > 500 ? timeout : DEFAULT_TIMEOUT_MS,
  };
}

/**
 * Facts are rendered as a plain list so the model cannot mistake them for
 * instructions (no markdown headings, no "you are" framing, no URLs it could
 * follow). Explorer links are appended separately and never described.
 *
 * @param {import('./chain.js').Finding[]} findings
 * @param {{type: string, value: string|null}} subject
 */
function buildFactsBlock(findings, subject) {
  const lines = findings
    .filter((f) => f.kind !== 'hypothesis')
    .map((f) => `- [${f.kind}] ${f.label}: ${f.detail}`);
  return [
    `Subject type: ${subject.type}`,
    ...(subject.value ? [`Subject value: ${subject.value}`] : []),
    'Facts read from the QIE node (the ONLY facts you may use):',
    ...lines,
  ].join('\n');
}

const SYSTEM_PROMPT = `You explain blockchain investigation results to software developers.

Hard rules:
- Use ONLY the facts listed under "Facts read from the QIE node". Nothing else is known.
- Never invent a value, hash, address, block number, gas number, name, token, project, or entity.
- Never guess intent, identity, or ownership. If the data does not say it, do not say it.
- Do not state or imply that anything is safe, audited, official, verified, or a scam.
- Do not use hedging words like "probably", "likely", "might be", "possibly", "seems".
- If the facts are insufficient to answer the question, say exactly what is missing and what could be looked up next.
- Never write a URL. Links are attached by the application, not by you.

Output: 2 to 4 short sentences of plain prose. No headings, no bullet lists, no code fences, no markdown.`;

/**
 * Ask the model to explain verified findings.
 *
 * Returns null (never throws) when the provider is unconfigured, unreachable,
 * slow, returns an unusable body, or produces output that fails the grounding
 * check. Callers treat null as "use deterministic wording".
 *
 * @param {{question: string, findings: import('./chain.js').Finding[], subject: {type: string, value: string|null}}} input
 * @returns {Promise<{summary: string, model: string, latencyMs: number} | null>}
 */
export async function explain({ question, findings, subject }) {
  const cfg = config();
  if (!cfg) return null;
  if (!Array.isArray(findings) || findings.length === 0) return null;

  const factsBlock = buildFactsBlock(findings, subject);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  const t0 = Date.now();

  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.1,
        max_tokens: 320,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `${factsBlock}\n\nQuestion: ${question}` },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) return null;
    const body = await res.json();
    const raw = body?.choices?.[0]?.message?.content;
    if (typeof raw !== 'string') return null;

    const summary = sanitize(raw, findings);
    if (!summary) return null;

    return { summary, model: cfg.model, latencyMs: Date.now() - t0 };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Strip the shapes a model drifts into (headings, bullets, fences, links) and
 * reject the result if it hedges or invents a hex value we never showed it.
 *
 * @param {string} text
 * @param {import('./chain.js').Finding[]} findings
 */
export function sanitize(text, findings) {
  let out = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^[#>\-*\d.\s]+/gm, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (out.length === 0) return null;
  if (out.length > MAX_SUMMARY_CHARS) out = `${out.slice(0, MAX_SUMMARY_CHARS).trimEnd()}…`;

  const lower = out.toLowerCase();
  if (SPECULATION_MARKERS.some((m) => lower.includes(m))) return null;

  // Every hex literal in the summary must already appear in the verified facts.
  const known = new Set(
    findings
      .map((f) => `${f.label} ${f.detail}`)
      .join(' ')
      .toLowerCase()
      .match(/0x[0-9a-f]+/g) ?? [],
  );
  const claimed = lower.match(/0x[0-9a-f]{4,}/g) ?? [];
  for (const hex of claimed) {
    if (!known.has(hex)) return null;
  }

  return out;
}

/**
 * Deterministic summary used whenever the model is unavailable or fails.
 * @param {import('./chain.js').Finding[]} findings
 * @param {{type: string, value: string|null}} subject
 */
export function fallbackSummary(findings, subject) {
  const verified = findings.filter((f) => f.kind === 'verified');
  const warnings = findings.filter((f) => f.kind === 'warning');
  const noun = subject.type === 'transaction' ? 'transaction' : subject.type === 'address' ? 'address' : 'subject';

  if (verified.length === 0) {
    const first = warnings[0];
    return first
      ? `${first.label}. ${first.detail}`
      : `No verified data was read for this ${noun}.`;
  }

  const head = `${verified.length} fact${verified.length === 1 ? '' : 's'} verified directly from QIE mainnet for this ${noun}.`;
  const body = verified
    .slice(0, 3)
    .map((f) => f.detail)
    .join(' ');
  const tail = warnings.length > 0 ? ` ${warnings.length} check did not complete — see the warnings above.` : '';
  return `${head} ${body}${tail}`;
}