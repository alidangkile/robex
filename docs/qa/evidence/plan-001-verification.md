# Plan 001 Foundation Verification Evidence (Fix Round 1)

## 1. Automated Test Suite (Vitest)
Command: `npm run test`
```text
Test Files  7 passed (7)
     Tests  27 passed (27)
  Duration  1.61s

Passed test suites:
✓ packages/core/test/transaction-state-machine.test.ts (3 tests)
✓ packages/config/test/env.test.ts (2 tests)
✓ packages/core/test/asset-normalizer.test.ts (3 tests)
✓ packages/config/test/network.test.ts (3 tests)
✓ apps/api/test/quote-service.test.ts (7 tests)
  - returns simulated quote with valid amounts and no fake calldata/gas
  - rejects mainnet chainId with explicit error
  - rejects unsupported chainId
  - rejects negative slippage
  - rejects excessive slippage (> 50%)
  - rejects non-finite slippage
  - handles zero slippage correctly
✓ apps/api/test/health.test.ts (1 test)
✓ apps/web/test/wallet-adapter.test.ts (8 tests)
  - MockWalletAdapter initializes with isMock true and centralized chainId
  - MockWalletAdapter.sendTransaction explicitly throws DISABLED_IN_PLAN_001
  - MockWalletAdapter disconnects and resets state
  - InjectedWalletAdapter initializes with isMock false and centralized chainId
  - InjectedWalletAdapter.sendTransaction explicitly throws DISABLED_IN_PLAN_001
  - InjectedWalletAdapter throws NO_PROVIDER when window.ethereum is missing
```

## 2. Typecheck Verification
Command: `npm run typecheck`
```text
tsc --build --verbose
Projects in this build:
* packages/types/tsconfig.json
* packages/config/tsconfig.json
* packages/core/tsconfig.json
* apps/api/tsconfig.json
* apps/web/tsconfig.json
* tsconfig.json
Build completed successfully with 0 errors.
```

## 3. Production Build Verification
Command: `npm run build`
```text
> @robex/api@0.1.0 build
> tsc

> @robex/web@0.1.0 build
> tsc && vite build
✓ 42 modules transformed.
dist/index.html                   0.88 kB │ gzip:  0.48 kB
dist/assets/index-DR1Ficck.css    5.72 kB │ gzip:  1.74 kB
dist/assets/index-YVcwawOA.js   170.85 kB │ gzip: 52.88 kB
✓ built in 7.92s
```

## 4. Lint Verification (Real Linter - ESLint)
Command: `npm run lint`
```text
> robex-monorepo@0.1.0 lint
> npm run lint --workspaces

> @robex/api@0.1.0 lint
> eslint src test

> @robex/web@0.1.0 lint
> eslint src test

ESLint checks passed across all workspaces with 0 errors and 0 warnings.
```

## 5. Runtime Backend Verification
- **Health Endpoint (`GET http://127.0.0.1:3001/health`):**
```json
{
  "status": "ok",
  "service": "robex-api",
  "uptimeSeconds": 19,
  "timestamp": 1791361647075,
  "network": {
    "chainId": 46630,
    "chainName": "Robinhood Chain Testnet",
    "isTestnet": true
  }
}
```

- **Quote Endpoint (`GET http://127.0.0.1:3001/api/v1/quote?amountIn=1000000000000000000&slippage=0.5`):**
```json
{
  "quote": {
    "id": "sim-quote-1791368940562-b9e3j",
    "source": {
      "id": "simulated-constant-product",
      "name": "Robinhood Testnet Simulated AMM (Foundation)",
      "type": "SIMULATED_FOUNDATION"
    },
    "chainId": 46630,
    "tokenIn": "0x0000000000000000000000000000000000000000",
    "tokenOut": "0x1111111111111111111111111111111111111111",
    "amountIn": "1000000000000000000",
    "expectedAmountOut": "2961474103",
    "minimumAmountOut": "2946666732",
    "priceImpactPercent": 1.28,
    "expiresAt": 1791368970562
  }
}
```
*Note: Omitted fake calldata (`rawCalldata`) and fake gas (`estimatedGas`).*

- **Negative Tests Verified:**
  - `chainId=1` (Mainnet) -> Returns HTTP 400 (`Mainnet quotes are prohibited in Plan 001 foundation`)
  - `chainId=99999` (Unsupported) -> Returns HTTP 400 (`Requested chainId 99999 does not match active network 46630`)
  - `slippage=-1` -> Returns HTTP 400 (`Invalid slippage: must be between 0% and 50%`)
  - `slippage=60` -> Returns HTTP 400 (`Invalid slippage: must be between 0% and 50%`)
  - `slippage=NaN` -> Returns HTTP 400 (`Invalid slippage: must be a finite number`)

