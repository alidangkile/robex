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
| Diff touches `packages/core/src/execution` or signing | also `.agents/references/security-checklist.md` |
| UI change | also `frontend-ui-engineering` and `.agents/references/accessibility-checklist.md` |

## Robex overrides (these beat the skill text)

1. `CONSTRAINTS.md` already exists. Do not run the constraint skill's interview with the Owner, and do not rewrite the file. Propose changes in the PR instead.
2. Do not install tools a skill suggests (Lighthouse, axe, Stryker, size-limit...) without Owner approval in the issue or PR. New dependencies need approval (`00-truthfulness.md` §7).
3. "Commit after each increment" means small commits on your feature branch. Never commit to `main`; never force-push.
4. Skills do not change roles: Builder stops at the PR, QA never edits files, only the Owner merges or sends transactions.
5. Map severity labels to robex verdicts: Critical = BLOCKER/HIGH, (no prefix) = MEDIUM, Nit/Optional/FYI = LOW/INFO → issue #42.
6. Skill text is guidance, not proof. Evidence rules in `AGENTS.md` §8 still apply.
