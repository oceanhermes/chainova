# Submission answers — QIE Mainnet Hackathon 3.0

Draft text for the submission form. Fill the two bracketed fields after deploy.

## Project name

Chainova

## One-liner

An AI developer copilot for the QIE Blockchain that answers only from live mainnet
RPC data, tagging every claim as verified or hypothesis.

## Track

Developer Infrastructure & Tooling

## What it does

Chainova turns a natural-language question about QIE mainnet into a read-only
investigation and returns an evidence-backed answer.

Paste a transaction hash or an address. Chainova runs an allowlisted set of viem RPC
calls against QIE mainnet (chainId 1990, `rpc1mainnet` with `rpc2mainnet` fallback) and
renders the result as tagged findings:

- **verified** — read straight from the node (block, from/to, value, gas, receipt
  status, balance, bytecode, nonce), each with a link into `mainnet.qie.digital`
- **hypothesis** — an interpretation of that data, explicitly labeled as such
- **warning** — a blocker, e.g. "transaction not found" or "no hash/address in the prompt"

Every answer also shows the full tool trace (tool name, arguments, latency, status), so
a developer can audit exactly what was called.

## Why it matters

Two failure modes dominate blockchain developer tooling today:

1. Explorers show raw fields but do not explain them, so a developer mentally stitches
   `getTransaction` + `getTransactionReceipt` + `getCode` together by hand.
2. LLM assistants answer questions about chain state from memory and hallucinate hashes,
   balances, and contract statuses.

Chainova closes that gap by making the model's answer *a rendering of tool output*
rather than a recollection. When there is nothing to read, it says so and lists its own
capabilities instead of guessing.

## Read-only by construction

The tool registry is a literal object with exactly five entries
(`getTransaction`, `getTransactionReceipt`, `getNativeBalance`, `getAddressCode`,
`getTransactionCount`). There is no plugin system, no dynamic dispatch, and no
`sender`/signing path anywhere in the codebase. The product cannot move funds.

## Mainnet usage

- Chain: QIE Mainnet, chainId `1990`
- RPC: `https://rpc1mainnet.qie.digital/` with `https://rpc2mainnet.qie.digital/` fallback
- All demo data is real mainnet data; `npm run verify:live` prints live node output for
  every tool, and the test suite (8 tests) runs against mainnet, not mocks

## Links

- Live app: [VERCEL_URL]
- Source: https://github.com/oceanhermes/chainova
- Demo video: [VIDEO_URL]

## Contract address field

Chainova is a read-only developer tool and deploys no new smart contract. If the form
requires a value here, the honest entry is the set of mainnet addresses the tool reads
against during the demo:

- example EOA: `0x8a746E18B0a114cbbEb4B94BB356396e5Be17379`
- example address: `0xd10cEC49175fAc24D493Df53f1B17ECF71D315eA`

(An email clarifying this requirement was sent to info@qie.digital — see
`EMAIL_ORGANIZER.md`.)
