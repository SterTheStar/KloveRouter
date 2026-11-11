# Saturn Router — Complete Project & Contributor Guidelines

This document serves as the comprehensive architectural guide, development standard, and release protocol for agents and contributors working on **Saturn Router**.

---

## 1. Project Overview & Mission

**Saturn Router** is a high-performance, self-hosted AI control plane and proxy gateway built on Bun and TypeScript. It bridges multiple LLM and media providers into a single unified endpoint with standard protocol conversions, robust authentication, credential rotation, model pooling (compound models), security guardrails, token usage tracking, and a reactive administrative dashboard.

### Core Value Proposition
- **Unified Gateway**: Send OpenAI Chat Completions, OpenAI Responses API, or Anthropic Messages requests interchangeably; Saturn routes and translates payloads transparently to the target provider.
- **Provider & Credential Orchestration**: Supports standard API keys, enterprise OAuth (Google Antigravity, OpenAI Codex), browser session emulation (ChatGPT, DeepAI Code loopback), and CLI session tokens (Perch AI, OpenFREE).
- **Compound Models (Model Pools)**: Create virtual models (`pool/<slug>`) providing automatic failover, priority fallback, or random load balancing across heterogeneous models and providers with configurable token limits.
- **Cost & Token Intelligence**: Calculates token usage (via `tiktoken`) and estimated costs using LiteLLM pricing tiers, tracking cache read/write, generation latencies, and tokens per second (TPS).
- **Multimodal & Media Hub**: Full proxying for image generation, edits, variations, text-to-speech, and asynchronous video generation jobs with binary streaming and byte accounting.
- **Advanced Interceptors & Plugins**: Built-in RTK (redundant tool output compression), Caveman token-saving concise prompting, configurable Guardrails (PII, secrets, injection, system prompt leaks), and Custom Skills / Design Systems marketplace injection.
- **Built-in Administrative Web UI**: Fast React 19 interface with real-time logs, full-text search chat, credential health tests, and update synchronization.

---

## 2. Technology Stack & Runtime

