# Plan 002 — Real Wallet & Network State

## 1. Goal

Replace Plan 001 foundation-only wallet behavior with verified real wallet and network state on Robinhood Chain Testnet.

Plan 002 proves that Robex can connect to a real external wallet, read the real account and chain, handle wrong-network/account-switch/chain-switch states, and preserve the architecture boundaries required by PRD and ARCHITECTURE.

This plan does **not** execute user transactions.

---

## 2. Why This Plan Exists

Plan 001 created the wallet abstraction and UI shell, but transaction execution remains intentionally disabled.

Before building real Swap, Robex must prove the wallet/network layer with runtime evidence.

Dependency order:

```text
Foundation
  ↓
Real Wallet + Network State   ← Plan 002
  ↓
Real balances / token registry
  ↓
Executable quote + safety
  ↓
Transaction execution
```

---

## 3. Scope

### 3.1 Real injected wallet connection

Support injected EVM wallets through the existing wallet abstraction.

Compatibility target:

- standards-conformant injected EVM wallets through the existing adapter boundary
- MetaMask is the required real-runtime verification target for Plan 002
- Rabby remains a V1 compatibility target; if available during Plan 002, capture additional runtime evidence, but lack of Rabby access does not block Plan 002

Plan 002 must record exactly which real wallet provider(s) were verified. It must not claim Rabby compatibility unless Rabby was actually verified at runtime.

The feature must:

- detect whether an injected provider exists
- request account access only after explicit user action
- read the selected account
- read the current chain ID
- expose wallet state through the internal wallet layer
- show the real connected address in the UI

No feature component may call `window.ethereum` directly.

### 3.2 Network state

Robinhood Chain Testnet is the only active network for Plan 002.

Required behavior:

- if wallet chain = active Robinhood Chain Testnet → `CONNECTED`
- if wallet chain is a known/supported Robex network but is not the active Robinhood Chain Testnet → `WRONG_NETWORK`
- if wallet chain is not supported by Robex → `UNSUPPORTED_NETWORK`
- user can request switch to the active testnet
- if the network is missing and the wallet supports adding a chain, the adapter may offer an explicit add-network flow using centralized network config
- network data must come from centralized configuration

No hard-coded chain ID, RPC URL, explorer URL, or native-currency data inside feature components or wallet adapters.

### 3.3 Wallet state handling

Required states:

- `DISCONNECTED`
- `CONNECTING`
- `CONNECTED`
- `WRONG_NETWORK`
- `UNSUPPORTED_NETWORK`
- user rejected connection
- wallet unavailable
- account switched
- chain switched

The UI must not show a stale previous account after account change.

The UI must not show a stale previous-network state after chain change.

### 3.4 Account switch behavior

On account change:

- replace the displayed account immediately after the wallet event is validated
- clear user-specific state/cache owned by the current frontend session
- cancel or invalidate stale account-bound requests where applicable
- reset action/transaction context
- do not render the previous account's data under the new account

Plan 002 does not require full Portfolio data, but the invalidation boundary must exist and be testable.

### 3.5 Chain switch behavior

On chain change:

- update wallet/network state
- invalidate chain-specific state
- clear stale quote/action context
- enter `WRONG_NETWORK` when the wallet is on another known/supported Robex network that is not active
- enter `UNSUPPORTED_NETWORK` when the wallet chain is not supported by Robex
- recover to `CONNECTED` when the active testnet is selected

### 3.6 Mock wallet policy

Mock wallet remains a development-only tool.

Requirements:

- available only when an explicit development flag enables it
- unavailable in production builds/runtime
- clearly labeled `DEV MOCK` anywhere it can be mistaken for a real wallet
- no automatic fallback from failed real-wallet connection to mock wallet
- mock state must never be represented as verified on-chain state

### 3.7 Transaction execution boundary

Plan 002 must keep real transaction execution disabled.

Requirements:

- no Swap/Pool/Earn feature can submit a transaction
- no exposed application-context function may enable arbitrary `eth_sendTransaction`
- wallet abstraction may reserve a future execution interface only if the active Plan 002 implementation returns an explicit disabled/not-implemented result
- no fake transaction hash
- no fake success state

