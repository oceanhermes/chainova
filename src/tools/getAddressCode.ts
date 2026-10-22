import type { Tool, ToolResult } from './types';
import { qieClient } from '../qie';
import { validateAddress, invalid, timed } from './helpers';

export const getAddressCode: Tool = {
  name: 'getAddressCode',
  description: 'Read deployed bytecode at an address. Empty/undefined result = EOA (not a contract).',
  params: { address: { type: 'address', required: true, description: '20-byte contract address' } },
  async execute(args: Record<string, string>): Promise<ToolResult> {
    const address = validateAddress(args.address ?? '');
    if (!address) return invalid('getAddressCode', 'invalid address');
    return timed('getAddressCode', async () => {
      // QIE quirk: eth_getCode returns "0x" raw, but viem surfaces it as undefined
      const code = (await qieClient.getCode({
        address: address as `0x${string}`,
      })) as string | undefined;
      const bytecode = code && code !== '0x' ? code : '0x';
      return { bytecode, isContract: bytecode !== '0x', bytecodeBytes: (bytecode.length - 2) / 2 };
    });
  },
};
