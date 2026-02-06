# Unused Interfaces in rgb-model.ts

This document lists interfaces/types from `src/types/rgb-model.ts` that are either:
1. Not used anywhere in the codebase
2. Duplicated in `wallet-model.ts` and only the wallet-model version is used

## Completely Unused Interfaces (Not Used Anywhere)

1. **`RgbTransfer`** (line 143)
   - Defined but never imported or used
   - Note: `wallet-model.ts` has `Transfer` interface which is used instead

2. **`Readable`** (line 1 - import)
   - Imported from 'stream' but never actually used as a type annotation
   - Only imported, never referenced

3. **`Recipient`** (line 41)
   - Defined but only appears in commented code (`// recipientMap: Record<string, Recipient[]>;`)
   - Never actually used as a type

4. **`IssueAssetNIAResponse`** (line 347)
   - Defined but never imported or used anywhere
   - Note: `wallet-model.ts` also has this interface but it's also unused there

## Duplicated Interfaces (Only wallet-model Version is Used)

These interfaces exist in both `rgb-model.ts` and `wallet-model.ts`, but only the `wallet-model.ts` versions are actually used:

5. **`RGBHTTPClientParams`** (line 3)
   - Duplicated in wallet-model.ts
   - Only wallet-model version is used

6. **`RestoreWalletRequestModel`** (line 25)
   - Duplicated in wallet-model.ts
   - Only wallet-model version is used (via `IWalletModel` namespace)

7. **`IssueAssetNiaRequestModel`** (line 47)
   - Duplicated in wallet-model.ts
   - Only wallet-model version is used
   - Note: rgb-model version has different signature: `{ ticker: string; name: string; amounts: number[]; precision: number }`
   - wallet-model version: `{ ticker: string; name: string; amounts: number[]; precision: number }` (same but used from wallet-model)

8. **`TransactionType`** (line 125)
   - Duplicated in wallet-model.ts
   - Only wallet-model version is used

9. **`BlockTime`** (line 128)
   - Duplicated in wallet-model.ts
   - Only wallet-model version is used

10. **`TransferKind`** (line 141)
    - Duplicated in wallet-model.ts (as a type, not interface)
    - Only wallet-model version is used

11. **`TransferStatus`** (line 163)
    - Duplicated in wallet-model.ts
    - Only wallet-model version is used

12. **`Utxo`** (line 168)
    - Duplicated in wallet-model.ts
    - Only wallet-model version is used

13. **`RgbAllocation`** (line 177)
    - Duplicated in wallet-model.ts
    - Only wallet-model version is used

14. **`Balance`** (line 183)
    - Duplicated in wallet-model.ts
    - Only wallet-model version is used

15. **`Media`** (line 292)
    - Duplicated in wallet-model.ts
    - Only wallet-model version is used

16. **`AssetIface`** (line 309 - enum)
    - Duplicated in wallet-model.ts
    - Only wallet-model version is used

17. **`AssetSchema`** (line 315 - enum)
    - Duplicated in wallet-model.ts
    - Only wallet-model version is used

18. **`Assignment`** (line 411)
    - Duplicated in wallet-model.ts
    - Only wallet-model version is used

## Summary

**Total unused interfaces from rgb-model.ts: 18**

- **4 completely unused** (never used anywhere)
- **14 duplicated** (only wallet-model versions are used)

## Recommendation

Consider removing these unused interfaces from `rgb-model.ts` to reduce duplication and potential confusion. The codebase primarily uses `wallet-model.ts` for these types.
