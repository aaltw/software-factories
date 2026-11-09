# Local setup: Software Factories for Real Engineers (Cohort 005)

Set up 2026-11-09. Course repo: https://github.com/ai-hero-dev/cohort-005-project (checked out at `eb765c3`, `origin` = course repo).

## What's here

- Course exercise repo, checked out in place (`git init` + fetch, because the folder already held `.claude/admiral/`).
- `npm install` done (685 packages). DB migrated and seeded (`*.db` is gitignored).
- `.gitignore` gained `.claude/admiral/` (also in `.git/info/exclude`). The course tracks `.claude/skills` (symlink to `.agents/skills`), so only the admiral board is ignored, not all of `.claude/`.

## Tool versions

| Tool | Version | Course needs |
| --- | --- | --- |
| node (nvm) | v24.15.0 | v22+ |
| npm | 12.2.2 | v10+ |
| git | 2.56.0 | any |
| gh | 2.103.3, logged in as `aaltw` | logged in |
| jq | 1.7.1 | any |
| podman | 6.1.4, machine running | for sandcastle (see below) |

Nothing new was installed globally.

## Deviations from this Mac's defaults (course wins)

- **npm, not pnpm.** The README says so, and `package-lock.json` is committed.
- **Prettier, not Biome.** The repo ships `.prettierrc`.
- **Podman, not Docker.** `.sandcastle/main.ts` imports `@ai-hero/sandcastle/sandboxes/docker`. When the sandcastle lessons arrive, swap it for `@ai-hero/sandcastle/sandboxes/podman` (it ships in the installed package).
- **Skills.** The repo vendors `grill-me`, `grilling`, `handoff` in `.agents/skills` (project scope). The `mattpocock-skills` plugin is already installed globally and is namespaced (`mattpocock-skills:grilling`), so they don't clash. Don't reinstall the plugin.

## Verify

```bash
node --version        # v22+
gh auth status
npm test              # 11 files, 378 tests pass
npm run typecheck     # exit 0
npm run dev           # http://localhost:5173 returns 200
```

## Still to do (Aalt)

1. **Fork**: `npx ai-hero-cli fork`. This wipes git history to one commit and creates a **public** repo on your GitHub account, then pushes there as `origin`. Course needs it public (free Actions minutes). Not run yet: it needs your OK. Its steps are: delete `.git`, `git init`, stage everything, commit, `gh repo create --public`, push. Staging respects the working-tree `.gitignore`, so the `.claude/admiral/` line keeps the board out. `.git/info/exclude` is deleted. This SETUP.md gets committed to the public fork too. It lists secret names only, no values.
2. **Plan**: the course expects a Claude plan of $100/month or more. Aalt has Claude Team, Codex, and Copilot credits (via Pi). For the factory in CI there are two options:
   - Claude: generate `CLAUDE_CODE_OAUTH_TOKEN` with `claude setup-token`, if the Team seat allows it.
   - Copilot: a fine-grained PAT with the "Copilot Requests" permission, saved as `COPILOT_GITHUB_TOKEN`. The course supports this route.

   Codex can't use a login in CI. It needs an API key, billed per token.

## Secrets (names only, never commit values)

| Name | When | Where |
| --- | --- | --- |
| `CLAUDE_CODE_OAUTH_TOKEN` (from your Claude subscription, `claude setup-token`) | Software Factory Part One | GitHub Actions secret on your fork |
| `FACTORY_PAT` (fine-grained GitHub PAT on your fork, see `.github/workflows/agent-explore.yml` on `live-run-through`) | Software Factory Part One | GitHub Actions secret on your fork |
| Knock keys (free Developer account; exact names not on `live-run-through` yet) | Notifications lessons | `.env` (gitignored) |
| `COPILOT_GITHUB_TOKEN` | Only if you run the factory on Copilot instead of Claude | GitHub Actions secret |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | Only for `request-logger` with API-key agents | Exported in your shell, not set by the repo |

Also useful later: a tldraw (or any drawing app) account for whiteboarding.

## After `npm run reset` / `cherry-pick`

`npm install && npm run db:migrate && npm run db:seed`. A reset can drop the `.claude/admiral/` line from `.gitignore`. `.git/info/exclude` still covers it until a fork recreates `.git`.
