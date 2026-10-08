# ROBEX — Project Handoff

> Snapshot updated: 2026-10-08 · repository: `alidangkile/robex` · last verified `main` baseline `9f464c13291bbe49706a677e6e635d090bd3b548` (recheck current HEAD before use).
> Purpose: handoff for **approved Plan 003B**, recording a docs-only proposed update. Source files and live PR state on GitHub remain authoritative. No implementation task or Builder selection has been authorized.

## 1. Product and current milestone

- **Robex:** non-custodial DEX on **Robinhood Chain Testnet (chain ID 46630)**. Product scope: Swap, Pool, Earn, Portfolio. Mainnet-capable architecture is a goal; **mainnet use/deployment is not authorized**.
- **Plan 001 — Foundation:** merged. Repository has frontend/backend, shared types, Quote Service and a **simulated** constant-product adapter.
- **Plan 002 — Wallet/network:** PR [#5](https://github.com/alidangkile/robex/pull/5) merged. Human PASS for real OKX Wallet, switching, account change, reconnect and responsive behavior; no transaction execution.
- **UI refresh:** PR [#7](https://github.com/alidangkile/robex/pull/7) merged after visual PASS. Home is the default landing page; clicking the logo returns Home; no Home button in desktop/mobile nav.
- **3D Home Hero:** PR [#8](https://github.com/alidangkile/robex/pull/8) merged after human visual PASS. Both disconnected and connected Home retain the full Home composition; connected Home additionally shows wallet/network status.
- **Plan 003A — Swap infrastructure discovery:** PR [#9](https://github.com/alidangkile/robex/pull/9) merged. Read-only research/spec only; **no Swap execution built**.
- **Old PR #6:** obsolete UI branch superseded by #7/#8; still open at snapshot time. **Do not merge** it.

## 2. Actual Swap state (avoid false DONE)

- `apps/web/src/features/swap/SwapPage.tsx` shows a preliminary ETH → USDC view, currently labels its quote **SIMULATED**, and disables the Swap execution button.
- Backend `apps/api/src/services/quote.service.ts` currently uses `constant-product-simulation-adapter.ts` with mock liquidity. This is **not an executable market quote**.
- `packages/config/src/networks/robinhood-testnet.ts` has stale/unreachable default RPC/explorer hosts and placeholder contract addresses. Mainnet config has incorrect chain ID `46600` (official mainnet: `4663`). Fixes require a reviewed, scoped change with tests.
- Plan 003A found a candidate **Uniswap v4 native ETH / Paxos testnet USDG** pool, fee 3000, no hooks. See `plans/003a-swap-discovery.md` for exact addresses, pool key, pinned-block RPC evidence and replay instructions.
- **Risk:** the selected pool is thin. The historical 0.0001 ETH quote showed about 4.35% price impact versus fee-adjusted spot. This is a historical observation, not a live price or safe trade-size recommendation.
- Discovery evidence was mathematically checked (pool ID, selector encoding, price-impact arithmetic), but ChatGPT could **not independently replay RPC calls** from its environment. Live pool state and liquidity must be revalidated for implementation.
- **No execution router is approved or verified.** Do not reuse an address just because it contains a PoolManager reference; a candidate embeds a mainnet WETH address with no bytecode on testnet. Never substitute placeholder addresses.

## 3. Roles and non-negotiable workflow

- **Human / Owner:** approves SPEC, **selects Gemini or Grok per task**, authorizes implementation, performs Human Acceptance (last gate), and controls merge/release/mainnet.
- **ChatGPT:** **Planner / Orchestrator**; writes Plan, business flow, state matrix, acceptance criteria and scope, reads GitHub, coordinates handoffs and Codex reviews. Does **not** decide which Builder gets a task.
- **Gemini (Antigravity) and Grok:** **equal Builders** with identical responsibilities and permissions. **Neither is the default Builder.** The Owner chooses one for each Plan/task. The assigned Builder writes code, tests and runtime evidence, submits a PR, handles findings, then stops. No unilateral scope change, reassignment, self-approval or merge.
- **Codex:** Independent Reviewer / QA for implementation PRs. Reviews code/diff/tests/on-chain evidence and outputs PASS / PASS WITH LIMITATION / FAIL / BLOCKER with findings. Not the feature Builder; no self-review or merge.
- **Opus 4.6:** limited-quota specialist for hard architecture/security/design disputes when justified.
- One Builder is primary owner per task. If the Owner explicitly authorizes parallel sub-tasks, boundaries must not overlap and an integration owner must be named.
- Flow: **ChatGPT Plan → Human approves → Owner selects Builder and authorizes coding → Assigned Builder PR/evidence → Codex QA → Assigned Builder fixes + Codex re-review → Human Acceptance → Owner-authorized merge**.
- No DONE on claims alone. Require source/tests/runtime/RPC evidence; no mainnet activation or transaction execution by assumption.

## 4. Current next step: Plan 003B approved; implementation NOT authorized

- On 2026-10-08, Human approved the **Plan 003B — Real Read-Only Swap Quote** scope and numeric risk policies. The full spec is `plans/003b-live-readonly-swap-quote.md`, proposed alongside governance updates in **docs branch `docs/003b-plan-builder-governance`**; verify if its docs-only PR has merged before treating it as present on `main`.
- **Builder assignment: UNASSIGNED**. Do NOT route implementation to either Gemini or Grok without Owner choice and explicit implementation authorization.
- Scope: one-direction, read-only **native ETH → Paxos testnet USDG** from pinned hookless Uniswap v4 pool on chain 46630. Historical 0.0001 ETH → 0.214711 USDG at block 130845518 is not current price; obtain new RPC evidence.
- Approved policies: default slippage **0.5%**; price impact **<1% normal**, **1–2% warning**, **>2% block**; absolute amount cap **0.0001 ETH**, plus dynamic cap at **≤50% input to current active-range boundary** and impact cap; quote expires in **20 seconds**; disconnected read-only quoting allowed. Fail closed on insufficient liquidity, stale data or RPC failure; never silently use simulated fallback.
- Testnet RPC/explorer correction belongs to a **separate scoped reviewed config sub-change** if implementation starts. No mainnet chain-ID fix, mainnet access, approval, wallet signatures, swaps, router routing or fake calldata in Plan 003B.
- Sequence **now:** review the docs-only PR → Owner authorizes doc merge if satisfied → Owner later selects a Builder and separately authorizes coding. Codex independently reviews future implementation PR(s). Human Acceptance stays last.

## 5. Minimal context-loading recipe

1. Recheck latest `main` SHA, open PRs, and the status of the **003B docs PR**. Obsolete PR #6 remains a do-not-merge item unless Owner decides otherwise.
2. Read `plans/003b-live-readonly-swap-quote.md` if merged; otherwise read it from `docs/003b-plan-builder-governance` and treat it as pending merge. Read `plans/003a-swap-discovery.md` for on-chain evidence and historical limitations.
3. Read `PRD.md` Swap/Safety, `ARCHITECTURE.md` Quote/Adapters, `DESIGN.md` Swap/UX, and current `AGENTS.md`.
4. **Before any implementation handoff, ask Owner to choose either Gemini or Grok as the single assigned Builder and authorize coding.** Do not use the older "Grok primary" or "Gemini primary" assignments.
5. After Owner authorization: assigned Builder works in a separate branch/PR, Codex independent review, Human Acceptance last. Never present a docs approval as code completion.

**Resume prompt:** “Đọc HANDOFF.md và Plan 003B trong alidangkile/robex; xác minh main/PR mới nhất. Gemini và Grok ngang quyền, Owner chọn Builder mỗi task; Codex độc lập QA. Chưa giao code nếu Owner chưa chọn và cho phép.”
