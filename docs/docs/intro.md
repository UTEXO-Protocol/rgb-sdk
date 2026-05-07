---
slug: /
---

# UTEXO RGB SDK Documentation

`@utexo/rgb-sdk` is a Node.js TypeScript SDK for RGB wallet operations and UTEXO protocol flows.

It wraps `rgb-lib` capabilities (wallet creation, UTXO management, RGB transfer lifecycle) and adds higher-level flows for:

- on-chain bridge operations
- Lightning invoice/payment operations
- dual wallet handling (`layer1` + `utexo`)
- file and VSS backup/restore

Use this site as the source of truth for:

- how to initialize and run `UTEXOWallet`
- parameter expectations for each method
- mapping from SDK methods to underlying `rgb-lib` behavior
