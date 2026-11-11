# Saturn Router — Agent & Contributor Guidelines

This document establishes development principles, repository standards, and mandatory release guidelines for agents and contributors working on **Saturn Router**.

---

## 1. Project Overview & Architecture

Saturn Router is a high-performance, self-hosted control plane for routing, monitoring, and managing artificial intelligence requests across multiple providers, protocols, and model endpoints.

### Tech Stack
- **Backend Runtime**: [Bun](https://bun.sh/) 1.x
- **Language**: TypeScript 5.x (strict mode)
- **API Framework**: [Elysia](https://elysiajs.com/) with JWT authentication and SQLite (`bun:sqlite`)
- **Web Interface**: React 19, Tailwind CSS v4, Vite, Remix Icons, Lucide Icons, Shadcn UI components
- **Protocol Converters**: Native translation between OpenAI (`/v1/chat/completions`), Responses API (`/v1/responses`), and Anthropic Messages (`/v1/messages`)

### Code Organization & Modularization
- Do not place unrelated features in single files.
- Keep API plugins under `src/api/` and core domain logic under `src/services/`.
- Keep third-party and vendor integrations isolated under `src/integrations/`.
- Frontend pages reside in `web/src/pages/` and modular widgets/tabs in `web/src/components/`.
- Maintain test coverage across all domain services and API route handlers (`*.test.ts`).

---

## 2. Release & Versioning Standards

Saturn Router strictly adheres to **Semantic Versioning 2.0.0 (SemVer)**.

### Version Formats
1. **Beta & Pre-releases**:
   - Format: `vMAJOR.MINOR.PATCH-beta.N` (e.g., `v0.1.0-beta.1`, `v0.1.0-beta.2`, `v1.0.0-beta.1`).
   - Flags: Must always be published with `--prerelease` in GitHub CLI.
   - Purpose: Feature testing, architectural iterations, and community feedback before stable availability.
2. **Final & Stable Releases**:
   - Format: `vMAJOR.MINOR.PATCH` (e.g., `v1.0.0`, `v1.0.1`, `v1.1.0`).
   - Flags: Published as the latest stable release (omitting `--prerelease`).
   - Purpose: Production-ready distribution.

### Source of Truth
The version string must always be updated synchronously across:
- Root `package.json` (`"version": "..."`)
- Web frontend `web/package.json` (`"version": "..."`)
- `src/version.ts` dynamically resolves `CURRENT_VERSION` from `package.json`.

---

## 3. Mandatory Release Notes & Traceability Rules

To maintain high software engineering standards, every published release must satisfy the **Commit Traceability Rule**.

### Commit Traceability Rule
> **Every feature, bug fix, provider integration, optimization, or capability mentioned in release notes MUST explicitly cite the commit hash where the change was introduced.**

#### Format
- Commit references must use the 7-character short commit SHA:
  - Example: `Support zip archive extraction on Windows without unzip utility (commit 980c2f8)`
  - Markdown link format: `([980c2f8](https://github.com/SterTheStar/SaturnRouter/commit/980c2f8))`

### Standardized Release Note Structure

Every release (Beta or Stable) must follow this exact section structure:

```markdown
# Saturn Router <TAG_NAME>

<Concise 2-3 sentence overview of this release milestone.>

## Key Highlights
- Summary of the most impactful capabilities added in this release.

## Supported Providers & Protocols
- Complete list of connected AI providers, loopback/OAuth integrations, and wire protocols with their respective commits.

## Guardrails, Security & Limits
- Security controls, AI firewall features, rate limiting, and token usage constraints with commits.

## Performance & Token Optimization
- Prompt caching, token compression (RTK / Caveman), and streaming optimizations with commits.

## Web Dashboard & UX Improvements
- Frontend enhancements, navigation changes, and UI refinements with commits.

## Bug Fixes & Stability
- Explicit list of bugs resolved with their corresponding commit hashes.

## How to Update
- Instructions for self-hosted users (Web panel one-click update and Git CLI instructions).
```

---

## 4. Release Publication Workflow (Step-by-Step)

Follow this rigorous procedure when preparing and publishing releases:

### Step 1: Bump Versions
Update the version string in:
1. `package.json`
2. `web/package.json`

### Step 2: Validate Builds and Test Suite
Run tests and compile the production bundle to ensure zero regressions:
```bash
bun test
bun run build
```
Both commands must pass with zero errors.

### Step 3: Gather Commit SHAs for Release Notes
Use git log to inspect commits introduced since the previous release:
```bash
git log --oneline -n 40
```
Map every bullet point in the release notes to its specific commit hash.

### Step 4: Commit and Push Release Prep
```bash
git add package.json web/package.json web/dist agents.md <other-modified-files>
git commit -m "chore(release): prepare vX.Y.Z[-beta.N]"
git push origin <branch>
```

### Step 5: Publish Release via GitHub CLI
For **Beta Releases**:
```bash
gh release create v0.1.0-beta.1 \
  --title "Saturn Router v0.1.0-beta.1" \
  --notes-file release_notes.md \
  --prerelease
```

For **Stable / Final Releases**:
```bash
gh release create v1.0.0 \
  --title "Saturn Router v1.0.0" \
  --notes-file release_notes.md
```

---

## 5. In-App Updates & GitHub Releases Sync

- The Saturn Router frontend features an automated update detection engine (`UpdatesTab` and `ChangelogTab`).
- The update system pulls releases from `https://api.github.com/repos/SterTheStar/SaturnRouter/releases`.
- **Pre-releases**: Users can opt in/out of beta releases via the *"Include Beta / Pre-releases"* toggle in **Settings > Updates**.
- **Changelog Page**: Releases published on GitHub automatically populate the **Settings > Changelog** tab with full Markdown rendering.