## 6. Addressing Codex Review Round 1 Findings

### Finding 1: Home Page Verified Claims (HIGH)
- Updated `HomePage.tsx` to explicitly describe the Plan 001 architecture shell and navigation boundaries.
- Removed all unverified claims of live on-chain protocol data or confirmed balances.

### Finding 2: Mock Wallet Dev Isolation & Fallback Guard (HIGH)
- UI introduces explicit Wallet Modal with separate options: "Browser Wallet (Injected)" and "Dev Mock Wallet".
- UI renders clear badge indicators (`[DEV MOCK]` with amber styling vs `[INJECTED]`).
- Removed automatic silent fallback to mock wallet upon injected wallet failure. Errors are raised cleanly.
- Added `isMock: boolean` property to `WalletAdapter` interface.

### Finding 3: Quote Decimals & Simulation Label (HIGH)
- Formats token decimals accurately in `SwapPage.tsx` using `formatBaseUnits(amount, 6)` for USDC (`2,961.47 USDC` instead of raw `2961474103`).
- Added amber `[SIMULATED]` badge directly alongside the quote output amount.

### Finding 4: Block Real Transaction Execution (HIGH)
- Completely omitted `sendTransaction` from `WalletContext` value and hook interface, preventing application features from exposing or calling `eth_sendTransaction`.
- Both `MockWalletAdapter.sendTransaction()` and `InjectedWalletAdapter.sendTransaction()` explicitly throw `DISABLED_IN_PLAN_001`.
- Verified via unit tests in `apps/web/test/wallet-adapter.test.ts`.

### Finding 5: Omit Fake Calldata & Gas Estimate (MEDIUM)
- Removed `rawCalldata` and `estimatedGas` from `packages/types/src/quote.ts` and `apps/api/src/adapters/constant-product-simulation-adapter.ts`.
- Verified simulated quote output no longer fabricates routing calldata or gas estimates.

### Finding 6: Reject Mainnet & Non-Active Chain Quotes (MEDIUM)
- Added strict chain validation guards in `QuoteService.getQuote()`.
- Rejects mainnet requests (`chainId === 1`) and any chainId differing from active Robinhood Testnet (`46630`).

### Finding 7: Validate Slippage Boundaries (MEDIUM)
- Validates slippage parameter in `QuoteService`: ensures finite number, `0 <= slippage <= 50%`.
- Added automated boundary unit tests in `apps/api/test/quote-service.test.ts`.

### Finding 8: Fix Header Overflow on Mobile/Tablet Connected (MEDIUM)
- Updated `Header.tsx` and `global.css` with responsive breakpoint rules for connected state.
- On screen widths `< 400px`, the raw hex address is hidden while keeping the brand logo, `[DEV MOCK]` badge, and `Disconnect` button accessible without text clipping or horizontal scrolling.
- Re-captured responsive screenshots for all viewports in connected state.

### Finding 9: Real Linter Integration (MEDIUM)
- Replaced stub `echo pass` with genuine ESLint 9 configuration (`eslint.config.mjs`) checking both `apps/api` and `apps/web`.
- `npm run lint` passes with 0 errors and 0 warnings.

### Finding 10: Centralized Network Config in Wallet Adapters (MEDIUM)
- Removed hardcoded `46630` constants in `MockWalletAdapter` and `InjectedWalletAdapter`.
- Both adapters import `getActiveNetworkConfig()` from `@robex/config` dynamically.

## 7. Responsive Viewport Screenshots
Saved artifacts:
- Desktop Wide Disconnected (1440x900): `docs/qa/evidence/desktop-wide.png`
- Desktop Narrow Disconnected (1024x768): `docs/qa/evidence/desktop-narrow.png`
- Tablet Disconnected (768x1024): `docs/qa/evidence/tablet.png`
- Mobile Disconnected (375x812): `docs/qa/evidence/mobile.png`
- Desktop Wide Connected (1440x900): `docs/qa/evidence/desktop-wide-connected.png`
- Tablet Connected (768x1024): `docs/qa/evidence/tablet-connected.png`
- Mobile Connected (375x812): `docs/qa/evidence/mobile-connected.png`
- Swap Feature Desktop (1440x900): `docs/qa/evidence/swap-feature-desktop.png`
- Swap Feature Mobile (375x812): `docs/qa/evidence/swap-feature-mobile.png`
