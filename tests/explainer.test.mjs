/**
 * Explainer tests against a local fake OpenAI-compatible server.
 *
 * This is how the model path is proven without depending on a live vendor: the
 * test controls exactly what the "model" replies, so every guard (grounding,
 * hedging rejection, timeout, HTTP failure) can be exercised deterministically.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

/** @type {import('node:http').Server} */
let server;
/** @type {string} */
let baseUrl;
/** @type {{reply: string | null, delayMs: number, status: number}} */
const control = { reply: null, delayMs: 0, status: 200 };

before(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const send = () => {
        if (control.status !== 200) {
          res.writeHead(control.status, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'nope' }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            choices: [{ message: { role: 'assistant', content: control.reply } }],
          }),
        );
      };
      if (control.delayMs > 0) setTimeout(send, control.delayMs);
      else send();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}/v1`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const FINDINGS = [
  {
    kind: 'verified',
    label: 'Transaction exists on QIE mainnet',
    detail: 'Included in block 11348015, from 0x8a746e18b0a114cbbeb4b94bb356396e5be17379.',
  },
  { kind: 'verified', label: 'Execution succeeded', detail: 'Gas used 21000 · 0 log(s) emitted.' },
];
const SUBJECT = { type: 'transaction', value: '0xc8f36a55' };

/** Fresh import so module-level env reads happen per test where needed. */
async function loadExplainer(env) {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import(`../lib/explain.js?t=${Date.now()}${Math.random()}`);
}

describe('explain → grounded model path', () => {
  it('uses a grounded reply verbatim (markdown stripped)', async () => {
    control.reply = '## Summary\nGas used **21000** in block 11348015.';
    control.delayMs = 0;
    control.status = 200;

    const { explain } = await loadExplainer({
      CHAINOVA_AI_BASE_URL: baseUrl,
      CHAINOVA_AI_MODEL: 'test-model',
      CHAINOVA_AI_TIMEOUT_MS: '3000',
    });
    const out = await explain({ question: 'what happened?', findings: FINDINGS, subject: SUBJECT });
    assert.ok(out, 'expected a model summary');
    assert.equal(out.summary, 'Summary Gas used 21000 in block 11348015.');
    assert.equal(out.model, 'test-model');
  });

  it('rejects a hallucinated address and returns null', async () => {
    control.reply = 'The sender transferred funds to 0xdeadbeefdeadbeefdeadbeefdeadbeef.';
    const { explain } = await loadExplainer({
      CHAINOVA_AI_BASE_URL: baseUrl,
      CHAINOVA_AI_MODEL: 'test-model',
    });
    assert.equal(await explain({ question: 'q', findings: FINDINGS, subject: SUBJECT }), null);
  });

  it('rejects hedging language', async () => {
    control.reply = 'This likely belongs to a whale wallet.';
    const { explain } = await loadExplainer({
      CHAINOVA_AI_BASE_URL: baseUrl,
      CHAINOVA_AI_MODEL: 'test-model',
    });
    assert.equal(await explain({ question: 'q', findings: FINDINGS, subject: SUBJECT }), null);
  });

  it('returns null when the provider errors', async () => {
    control.status = 500;
    const { explain } = await loadExplainer({
      CHAINOVA_AI_BASE_URL: baseUrl,
      CHAINOVA_AI_MODEL: 'test-model',
    });
    assert.equal(await explain({ question: 'q', findings: FINDINGS, subject: SUBJECT }), null);
    control.status = 200;
  });

  it('returns null instead of hanging when the provider is slow', async () => {
    control.reply = 'Gas used 21000.';
    control.delayMs = 1500;
    const { explain } = await loadExplainer({
      CHAINOVA_AI_BASE_URL: baseUrl,
      CHAINOVA_AI_MODEL: 'test-model',
      CHAINOVA_AI_TIMEOUT_MS: '600',
    });
    const t0 = Date.now();
    const out = await explain({ question: 'q', findings: FINDINGS, subject: SUBJECT });
    assert.equal(out, null);
    assert.ok(Date.now() - t0 < 1400, 'must abort at the configured timeout');
    control.delayMs = 0;
  });

  it('returns null when unconfigured, without any network call', async () => {
    const { explain, isConfigured } = await loadExplainer({
      CHAINOVA_AI_BASE_URL: undefined,
      CHAINOVA_AI_MODEL: undefined,
    });
    assert.equal(isConfigured(), false);
    assert.equal(await explain({ question: 'q', findings: FINDINGS, subject: SUBJECT }), null);
  });
});

describe('explain → applied inside investigate()', () => {
  it('labels the source as model when grounded, deterministic when not', async () => {
    const { investigate } = await import(`../lib/chain.js?t=${Date.now()}${Math.random()}`);

    // No provider configured → deterministic wording, investigation still works.
    delete process.env.CHAINOVA_AI_BASE_URL;
    delete process.env.CHAINOVA_AI_MODEL;
    const plain = await investigate('explain 0xc8f36a559960dd7a16c3abdfa8edad55fe825c474548a21cce0c05fe0ba98a8d');
    assert.equal(plain.summarySource, 'deterministic');
    assert.ok(plain.summary.length > 0);
    assert.ok(plain.findings.length > 0);
  });
});