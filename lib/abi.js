/**
 * ABI inspector — build a read-only function surface from a user-supplied ABI.
 *
 * Chainova never fetches a "verified ABI" from a third-party service and never
 * claims a contract is verified, audited, or safe. The only ABI source is the
 * user's own text: paste an ABI, get the read-only calls it exposes.
 *
 * Every function is classified:
 *   read   — stateMutability view/pure, safe to eth_call
 *   write  — mutating; listed so the user sees it, never executable here
 *   other  — payable/nonpayable fallback, constructor, events
 */
import { toFunctionSelector } from 'viem';

const MAX_ABI_ENTRIES = 400;

/** @typedef {{type:'read'|'write'|'other', name:string, signature:string, selector:string, inputs:Array<{name:string,type:string}>, outputs:Array<{name:string,type:string}>, stateMutability:string}} AbiFunction */

/**
 * Parse and validate an ABI. Accepts a JSON array, or an object with an `abi`
 * array (the shape found in Hardhat/Foundry artifacts).
 *
 * @param {unknown} input
 * @returns {{ok: true, functions: AbiFunction[], counts: Record<string, number>} | {ok: false, error: string}}
 */
export function parseAbi(input) {
  let parsed = input;

  if (typeof parsed === 'string') {
    const text = parsed.trim();
    if (text.length === 0) return { ok: false, error: 'ABI is empty' };
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      return { ok: false, error: `ABI is not valid JSON: ${/** @type {Error} */ (err).message}` };
    }
  }

  // Foundry/Hardhat artifact: { abi: [...] }
  if (parsed && !Array.isArray(parsed) && typeof parsed === 'object' && Array.isArray(/** @type {any} */ (parsed).abi)) {
    parsed = /** @type {any} */ (parsed).abi;
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, error: 'ABI must be a JSON array, or an artifact object with an "abi" array' };
  }
  if (parsed.length === 0) return { ok: false, error: 'ABI array is empty' };
  if (parsed.length > MAX_ABI_ENTRIES) {
    return { ok: false, error: `ABI has ${parsed.length} entries (max ${MAX_ABI_ENTRIES})` };
  }

  /** @type {AbiFunction[]} */
  const functions = [];
  let events = 0;
  let ignored = 0;

  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') {
      ignored += 1;
      continue;
    }
    const type = /** @type {any} */ (entry).type;
    if (type === 'event' || type === 'error') {
      events += 1;
      continue;
    }
    if (type !== 'function') {
      ignored += 1;
      continue;
    }

    const name = /** @type {any} */ (entry).name;
    if (typeof name !== 'string' || name.length === 0) {
      ignored += 1;
      continue;
    }

    /** @type {Array<{name:string,type:string}>} */
    const inputs = Array.isArray(/** @type {any} */ (entry).inputs)
      ? /** @type {any} */ (entry).inputs.map((/** @type {any} */ i) => ({
          name: typeof i.name === 'string' ? i.name : '',
          type: String(i.type ?? ''),
        }))
      : [];
    /** @type {Array<{name:string,type:string}>} */
    const outputs = Array.isArray(/** @type {any} */ (entry).outputs)
      ? /** @type {any} */ (entry).outputs.map((/** @type {any} */ o) => ({
          name: typeof o.name === 'string' ? o.name : '',
          type: String(o.type ?? ''),
        }))
      : [];

    const signature = `${name}(${inputs.map((i) => i.type).join(',')})`;
    let selector = '';
    try {
      selector = toFunctionSelector(signature);
    } catch {
      // Unsupported tuple/struct shape — keep the function listed, mark unselectable.
      selector = '';
    }

    const mutability = String(/** @type {any} */ (entry).stateMutability ?? 'nonpayable');
    const kind = mutability === 'view' || mutability === 'pure' ? 'read' : 'write';

    functions.push({ type: kind, name, signature, selector, inputs, outputs, stateMutability: mutability });
  }

  if (functions.length === 0) {
    return { ok: false, error: 'No functions found in this ABI' };
  }

  functions.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'read' ? -1 : 1));

  return {
    ok: true,
    functions,
    counts: {
      total: functions.length,
      read: functions.filter((f) => f.type === 'read').length,
      write: functions.filter((f) => f.type === 'write').length,
      events,
      ignored,
    },
  };
}

const SELECTOR_RE = /^0x[0-9a-fA-F]{8}$/;

/**
 * Resolve the 4-byte selector found in a transaction's `input` against a
 * user-supplied ABI. Returns null when the input is short or unknown.
 *
 * @param {string} input
 * @param {AbiFunction[]} functions
 */
export function matchSelector(input, functions) {
  if (typeof input !== 'string' || !input.startsWith('0x') || input.length < 10) return null;
  const selector = `0x${input.slice(2, 10)}`.toLowerCase();
  if (!SELECTOR_RE.test(selector)) return null;
  const hit = functions.find((f) => f.selector.toLowerCase() === selector);
  return hit ? { selector, function: hit } : { selector, function: null };
}