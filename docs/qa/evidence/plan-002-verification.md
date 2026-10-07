# Plan 002 Real Wallet & Network State Verification Evidence

## 1. Automated Test Suite (Vitest)
Command: `npm run test`
```text
Test Files  7 passed (7)
     Tests  48 passed (48)
  Duration  1.51s

Passed test suites:
✓ packages/config/test/env.test.ts (2 tests)
✓ packages/core/test/transaction-state-machine.test.ts (3 tests)
✓ packages/config/test/network.test.ts (3 tests)
✓ packages/core/test/asset-normalizer.test.ts (3 tests)
✓ apps/api/test/quote-service.test.ts (8 tests)
✓ apps/api/test/health.test.ts (1 test)
✓ apps/web/test/wallet-adapter.test.ts (28 tests)
  - MockWalletAdapter (Development Isolation & Gating)
    ✓ initializes in DISCONNECTED state with isMock true
    ✓ enforces mock wallet gating: requires both development runtime and explicit flag=true
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
    ✓ MEDIUM 3: falls back to wallet_addEthereumChain on 4902 and completes explicit secondary switch
    ✓ MEDIUM 3: handles user rejection on the secondary switch following network addition
    ✓ MEDIUM 6: restricts switchChain to active testnet and blocks mainnet/unsupported targets before provider call
    ✓ throws user-friendly error when network switch is rejected by user
    ✓ HIGH 2: deduplicates in-flight connection requests and prevents concurrent eth_requestAccounts
    ✓ HIGH 1 Regression: account cleared -> chain event (state stays DISCONNECTED, account stays null)
    ✓ HIGH 1 Regression: account cleared -> account returns (uses validated chainId correctly)
    ✓ HIGH 1 Regression: chain event before account event correctly determines state upon account arrival
    ✓ HIGH 1 Regression: disconnect -> later chain event leaves state DISCONNECTED
    ✓ disposes adapter listeners cleanly
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
✓ built successfully.
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

### 5.2 Network State Handling & Invariants
- **Active Network:** Robinhood Chain Testnet (`chainId: 46630`), centralized in `@robex/config`.
- **Target Switching Guard (MEDIUM 6):** `InjectedWalletAdapter.switchChain` rejects non-testnet targets (such as Robinhood Mainnet `46600` or arbitrary chains) before making any provider requests.
- **Explicit Secondary Switch (MEDIUM 3):** When adding a network via `wallet_addEthereumChain` (on error 4902), the adapter explicitly calls `wallet_switchEthereumChain` following addition to ensure chain selection per EIP-3085.
- **Connected State:** Entered when wallet `chainId === 46630` and an authorized account is present.
- **Wrong Network State:** Entered when wallet is connected to a recognized Robex network other than active testnet (e.g. Robinhood Mainnet `46600`).
- **Unsupported Network State:** Entered when wallet is connected to an unknown chain (e.g. Ethereum Mainnet `1`).
- **DEV MOCK Label Visibility (MEDIUM 5):** When using the mock adapter, the `DEV MOCK` badge and `[DEV MOCK Simulation]` qualifier remain prominently visible across all states (Connected, Wrong Network, Unsupported Network).

### 5.3 Lock/Unlock & Concurrency Safety
- **State Invariant (HIGH 1):** The adapter tracks validated chain state independently of the account and NEVER enters `CONNECTED`, `WRONG_NETWORK`, or `UNSUPPORTED_NETWORK` without an authorized account (`account !== null`).
- **In-flight Connection Guard (HIGH 2):** Connect operations are protected by an in-flight guard (`isConnectingRef`), preventing duplicate concurrent `eth_requestAccounts` requests. Connect CTAs are disabled during the `CONNECTING` state.
- **Adapter Cleanup:** Adapters expose `dispose()` to detach event listeners and clean up subscriptions upon replacement or unmount.

### 5.4 Quote & Identity Invalidation (MEDIUM 2)
- Downstream features (`SwapPage`) immediately clear existing quotes, reset loading states, and cancel in-flight async requests upon any identity, chain, or network state change.

### 5.5 Critical Scope Boundary Enforcement (LOW 2)
- **Zero Balance Reads:** Balance and portfolio displays are deferred to Plan 003 per contract. Placeholders like `Balance: --` and empty position tables are deferred.
- **Zero Real Transaction Execution:** `sendTransaction` throws `DISABLED_IN_PLAN_002` on both adapters.
- **Mock Wallet Production Gating:** Gated via `isMockWalletAllowed(isDev, flag)` requiring both `isDev === true` and `VITE_ENABLE_MOCK_WALLET === 'true'`.

## 6. Responsive Viewport Screenshots & Overflow Measurements

*Note: The screenshot artifacts below were generated using the Dev Mock Wallet to validate responsive layouts, banner presentations, and DOM overflow boundaries across viewports.*

Every viewport was verified at runtime using Playwright DOM measurement (`scrollWidth <= innerWidth`):

| Viewport | State | Resolution | innerWidth | scrollWidth | Overflow |
|---|---|---|---|---|---|
| Desktop Wide | Disconnected | 1440x900 | 1440px | 1440px | **0px** |
| Desktop Narrow | Disconnected | 1024x768 | 1024px | 1024px | **0px** |
| Tablet | Disconnected | 768x1024 | 768px | 768px | **0px** |
| Mobile | Disconnected | 375x812 | 375px | 375px | **0px** |
| Desktop Wide | Connected (DEV MOCK) | 1440x900 | 1440px | 1440px | **0px** |
| Desktop Narrow | Connected (DEV MOCK) | 1024x768 | 1024px | 1024px | **0px** |
| Tablet | Connected (DEV MOCK) | 768x1024 | 768px | 768px | **0px** |
| Mobile | Connected (DEV MOCK) | 375x812 | 375px | 375px | **0px** |
| Desktop Wide | Wrong Network (46600) | 1440x900 | 1440px | 1440px | **0px** |
| Desktop Narrow | Wrong Network (46600) | 1024x768 | 1024px | 1024px | **0px** |
| Tablet | Wrong Network (46600) | 768x1024 | 768px | 768px | **0px** |
| Mobile | Wrong Network (46600) | 375x812 | 375px | 375px | **0px** |
| Desktop Wide | Unsupported Network (1) | 1440x900 | 1440px | 1440px | **0px** |
| Desktop Narrow | Unsupported Network (1) | 1024x768 | 1024px | 1024px | **0px** |
| Tablet | Unsupported Network (1) | 768x1024 | 768px | 768px | **0px** |
| Mobile | Unsupported Network (1) | 375x812 | 375px | 375px | **0px** |

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
- `docs/qa/evidence/desktop-narrow-unsupported-network.png`
- `docs/qa/evidence/tablet-unsupported-network.png`
- `docs/qa/evidence/mobile-unsupported-network.png`
- `docs/qa/evidence/swap-feature-desktop.png`
- `docs/qa/evidence/swap-feature-mobile.png`
