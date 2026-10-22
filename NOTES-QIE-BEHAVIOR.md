# QIE Mainnet — Live Behavior Notes (verified 22 Oct 2026)

## RPC (https://rpc1mainnet.qie.digital/)
- eth_chainId → `0x7c6` (1990) ✓, fast (~80-100ms round trip from this host)
- eth_blockNumber works; blocks move fast (multiple blocks between calls, ~11.35M range)
- eth_getBlockByNumber("latest") OK: gasLimit `0xffffffff`, baseFeePerGas `0x3b9aca00` (1 gwei), difficulty 0
- eth_getTransactionByHash / eth_getTransactionReceipt OK; tx type 0x2 (EIP-1559)
- **QUIRK:** eth_getCode returns raw `"0x"` for EOA, but viem's getCode surfaces it as
  `undefined` → getAddressCode must normalize before length checks (handled in tool).
- Explorer mainnet.qie.digital HTML routes (/, /txs, /blocks) often return **502** (flaky).
  API paths that DO work:
  - `GET /api/v2/transactions` (Accept: application/json) → 50 latest txs, rich fields:
    hash, from/to {hash, is_contract, is_verified...}, value (string decimal wei),
    result: "success", revert_reason, gas_used, type, timestamp, block_number, nonce,
    token_transfers, decoded_input, has_error_in_internal_transactions
  - `GET /api/v2/blocks/{height}`, `GET /api/v2/addresses/{addr}` (coin_balance,
    is_contract, is_verified) — good candidates for `getExplorerMetadata` tool later.
  - Legacy Etherscan-style `/api?module=...&action=...` exists but "Unknown module/action"
    for common combos — don't rely on it.
- Note: explorer `transaction_count` returns null → use RPC getTransactionCount instead.
- Sample live tx for tests: 0xc8f36a55...a8d (block 11348015, EOA→EOA transfer, value 5 wei)
  from 0x8a746E18...379 (nonce 234 at time of test), to 0xd10cEC49...15eA (balance 5 wei)

## Testnet / Faucet
- Testnet chainId **1983**, RPC https://rpc1testnet.qie.digital, explorer https://testnet.qie.digital/
- Faucet https://www.qie.digital/faucet: 2 testnet QIE/day/wallet, POSTs to
  https://admin-api.qie.digital/api/test-token/check-validity then /api/test-token with
  {walletAddress, metadata}. Metadata comes from a Next.js server action + QIE ID
  (id.qie.digital) verification → **cannot be done headless; needs user's QIE wallet
  address + QIE ID.** Hackathon is mainnet-only anyway — faucet is low priority.
