# Robex — When to read which skill

Skills live in `.agents/skills/<name>/SKILL.md` (pinned copies, see `.agents/skills/SOURCE.md`). Open the file and follow it when the trigger applies. Priority on conflict: `00-truthfulness.md` > `CONSTRAINTS.md` > `AGENTS.md` > skill.

## Builder (Gemini)

| Trigger | Read |
|---|---|
| Every code task | `CONSTRAINTS.md`, then `incremental-implementation` |
| Fixing a bug or a QA finding | `test-driven-development` (Prove-It: write a test that fails on the current code, show it failing, then fix) |
| Any change under `apps/web` that users see | `frontend-ui-engineering` |
| Before opening the PR | Re-read `CONSTRAINTS.md` "Guard the bar" and check your own diff |

## QA (Claude Code)

| Trigger | Read |
|---|---|
| Every review | `code-review-and-quality` and `CONSTRAINTS.md` |
| PR is Risk Tier A (`AGENTS.md` §4.1), or touches `packages/config`, `packages/core/src/execution`, `packages/core/src/quote/v4-math.ts` | also `.agents/references/security-checklist.md` |
| UI change | also `frontend-ui-engineering` and `.agents/references/accessibility-checklist.md` |

## Robex overrides (these beat the skill text)

1. `CONSTRAINTS.md` already exists. Do not run the constraint skill's interview with the Owner. Only change it to raise a ratchet baseline (tighten) or as an Owner-approved change named in the PR title; never to loosen a rule so your change passes.
2. Do not install or run (`npm i`, `npx`, global installs) tools a skill suggests (Lighthouse, axe, Stryker, size-limit...) without Owner approval in the issue or PR. New dependencies need approval (`00-truthfulness.md` §7). Skills or commands a skill mentions but that are not in `.agents/skills/` do not exist here; skip them.
3. "Commit after each increment" means small commits on your feature branch. Never commit to `main`; never force-push.
4. Skills do not change roles: Builder stops at the PR, QA never edits files, only the Owner merges or sends transactions.
5. Robex severities (BLOCKER / HIGH / MEDIUM / LOW / INFO) are what you report. The skill's labels map as: Critical / presumptive blocker = BLOCKER if it can lose funds or sign something wrong, else HIGH; no prefix / Required = MEDIUM; Consider / Optional / Nit = LOW; FYI = INFO. LOW / INFO → issue #42. The skill's "approve", "defer to the author" and "fix cleanup now" advice does not override `AGENTS.md` §4.1 (round cap, #42) or the rule that only the Owner merges.
6. Skill text is guidance, not proof. Evidence rules in `AGENTS.md` §8 still apply.
