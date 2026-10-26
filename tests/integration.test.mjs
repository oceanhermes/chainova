/**
 * Integration tests against QIE mainnet. Real network — a failure here means the
 * chain or the RPC endpoint changed, not that a mock drifted.
 *
 * Run: npm test
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { investigate, toolRegistry, listTools, health } from '../lib/chain.js';

const RECENT_TX = '0xc8f36a559960dd7a16c3abdfa8edad55fe825c474548a21cce0c05fe0ba98a8d';
const EOA = '0x8a746E18B0a114cbbEb4B94BB356396e5Be17379';
const ADDR2 = '0xd10cEC49175fAc24D493Df53f1B17ECF71D315eA';

describe('tool registry', () => {
  it('is a strict allowlist of exactly five tools', () => {
    assert.deepEqual(listTools().sort(), [
      'getAddressCode',
      'getNativeBalance',
      'getTransaction',
      'getTransactionCount',
      'getTransactionReceipt',
    ]);
  });

  it('rejects malformed arguments without a network round trip', async () => {
    const cases = [
      ['getTransaction', { hash: 'nope' }],
      ['getTransactionReceipt', { hash: '0x1234' }],
      ['getNativeBalance', { address: '0xdeadbeef' }],
      ['getAddressCode', { address: '' }],
      ['getTransactionCount', { address: '0xzz' }],
    ];
    for (const [name, args] of cases) {
      const res = await toolRegistry[name].execute(args);
      assert.equal(res.ok, false, `${name} should reject ${JSON.stringify(args)}`);
      assert.equal(res.durationMs, 0, `${name} should fail before any I/O`);
    }
  });
});

describe('health', () => {
  it('reports QIE chainId 1990 and a live block', async () => {
    const h = await health();
    assert.equal(h.ok, true);
    assert.equal(h.chainId, 1990);
    assert.ok(Number(h.blockNumber) > 0);
  });
});

describe('investigate → transaction', () => {
  it('proves a real mainnet transaction with verified findings', async () => {
    const inv = await investigate(`what happened in ${RECENT_TX}?`);
    assert.equal(inv.subject.type, 'transaction');
    assert.equal(inv.subject.value, RECENT_TX.toLowerCase());
    assert.equal(inv.toolTrace.length, 2);
    assert.ok(inv.toolTrace.every((t) => t.ok));
    assert.ok(inv.findings.some((f) => f.kind === 'verified'));
    assert.equal(inv.explorerLinks[0].url, `https://mainnet.qie.digital/tx/${RECENT_TX.toLowerCase()}`);
  });

  it('labels an unknown-but-well-formed hash as a warning, not an error', async () => {
    const inv = await investigate(`0x${'ab'.repeat(32)}`);
    assert.equal(inv.subject.type, 'transaction');
    assert.ok(inv.toolTrace.some((t) => !t.ok));
    const w = inv.findings.find((f) => f.kind === 'warning');
    assert.ok(w, 'expected a warning finding');
    assert.match(w.label, /not found|failed/i);
  });
});

describe('investigate → address', () => {
  it('classifies an address as EOA or contract with a nonce', async () => {
    const inv = await investigate(`who is ${EOA}?`);
    assert.equal(inv.subject.type, 'address');
    assert.equal(inv.toolTrace.length, 3);
    const labels = inv.findings.map((f) => f.label).join(' | ');
    assert.match(labels, /contract|EOA/);
    assert.match(labels, /Outgoing transaction count/);
    assert.ok(inv.findings.some((f) => f.kind === 'hypothesis'), 'activity level must be a hypothesis');
  });

  it('runs all three address tools on a second address', async () => {
    const inv = await investigate(`is ${ADDR2} a contract?`);
    assert.equal(inv.toolTrace.length, 3);
    assert.ok(inv.findings.length >= 3);
    assert.ok(inv.explorerLinks[0].url.includes('/address/'));
  });
});

describe('investigate → grounded refusal', () => {
  it('does not invent an answer when no hash or address is present', async () => {
    const inv = await investigate('what is the meaning of life');
    assert.equal(inv.subject.type, 'unknown');
    assert.equal(inv.toolTrace.length, 0);
    assert.equal(inv.findings[0].kind, 'warning');
    assert.match(inv.findings[0].detail, /hash|address/i);
    // It lists its own capabilities instead of hallucinating chain state.
    assert.ok(inv.findings.some((f) => f.label.startsWith('Available tool:')));
  });
});