---

## 4. Non-goals

Plan 002 does not include:

- executable Swap
- ERC-20 approval
- `eth_sendTransaction` execution path
- all balance reads, including native-token balance and ERC-20 balance reads
- all balance, asset, portfolio-value, and position displays
- Pool transactions
- Earn transactions
- Portfolio aggregation
- liquidity protocol selection
- WalletConnect implementation if it requires a new provider/vendor decision not yet approved
- Smart Account
- gas sponsorship
- mainnet activation
- production deployment

WalletConnect-compatible support remains a V1 product goal, but Plan 002 focuses on injected wallet correctness first.

---

## 5. Architecture Requirements

Required path:

```text
UI Feature
   ↓
Wallet Context / Internal Wallet Service
   ↓
WalletAdapter
   ↓
Injected EVM Provider
```

Forbidden:

```text
Feature Component
   ↓
window.ethereum
```

Network configuration path:

```text
Wallet Adapter
   ↓
Central Network Config
   ↓
Robinhood Chain Testnet definition
```

No duplicated network constants.

---

## 6. UX Requirements

### Disconnected

Show:

- Connect Wallet CTA
- read-only product shell remains usable

### Connecting

Show:

- visible connecting state
- prevent duplicate connection requests

### Connected

Show:

- shortened real wallet address
- active network state
- disconnect control
- wallet type when known

Plan 002 performs **no balance reads** and displays **no balances, asset holdings, portfolio value, or positions**. Those belong to the next plan.

Do not claim balances or on-chain asset state in Plan 002.

### Wrong network

Use this state when the wallet is on another network that Robex recognizes, but it is not the active Robinhood Chain Testnet.

Show:

- clear wrong-network message
- expected network name
- Switch Network CTA

Do not silently switch chains without user action.

### Unsupported network

Use this state when the wallet chain is not supported by Robex.

Show:

- clear unsupported-network message
- expected Robinhood Chain Testnet name
- Switch Network CTA when the wallet supports switching/adding the active network

Do not present an unsupported network as merely connected or healthy.

### Wallet unavailable

Show a clear message that an injected compatible wallet was not detected.

Do not silently switch to mock wallet.

### User rejected

Return to a safe disconnected state with a clear non-technical message.

---

## 7. State Invalidation Contract

Plan 002 must introduce a clear frontend invalidation boundary for wallet identity/network changes.

At minimum expose a mechanism that downstream features can subscribe to or call for:

- account changed
- chain changed
- disconnect

This does not require a complex global cache framework.

Do not introduce a large state-management dependency unless justified by evidence.

---

## 8. Security Rules

- Never request or store seed phrase/private key.
- Backend remains non-custodial.
- Wallet prompts only follow explicit user action.
- No automatic mainnet activation.
- No arbitrary transaction submission.
- No silent wallet/provider fallback.
- No stale account/network data after wallet events.
- External provider errors must become explicit application states.

---

## 9. Testing Requirements

### Unit tests

Cover at minimum:

- injected provider unavailable
- user rejects connection
- connected account normalization
- correct active chain detection
- wrong network detection
- unsupported network detection
- network switch request construction from centralized config
- account-change transition
- chain-change transition
- mock-wallet development gating
- transaction execution remains disabled

### Integration/runtime tests

Verify:

- real MetaMask runtime connection in browser as the minimum required provider evidence
- record which real injected wallet provider(s) were verified
- if Rabby is available, verify it separately and record the result; do not claim Rabby compatibility without evidence
- displayed account equals wallet account
- displayed chain equals wallet chain
- wrong network state
- unsupported network state
- switch to Robinhood Chain Testnet
- disconnect
- account switch
- chain switch
- no stale identity after account switch
- no transaction execution path

Tests using mocks may verify logic, but they do not replace real-wallet runtime evidence.

---

## 10. Responsive Evidence

Capture important wallet states at:

- desktop wide
- desktop narrow
- tablet
- mobile

At minimum capture:

- disconnected
- connected
- wrong network

No horizontal overflow.

---

