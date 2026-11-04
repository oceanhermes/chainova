/**
 * Chainova core — QIE mainnet read-only tools + grounded investigations.
 *
 * Plain ESM JavaScript so it runs unchanged in a Vercel serverless function and
 * under `node --test`. Every capability is an allowlisted RPC read; there is no
 * dynamic dispatch, no signing, and no arbitrary fetch.
 */
import { createPublicClient, http, defineChain } from 'viem';
import { parseAbi, matchSelector } from './abi.js';
import { explain, fallbackSummary } from './explain.js';

/** QIE Mainnet — official network parameters (docs.qie.digital). */
export const qie = defineChain({
  id: 1990,
  name: 'QIE Blockchain Mainnet',
  nativeCurrency: { name: 'QIE', symbol: 'QIE', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc1mainnet.qie.digital/'] },
  },
  blockExplorers: {
    default: { name: 'QIE Explorer', url: 'https://mainnet.qie.digital' },
  },
});

export const EXPLORER = qie.blockExplorers.default.url;

export const qieClient = createPublicClient({
  chain: qie,
  transport: http('https://rpc1mainnet.qie.digital/', {
    // rpc2 takes over automatically if rpc1 stops answering.
    fallback: { source: http('https://rpc2mainnet.qie.digital/') },
  }),
});

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const HASH_FIND_RE = /0x[0-9a-fA-F]{64}/;
const ADDR_FIND_RE = /0x[0-9a-fA-F]{40}/;

/**
 * @typedef {Object} ToolResult
 * @property {string} tool
 * @property {boolean} ok
 * @property {unknown} [data]
 * @property {string} [error]
 * @property {number} durationMs
 */

/** @param {string} tool @param {string} msg @returns {ToolResult} */
function invalid(tool, msg) {
  return { tool, ok: false, error: msg, durationMs: 0 };
}

/**
 * @template T
 * @param {string} tool
 * @param {() => Promise<T>} fn
 * @returns {Promise<ToolResult>}
 */
async function timed(tool, fn) {
  const t0 = Date.now();
  try {
    return { tool, ok: true, data: await fn(), durationMs: Date.now() - t0 };
  } catch (err) {
    return { tool, ok: false, error: /** @type {Error} */ (err).message, durationMs: Date.now() - t0 };
  }
}

/**
 * @typedef {Object} Tool
 * @property {string} name
 * @property {string} description
 * @property {Record<string, {type: 'hash'|'address'|'uint', required: boolean, description: string}>} params
 * @property {(args: Record<string,string>) => Promise<ToolResult>} execute
 */

