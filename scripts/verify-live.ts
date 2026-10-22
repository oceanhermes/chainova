import { toolRegistry } from '../src/tools/registry';
import { qieClient } from '../src/qie';

const recentTx = '0xc8f36a559960dd7a16c3abdfa8edad55fe825c474548a21cce0c05fe0ba98a8d';
const eoa = '0x8a746E18B0a114cbbEb4B94BB356396e5Be17379';
const recipient = '0xd10cEC49175fAc24D493Df53f1B17ECF71D315eA';

const j = (o: unknown) =>
  JSON.stringify(o, (_k, v) => (typeof v === 'bigint' ? v.toString() + 'n' : v))?.slice(0, 200);

async function main() {
  console.log('chainId:', await qieClient.getChainId());
  console.log('blockNumber:', await qieClient.getBlockNumber());
  console.log('--- tool registry live test ---');
  const cases: Array<[string, Record<string, string>]> = [
    ['getTransaction', { hash: recentTx }],
    ['getTransactionReceipt', { hash: recentTx }],
    ['getNativeBalance', { address: recipient }],
    ['getAddressCode', { address: recipient }],
    ['getTransactionCount', { address: eoa }],
    ['getTransaction', { hash: '0x' + 'ab'.repeat(32) }],
    ['getNativeBalance', { address: '0xdeadbeef' }],
  ];
  for (const [name, args] of cases) {
    const res = await toolRegistry[name].execute(args);
    console.log(`[${res.ok ? 'OK ' : 'ERR'}] ${name} (${res.durationMs}ms) ${res.error ?? j(res.data)}`);
  }
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
