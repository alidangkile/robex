# Plan 003B — Real Read-Only Swap Quote

> Status: APPROVED BY HUMAN in ChatGPT on 2026-10-08. This PR records the approved specification; implementation has NOT been authorized or assigned.
>
> Planner / Orchestrator: ChatGPT. Builder: **UNASSIGNED** — Owner chooses **Gemini or Grok** for each task; equal Builder role. Independent QA: Codex. Final authority: Owner.
>
> Dependency: [Plan 003A](003a-swap-discovery.md). Network: Robinhood Chain **Testnet 46630 only**. No mainnet activation.

## 1. WHY — Objective and milestone

Show a real, **read-only** quote from one verified Uniswap v4 testnet pool for **native ETH → Paxos testnet USDG**. The user enters ETH and sees an estimated USDG amount, source, price impact, slippage, minimum received, expiry, and explicit limitations. This step proves reliable real quote retrieval and safe UX before any later transaction-execution plan.

A quote is not an executable swap or a guarantee that a transaction would succeed. USDG on testnet has no real monetary or redemption value.

Flow:

1. User enters ETH amount.
2. Validate chain, tokens, base-unit amount and quote policies.
3. Web → backend Quote Service → Uniswap v4 adapter → read-only RPC.
4. Verify PoolKey, fresh StateView state, V4Quoter result and risk limits.
5. Return one valid read-only quote **or** an explicit rejection/error.
6. Never sign, approve, wrap/unwrap or send a transaction.

## 2. Locked on-chain scope

| Field | Approved value |
| --- | --- |
| chainId | 46630 |
| Direction | Native ETH → Paxos USDG, exact input, one pool, one direction |
| Native ETH (currency0) | 0x0000000000000000000000000000000000000000, 18 decimals |
| Paxos USDG (currency1) | 0x7E955252E15c84f5768B83c41a71F9eba181802F, 6 decimals |
| PoolManager | 0x8366a39CC670B4001A1121B8F6A443A643e40951 |
| StateView | 0xf3334192d15450cdd385c8b70e03f9a6bd9e673b |
| V4Quoter | 0x8dc178efb8111bb0973dd9d722ebeff267c98f94 |
| Pool ID | 0xf76eb83b8bb6de286ef58daac9dc52ae5c22b1cf2b0cce47041b17375b0a1669 |
| Pool key fee / tickSpacing / hooks | 3000 / 60 / zero address |
| Quote function | quoteExactInputSingle, zeroForOne=true, hookData empty |
| Official testnet WETH (token allowlist, NOT this pair) | 0x7943e237c7F95DA44E0301572D358911207852Fa |

The token registry allowlist is limited to native ETH, official testnet WETH and Paxos testnet USDG. **003B may quote only ETH → USDG**; being allowlisted does not make WETH a quotable V1 pair. Reject all other token contracts, including tokens with matching symbols; reject other pools, dynamic-fee pools and nonzero hooks.

Recompute pool ID using Ethereum Keccak-256 of ABI-encoded PoolKey; reject a mismatch. Verify the Quoter and StateView refer to the pinned PoolManager; verify current testnet chain ID and contract bytecode using fresh RPC evidence. The V4Quoter source was not marked verified on the explorer during 003A — this limitation must be disclosed and independently reviewed.

**Historical reference only:** Plan 003A pinned a quote at block 130845518: 0.0001 ETH → 214711 raw USDG (= 0.214711 USDG), with approximately **4.35%** impact against fee-adjusted spot. This is not a live value or approved size. Never hardcode it as a current expected result.

## 3. Human-approved quote policies

| Policy | Rule |
| --- | --- |
| Default slippage | 0.5% |
| Price impact < 1% | Normal |
| Price impact ≥ 1% and ≤ 2% | Warning |
| Price impact > 2% | **Reject valid quote**; explain the excessive impact |
| Absolute ETH input cap | ≤ 0.0001 ETH (additional dynamic cap applies) |
| Liquidity cap | Compute from fresh current in-range liquidity; cap at most 50% of estimated ETH input needed to reach the lower boundary of the current active liquidity range |
| Quote lifetime | 20 seconds |
| Quote refresh | On input change or explicit Refresh |
| Disconnected wallet | Allow read-only quote |
| Wrong / unsupported connected chain | Clear quote; ask user to switch network |
| Missing/stale state, unknown safe cap, no liquidity | Fail closed; do not offer a valid quote |
| RPC failures or quote rejects | Visible error; **never silently fall back to simulation** |