/** @type {Record<string, Tool>} */
export const toolRegistry = {
  getTransaction: {
    name: 'getTransaction',
    description: 'Fetch a QIE mainnet transaction by hash. Null when unknown/pending.',
    params: { hash: { type: 'hash', required: true, description: '32-byte transaction hash' } },
    async execute(args) {
      const raw = args.hash ?? '';
      if (!HASH_RE.test(raw)) return invalid('getTransaction', 'invalid tx hash');
      const hash = /** @type {`0x${string}`} */ (raw.toLowerCase());
      return timed('getTransaction', async () => {
        const tx = await qieClient.getTransaction({ hash });
        // QIE throws for well-formed-but-unknown hashes instead of returning null.
        return tx ? { ...tx, explorerUrl: `${EXPLORER}/tx/${hash}` } : null;
      });
    },
  },

  getTransactionReceipt: {
    name: 'getTransactionReceipt',
    description: 'Fetch a QIE receipt (status, gasUsed, logs). Null when not yet mined.',
    params: { hash: { type: 'hash', required: true, description: '32-byte transaction hash' } },
    async execute(args) {
      const raw = args.hash ?? '';
      if (!HASH_RE.test(raw)) return invalid('getTransactionReceipt', 'invalid tx hash');
      const hash = /** @type {`0x${string}`} */ (raw.toLowerCase());
      return timed('getTransactionReceipt', async () => {
        const rc = await qieClient.getTransactionReceipt({ hash });
        return rc ? { ...rc, explorerUrl: `${EXPLORER}/tx/${hash}` } : null;
      });
    },
  },

  getNativeBalance: {
    name: 'getNativeBalance',
    description: 'Read the QIE native balance (wei) of an address.',
    params: { address: { type: 'address', required: true, description: '20-byte account address' } },
    async execute(args) {
      const raw = args.address ?? '';
      if (!ADDR_RE.test(raw)) return invalid('getNativeBalance', 'invalid address');
      const address = /** @type {`0x${string}`} */ (raw.toLowerCase());
      return timed('getNativeBalance', async () => {
        const wei = await qieClient.getBalance({ address });
        return { wei: wei.toString() };
      });
    },
  },

  getAddressCode: {
    name: 'getAddressCode',
    description: 'Read deployed bytecode. Empty = EOA (wallet), non-empty = contract.',
    params: { address: { type: 'address', required: true, description: '20-byte contract address' } },
    async execute(args) {
      const raw = args.address ?? '';
      if (!ADDR_RE.test(raw)) return invalid('getAddressCode', 'invalid address');
      const address = /** @type {`0x${string}`} */ (raw.toLowerCase());
      return timed('getAddressCode', async () => {
        // QIE quirk: eth_getCode returns "0x" for EOAs; viem surfaces undefined.
        const code = await qieClient.getCode({ address });
        const bytecode = code && code !== '0x' ? code : '0x';
        return {
          bytecode,
          isContract: bytecode !== '0x',
          bytecodeBytes: (bytecode.length - 2) / 2,
        };
      });
    },
  },

  getTransactionCount: {
    name: 'getTransactionCount',
    description: 'Read the account nonce (outgoing transaction count).',
    params: { address: { type: 'address', required: true, description: '20-byte account address' } },
    async execute(args) {
      const raw = args.address ?? '';
      if (!ADDR_RE.test(raw)) return invalid('getTransactionCount', 'invalid address');
      const address = /** @type {`0x${string}`} */ (raw.toLowerCase());
      return timed('getTransactionCount', async () => {
        const nonce = await qieClient.getTransactionCount({ address });
        return { nonce };
      });
    },
  },

  readContract: {
    name: 'readContract',
    description:
      'Call a read-only (view/pure) function on a deployed QIE contract, using an ABI the caller supplies. Rejects mutating functions.',
    params: {
      address: { type: 'address', required: true, description: '20-byte contract address' },
      abi: { type: 'uint', required: false, description: 'JSON ABI array (or artifact object)' },
      function: { type: 'uint', required: false, description: 'Function name to call' },
      args: { type: 'uint', required: false, description: 'JSON array of call arguments' },
    },
    async execute(args) {
      const raw = args.address ?? '';
      if (!ADDR_RE.test(raw)) return invalid('readContract', 'invalid address');
      const address = /** @type {`0x${string}`} */ (raw.toLowerCase());

      const parsed = parseAbi(args.abi ?? '');
      if (!parsed.ok) return invalid('readContract', parsed.error);

      const fnName = (args.function ?? '').trim();
      if (!fnName) return invalid('readContract', 'missing function name');

      const candidates = parsed.functions.filter((f) => f.name === fnName);
      if (candidates.length === 0) {
        return invalid('readContract', `function "${fnName}" is not in this ABI`);
      }
      const readOnly = candidates.filter((f) => f.type === 'read');
      if (readOnly.length === 0) {
        return invalid('readContract', `"${fnName}" is a mutating function — Chainova never sends transactions`);
      }
      const fn = readOnly[0];

      /** @type {unknown[]} */
      let callArgs = [];
      if (args.args && args.args.trim().length > 0) {
        try {
          const decoded = JSON.parse(args.args);
          if (!Array.isArray(decoded)) return invalid('readContract', 'args must be a JSON array');
          callArgs = decoded;
        } catch (err) {
          return invalid('readContract', `args is not valid JSON: ${/** @type {Error} */ (err).message}`);
        }
      }
      if (callArgs.length !== fn.inputs.length) {
        return invalid(
          'readContract',
          `${fn.signature} needs ${fn.inputs.length} argument(s), received ${callArgs.length}`,
        );
      }

      return timed('readContract', async () => {
        const result = await qieClient.readContract({
          address,
          abi: [fn],
          functionName: fn.name,
          args: callArgs,
        });
        return {
          function: fn.signature,
          selector: fn.selector,
          stateMutability: fn.stateMutability,
          args: callArgs,
          result: jsonSafe(result ?? null),
          explorerUrl: `${EXPLORER}/address/${address}`,
        };
      });
    },
  },
};

/** @param {string} name */
export function getTool(name) {
  return Object.hasOwn(toolRegistry, name) ? toolRegistry[name] : undefined;
}

export function listTools() {
  return Object.keys(toolRegistry);
}

/**
 * Human-readable QIE amount. Sub-1e-9 amounts stay in wei — 18 zero decimals
 * tell a reader nothing.
 * @param {bigint} wei
 */
function formatQie(wei) {
  const whole = wei / 10n ** 18n;
  const frac = (wei % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '');
  if (whole === 0n && wei < 1_000_000_000n) return `${wei} wei`;
  return frac ? `${whole}.${frac} QIE` : `${whole} QIE`;
}

/** @param {string} h */
function shortHash(h) {
  return `${h.slice(0, 10)}…${h.slice(-8)}`;
}

