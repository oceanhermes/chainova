import type { Tool, ToolResult } from './types';
import { qieClient } from '../qie';
import { validateAddress, invalid, timed } from './helpers';

export const getNativeBalance: Tool = {
  name: 'getNativeBalance',
  description: 'Read the QIE native balance (wei) of an address.',
  params: { address: { type: 'address', required: true, description: '20-byte account address' } },
  async execute(args: Record<string, string>): Promise<ToolResult> {
    const address = validateAddress(args.address ?? '');
    if (!address) return invalid('getNativeBalance', 'invalid address');
    return timed('getNativeBalance', () =>
      qieClient.getBalance({ address: address as `0x${string}` })
    );
  },
};
