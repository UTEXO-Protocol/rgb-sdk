# rgb-lib Alignment

`@utexo/rgb-sdk` relies on `rgb-lib` concepts and request/response models through `@utexo/rgb-sdk-core`.

## What is aligned

- Wallet primitives: addresses, balances, unspents, transfer history
- RGB receive/send lifecycle: begin/end PSBT flows and one-shot helpers
- Asset issuance models (NIA as primary public flow in this SDK)
- Backup model semantics (local backup artifacts and VSS-style remote storage)

## Practical mapping

- `generateKeys`, `deriveKeysFromMnemonic`, `deriveKeysFromSeed` mirror `rgb-lib` key workflows.
- `createUtxos*`, `send*`, `blindReceive`, `witnessReceive`, `listTransfers` keep model names and behavior close to `rgb-lib` types.
- `UTEXOWallet` adds UTEXO bridge orchestration (`onchain*`, `lightning*`) while preserving rgb-lib request style for core wallet operations.

## Notes for integrators

- Treat SDK type names in `index.d.ts` as canonical for runtime payload shape.
- Prefer begin/end methods when external signing is required (HSM or hardware signer).
- Run backup after any state mutation to preserve consistency with RGB UTXO state transitions.
