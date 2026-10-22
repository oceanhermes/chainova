import type { Tool, ToolResult } from './types';
import { qieClient, qie } from '../qie';
import { validateHash, invalid, timed } from './helpers';

export const getTransactionReceipt: Tool = {
  name: 'getTransactionReceipt',
  description: 'Fetch a QIE mainnet transaction receipt (status, gasUsed, logs). Null when not yet mined.',
  params: { hash: { type: 'hash', required: true, description: '32-byte transaction hash' } },
  async execute(args: Record<string, string>): Promise<ToolResult> {
    const hash = validateHash(args.hash ?? '');
    if (!hash) return invalid('getTransactionReceipt', 'invalid tx hash');
    return timed('getTransactionReceipt', async () => {
      const data = await qieClient.getTransactionReceipt({ hash: hash as `0x${string}` });
      return data ? { ...data, explorerUrl: `${qie.blockExplorers.default.url}/tx/${hash}` } : null;
    });
  },
};
