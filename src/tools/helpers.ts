import type { ToolResult } from './types';

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

export function validateHash(h: string): string | null {
  return HASH_RE.test(h) ? h.toLowerCase() : null;
}
export function validateAddress(a: string): string | null {
  return ADDR_RE.test(a) ? a.toLowerCase() : null;
}
export function invalid(tool: string, msg: string): ToolResult {
  return { tool, ok: false, error: msg, durationMs: 0 };
}
export async function timed<T>(tool: string, fn: () => Promise<T>): Promise<ToolResult<T>> {
  const t0 = Date.now();
  try {
    const data = await fn();
    return { tool, ok: true, data, durationMs: Date.now() - t0 };
  } catch (e) {
    return { tool, ok: false, error: (e as Error).message, durationMs: Date.now() - t0 };
  }
}
