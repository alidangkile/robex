# Constraints — Robex

Last reviewed: 2026-10-14 by Claude (Orchestrator), approved by Owner.
Method: `.agents/skills/constraint-driven-development/SKILL.md`.

Read this file before writing code. Do not weaken it to make a change pass.
Tightening the bar can be quiet; loosening it must be loud: only an Owner-approved PR that says so in its title may relax a rule here.

## Floor (always enforced)

- No new suppression comments: `@ts-ignore`, `@ts-nocheck`, `@ts-expect-error`, `eslint-disable` (any form). Baseline: 7 existing `@ts-expect-error`, all in `packages/core/test/` (6 test runtime rejection of bad input, 1 tests a missing `performance` global). A new one needs a row in Exceptions.
- No skipped or focused tests: `.skip`, `.only`, `.todo`, `xit`, `xdescribe`. Baseline: 0.
- No deleted test files and no removed assertions inside kept tests, unless the PR explains why and QA agrees.
- No stubs: `throw new Error("Not implemented")`, empty `catch {}`, a `TODO` where the implementation should be.
- No secrets, private keys, seed phrases or RPC URLs with tokens in source, tests, fixtures or comments.
- This file is not weakened to make a change pass.

## Protected values (change only when an approved SPEC names the change)

| What | Where | Why |
|---|---|---|
| Swap value cap `ABSOLUTE_ETH_CAP_WEI` (0.0001 ETH) | `packages/core/src/quote/v4-math.ts` | Owner decision D2 |
| Chain ID 46630 required before send; mainnet 4663 never enabled | `packages/config`, `packages/core/src/execution` | `AGENTS.md` §19 |
| `ALLOW_MAINNET` guard: mainnet config throws unless `ALLOW_MAINNET=true` | `packages/config/src/networks/index.ts` | `AGENTS.md` §19 |
| Contract and token addresses | `packages/config` only | `00-truthfulness.md` §6 |
| Pre-send checks: byte-equal calldata, strict key allowlists, balance ≥ amountIn + 2× gas, deadline ≤ now + 60 s | `packages/core/src/execution` | C1 spec (issue #28) |
| `eth_sendTransaction` fields exactly `{from,to,value,data,gas,chainId}` | `packages/core/src/execution` | C1 spec (issue #28) |

A PR that changes the code or value behind any row above (not just this table's wording) is Risk Tier A (`AGENTS.md` §4.1).

## Enforced with commands

| Dimension | Rule | Checked by | Runs at |
|---|---|---|---|
| Lint | Zero errors | `npm run lint` | before push, CI |
| Types | Zero errors | `npm run typecheck` | before push, CI |
| Tests | All pass, no retries hidden | `npm run test` | before push, CI |
| Build | Succeeds | `npm run build` | CI |
| Dist | No forbidden content in built output | `npm run verify:dist` | CI |

## Ratchets (measured; may only move in the good direction)

| Metric | Baseline | Source | Direction |
|---|---|---|---|
| Passing tests | 444 | Actions run 38731838875 (PR #50, commit f2f5c65), "Tests 444 passed (444)" | must not fall |
| Suppression comments | 7 | `grep` on `apps packages scripts` at `main` 107e01e | must not grow |
| Skipped/focused tests | 0 | same | stays 0 |

When a PR raises the test count, that PR updates the baseline here (a tightening edit, allowed without Owner approval). QA compares the CI count with this baseline in every PR.

## Guard the bar (QA checks these five in every diff)

1. A threshold or protected value moved.
2. A test got easier (`.skip`, deleted file, weaker assertion).
3. A checker got silenced (new suppression).
4. Work is unfinished (stub, empty `catch`, `TODO`).
5. A new Exceptions row nobody discussed.

## Exceptions

| ID | Rule | Path | Reason | Approved by | Expires |
|---|---|---|---|---|---|
| — | — | — | none yet | — | — |
