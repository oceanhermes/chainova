import type { Tool, ToolResult } from './types';
import { qieClient, qie } from '../qie';
import { validateHash, invalid, timed } from './helpers';

export const getTransaction: Tool = {
  name: 'getTransaction',
  description: 'Fetch a QIE mainnet transaction by hash. Returns null when the tx is unknown/pending.',
  params: { hash: { type: 'hash', required: true, description: '32-byte transaction hash' } },
  async execute(args: Record<string, string>): Promise<ToolResult> {
    const hash = validateHash(args.hash ?? '');
    if (!hash) return invalid('getTransaction', 'invalid tx hash');
    return timed('getTransaction', async () => {
      const data = await qieClient.getTransaction({ hash: hash as `0x${string}` });
      return data ? { ...data, explorerUrl: `${qie.blockExplorers.default.url}/tx/${hash}` } : null;
    });
  },
};
