# Saturn Router — Agent & Contributor Guidelines

This document establishes development principles, repository standards, and release guidelines for agents and contributors working on Saturn Router.

---

## 1. Project Overview & Architecture

Saturn Router is a high-performance self-hosted control plane for routing, monitoring, and managing AI requests across providers, protocols, and model endpoints.

### Tech Stack
- Backend Runtime: Bun 1.x
- Language: TypeScript 5.x (strict mode)
- API Framework: Elysia with JWT authentication and SQLite (`bun:sqlite`)
- Web Interface: React 19, Tailwind CSS v4, Vite, Remix Icons, Lucide Icons, Shadcn UI components
- Protocol Converters: Bidirectional conversion between OpenAI Chat Completions, Responses API, and Anthropic Messages

### Code Organization & Modularization
- Do not place unrelated features in single files.
- Keep API plugins under `src/api/` and core domain logic under `src/services/`.
- Keep vendor integrations isolated under `src/integrations/`.
- Frontend pages reside in `web/src/pages/` and modular widgets/tabs in `web/src/components/`.
- Maintain test coverage across all domain services and API route handlers (`*.test.ts`).

---

## 2. Release & Versioning Standards

Saturn Router adheres to Semantic Versioning 2.0.0 (SemVer).

### Version Formats
1. Beta & Pre-releases:
   - Format: `vMAJOR.MINOR.PATCH-beta` (e.g. `v0.1.0-beta`, `v0.2.0-beta`, `v1.0.0-beta`).
   - Suffix rule: Do not append `.1` or build numbers to base beta tags unless requested.
   - Flags: Always publish with `--prerelease` in GitHub CLI.
   - Purpose: Initial releases, preview testing, and architecture milestones.
2. Stable & Final Releases:
   - Format: `vMAJOR.MINOR.PATCH` (e.g. `v1.0.0`, `v1.1.0`).
   - Flags: Published as the latest stable release (omitting `--prerelease`).
   - Purpose: General availability and production deployments.

### Source of Truth
The version string must always be updated synchronously across:
- Root `package.json` (`"version": "..."`)
- Web frontend `web/package.json` (`"version": "..."`)
- `src/version.ts` dynamically resolves `CURRENT_VERSION` from `package.json`.

---

## 3. Release Notes Protocol (Hydra-style GitHub Standard)

Every release must follow the clean, conventional GitHub release notes structure (matching Hydra Launcher standard).

### Guidelines
- No emojis anywhere in the release title, sections, or bullet points.
- No all-uppercase titles or headers. Use standard Title Case or Sentence Case.
- Every change listed under What's Changed must cite the commit SHA and author.

### Standardized Release Template

```markdown
## What's Changed

- feat(core): implement in-app github release updates and collapsible changelog by @SterTheStar in 847fb4d
- fix(rtk): support extracting zip archives on Windows without unzip utility by @SterTheStar in 980c2f8
- fix(codex): stabilize prompt caching with deterministic tool call IDs and session affinity by @SterTheStar in 7e99257
- fix(antigravity): fix sequential tool calls indexing and chunk conversion for Claude models by @SterTheStar in 6a589d2
- feat(providers): start disabled providers section collapsed by default by @SterTheStar in a293718
- feat(chat): add delete-all chats with collapsible Recents and period filter by @SterTheStar in eb11c69
- feat(guardrails): add AI firewall plugin with secrets, pii, and prompt protection by @SterTheStar in 147b1d0
- feat(skills): add skills page with real-time marketplace and 16:9 markdown modal by @SterTheStar in 3c5f1b8

**Full Changelog**: https://github.com/SterTheStar/SaturnRouter/commits/v0.1.0-beta
```

---

## 4. Release Publication Workflow

Follow this procedure when preparing and publishing releases:

### Step 1: Bump Versions
Update the version string in:
1. `package.json`
2. `web/package.json`

### Step 2: Validate Builds and Test Suite
```bash
bun test
bun run build
```
Both commands must pass with zero errors before proceeding.

### Step 3: Commit and Push Changes
```bash
git add package.json web/package.json src/ web/ agents.md
git commit -m "chore(release): bump version to vX.Y.Z[-beta]"
git push origin <branch>
```

### Step 4: Publish Release via GitHub CLI
For Beta Releases:
```bash
gh release create v0.1.0-beta \
  --title "v0.1.0-beta" \
  --notes-file release_notes.md \
  --prerelease
```

For Stable Releases:
```bash
gh release create v1.0.0 \
  --title "v1.0.0" \
  --notes-file release_notes.md
```

---

## 5. In-App Updates & GitHub Releases Sync

- The Saturn Router frontend features an automated update detection engine in Settings > Updates.
- The Changelog tab in Settings pulls and formats releases from GitHub into clean, collapsible cards.
- Pre-releases: Users can opt in or out of beta builds using the "Include Beta / Pre-releases" switch.
