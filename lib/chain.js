/**
 * Chainova core — QIE mainnet read-only tools + grounded investigations.
 *
 * Plain ESM JavaScript so it runs unchanged in a Vercel serverless function and
 * under `node --test`. Every capability is an allowlisted RPC read; there is no
 * dynamic dispatch, no signing, and no arbitrary fetch.
 */
import { createPublicClient, http, defineChain } from 'viem';

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
 * @param {string} question
 */
export async function investigate(question) {
  const text = String(question ?? '').trim();
  /** @type {Array<{tool: string, args: Record<string,string>, ok: boolean, durationMs: number, error?: string}>} */
  const toolTrace = [];
  /** @type {Finding[]} */
  const findings = [];
  /** @type {Record<string, unknown>} */
  const raw = {};
  /** @type {Array<{label: string, url: string}>} */
  const explorerLinks = [];

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

  return {
    id: `inv_${Date.now().toString(36)}`,
    question: text,
    subject,
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
