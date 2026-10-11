# Robex — Truthfulness rules (apply to every agent, every task)

Why: in PRs #23, #27 and #30 the Builder wrote invented details labelled as FACT (a commit SHA, a comment id, a pool id, a contract address that matched only the first and last 4 characters, a code line that does not exist). QA caught them, but in transaction code a wrong address can send funds to the wrong place. A wrong FACT is worse than a missing one.

## 1. Never type exact values from memory
Addresses, hashes, commit SHAs, chain IDs, block numbers, selectors, amounts, URLs, version numbers, file line numbers, issue/comment ids, test counts, and quoted code or docs must be **copied** from one of:
- output of a command you ran in this session,
- a file you opened in this session,
- a web page you fetched in this session.
If you cannot copy it, write `not proven`. Never "fill in" a value that looks right.

## 2. Every FACT carries its source
Write `[FACT]` only with the source next to it: command + block number, file path + line range, or URL (+ date read).
No source → `[ASSUMPTION]` or `not proven`. UI text is not proof of server behaviour.

## 3. Quote exactly
When citing code or documentation, copy it verbatim. Mark omitted parts with `...`. Never add, merge, or "clean up" lines inside a quote.

## 4. Reports come from command output
Before posting a BUILDER UPDATE, PR description, or CI RESULT, run and paste the relevant output:
- `git rev-parse HEAD` (commit SHA)
- `git diff --stat origin/main...HEAD` (files changed)
- the test command's summary line (state whether it is local or from the Actions log)
Do not report CI until the run has finished. If any job was re-run, say so and name the failing test.

## 5. Self-check before you post
Re-open the source of every FACT and compare it to what you wrote, character by character for addresses and hashes. Add a `Not checked` list for anything you did not verify. Saying "I don't know" is acceptable; guessing is not.

## 6. Addresses in code
Contract and token addresses live only in `packages/config`. Import them; never inline a literal address elsewhere. Any new or changed address needs a test that pins the exact value, and the PR must cite the RPC call or explorer page that proves it.

## 7. Stay in scope
Change only the files the task names. If you need another file or a new dependency, stop and ask in the PR or issue.

## 8. Never
- send transactions, sign, approve, or handle seed phrases / private keys;
- enable mainnet;
- merge, force-push, or rewrite history;
- edit files while acting as QA.

Full process: `AGENTS.md` (roles, section 3.1 reporting) and `HANDOFF.md` (current state).
