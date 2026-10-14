# Vendored agent skills — source and pin

These files are **verbatim copies** (no edits) of selected skills from
`addyosmani/agent-skills`, reviewed by Claude (Orchestrator) on 2026-10-14
and approved by the Owner.

- Upstream: https://github.com/addyosmani/agent-skills
- Pinned commit: `aeac41d4d005999432bb7312f7ff06383a91d59d` (plugin version 0.6.13)
- Licence: MIT, copyright (c) 2025 Addy Osmani. Full text: `.agents/skills/LICENSE`.

## What is vendored

| Path in robex | Upstream path |
|---|---|
| `.agents/skills/constraint-driven-development/SKILL.md` | `skills/constraint-driven-development/SKILL.md` |
| `.agents/skills/constraint-driven-development/references/floor-guard.md` | `skills/constraint-driven-development/references/floor-guard.md` |
| `.agents/skills/incremental-implementation/SKILL.md` | `skills/incremental-implementation/SKILL.md` |
| `.agents/skills/test-driven-development/SKILL.md` | `skills/test-driven-development/SKILL.md` |
| `.agents/skills/frontend-ui-engineering/SKILL.md` | `skills/frontend-ui-engineering/SKILL.md` |
| `.agents/skills/code-review-and-quality/SKILL.md` | `skills/code-review-and-quality/SKILL.md` |
| `.agents/references/*.md` (5 files) | `references/*.md` (same names) |

`.agents/references/` exists so the skills' relative links (`../../references/...`) resolve unchanged.

## What is deliberately NOT vendored

- `hooks/` (session-start, sdd-cache, simplify-ignore shell scripts): they run code on the agent's machine and robex does not need them.
- `.claude-plugin/`, `agents/`, `commands/`: not needed; robex roles are defined in `AGENTS.md`.
- All other skills (browser-testing needs an extra MCP server; robex already uses Playwright).
- Do **not** run `agy plugin install addyosmani/agent-skills` or `/plugin marketplace add`: those install the unreviewed latest version, including hooks.

## How robex uses them

See `.agents/rules/10-skills.md`. On any conflict, `AGENTS.md`, `CONSTRAINTS.md` and `.agents/rules/00-truthfulness.md` win over a skill.

## Updating

1. Read the upstream diff between the pinned commit and the new commit.
2. Check it for new scripts, network calls, install steps or instructions that conflict with robex rules.
3. Copy the files verbatim, update the commit and the hashes below in the same PR (Tier C).

## SHA-256 of vendored files (paths relative to `.agents/`)

```text
61c759d94d52296231f5f310b92b401f56c44e4430dc3cc95ebac5d7b1d5ffac  references/accessibility-checklist.md
d1c75d2ae65d2c7a9cd01f93fa8de63e00e75f2fe5d08be224d576157054dcee  references/definition-of-done.md
fffc38b8f3b328a973aab8b1a2efdd72b65710d8f4b57f28f8374ddae7f8a88b  references/performance-checklist.md
37774056502fe8970dcd2fd27dca5fa31f2a55232649fc3056c89c3af7d62755  references/security-checklist.md
f0bf05acd0edcadc27297ad5b74f104c8103ccfedba1a05cd6d6ae4af8364c56  references/testing-patterns.md
6f202f8bd568cd730dbb2b0d1f8e243bc74c2fa1f64dbce9b2c7ea08bd5c9fd7  skills/LICENSE
2db1e850379f255fd3091ef278cde24cd6c7d2ba23e360cc52ea522c40d4396e  skills/code-review-and-quality/SKILL.md
06479d4305f286d23cfb99f5dc85695896785269664e1f6a8d800e3b71e70c10  skills/constraint-driven-development/SKILL.md
59715dc6c3c6c36ec9177f9ced65c379e80a4539b36115456666bfabc43a6a9c  skills/constraint-driven-development/references/floor-guard.md
29a3e53d57c0a128831a20730ae874a8c4fda40c001fcdc15f8e9ad4b5f72f1b  skills/frontend-ui-engineering/SKILL.md
df66536610071727feae1ca95f3c391c248ad828041750ccd3699cce763aa00b  skills/incremental-implementation/SKILL.md
a3aa6ba95638497025577469eda10ed17918698209615aeafbc26f131bf2469d  skills/test-driven-development/SKILL.md
```

Check: `cd .agents && sha256sum -c` with the block above.
