# Pull Request: feat/001-foundation

## Title: `feat: implement Robex Plan 001 foundation and architecture scaffolding`

### Goal
Establish the technical foundation for the Robex Decentralized Exchange (DEX) on Robinhood Chain Testnet, implementing the workspace structure, shared types/config/core packages, wallet abstraction layer, API service boundary with a functional `Feature -> Service -> Adapter -> Provider` quote call path, responsive navigation shell, and baseline automated test suite.

---

### Scope
- **Monorepo Architecture**: Configured npm workspaces containing `apps/web`, `apps/api`, `packages/types`, `packages/config`, `packages/core`.
- **Centralized Network Config**: Structured Robinhood Chain Testnet (Chain ID `46630`) configuration with safety invariants preventing accidental mainnet activation without explicit approval.
- **Wallet Abstraction**: Created `WalletAdapter` interface, `InjectedWalletAdapter` (wrapping `window.ethereum`), `MockWalletAdapter`, and `WalletProvider` / `useWallet()` context. No feature component directly couples to MetaMask APIs.
- **Architecture Call Path**: Implemented a complete end-to-end path:
  `SwapPage (UI) -> /api/v1/quote -> QuoteService -> ConstantProductSimulationAdapter -> MockRpcLiquidityProvider`.
- **Pre-Review Hardening**:
  - Removed all fake financial balances (using `--` shell placeholders).
  - Removed silent fake quote fallback (explicit error callouts when API is unreachable).
  - Removed fake transaction generation (`MockWalletAdapter.sendTransaction()` explicitly throws `NOT_IMPLEMENTED`).
  - Disabled Swap transaction trigger in Plan 001 shell.
  - Renamed adapter to `ConstantProductSimulationAdapter` and source type to `SIMULATED_FOUNDATION` (no misleading external protocol claims).
- **Asset Normalization Foundation**: Normalization logic for ERC20, Native, and Stock Tokens (`stockMultiplier`, confidence levels, financial USD formatting).
- **Transaction State Machine**: Deterministic state transitions from `IDLE` to `SUCCESS` with invariant preventing direct jump from `AWAITING_WALLET` to `SUCCESS`.
- **Frontend Navigation Shell**: Header, Desktop Nav, Mobile Bottom Nav, Error Boundary, and 5 shell views: `Home`, `Swap`, `Pool`, `Earn`, `Portfolio`.
- **Design Tokens & System**: Implemented clean, high-trust financial theme based on `DESIGN.md` tokens.
- **Verification Baseline**: Configured Vitest test suite, TypeScript composite project build, linting, and Playwright screenshot automation across 4 viewports.

---

### Non-goals
- Executable on-chain swaps (no live smart contracts deployed in Plan 001).
- Liquidity pool creation or staking contracts.
- Production RPC endpoints or private key handling.
- Mainnet activation.
- Real user financial data or fake financial success claims.

---

### Acceptance Criteria
- [x] Runnable frontend shell with 5 distinct navigation areas (Home, Swap, Pool, Earn, Portfolio).
- [x] Runnable backend API with `/health` and `/api/v1/quote` endpoints.
- [x] Centralized network configuration with Robinhood Testnet active.
- [x] Wallet abstraction layer decoupling feature UI from vendor APIs.
- [x] Feature -> Service -> Adapter -> Provider call path verified end-to-end.
- [x] Transaction state machine invariant enforced.
- [x] Secrets excluded from git (using `.env.example`).
- [x] Automated tests passing (20/20 tests across 7 test suites).
- [x] TypeScript typecheck passes across workspace (0 errors).
- [x] Production build passes (`npm run build`).
- [x] Responsive layout verified with screenshot evidence across Desktop Wide, Desktop Narrow, Tablet, Mobile.
- [x] Documentation and ADRs updated (`README.md`, `ADR-001`, `plan-001-verification.md`).

---

### Verification Evidence
- **Automated Tests:** `7/7 files, 20/20 tests passed` (Vitest)
- **TypeScript:** `0 errors` (`npm run typecheck`)
- **Build:** Succeeded (`npm run build`)
- **Lint:** Succeeded (`npm run lint`)
- **Backend Runtime:**
  - `GET /health` -> 200 OK (`Robinhood Chain Testnet`, Chain ID `46630`)
  - `GET /api/v1/quote` -> 200 OK (returns valid quote from `ConstantProductSimulationAdapter` with `SIMULATED_FOUNDATION` source)
- **Frontend Runtime:** `http://localhost:5173` loads navigation, pages, and interactive test wallet.
- **Screenshot Evidence:**
  - Desktop Wide (1440x900): `docs/qa/evidence/desktop-wide.png`
  - Desktop Narrow (1024x768): `docs/qa/evidence/desktop-narrow.png`
  - Tablet (768x1024): `docs/qa/evidence/tablet.png`
  - Mobile (375x812): `docs/qa/evidence/mobile.png`
  - Swap Feature: `docs/qa/evidence/swap-feature-desktop.png` and `docs/qa/evidence/swap-feature-mobile.png`

---

### Known Limitations
- V1 quote calculations currently use simulated liquidity reserves pending live contract deployment on Robinhood Chain Testnet in subsequent plans.
- Injected wallet connection connects to Robinhood Chain Testnet if present, with fallback to Mock Wallet Adapter for local development.

---

### Risk Notes
- None identified for Plan 001. Mainnet activation is protected by code invariants that throw errors if triggered unintentionally.
