# QIE behavior notes — verified against mainnet

Live observations from `npm run verify:live` against `rpc1mainnet.qie.digital`
(chainId 1990). These are quirks the tool layer has to compensate for.

## getCode returns "0x" for EOAs

`eth_getCode` on QIE returns the string `"0x"` for an externally owned account rather
than an empty result. viem surfaces this as `undefined`. `getAddressCode` normalizes
both cases back to `"0x"` and reports `isContract: false`, `bytecodeBytes: 0`.

## Unknown transaction hashes throw rather than return null

`eth_getTransactionByHash` for a well-formed but unknown hash raises
`Transaction with hash "0x…" could not be found.` instead of returning `null`.
The tool layer catches this and returns `ok: false` with the message, which the
investigation maps to a `warning` finding — so the UI says "not found", not "error".

## Gas price is 2 gwei flat

Observed `gasPrice: 2000000000n` on mainnet transfers. Useful as a sanity baseline
when reading transactions; not used for any computation.

## rpc2 exists as a fallback

`rpc2mainnet.qie.digital` answered identically during testing. The viem transport
falls back to it automatically when rpc1 fails, so a single unhealthy endpoint does
not take the app down.

## Explorer URL shape

`https://mainnet.qie.digital/tx/<hash>` and `/address/<address>`. Both verified
reachable for real mainnet data.
