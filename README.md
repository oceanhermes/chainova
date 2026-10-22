# Chainova

AI-powered developer copilot for the QIE Blockchain. Turns natural-language
questions into live on-chain investigations with evidence-backed answers.

- Read-only tool registry (viem, QIE mainnet chainId 1990)
- Next.js + TS + Tailwind (app shell: Phase 2)
- Strict allowlist: getTransaction, getTransactionReceipt, getNativeBalance,
  getAddressCode, getTransactionCount

## Verify live

```bash
npm install
npx tsx scripts/verify-live.ts
```
