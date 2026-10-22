import type { Tool, ToolResult } from './types';
import { qieClient } from '../qie';
import { validateAddress, invalid, timed } from './helpers';

export const getTransactionCount: Tool = {
  name: 'getTransactionCount',
  description: 'Read the account nonce (outgoing transaction count) of an address.',
  params: { address: { type: 'address', required: true, description: '20-byte account address' } },
  async execute(args: Record<string, string>): Promise<ToolResult> {
    const address = validateAddress(args.address ?? '');
    if (!address) return invalid('getTransactionCount', 'invalid address');
    return timed('getTransactionCount', () =>
      qieClient.getTransactionCount({ address: address as `0x${string}` })
    );
  },
};
