# Chainova — demo script (2–3 min, mainnet data only)

Record at 1280×800, browser zoom 100%. One take, no cuts; the live latency is part
of the pitch.

## 0. Cold open (0:00–0:15)

- Land on the deployed URL with an empty console.
- Point at the status pill: **"QIE live · block 11,4xx,xxx · xxx ms"** — that number
  updates on every load because it is a real `eth_blockNumber` call.
- One line: *"Chainova is a developer copilot for QIE. It cannot write to the chain —
  it can only read it, and it shows its work."*

## 1. Transaction inspection (0:15–1:00)

- Paste a real mainnet hash, hit **Investigate**.
- While the timer runs, say: *"Two RPC calls: the transaction and its receipt."*
- When it lands, read the findings out loud in the tags' own words:
  - **verified** — block, from, to
  - **verified** — value, gas limit, gas price
  - **verified** — status, gas used, log count
- Click **view on explorer ↗** on one finding. The explorer tab opens on the same tx.
  *"That link is the proof. Nothing here is generated prose about the chain — it's the
  node's answer, formatted."*
- Point at the **tool trace**: `2 call(s)`, each with latency in ms.

## 2. Wallet analysis (1:00–1:45)

- Paste an address, investigate. Three tools fire: balance, bytecode, nonce.
- The interesting part is the **hypothesis** card: *"The bytecode and nonce are facts.
  The line 'has sent transactions, so it is an active participant' is my reading of
  that fact — and it's tagged as such. That distinction is the whole product."*
- Contrast: paste an address that is a contract. The label flips to
  **"This address is a contract"** with a bytecode byte count.

## 3. Grounded refusal (1:45–2:15)

- Ask something with no hash and no address: *"what's the price of QIE?"*
- It refuses to invent: **"No transaction hash or address found"**, then lists the five
  tools it does have.
- *"A chatbot would have guessed. This one tells you the shape of its own capability
  instead of making something up."*

## 4. Close (2:15–2:30)

- Scroll to the footer: chainId 1990, Source link.
- *"Five allowlisted read-only tools, no signing, no writes, no arbitrary fetch.
  Deployed on Vercel, source on GitHub, chainId 1990. Chainova."*

## Things to have ready before recording

- Deployed URL loaded once (warm) so the first paint isn't cold.
- Two tabs pre-opened: the app, and `mainnet.qie.digital` for the explorer click.
- One real tx hash and one real address in a scratch note so you're not typing live.
- Do **not** narrate the tool trace numbers as if scripted — read them off the screen.