## 11. Evidence Requirements

Claims require matching evidence:

| Claim | Evidence |
|---|---|
| Wallet connects | Browser/runtime with real MetaMask as the minimum Plan 002 provider evidence; record exact verified provider(s) |
| Address is correct | UI address compared with wallet account |
| Chain is correct | Wallet/provider chain ID + UI state |
| Wrong network works | Runtime evidence on a known but non-active network |
| Unsupported network works | Runtime evidence on an unsupported chain |
| Switch network works | Wallet prompt + resulting chain state |
| Account switch works | Before/after runtime evidence |
| Chain switch works | Before/after runtime evidence |
| Responsive works | Viewport screenshots/runtime measurements |
| Logic works | Automated tests |
| No tx execution | Source inspection + negative test |

A mock-wallet screenshot cannot satisfy a real-wallet acceptance criterion.

---

## 12. Verification Commands

Before handoff:

- `npm run test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

Runtime verification must be performed after automated checks.

---

## 13. Git Workflow

Implementation must:

- start from latest `main`
- use a fresh feature branch such as `feat/002-wallet-network`
- preserve reviewed history
- use new commits for post-review fixes
- open a PR to `main`
- not merge before Codex PASS and Human Acceptance

Builder handoff is a claim, not final approval.

---

## 14. Agent Workflow

### Gemini

- implementation
- direct tests
- runtime verification
- evidence capture
- scoped commits
- GitHub handoff

After push + GitHub handoff, Gemini must **STOP**.

Gemini must **not** independently invoke Codex or advance the workflow to review.

### ChatGPT

- inspect branch/PR/handoff
- perform pre-review
- decide when independent review starts
- coordinate fixes and review rounds

### Codex

- independent review only
- verify source, tests, runtime evidence
- use the verdict set defined by `AGENTS.md`: `PASS`, `PASS WITH LIMITATION`, `FAIL`, or `BLOCKER`, with findings as applicable
- do not become the implementation owner

### Human

- final acceptance
- merge authorization

---

## 15. Acceptance Criteria

Plan 002 is complete only when all are true:

1. A real MetaMask injected wallet connects through the wallet abstraction, and the implementation records exactly which real wallet provider(s) were runtime-verified. Rabby compatibility must not be claimed without Rabby runtime evidence.
2. UI account matches the wallet-selected account.
3. UI/network state reflects the wallet's real chain.
4. Robinhood Chain Testnet is recognized from centralized config.
5. Wrong-network state is explicit for a known/supported but non-active network.
6. Unsupported-network state is explicit for networks Robex does not support.
7. User-triggered switch to Robinhood Chain Testnet works.
8. Account switch updates identity and invalidates stale account state.
9. Chain switch updates network state and invalidates stale chain state.
10. Wallet unavailable and user rejection have explicit safe states.
11. Mock wallet is explicit dev-only behavior with visible `DEV MOCK` labeling.
12. There is no automatic fallback from real wallet to mock wallet.
13. No real transaction execution is possible in Plan 002.
14. No fake transaction success/hash exists.
15. No wallet/network constants are duplicated outside centralized config without a documented reason.
16. Plan 002 performs no native-token or ERC-20 balance reads and displays no balances, asset holdings, portfolio value, or positions.
17. Automated test suite passes.
18. Real lint passes.
19. Typecheck passes.
20. Build passes.
21. Required runtime evidence exists.
22. Required responsive states fit desktop/tablet/mobile.
23. Codex reports no BLOCKER/HIGH findings.
24. Human Acceptance passes before merge.

---

## 16. Stop / Escalation Conditions

Stop implementation and escalate to ChatGPT before proceeding if:

- Robinhood Chain Testnet wallet parameters are uncertain or conflict with current official docs
- implementation requires a new wallet vendor SDK
- WalletConnect provider/vendor must be selected
- a wallet requires architecture changes outside the current adapter boundary
- transaction execution becomes necessary
- mainnet activation is requested
- secrets/API keys are required
- a new global state framework is proposed
- PRD/ARCHITECTURE/DESIGN conflicts with this plan

Do not invent missing external facts.
