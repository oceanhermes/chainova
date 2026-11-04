/**
 * Tests for the ABI layer, the grounded explainer, and the contract inspector.
 *
 * The ABI/sanitizer tests are pure. The contract tests hit QIE mainnet, matching
 * the rest of this suite: a failure means the chain changed, not a mock.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseAbi, matchSelector } from '../lib/abi.js';
import { sanitize, fallbackSummary, isConfigured } from '../lib/explain.js';
import { inspectContract } from '../lib/contract.js';
import { listTools, toolRegistry } from '../lib/chain.js';

const ERC20_ABI = JSON.stringify([
  { type: 'function', name: 'name', inputs: [], outputs: [{ name: '', type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'transfer', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'event', name: 'Transfer', inputs: [], anonymous: false },
]);

describe('parseAbi', () => {
  it('separates read from write functions and skips events', () => {
    const parsed = parseAbi(ERC20_ABI);
    assert.equal(parsed.ok, true);
    const names = parsed.functions.map((f) => `${f.type}:${f.name}`);
    assert.deepEqual(names, ['read:balanceOf', 'read:name', 'write:transfer']);
    assert.equal(parsed.counts.read, 2);
    assert.equal(parsed.counts.write, 1);
    assert.equal(parsed.counts.events, 1);
  });

  it('computes canonical 4-byte selectors', () => {
    const parsed = parseAbi(ERC20_ABI);
    const balanceOf = parsed.functions.find((f) => f.name === 'balanceOf');
    // Known constant for balanceOf(address).
    assert.equal(balanceOf.selector, '0x70a08231');
  });

  it('accepts a Foundry/Hardhat artifact wrapper', () => {
    const artifact = JSON.stringify({ abi: JSON.parse(ERC20_ABI), bytecode: '0x' });
    const parsed = parseAbi(artifact);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.counts.read, 2);
  });

  it('rejects malformed input with a reason instead of throwing', () => {
    for (const bad of ['', 'not json', '{"abi": 5}', '[]', '[{"type":"event","name":"X"}]']) {
      const parsed = parseAbi(bad);
      assert.equal(parsed.ok, false, `expected rejection for ${JSON.stringify(bad)}`);
      assert.equal(typeof parsed.error, 'string');
    }
  });
});

describe('matchSelector', () => {
  it('resolves a known selector and reports an unknown one', () => {
    const fn = parseAbi(ERC20_ABI).functions;
    const hit = matchSelector(`0x70a08231${'0'.repeat(64)}`, fn);
    assert.equal(hit.function.name, 'balanceOf');

    const miss = matchSelector(`0xdeadbeef${'0'.repeat(64)}`, fn);
    assert.equal(miss.function, null);
    assert.equal(miss.selector, '0xdeadbeef');
  });

  it('returns null for calldata without a selector', () => {
    const fn = parseAbi(ERC20_ABI).functions;
    assert.equal(matchSelector('0x', fn), null);
    assert.equal(matchSelector('0xabcd', fn), null);
  });
});

describe('sanitize (grounding guard)', () => {
  const findings = [
    { kind: 'verified', label: 'Transaction exists', detail: 'Included in block 11348015, from 0x8a746e18b0a114cbbeb4b94bb356396e5be17379.' },
    { kind: 'verified', label: 'Execution succeeded', detail: 'Gas used 21000.' },
  ];

  it('keeps a grounded explanation and strips markdown', () => {
    const ok = sanitize('## Summary\nGas used **21000** for block 11348015.', findings);
    assert.equal(ok, 'Summary Gas used 21000 for block 11348015.');
  });

  it('rejects hedging language', () => {
    assert.equal(sanitize('This probably means the sender is a whale.', findings), null);
    assert.equal(sanitize('It seems to be a payment.', findings), null);
  });

  it('rejects an address the tools never returned', () => {
    assert.equal(sanitize('The sender is 0xdeadbeefdeadbeefdeadbeef.', findings), null);
  });

  it('strips URLs the model tried to write', () => {
    const out = sanitize('See https://evil.example/x for more.', findings);
    assert.equal(out, 'See for more.');
  });
});

describe('fallbackSummary', () => {
  it('summarises verified findings without a model', () => {
    const s = fallbackSummary(
      [{ kind: 'verified', label: 'A', detail: 'Fact one.' }, { kind: 'verified', label: 'B', detail: 'Fact two.' }],
      { type: 'transaction', value: '0xabc' },
    );
    assert.match(s, /2 facts verified/);
    assert.match(s, /Fact one/);
  });

  it('reports a warning when nothing verified', () => {
    const s = fallbackSummary([{ kind: 'warning', label: 'Not found', detail: 'Node returned null.' }], { type: 'unknown', value: null });
    assert.equal(s, 'Not found. Node returned null.');
  });
});

describe('readContract tool (safety)', () => {
  it('is registered and refuses mutating functions before any I/O', async () => {
    assert.ok(listTools().includes('readContract'));
    const res = await toolRegistry.readContract.execute({
      address: '0x8a746E18B0a114cbbEb4B94BB356396e5Be17379',
      abi: ERC20_ABI,
      function: 'transfer',
      args: '[]',
    });
    assert.equal(res.ok, false);
    assert.match(res.error, /mutating|never sends/i);
    assert.equal(res.durationMs, 0);
  });

  it('refuses a function that is absent from the ABI', async () => {
    const res = await toolRegistry.readContract.execute({
      address: '0x8a746E18B0a114cbbEb4B94BB356396e5Be17379',
      abi: ERC20_ABI,
      function: 'rugPull',
    });
    assert.equal(res.ok, false);
    assert.equal(res.durationMs, 0);
  });
});

describe('inspectContract → live QIE mainnet', () => {
  it('confirms bytecode for a real contract and refuses to invent a surface', async () => {
    // QIE mainnet address used elsewhere in this suite.
    const report = await inspectContract('0xd10cEC49175fAc24D493Df53f1B17ECF71D315eA');
    assert.ok(report.toolTrace.length === 3);
    assert.ok(report.findings.some((f) => f.kind === 'verified'));
    assert.ok(
      report.findings.some((f) => /Function surface unknown/.test(f.label)),
      'without an ABI it must say the surface is unknown instead of guessing',
    );
    assert.equal(report.readSurface, null);
  });

  it('lists read functions and keeps write functions non-executable', async () => {
    const report = await inspectContract('0xd10cEC49175fAc24D493Df53f1B17ECF71D315eA', { abi: ERC20_ABI });
    assert.equal(report.readSurface.length, 2);
    assert.equal(report.writeSurface.length, 1);
    assert.equal(report.writeSurface[0].name, 'transfer');
    assert.ok(report.findings.every((f) => f.kind !== 'verified' || !/audited|verified source/i.test(f.detail)));
  });

  it('rejects an invalid address without a network round trip', async () => {
    await assert.rejects(() => inspectContract('0xnothex'), /invalid address/);
  });
});

describe('explainer configuration', () => {
  it('reports itself unconfigured when no provider env is set', () => {
    if (!process.env.CHAINOVA_AI_BASE_URL && !process.env.CHAINOVA_AI_MODEL) {
      assert.equal(isConfigured(), false);
    }
  });
});