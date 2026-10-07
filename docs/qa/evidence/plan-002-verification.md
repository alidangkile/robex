# Plan 002 Real Wallet & Network State Verification Evidence

## 1. Automated Test Suite (Vitest)
Command: `npm run test`
```text
Test Files  7 passed (7)
     Tests  40 passed (40)
  Duration  1.37s

Passed test suites:
✓ packages/core/test/transaction-state-machine.test.ts (3 tests)
✓ packages/core/test/asset-normalizer.test.ts (3 tests)
✓ packages/config/test/env.test.ts (2 tests)
✓ packages/config/test/network.test.ts (3 tests)
✓ apps/api/test/quote-service.test.ts (8 tests)
✓ apps/api/test/health.test.ts (1 test)
✓ apps/web/test/wallet-adapter.test.ts (20 tests)
  - MockWalletAdapter (Development Isolation & Gating)
    ✓ initializes in DISCONNECTED state with isMock true
    ✓ enforces mock wallet gating: strictly disabled in production regardless of flag
    ✓ connects to active testnet from centralized network config
    ✓ transitions to WRONG_NETWORK for known Robex network (Robinhood Mainnet 46600)
    ✓ transitions to UNSUPPORTED_NETWORK for unknown chain (e.g. Ethereum Mainnet 1)
    ✓ emits state invalidation on account change and chain change
    ✓ enforces safety invariant: MockWalletAdapter blocks transaction execution
  - InjectedWalletAdapter (Simulated EIP-1193 Provider Integration & Logic Tests)
    ✓ identifies provider type accurately as METAMASK
    ✓ throws descriptive error if injected provider is missing
    ✓ connects and detects active Robinhood Chain Testnet (46630) -> CONNECTED
    ✓ connects on Robinhood Mainnet (46600) -> WRONG_NETWORK
    ✓ connects on unsupported network (1) -> UNSUPPORTED_NETWORK
    ✓ handles user rejection (error code 4001) safely without leaking stale state
    ✓ handles already pending request (error code -32002) cleanly
    ✓ responds to accountsChanged event: switches account and invalidates state
    ✓ responds to chainChanged event: updates network state and invalidates cache
    ✓ switches chain via wallet_switchEthereumChain
    ✓ falls back to wallet_addEthereumChain when chain is missing (error 4902)
    ✓ throws user-friendly error when network switch is rejected by user
    ✓ enforces safety invariant: InjectedWalletAdapter blocks transaction execution
```
*Note on Evidence Classification: The unit tests above verify standards-conformant EIP-1193 logic using mocked provider interfaces; they constitute simulated integration logic evidence, not real-wallet runtime evidence.*

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
✓ 44 modules transformed.
dist/index.html                   0.90 kB │ gzip:  0.49 kB
dist/assets/index-DOFV7dsE.css    8.75 kB │ gzip:  2.27 kB
dist/assets/index-hi2D4n1K.js   181.54 kB │ gzip: 55.11 kB
✓ built in 8.22s
```

## 4. Lint Verification (ESLint)
Command: `npm run lint`
```text
> robex-monorepo@0.1.0 lint
> eslint packages apps

