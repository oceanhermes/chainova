/**
 * Contract inspector — what is deployed at this address, and what can be read.
 *
 * Deliberate boundaries:
 *   - Bytecode comes from `eth_getCode` on QIE mainnet. Nothing else.
 *   - An ABI is NEVER fetched from a source-code service. If the user has one,
 *     they paste it; otherwise the report says the surface is unknown.
 *   - Chainova never says a contract is "verified", "audited", "official", or
 *     "safe". It reports bytecode presence and the user's own ABI.
 */
import { qieClient, EXPLORER, getTool } from './chain.js';
import { parseAbi } from './abi.js';

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

/** 4-byte error/function signatures worth naming without an ABI. */
const WELL_KNOWN = new Map([
  ['0x' + '08c379a0', 'Error(string) — require/revert with a message'],
  ['0x' + '4e487b71', 'Panic(uint256) — assertion or arithmetic failure'],
]);

/**
 * @param {string} address
 * @param {{abi?: string}} [options]
 */
export async function inspectContract(address, options = {}) {
  const addr = String(address ?? '').trim();
  if (!ADDR_RE.test(addr)) throw new Error('invalid address');

  /** @type {import('./chain.js').Finding[]} */
  const findings = [];
  /** @type {Array<{label: string, url: string}>} */
  const explorerLinks = [{ label: `Address ${addr.slice(0, 10)}…${addr.slice(-8)}`, url: `${EXPLORER}/address/${addr}` }];
  /** @type {Record<string, unknown>} */
  const raw = {};

  const codeTool = /** @type {any} */ (getTool('getAddressCode'));
  const balTool = /** @type {any} */ (getTool('getNativeBalance'));
  const nonceTool = /** @type {any} */ (getTool('getTransactionCount'));

  const [codeRes, balRes, nonceRes] = await Promise.all([
    codeTool.execute({ address: addr }),
    balTool.execute({ address: addr }),
    nonceTool.execute({ address: addr }),
  ]);

  /** @type {Array<{tool: string, args: Record<string,string>, ok: boolean, durationMs: number, error?: string}>} */
  const toolTrace = [codeRes, balRes, nonceRes].map((r) => ({
    tool: r.tool,
    args: { address: addr },
    ok: r.ok,
    durationMs: r.durationMs,
    ...(r.error ? { error: r.error } : {}),
  }));

  if (!codeRes.ok) {
    findings.push({ kind: 'warning', label: 'Bytecode read failed', detail: codeRes.error ?? 'RPC error.' });
  } else {
    const code = /** @type {any} */ (codeRes.data);
    raw.bytecodeBytes = code.bytecodeBytes;
    findings.push({
      kind: 'verified',
      label: code.isContract ? 'Bytecode is deployed at this address' : 'No bytecode at this address',
      detail: code.isContract
        ? `Runtime bytecode is ${code.bytecodeBytes} bytes (from eth_getCode). Deployment is confirmed; the code's purpose is not implied.`
        : 'eth_getCode returned empty — this is an externally owned account, not a contract.',
      source: `${EXPLORER}/address/${addr}`,
    });
  }

  if (balRes.ok && balRes.data) {
    const wei = BigInt(String(/** @type {any} */ (balRes.data).wei));
    raw.balanceWei = wei.toString();
    findings.push({
      kind: 'verified',
      label: 'Native balance',
      detail: `${wei} wei held by this address.`,
      source: `${EXPLORER}/address/${addr}`,
    });
  }

  if (nonceRes.ok && nonceRes.data) {
    const nonce = Number(/** @type {any} */ (nonceRes.data).nonce);
    raw.nonce = nonce;
    findings.push({
      kind: 'verified',
      label: 'Outgoing transaction count',
      detail: `${nonce} transaction(s) originated from this address.`,
    });
  }

  const suppliedAbi = typeof options.abi === 'string' ? options.abi.trim() : '';
  /** @type {import('./abi.js').AbiFunction[] | null} */
  let readSurface = null;
  /** @type {import('./abi.js').AbiFunction[] | null} */
  let writeSurface = null;

  if (suppliedAbi.length === 0) {
    findings.push({
      kind: 'hypothesis',
      label: 'Function surface unknown',
      detail:
        'Chainova does not fetch third-party verified source, so the callable functions cannot be named from bytecode alone. Paste an ABI to list them.',
    });
  } else {
    const parsed = parseAbi(suppliedAbi);
    if (!parsed.ok) {
      findings.push({ kind: 'warning', label: 'ABI rejected', detail: parsed.error });
    } else {
      readSurface = parsed.functions.filter((f) => f.type === 'read');
      writeSurface = parsed.functions.filter((f) => f.type === 'write');
      raw.abiCounts = parsed.counts;
      findings.push({
        kind: 'verified',
        label: 'Read-only surface (from your ABI)',
        detail:
          readSurface.length === 0
            ? 'Your ABI declares no view/pure functions, so nothing can be read without sending a transaction.'
            : `${readSurface.length} view/pure function(s) callable: ${readSurface
                .slice(0, 6)
                .map((f) => f.signature)
                .join(', ')}${readSurface.length > 6 ? `, +${readSurface.length - 6} more` : ''}.`,
      });
      findings.push({
        kind: 'hypothesis',
        label: 'State-changing surface (never executed here)',
        detail:
          writeSurface.length === 0
            ? 'Your ABI declares no mutating functions.'
            : `${writeSurface.length} mutating function(s) are listed for context only — Chainova has no signing key and cannot call them.`,
      });
      if (bytecodePresent(codeRes)) {
        findings.push({
          kind: 'hypothesis',
          label: 'ABI vs deployed bytecode',
          detail:
            'A matching selector does not prove this ABI belongs to this deployment. Confirm with the deploying project before trusting a decoded call.',
        });
      }
    }
  }

  return {
    id: `ctr_${Date.now().toString(36)}`,
    address: addr.toLowerCase(),
    findings,
    readSurface,
    writeSurface,
    toolTrace,
    raw,
    explorerLinks,
    knownSelectors: [...WELL_KNOWN.entries()].map(([selector, meaning]) => ({ selector, meaning })),
    createdAt: new Date().toISOString(),
  };
}

/** @param {any} codeRes */
function bytecodePresent(codeRes) {
  return codeRes?.ok && codeRes?.data?.isContract === true;
}

/** Re-exported so tests can assert the RPC target without importing viem. */
export const _internal = { qieClient };