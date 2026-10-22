import type { Tool } from './types';
import { getTransaction } from './getTransaction';
import { getTransactionReceipt } from './getTransactionReceipt';
import { getNativeBalance } from './getNativeBalance';
import { getAddressCode } from './getAddressCode';
import { getTransactionCount } from './getTransactionCount';

/**
 * Chainova tool registry — strictly read-only, allowlisted.
 * No sendTransaction, no signing, no shell, no arbitrary fetch.
 */
export const toolRegistry: Record<string, Tool> = {
  getTransaction,
  getTransactionReceipt,
  getNativeBalance,
  getAddressCode,
  getTransactionCount,
};

export function getTool(name: string): Tool | undefined {
  return toolRegistry[name];
}

export function listTools(): string[] {
  return Object.keys(toolRegistry);
}