ESLint checks passed across all packages and apps with 0 errors and 0 warnings.
```

## 5. Wallet & Network State Contract Verification

### 5.1 Real Injected EVM Provider (MetaMask Target Status)
- **REAL METAMASK RUNTIME STATUS: NOT YET VERIFIED IN BUILDER AUTOMATION**
  - **Limitation Explanation:** The current automated environment operates a headless Playwright Chromium browser without an interactive, pre-configured real MetaMask extension (wallet state, private keys, unlock password).
  - Therefore, real MetaMask runtime execution has **not** been performed by the Builder agent, and Acceptance Criterion 1 is not claimed as passed by automation alone.
  - Automated tests serve as **simulated EIP-1193 logic verification** only.
  - Real MetaMask runtime verification must be conducted during **Human Acceptance** or in an interactive browser session with the MetaMask extension.
- **Provider Detection Architecture:** Implemented via `hasProvider()` on `InjectedWalletAdapter`. Displays an explicit "Not Detected" badge in the wallet modal if `window.ethereum` is absent.
- **Explicit User Action:** Connection requires explicit user button interaction; no unsolicited connection prompt is initiated on load.

### 5.2 Network State Handling
- **Active Network:** Robinhood Chain Testnet (`chainId: 46630`), centralized in `@robex/config`.
- **Connected State:** Entered when wallet `chainId === 46630`. Shows shortened address (`0x71C8...0B3B`), provider badge, and Disconnect button.
- **Wrong Network State:** Entered when wallet is connected to a recognized Robex network other than active testnet (e.g. Robinhood Mainnet `46600`). Renders:
  - Header warning badge `[Wrong Net]`
  - Shortened address pill
  - Header `Switch Network` button (desktop/tablet)
  - Prominent `NetworkBanner` alert below header with full network details and `Switch to Robinhood Chain Testnet` CTA
- **Unsupported Network State:** Entered when wallet is connected to an unknown chain (e.g. Ethereum Mainnet `1`). Renders `[Unsupported]` badge and danger `NetworkBanner` with Switch Network CTA.
- **Switch / Add Network Flow:**
  - Invokes `wallet_switchEthereumChain` with `0x${chainId.toString(16)}`.
  - On error code `4902` (chain not found), falls back to `wallet_addEthereumChain` using centralized network config parameters (`chainId`, `chainName`, `rpcUrls`, `nativeCurrency`, `blockExplorerUrls`).
  - Gracefully handles user cancellation (`error.code === 4001`) with clear non-technical message.

### 5.3 State Invalidation Contract
- `WalletAdapter.onInvalidation` listener notifies downstream features on:
  - `account`: when `accountsChanged` fires with a new address. Clears user cache and updates active address immediately.
  - `chain`: when `chainChanged` fires. Re-evaluates network state and invalidates stale quote data.
  - `disconnect`: when wallet is locked or disconnected. Resets state to `DISCONNECTED`.
- `WalletContext` exposes `invalidationVersion` and `lastInvalidationReason`.
- `SwapPage` invalidates quotes immediately upon account/chain changes and blocks quote fetching when on wrong or unsupported networks.

### 5.4 Critical Scope Boundary Enforcement
- **Zero Balance Reads:** Plan 002 performs zero ETH/native or ERC-20 balance reads. All balances display `--`.
- **Zero Real Transaction Execution:**
  - `sendTransaction` is not exposed in `WalletContext`.
  - `MockWalletAdapter.sendTransaction` and `InjectedWalletAdapter.sendTransaction` both throw `DISABLED_IN_PLAN_002: Real transaction execution is strictly disabled in Plan 002`.
- **Mock Wallet Production Gating:**
  - Gated via `isMockWalletAllowed(isDev, flag)`.
  - In production (`isDev === false`), mock wallet is strictly disabled unconditionally, even if `VITE_ENABLE_MOCK_WALLET=true` is set.
  - Labeled `DEV MOCK` and never falls back automatically on real wallet failure.

## 6. Responsive Viewport Screenshots & Overflow Measurements

*Note: The screenshot artifacts below were generated using the Dev Mock Wallet to validate responsive layouts, banner presentations, and DOM overflow boundaries across viewports.*

Every viewport was verified at runtime using Playwright DOM measurement (`scrollWidth <= innerWidth`):

| Viewport | State | Resolution | innerWidth | scrollWidth | Overflow |
|---|---|---|---|---|---|
| Desktop Wide | Disconnected | 1440x900 | 1440px | 1440px | 0px |
| Desktop Narrow | Disconnected | 1024x768 | 1024px | 1024px | 0px |
| Tablet | Disconnected | 768x1024 | 768px | 768px | 0px |
| Mobile | Disconnected | 375x812 | 375px | 375px | 0px |
| Desktop Wide | Connected (Mock) | 1440x900 | 1440px | 1440px | 0px |
| Desktop Narrow | Connected (Mock) | 1024x768 | 1024px | 1024px | 0px |
| Tablet | Connected (Mock) | 768x1024 | 768px | 768px | 0px |
| Mobile | Connected (Mock) | 375x812 | 375px | 375px | 0px |
| Desktop Wide | Wrong Network | 1440x900 | 1440px | 1440px | 0px |
| Desktop Narrow | Wrong Network | 1024x768 | 1024px | 1024px | 0px |
| Tablet | Wrong Network | 768x1024 | 768px | 768px | 0px |
| Mobile | Wrong Network | 375x812 | 375px | 375px | 0px |
| Desktop Wide | Unsupported Network | 1440x900 | 1440px | 1440px | 0px |

### Saved Artifacts:
- `docs/qa/evidence/desktop-wide.png`
- `docs/qa/evidence/desktop-narrow.png`
- `docs/qa/evidence/tablet.png`
- `docs/qa/evidence/mobile.png`
- `docs/qa/evidence/desktop-wide-connected.png`
- `docs/qa/evidence/desktop-narrow-connected.png`
- `docs/qa/evidence/tablet-connected.png`
- `docs/qa/evidence/mobile-connected.png`
- `docs/qa/evidence/desktop-wide-wrong-network.png`
- `docs/qa/evidence/desktop-narrow-wrong-network.png`
- `docs/qa/evidence/tablet-wrong-network.png`
- `docs/qa/evidence/mobile-wrong-network.png`
- `docs/qa/evidence/desktop-wide-unsupported-network.png`
- `docs/qa/evidence/swap-feature-desktop.png`
- `docs/qa/evidence/swap-feature-mobile.png`
