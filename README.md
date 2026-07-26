<div align="center">
  <img src="web/src/assets/klove-mark.svg" width="88" height="88" alt="Klove logo" />
  <h1>Klove</h1>
  <p><strong>A private, observable AI gateway for every model provider.</strong></p>
  <p>
    Route OpenAI-compatible traffic, manage OAuth providers, rotate credentials,<br />
    and understand usage from one focused control plane.
  </p>
  <p>
    <img alt="Bun" src="https://img.shields.io/badge/Bun-1.x-171717?logo=bun&logoColor=white" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" />
    <img alt="React" src="https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white" />
    <img alt="Elysia" src="https://img.shields.io/badge/Elysia-1.x-7C3AED" />
    <img alt="Last commit" src="https://img.shields.io/github/last-commit/SterTheStar/KloveRouter?logo=github&color=171717" />
  </p>
</div>

## Overview

Klove provides a single OpenAI-compatible endpoint in front of API-key and OAuth-backed AI providers. It combines request routing with a private administration panel for providers, models, credentials, pricing, usage, quotas, and request-level diagnostics.

```text
Application / IDE
       |
       |  OpenAI Chat Completions
       v
     Klove
       |
       +-- OpenAI-compatible APIs
       +-- Anthropic Messages API
       +-- Codex OAuth
       +-- Google Antigravity OAuth
```

## Highlights

| Capability | Description |
| --- | --- |
| Unified API | Exposes models through `POST /v1/chat/completions` and `GET /v1/models`. |
| Provider routing | Uses stable provider-prefixed model IDs to route each request. |
| Credential rotation | Supports fixed credentials and resilient round-robin selection with cooldowns. |
| OAuth integrations | Connects Codex and Google Antigravity accounts without placing tokens in client applications. |
| Streaming | Converts provider-native streams to OpenAI-compatible SSE with reasoning and tool-call deltas. |
| Observability | Records request status, account, client IP, latency, throughput, tokens, cache usage, and estimated cost. |
| Pricing | Stores editable per-model pricing tiers for input, output, cache reads, and cache writes. |
| Operations | Displays model availability, OAuth quota windows, usage history, and per-provider statistics. |
| Private control plane | Protects the panel with password authentication and encrypts provider credentials at rest. |

## Supported Protocols

| Protocol | Authentication | Notes |
| --- | --- | --- |
| OpenAI-compatible | API key | Chat completions, streaming, tools, usage, and cache metadata. |
| Anthropic | API key | Native Messages conversion, tools, thinking, and prompt-cache accounting. |
| Codex | OAuth | Responses API conversion, reasoning summaries, tools, usage, and account rotation. |
| Antigravity | Google OAuth | Gemini, Claude, and GPT-family routing with thinking, quotas, tools, and model aliases. |

## Quick Start

### Requirements

- [Bun](https://bun.sh/) 1.x
- A modern browser
- Provider credentials or an OAuth account to connect

### Install

```bash
git clone https://github.com/SterTheStar/KloveRouter.git
cd KloveRouter
bun install
cp .env.example .env
```

Generate secure application secrets before starting a production instance:

```bash
openssl rand -base64 32
```

Add the generated values to `.env`, then build and start Klove:

```bash
bun run build
bun run start
```

Open [http://localhost:3000](http://localhost:3000). The initial password is taken from `DEFAULT_PASSWORD`; change it from **Settings** after the first login.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Panel and API port. The server listens on `0.0.0.0`. |
| `DB_PATH` | `./data/klove.db` | SQLite database path. |
| `DEFAULT_PASSWORD` | `klove123` | Password seeded on the first database initialization. |
| `JWT_SECRET` | Development fallback | Signs panel sessions and acts as an encryption fallback. |
| `KLOVE_ENCRYPTION_KEY` | `JWT_SECRET` | Encrypts provider credentials stored in SQLite. |
| `LOG_LEVEL` | `info` | Set to `debug` for credential-selection diagnostics. |
| `NODE_ENV` | Development | Use `production` to serve the built frontend from Bun. |

> [!IMPORTANT]
> Set unique values for `DEFAULT_PASSWORD`, `JWT_SECRET`, and `KLOVE_ENCRYPTION_KEY` before exposing Klove outside a trusted network.

### OAuth Callback

Codex and Antigravity use a callback listener on port `1455`:

```text
http://localhost:1455/auth/callback
http://localhost:1455/antigravity/callback
```

The callback URLs intentionally remain on `localhost` for provider compatibility. Allow local access to port `1455` while completing OAuth authentication.

## Development

Run the backend and Vite development server together:

```bash
bun run dev
```

Or run them independently:

```bash
bun run dev:backend
bun run dev:frontend
```

Validate a production build with:

```bash
bunx tsc --noEmit
bun run build
```

## API Usage

Create an API key from the Klove panel, then list the routed models:

```bash
curl http://localhost:3000/v1/models \
  -H "Authorization: Bearer $KLOVE_API_KEY"
```

Send a streaming chat completion using a provider-prefixed model ID:

```bash
curl --no-buffer http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer $KLOVE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "googleantigravity/gemini-3-flash",
    "messages": [{ "role": "user", "content": "Explain event streams briefly." }],
    "stream": true
  }'
```

Reasoning-capable providers expose streamed thinking through `choices[].delta.reasoning_content` when the upstream model returns it.

## Data and Security

- Klove stores application state in SQLite under `DB_PATH`.
- API secrets and OAuth tokens are encrypted before persistence.
- Provider credentials are never returned through public API responses.
- Request logs store operational metadata, token counts, account labels, and client IP addresses; they do not store prompt or completion bodies.
- The `data/` directory and `.env` files are excluded from Git.

Back up the SQLite database and encryption key together. An encrypted database cannot be recovered without the key used to write it.

## Project Structure

```text
src/
  api/              HTTP routes and protocol gateway
  clients/          Provider API clients
  db/               SQLite connection and schema
  integrations/     Codex and Antigravity integrations
  services/         Models, credentials, usage, and logs
web/src/
  components/       Shared interface components
  pages/            Control-panel pages
  api/              Browser API client
```

## Support

If Klove is useful to you, consider supporting its development:

<a href="https://www.buymeacoffee.com/sterzinhab9"><img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=&slug=sterzinhab9&button_colour=FFDD00&font_colour=000000&font_family=Poppins&outline_colour=000000&coffee_colour=ffffff" alt="Buy me a coffee" /></a>

<div align="center">
  Made by <a href="https://github.com/SterTheStar">Esther</a> with &lt;3
</div>