/** @param {Record<string, unknown>} obj */
function jsonSafe(obj) {
  return JSON.parse(JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v)));
}

/**
 * @typedef {Object} Finding
 * @property {'verified'|'hypothesis'|'warning'} kind
 * @property {string} label
 * @property {string} detail
 * @property {string} [source]
 */

/**
 * Run a read-only investigation against QIE mainnet.
 *
 * Findings are split by epistemic status: `verified` comes straight from a tool
 * result, `hypothesis` is an interpretation of that data, `warning` is a blocker.
 *
 * When an `abi` is supplied, a transaction's 4-byte selector is resolved against
 * it so the answer names the function that was called — this is still a read of
 * data the user provided, not a claim that the contract is verified.
 *
 * @param {string} question
 * @param {{abi?: string}} [options]
 */
export async function investigate(question, options = {}) {
  const text = String(question ?? '').trim();
  /** @type {Array<{tool: string, args: Record<string,string>, ok: boolean, durationMs: number, error?: string}>} */
  const toolTrace = [];
  /** @type {Finding[]} */
  const findings = [];
  /** @type {Record<string, unknown>} */
  const raw = {};
  /** @type {Array<{label: string, url: string}>} */
  const explorerLinks = [];

  // A caller-supplied ABI is optional. Invalid ABI never blocks the investigation;
  // it becomes a warning so the user knows why selector decoding is absent.
  /** @type {import('./abi.js').AbiFunction[] | null} */
  let userAbi = null;
  const suppliedAbi = typeof options.abi === 'string' ? options.abi.trim() : '';
  let abiRejected = '';
  if (suppliedAbi.length > 0) {
    const parsedAbi = parseAbi(suppliedAbi);
    if (parsedAbi.ok) {
      userAbi = parsedAbi.functions;
      raw.abi = parsedAbi.counts;
    } else {
      abiRejected = parsedAbi.error;
    }
  }

  /** @param {ToolResult} res @param {Record<string,string>} args */
  const record = (res, args) => {
    toolTrace.push({
      tool: res.tool,
      args,
      ok: res.ok,
      durationMs: res.durationMs,
      ...(res.error ? { error: res.error } : {}),
    });
  };

  const hashMatch = text.match(HASH_FIND_RE);
  const addrMatch = text.match(ADDR_FIND_RE);
  /** @type {{type: 'transaction'|'address'|'unknown', value: string|null}} */
  let subject = { type: 'unknown', value: null };

  if (hashMatch) {
    const hash = hashMatch[0].toLowerCase();
    subject = { type: 'transaction', value: hash };

    const txRes = await toolRegistry.getTransaction.execute({ hash });
    record(txRes, { hash });
    const rcRes = await toolRegistry.getTransactionReceipt.execute({ hash });
    record(rcRes, { hash });

    if (txRes.ok && txRes.data) {
      const tx = /** @type {Record<string, any>} */ (txRes.data);
      raw.transaction = jsonSafe(tx);
      findings.push({
        kind: 'verified',
        label: 'Transaction exists on QIE mainnet',
        detail: `Included in block ${tx.blockNumber}, from ${tx.from}${tx.to ? ` to ${tx.to}` : ' (contract creation)'}.`,
        source: `${EXPLORER}/tx/${hash}`,
      });
      findings.push({
        kind: 'verified',
        label: 'Value transferred',
        detail: `${formatQie(tx.value ?? 0n)} · gas limit ${tx.gas} · gas price ${tx.gasPrice} wei.`,
      });

      // Selector decoding only runs against an ABI the user pasted themselves.
      if (userAbi) {
        const match = matchSelector(String(tx.input ?? ''), userAbi);
        if (match && match.function) {
          findings.push({
            kind: 'verified',
            label: 'Function called (from your ABI)',
            detail: `${match.function.signature} — selector ${match.selector}, ${match.function.stateMutability}. ${match.function.inputs.length} input parameter(s).`,
          });
        } else if (match) {
          findings.push({
            kind: 'warning',
            label: 'Selector not in the supplied ABI',
            detail: `Calldata starts with ${match.selector}, which no function in your ABI produces. The ABI may be incomplete or belong to a different contract.`,
          });
        } else {
          findings.push({
            kind: 'verified',
            label: 'No calldata',
            detail: 'This transaction carries no function selector — it is a plain value transfer.',
          });
        }
      } else if (abiRejected) {
        findings.push({
          kind: 'warning',
          label: 'ABI ignored',
          detail: `${abiRejected}. Selector decoding skipped; the rest of the investigation is unaffected.`,
        });
      }
    } else if (txRes.ok && txRes.data === null) {
      findings.push({
        kind: 'warning',
        label: 'Transaction not found',
        detail: 'The node returned null for this hash — pending, dropped, or from another chain.',
      });
    } else {
      findings.push({
        kind: 'warning',
        label: 'Transaction lookup failed',
        detail: txRes.error ?? 'Unknown RPC error.',
      });
    }

    if (rcRes.ok && rcRes.data) {
      const rc = /** @type {Record<string, any>} */ (rcRes.data);
      raw.receipt = jsonSafe(rc);
      findings.push({
        kind: 'verified',
        label: `Execution ${rc.status === 'success' ? 'succeeded' : 'reverted'}`,
        detail: `Gas used ${rc.gasUsed} · ${Array.isArray(rc.logs) ? rc.logs.length : 0} log(s) emitted.`,
        source: `${EXPLORER}/tx/${hash}`,
      });
    }

    explorerLinks.push({ label: `Tx ${shortHash(hash)}`, url: `${EXPLORER}/tx/${hash}` });
  } else if (addrMatch) {
    const address = addrMatch[0].toLowerCase();
    subject = { type: 'address', value: address };

    const balRes = await toolRegistry.getNativeBalance.execute({ address });
    record(balRes, { address });
    const codeRes = await toolRegistry.getAddressCode.execute({ address });
    record(codeRes, { address });
    const countRes = await toolRegistry.getTransactionCount.execute({ address });
    record(countRes, { address });

    if (balRes.ok && balRes.data) {
      const wei = BigInt(String(/** @type {any} */ (balRes.data).wei));
      raw.balanceWei = wei.toString();
      findings.push({
        kind: 'verified',
        label: 'Native balance',
        detail: `${formatQie(wei)} held by this address.`,
        source: `${EXPLORER}/address/${address}`,
      });
    } else if (!balRes.ok) {
      findings.push({ kind: 'warning', label: 'Balance read failed', detail: balRes.error ?? 'RPC error.' });
    }

    if (codeRes.ok && codeRes.data) {
      const code = /** @type {any} */ (codeRes.data);
      raw.contract = code;
      findings.push({
        kind: 'verified',
        label: code.isContract ? 'This address is a contract' : 'This address is an EOA',
        detail: code.isContract
          ? `Runtime bytecode is ${code.bytecodeBytes} bytes.`
          : 'No bytecode deployed — it is an externally owned account (wallet).',
        source: `${EXPLORER}/address/${address}`,
      });
    }

    if (countRes.ok && countRes.data) {
      const nonce = Number(/** @type {any} */ (countRes.data).nonce);
      raw.nonce = nonce;
      findings.push({
        kind: 'verified',
        label: 'Outgoing transaction count',
        detail: `${nonce} transaction(s) originated from this address.`,
      });
      findings.push({
        kind: 'hypothesis',
        label: 'Activity level',
        detail:
          nonce === 0
            ? 'Never sent a transaction — fresh wallet, contract, or receive-only address.'
            : 'Has sent transactions, so it is an active participant on QIE.',
      });
    }

    explorerLinks.push({ label: `Address ${shortHash(address)}`, url: `${EXPLORER}/address/${address}` });
  } else {
    findings.push({
      kind: 'warning',
      label: 'No transaction hash or address found',
      detail:
        'Chainova answers only from live chain data. Paste a 0x-prefixed 64-char transaction hash or a 40-char address.',
    });
    for (const name of listTools()) {
      findings.push({
        kind: 'hypothesis',
        label: `Available tool: ${name}`,
        detail: toolRegistry[name].description,
      });
    }
  }

  const summary = await explain({ question: text, findings, subject });

  return {
    id: `inv_${Date.now().toString(36)}`,
    question: text,
    subject,
    summary: summary ? summary.summary : fallbackSummary(findings, subject),
    summarySource: summary ? 'model' : 'deterministic',
    ...(summary ? { summaryModel: summary.model, summaryLatencyMs: summary.latencyMs } : {}),
    findings,
    toolTrace,
    raw,
    explorerLinks,
    createdAt: new Date().toISOString(),
  };
}

/** RPC health probe — chain id, latest block, latency. */
export async function health() {
  const t0 = Date.now();
  try {
    const [chainId, blockNumber] = await Promise.all([
      qieClient.getChainId(),
      qieClient.getBlockNumber(),
    ]);
    return {
      ok: chainId === qie.id,
      chain: qie.name,
      chainId,
      blockNumber: blockNumber.toString(),
      latencyMs: Date.now() - t0,
    };
  } catch (err) {
    return {
      ok: false,
      chain: qie.name,
      error: /** @type {Error} */ (err).message,
      latencyMs: Date.now() - t0,
    };
  }
}