The effective input limit is the **minimum** of the fixed 0.0001 ETH cap, the freshly computed dynamic range cap, and the size meeting the price-impact rule. Quoter and StateView calculations must reference a consistent block, with correct token decimals and rounding. Check zero liquidity, tick boundaries, missing adjacent liquidity and rounding edge cases. If the safe limit cannot be established, refuse the quote — do not guess an arbitrary amount.

Define price impact against a documented reference, separating the 0.30% pool fee from price movement (consistent with 003A's fee-adjusted spot comparison). Do not confuse price impact with slippage. Compute minimum received using exact integer base units and round down, never up. Slippage parameters must be validated rather than trusted.

A 20-second quote expiry is a **display validity policy**, not a promise of executable pricing or a guarantee of transaction success.

## 4. Frontend UX and state matrix

Preserve Robex's existing visual design; replace preliminary **ETH → USDC / SIMULATED** presentation with **ETH → USDG** and the verified live source. Do not claim balances, portfolio holdings or executable gas estimates. The Swap button remains **disabled** and says execution is a later milestone. Label testnet USDG as valueless test currency.

Basic view: You Pay (ETH, amount), You Receive (USDG, estimated amount), price impact, visible risk warning/block. Details: source **Uniswap v4**, pool fee, reference rate, slippage, minimum received, quote age/expiry and data block. Format ETH using 18 decimals, USDG using 6; do not truncate precision into a misleading amount.

| State / event | Required response |
| --- | --- |
| Disconnected | Read-only quote available; no forced wallet connection |
| Connecting / connected on 46630 | Read-only quote available; no signature prompt |
| Wrong / unsupported network | Clear prior quote and show Switch Network guidance |
| Empty / invalid / zero / excessive / overly precise input | No RPC call; inline validation |
| Loading | Stable loading state, prevent misleading old data |
| Fresh valid quote | Show amount, block, source, risk, minimum received and expiry |
| Expired/stale quote | Mark invalid, hide actionable interpretation; require refresh |
| No liquidity / unknown safe limit | Reject clearly |
| Impact 1–2% | Warning with numeric value |
| Impact >2% | Block with explanation, not a valid quote |
| RPC failure, rate limit, timeout, bad contract or chain | Explicit error and retry |
| Account, chain or provider changes / disconnect | Cancel or invalidate old requests, discard late results, re-evaluate current policy |
| Mobile / tablet / desktop | Financial numbers readable, no clipping or horizontal overflow |

Account/chain changes must never permit an old request to overwrite new state. Disconnecting returns to disconnected read-only mode; it does not legitimize stale data from the old session.

## 5. Architecture and implementation boundaries

Keep existing **Feature → Service → Adapter → Provider** boundaries and the quote-service chain restriction. The feature must not call RPC directly or bypass the service.

- Add a **Uniswap v4 read-only quote adapter**. Distinguish a real source from `SIMULATED_FOUNDATION` in the shared quote types and UI. Preserve the simulation adapter only for explicit tests/development use; never treat it as an automatic live fallback.
- Validate exact token addresses, chain ID, positive decimal-integer `amountIn`, and the single approved pool. Remove placeholder default token/amount values from the live API route; reject malformed inputs before BigInt conversion.
- Represent values as base-unit integer strings (or equivalent lossless integer representation). Never use `parseFloat` or floating-point multiplication for ETH → wei; never round received USDG upward.
- Use StateView and V4Quoter reads at a **consistent recent block**, with address/bytecode linkage, liquidity and price impact checks. Keep RPC timeout and rate-limit errors explicit.
- Extend `NetworkContracts` and quote type fields before inserting poolManager, stateView, quoter, pool ID, quote block or expiry. Never store contract addresses in `routerPlaceholder`. No calldata or transaction request field is needed.
- Quote source, block provenance, pool identity, timestamps and expiry must be available to UI/QA without leaking private keys or RPC secrets.
- Read-only quote endpoint must never sign, approve, execute or send transactions.

**Pre-implementation configuration sub-change (separate, scoped, reviewed):** Correct Robinhood **testnet** default RPC/explorer to the official documented hosts, remove unverified backup host, and update related tests. Do not silently replace placeholder contract addresses without fresh `eth_getCode` verification. Changing mainnet chain ID (currently wrongly 46600), mainnet RPC/explorer, block-time constants or activating mainnet requires **separate approval/scope**; none is included in 003B. Do not set `ALLOW_MAINNET`.

## 6. Explicit non-goals

No wallet signature, token approval, Swap execution, transaction payload, fake calldata, router selection, mainnet access, deployment, ETH wrap/unwrap, liquidity provisioning, reverse USDG → ETH route, WETH/USDG route, token selector, new pool, hooked/dynamic-fee pool, routing aggregation, Pool/Earn/Portfolio implementation or balance features.

Execution needs a separate future plan with an independently verified testnet router and receipt-level testing. Do not reuse the unverified older router embedding empty mainnet WETH (see 003A).

## 7. Verification requirements and acceptance

**Builder evidence** must demonstrate the following, not just claim success:

1. Automated tests: exact decimal-to-base-unit conversion, boundaries, min-received floor, slippage, fee-adjusted price impact, 1%/2% thresholds, absolute/dynamic caps, pool IDs, wrong chain, unknown token, request validation and error classification.
2. Negative tests: no liquidity, failed or stale StateView, missing bytecode, wrong contract linkage, late responses, expiry, timeouts, 429s, unsupported network, switched accounts, simulated fallback prohibition and absence of any transaction action.
3. Fresh **read-only** RPC evidence: chain ID; block number/hash; PoolManager/StateView/Quoter bytecode and linkage; exact PoolKey/pool ID; same-block price/liquidity/quote request and responses, decoded output; compare API and UI. A historical 214711 output is a fixture, not a permanent assertion.
4. UX runtime evidence: disconnected, connected, wrong network, loading, valid/warning/blocked quote, no liquidity, RPC error, expiry and changing wallet/chain. Desktop wide, desktop narrow, tablet and mobile; show no horizontal overflow.
5. Run and record `npm run test`, `npm run lint`, `npm run typecheck`, `npm run build`, `git diff --check`; disclose skipped checks and environment limitations. Do not claim PASS merely from a checklist.

**Acceptance gates:**

- The exact approved real ETH → USDG quote path works on chain 46630 with fresh, independently inspectable evidence.
- No simulation is presented as live and no fabricated gas/transaction data appears.
- Quote policy, freshness, liquidity/impact controls and UI states are implemented and independently verified.
- The **Owner-selected Builder** submits scoped commits, PR and evidence, then **stops**.
- **Codex** performs independent implementation QA and re-review of fixes; no unresolved blocker.
- **Human Acceptance is last**, after technical review; only Owner can approve merge.
- If RPC/contract verification cannot be independently established, classify as limitation/blocker; do not declare completed live quote.
- No mainnet activation or transaction execution under this Plan.

## 8. Task ownership, GitHub and next gate

Owner selects **either Gemini or Grok** as Builder for each task; they have identical permissions and responsibilities. Neither is default. ChatGPT writes and maintains specifications, coordinates QA and never assigns an implementation task without Owner's instruction. Codex is independent QA, never feature Builder. For deliberate parallel work, Owner must separately assign non-overlapping ownership and a named integrator.

This approved document is a **specification**, not permission to code. Sequence after this docs-only PR is reviewed/merged: Owner explicitly selects Builder and authorizes work → assigned Builder creates implementation branch/PR with evidence → Codex independent QA → Builder fixes as needed → Codex re-review → Human Acceptance → Owner merge authorization.

Source documents: `PRD.md` (Swap/Safety/Transaction Lifecycle), `ARCHITECTURE.md` (Quote/Adapters), `DESIGN.md` (Swap UX), `plans/003a-swap-discovery.md`, `AGENTS.md`, `HANDOFF.md`.