| Layer | Technologies |
| --- | --- |
| **Runtime & Tooling** | [Bun](https://bun.sh/) 1.x (native SQLite, fast HTTP, test runner, bundler) |
| **Language** | TypeScript 5.x (Strict mode enabled) |
| **Backend Framework** | [ElysiaJS](https://elysiajs.com/) 1.2+ with `@elysiajs/jwt`, `@elysiajs/cors`, `@elysiajs/static` |
| **Database** | SQLite via `bun:sqlite` with WAL mode, FTS5 full-text search, and automated migrations |
| **Frontend Framework** | React 19, Vite, Tailwind CSS v4, Lucide Icons, Remix Icons |
| **UI Components** | Radix UI primitives, Shadcn UI patterns |
| **Protocol Conversions** | Custom bidirectional converter SDK (`src/sdk/protocol-converter.ts`) |
| **Token Calculation** | `tiktoken` with model-specific encoding resolvers |

---

## 3. Architecture & Codebase Organization

The codebase strictly follows modular architecture principles. **Monolithic or one-file implementations are prohibited.** Functionalities must remain separated into clear domains, services, plugins, and UI layers.

```text
SaturnRouter/
├── .env.example             # Template for environment configuration
├── agents.md                # This guide: Architecture, Standards & Release Protocol
├── bun.lock                 # Root lockfile
├── entry.ts                 # Dev launcher running frontend and backend concurrently
├── index.ts                 # Production server entrypoint
├── package.json             # Root metadata, scripts, and dependencies
├── scripts/                 # Maintenance, versioning, and test seed scripts
│   ├── bump-version.ts      # Automated SemVer bumper across packages
│   ├── sync-version.ts      # Synchronizes root version to web/package.json
│   └── seed-fake-usage.ts   # Generates mock usage logs for UI development
├── src/                     # Backend domain logic and API gateway
│   ├── api/                 # Elysia routes and HTTP plugins
│   │   ├── auth.plugin.ts           # Panel authentication, login, setup status
│   │   ├── chat.plugin.ts           # Internal chat completions & streaming
│   │   ├── chats.plugin.ts          # Chat sessions, messages, and attachments
│   │   ├── media-proxy.plugin.ts    # DALL-E, TTS, and Video API endpoints
│   │   ├── model-pools.plugin.ts    # Model pool CRUD & routing rules
│   │   ├── models.plugin.ts         # Model catalog, capabilities & health tests
│   │   ├── proxy.plugin.ts          # Core gateway: /v1/chat/completions, /v1/messages, /v1/responses
│   │   ├── request-logs.plugin.ts   # Request auditing, detail viewers & search
│   │   └── updates.plugin.ts        # GitHub update check and updater endpoints
│   ├── clients/             # Upstream client callers (OpenAI, Anthropic)
│   ├── db/                  # SQLite schema definitions and database connection
│   │   ├── connection.ts    # SQLite instance initialization
│   │   └── schema.ts        # Table definitions, indices, and schema migrations
│   ├── integrations/        # Vendor-specific protocol adapters & authenticators
│   │   ├── antigravity/     # Google OAuth, Cloud Code hub endpoints, quota tracking
│   │   ├── atomesus/        # Atomesus session and streaming client
│   │   ├── chatgpt/         # ChatGPT web session emulation, headers, and conversation cache
│   │   ├── codex/           # OpenAI Codex OAuth, token refreshing, and turn tokens
│   │   ├── conol/           # Conol agent and session adapter
│   │   ├── deepai/          # DeepAI Code: loopback OAuth, lane 4 discovery, session affinity
│   │   ├── freebuff/        # Freebuff provider integration
│   │   ├── openfree/        # OpenCode CLI runner & Zen free models bridge
│   │   ├── perch/           # Perch AI turn ticket resolver and token rotation
│   │   └── qwen/            # Qwen provider integration
│   ├── plugins/             # Advanced proxy interceptors
│   │   ├── caveman/         # Concise token-saving prompt injection
│   │   ├── custom-skills/   # System prompt and design catalog skills injection
│   │   ├── guardrails/      # Inbound/outbound inspection (Secrets, PII, Injections, Env)
│   │   └── rtk/             # Redundant Tool Output Trimming manager & binary filters
│   ├── sdk/                 # Core protocol transformation engine
│   │   └── protocol-converter.ts  # Bidirectional OpenAI <-> Responses <-> Anthropic converter
│   └── services/            # Domain business logic
│       ├── credential.service.ts    # Key encryption, credential rotation & failover
│       ├── model-pool.service.ts    # Compound models routing & member selection
│       ├── request-log.service.ts   # Persistent audit logging with payload redaction
│       ├── secret.service.ts        # AES-GCM encryption for stored secrets
│       ├── token-counter/           # Token estimation engine
│       └── update/                  # GitHub Releases client and self-update engine
└── web/                     # React 19 administrative frontend
    ├── src/
    │   ├── api/client.ts    # Typed fetch client for backend API
    │   ├── components/      # UI components, modals, and design widgets
    │   ├── hooks/           # React hooks (useAuth, useQuery, useChatMessages)
    │   ├── lib/             # Utilities, model metadata helpers, and icons
    │   ├── pages/           # Routed views (Dashboard, Models, Pools, Logs, Chat, Settings...)
    │   └── templates/       # Predefined provider configuration presets
    └── vite.config.ts       # Vite bundler configuration
```

---

## 4. Key Subsystems & Lifecycle Flows

### 4.1. The Request Proxy Lifecycle (`/v1/chat/completions`, `/v1/messages`, `/v1/responses`)
1. **Request Intake & Normalization**: The gateway accepts requests in OpenAI Chat Completions format, Anthropic Messages format, or OpenAI Responses API format.
2. **Authentication**: Incoming requests require a valid Saturn API Key (`Authorization: Bearer <key>` or `x-api-key`). The key is hashed and matched against active keys in SQLite.
3. **Model Resolution**:
   - Standard models: Formatted as `provider/model` (e.g., `anthropic/claude-3-7-sonnet`, `deepai/gemini-2.5-pro`).
   - Compound models: Formatted as `pool/<slug>` (e.g., `pool/reliable-code`). Saturn resolves pool members and executes fallback/load balancing.
4. **Pre-Processing Interceptors**:
   - **RTK Filter**: Compresses repeated tool call outputs to conserve context window.
   - **Guardrails**: Inspects inbound messages for secrets, API keys, credentials, PII, and prompt injection patterns. Redacts or blocks according to configuration.
   - **Caveman Prompt**: Injects concise communication prompts to minimize output token consumption if enabled.
   - **Custom Skills / Design Systems**: Injects active behavioral or design system prompt rules.
5. **Credential Selection & Rotation**:
   - Resolves provider credentials based on the configured mode: `fixed`, `round_robin`, or `failover`.
   - Manages rate-limiting cooldown sequences and rotates credentials upon failures.
6. **Protocol Conversion**:
   - If calling an Anthropic upstream with an OpenAI request (or vice versa), `protocol-converter.ts` transforms messages, system prompts, tool definitions, tool calls, and streaming SSE chunks bidirectionally.
7. **Execution & Streaming**:
   - Emits Server-Sent Events (SSE) with `think-tag-fix` applied (ensuring unclosed `<think>` tags are safely handled).
8. **Logging & Accounting**:
   - Asynchronously calculates tokens, TPS, duration, and estimated cost via LiteLLM pricing tiers.
   - Stores sanitized payload summaries in `request_logs`.

### 4.2. Media Gateway (`/v1/images/*`, `/v1/audio/*`, `/v1/videos*`)
- Routes image generation, image editing, and image variations to OpenAI-compatible image endpoints.
- Proxies text-to-speech audio streams.
- Manages asynchronous video generation jobs (`/v1/videos`), storing job state and polling or delivering streaming byte outputs.

### 4.3. Data Storage & Security Model
- **SQLite Database**: Located at `DB_PATH` (`./data/saturn.db`). WAL mode ensures concurrent read/write performance.
- **At-Rest Encryption**: All provider secrets, API keys, and OAuth refresh tokens are encrypted using AES-GCM (`SATURN_ENCRYPTION_KEY`). Plaintext secrets are never stored or exposed in API responses.
- **SSRF Protection**: Enforces IP and domain validation on provider base URLs to prevent Server-Side Request Forgery against private local subnets.
- **Chat Attachments**: Large client file attachments in internal chats are chunked into 1 MB blobs in SQLite rather than inflated in memory or JSON columns. Full-text search (FTS5) indexes message content for instant search.

---

## 5. Coding & Development Standards

### 5.1. General Principles
- **Strict Typing**: No untyped `any` without an explicit justification or boundary parsing. Use TypeScript interfaces and Elysia/TypeBox validation (`t.*`).
- **No Monolithic Files**: Do not combine unrelated services or features into single files. Maintain single-responsibility modules.
- **Error Handling**: Use structured error responses adhering to OpenAI API standards (`{ error: { message, type, code } }`). Ensure upstream network aborts (`AbortController`) clean up resources immediately.
- **Sanitization**: Never log raw API secrets, sensitive user tokens, or sensitive credentials to terminal output or database request logs.

### 5.2. Testing & Quality Assurance
- Backend unit and integration tests are powered by Bun's native runner:
  ```bash
  bun test
  ```
- Before pushing any change, verify that all test suites pass with zero errors and that the frontend builds cleanly:
  ```bash
  bun test
  bun run build
  ```

---

## 6. Release & Versioning Standards

Saturn Router strictly adheres to [Semantic Versioning 2.0.0 (SemVer)](https://semver.org/).

### 6.1. Version Formats
1. **Beta & Pre-releases**:
   - Format: `vMAJOR.MINOR.PATCH-beta` (e.g. `v0.1.0-beta`, `v0.2.0-beta`, `v1.0.0-beta`).
   - Suffix rule: Do not append `.1` or build numbers to base beta tags unless explicitly requested.
   - Flags: Always publish with `--prerelease` in GitHub CLI.
   - Purpose: Initial releases, preview testing, and architecture milestones.
2. **Stable & Final Releases**:
   - Format: `vMAJOR.MINOR.PATCH` (e.g. `v1.0.0`, `v1.1.0`).
   - Flags: Published as the latest stable release (omitting `--prerelease`).
   - Purpose: General availability and production deployments.

### 6.2. Centralized Source of Truth
The version string is centralized in the root `package.json` (`"version": "..."`):
- `web/package.json` is kept in sync automatically via `bun scripts/sync-version.ts` (executed during `bun run build` and `bun run dev`).
- `src/version.ts` dynamically resolves `CURRENT_VERSION` from `package.json`.
- `web/src/version.ts` receives the version injected directly by Vite.
- To bump versions across the entire codebase in a single command, run:
  ```bash
  bun run version:bump <new-version>
  # Example: bun run version:bump 0.2.0-beta
  ```

---

## 7. Release Notes Protocol (Hydra-style GitHub Standard)

Every release must follow the clean, conventional GitHub release notes structure (matching the Hydra Launcher standard).

### 7.1. Strict Rules
- **No Emojis**: Never use emojis in release titles, section headers, or bullet items.
- **Conventional Case**: Use standard Title Case or Sentence Case for headers. Never use ALL-CAPS titles.
- **Commit Attribution**: Every change listed under *What's Changed* must cite the commit SHA and the author (e.g., `@SterTheStar in abc1234`).
- **No Commit Repetition**: Release notes must strictly contain only commits created since the previous release tag (`git log <previous-tag>..HEAD`). Never repeat commits that were already published in previous releases.
- **Ephemeral Release Notes**: The `release_notes.md` file is ignored in `.gitignore` and must be deleted immediately after publishing to keep the working tree clean.

### 7.2. Standardized Release Template

```markdown
## What's Changed

- feat(scope): concise description of change by @SterTheStar in abc1234
- fix(scope): concise description of fix by @SterTheStar in def5678

**Full Changelog**: https://github.com/SterTheStar/SaturnRouter/compare/<previous-tag>...<current-tag>
```

---

## 8. Release Publication Workflow

Follow this exact procedure when preparing and publishing releases:

### Step 0: Fetch Remote Tags
Always fetch the latest tags from the remote repository before checking tags, determining the next version, or gathering release notes:
```bash
git fetch --tags
```
Never rely solely on local tags: tags published through GitHub Releases or remote environments are only recognized locally after an explicit `git fetch --tags`.

### Step 1: Bump Versions
Run the centralized version bump script:
```bash
bun run version:bump <new-version>
# Example: bun run version:bump 0.2.0-beta
```

### Step 2: Validate Builds and Test Suite
Both commands must pass with zero errors before proceeding:
```bash
bun test
bun run build
```

### Step 3: Gather Commits Since Previous Tag
Inspect exclusively commits made since the last published release tag to avoid duplicating commits across updates:
```bash
PREV_TAG=$(git describe --tags --abbrev=0)
git log ${PREV_TAG}..HEAD --pretty=format:"- %s by @SterTheStar in %h"
```
Save these entries into a temporary `release_notes.md` file following the template in Section 7.2.

### Step 4: Commit and Push Changes
```bash
git add package.json web/package.json src/ web/ agents.md .gitignore
git commit -m "chore(release): bump version to vX.Y.Z[-beta]"
git push origin <branch>
```

### Step 5: Publish Release via GitHub CLI
For Beta / Pre-releases:
```bash
gh release create v0.2.0-beta \
  --title "v0.2.0-beta" \
  --notes-file release_notes.md \
  --prerelease
```

For Stable Releases:
```bash
gh release create v1.0.0 \
  --title "v1.0.0" \
  --notes-file release_notes.md
```

### Step 6: Clean Up Ephemeral Notes
Always delete the temporary release notes file after publishing:
```bash
rm release_notes.md
```

---

## 9. In-App Updates & GitHub Releases Sync

- **Automated Update Detection**: Saturn Router includes a background update worker (`src/services/update/`) that periodically checks the GitHub Releases API for new tags.
- **UI Management**: In **Settings > Updates**, users can view available updates, inspect the formatted Hydra-style changelog, and initiate self-updates when running on supported platforms.
- **Pre-release Opt-In**: Users can toggle "Include Beta / Pre-releases" to receive notification of pre-release builds.
- **Attribution Linking**: Author mentions (`@username`) and commit hashes in release notes automatically link to GitHub in the panel interface.
