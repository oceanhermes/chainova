/**
 * Live verification against QIE mainnet — prints real node output for every tool.
 * Run: npm run verify:live
 */
import { toolRegistry, listTools, health } from '../lib/chain.js';

const RECENT_TX = '0xc8f36a559960dd7a16c3abdfa8edad55fe825c474548a21cce0c05fe0ba98a8d';
const EOA = '0x8a746E18B0a114cbbEb4B94BB356396e5Be17379';
const OTHER = '0xd10cEC49175fAc24D493Df53f1B17ECF71D315eA';

const preview = (v) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? `${x}n` : x))?.slice(0, 180);

const h = await health();
console.log(
  `health      : ${h.ok ? 'OK' : 'FAIL'} · ${h.chain} · chainId ${h.chainId} · block ${h.blockNumber} · ${h.latencyMs}ms`,
);
console.log(`tools       : ${listTools().join(', ')}`);
console.log('--- live tool calls ---');

/** [tool, args, expectOk] */
const cases = [
  ['getTransaction', { hash: RECENT_TX }, true],
  ['getTransactionReceipt', { hash: RECENT_TX }, true],
  ['getNativeBalance', { address: OTHER }, true],
  ['getAddressCode', { address: OTHER }, true],
  ['getTransactionCount', { address: EOA }, true],
  // Negative paths: well-formed but unknown hash, and a malformed address.
  ['getTransaction', { hash: '0x' + 'ab'.repeat(32) }, false],
  ['getNativeBalance', { address: '0xdeadbeef' }, false],
];

let failures = 0;
for (const [name, args, expectOk] of cases) {
  const res = await toolRegistry[name].execute(args);
  const verdict = res.ok === expectOk ? '' : '  <-- UNEXPECTED';
  if (res.ok !== expectOk) failures += 1;
  const body = res.error ?? preview(res.data);
  console.log(
    `[${res.ok ? 'OK ' : 'ERR'}] ${name.padEnd(23)} ${String(res.durationMs).padStart(5)}ms  ${body}${verdict}`,
  );
}

console.log(
  failures === 0
    ? '\nRESULT: all live calls behaved as expected'
    : `\nRESULT: ${failures} unexpected result(s)`,
);
process.exit(failures === 0 ? 0 : 1);
