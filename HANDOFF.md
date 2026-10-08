# ROBEX — Project Handoff

> Snapshot: 2026-10-08 · repository: `alidangkile/robex` · `main` at `f05adb5372e80ae0e0ad2bd5bf28733763d5901d`.
> Purpose: give a new ChatGPT conversation enough context to continue **Plan 003B**. This is a navigation summary; GitHub source files and actual PR state remain authoritative. Recheck the current `main` SHA when starting.

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

- **Human/user:** approves SPEC, Human Acceptance (last gate), merge/release/mainnet authorization.
- **ChatGPT:** orchestrator + BA/planner; **authors the feature Plan, business flow, state matrix, acceptance criteria, and scope before handing work to Builder**. Coordinates reviews, resolves findings and verifies the review record; does not delegate product planning to Grok or treat Builder self-tests as independent QA.
- **Grok:** current primary **Builder**. Implements only the approved plan; may raise technical blockers and propose changes, but may not silently change scope, self-approve, or merge.
- **Codex:** **Independent Reviewer / QA** for implementation PRs. Inspects PR diff/source, runs or checks tests, challenges runtime/RPC evidence and regressions, and issues PASS / PASS WITH LIMITATION / FAIL / BLOCKER with specific findings. Codex is **not the feature Builder**, cannot self-approve its own changes, and cannot merge. For docs-only low-risk PRs, ChatGPT may perform a scoped review and state any verification limitations explicitly.
- Repo `AGENTS.md` still describes an earlier Gemini-based builder assignment; **current agreed operating assignment is Grok**. Keep this distinction explicit until governance docs are updated through review.
- Flow: **ChatGPT SPEC → Human approves → Grok implements + PR/evidence → Codex independent QA (for code PRs) → Grok fixes + Codex re-review → Human runtime acceptance → authorized merge**. ChatGPT orchestrates every gate.
- No “DONE” based on agent claims alone. Claims need applicable source/tests/runtime/screenshot/RPC/transaction-hash evidence. No code or mainnet activation by assumption.

## 4. Immediate next action: Plan 003B (NOT YET WRITTEN OR APPROVED)

**ChatGPT must draft the Plan first**, in Vietnamese with simple explanations of technical terms, then request the user's approval. Do **not** issue Grok's implementation prompt until approved.

Proposed 003B scope for user decision:
- **Read-only live quote** from Uniswap v4 V4Quoter on **testnet 46630** for the verified candidate ETH → USDG pool, with fresh RPC evidence; no simulated fallback presented as live.
- Clear accurate amount conversion using integer base units, token allowlist, pool-key/source verification, quote expiration/stale handling, liquidity checks and conservative caps, price impact/slippage/minimum received.
- Design the UX for disconnected/read-only use, wrong network, input errors, loading, no liquidity, high price impact, provider failure, account/chain changes and mobile display. **Decisions requiring user approval** (e.g. disconnected quote policy, price-impact block threshold, amount cap) must be explicit in the Plan, not invented by Grok.
- **Non-goals:** approvals, wallet signatures, swap execution, fake calldata, mainnet, new pools or aggregator routing. Execution is a later plan and needs separately verified router + receipt-based tests.

## 5. Minimal context-loading recipe for a new ChatGPT chat

1. Read **this HANDOFF** and confirm latest `main`/open PRs. Do not load the whole repo.
2. For drafting 003B: read `PRD.md` **Swap / Safety / Transaction Lifecycle** sections, `ARCHITECTURE.md` **Quote/Adapters** sections, `DESIGN.md` relevant Swap/UX sections, and `plans/003a-swap-discovery.md`.
3. Inspect only implicated code on demand: `SwapPage.tsx`, `quote.service.ts`, `quote.route.ts`, adapters, shared `Quote` type, network configuration and tests.
4. Deliver the **proposed Plan 003B** to the user for approval **before** assigning a builder task. Keep prompts concise and use GitHub PRs as the record of implementation.
5. Re-read source/PR diffs whenever verifying a new commit; summaries and this file may go stale.

**Next prompt for a new chat:** “Đọc `HANDOFF.md` trên GitHub repo `alidangkile/robex`; kiểm tra `main` và tạo bản đề xuất Plan 003B để tôi duyệt. Bạn là Planner/Orchestrator, Grok chỉ là Builder. Chưa giao code.”
