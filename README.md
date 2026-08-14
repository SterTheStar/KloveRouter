<div align="center">
  <img src="web/src/assets/klove-wordmark.svg" width="290" height="96" alt="Klove" />
  <p>
    Route OpenAI-compatible traffic, manage OAuth providers, rotate credentials,<br />
    and understand usage from one focused control plane.
  </p>
  <p>
    <img alt="Bun" src="https://img.shields.io/badge/Bun-1.x-171717?logo=bun&logoColor=white" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" />
    <img alt="React" src="https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white" />
    <img alt="Elysia" src="https://img.shields.io/badge/Elysia-1.x-7C3AED" />
    <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-Klove%20NC--SA-6B7280" /></a>
    <img alt="Last commit" src="https://img.shields.io/github/last-commit/SterTheStar/KloveRouter?logo=github&color=171717" />
  </p>
</div>

## Overview

Klove provides a single OpenAI-compatible endpoint in front of API-key and OAuth-backed AI providers. It combines request routing with a private administration panel for providers, models, credentials, pricing, usage, quotas, and request-level diagnostics.

## Supported Protocols

| Protocol          | Authentication | Notes                                                                                   |
| ----------------- | -------------- | --------------------------------------------------------------------------------------- |
| OpenAI-compatible | API key        | Chat completions, streaming, tools, usage, and cache metadata. Responses API is also supported.                          |
| Anthropic         | API key        | Native Messages conversion, tools, thinking, and prompt-cache accounting.               |
| Codex             | OAuth          | Responses API conversion, reasoning summaries, tools, usage, and account rotation.      |
| Antigravity       | Google OAuth   | Gemini, Claude, and GPT-family routing with thinking, quotas, tools, and model aliases. |
| Atomesus          | Bearer token   | Native models, effort controls, persistent sessions, and streaming responses.          |
| ChatGPT           | Session token/cookie | Authorized ChatGPT backend sessions stored encrypted; availability depends on the account and endpoint. |

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

| Variable               | Default              | Purpose                                                  |
| ---------------------- | -------------------- | -------------------------------------------------------- |
| `PORT`                 | `3000`               | Panel and API port. The server listens on `0.0.0.0`.     |
| `DB_PATH`              | `./data/klove.db`    | SQLite database path.                                    |
| `DEFAULT_PASSWORD`     | `klove123`           | Password seeded on the first database initialization.    |
| `JWT_SECRET`           | Development fallback | Signs panel sessions and acts as an encryption fallback. |
| `KLOVE_ENCRYPTION_KEY` | `JWT_SECRET`         | Encrypts provider credentials stored in SQLite.          |
| `LOG_LEVEL`            | `info`               | Set to `debug` for credential-selection diagnostics.     |
| `NODE_ENV`             | Development          | Use `production` to serve the built frontend from Bun.   |

> [!IMPORTANT]
> Set unique values for `DEFAULT_PASSWORD`, `JWT_SECRET`, and `KLOVE_ENCRYPTION_KEY` before exposing Klove outside a trusted network.

### OAuth Callback

Codex and Antigravity use a callback listener bound to `0.0.0.0` on port `1455`:

```text
http://0.0.0.0:1455/auth/callback
http://0.0.0.0:1455/antigravity/callback
```

The listener accepts connections on every network interface. Make port `1455` reachable from the machine or network completing OAuth authentication.

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

## License

Klove is source-available under the [Klove NC-SA License 1.0.0](LICENSE), where NC means Noncommercial and SA means Share-Alike. It is a modified form of PolyForm Noncommercial 1.0.0.

- Noncommercial use, study, modification, and redistribution are permitted.
- Copies, forks, and derivative works must provide their complete source code under the same license.
- Public network deployments must publish the corresponding source for the deployed version.
- Commercial use requires a separate written license from the licensor.

This license includes noncommercial restrictions and is therefore not an OSI-approved open-source license.

<div align="center">
  <h2>Support</h2>
  <p>If Klove is useful to you, consider supporting its development.</p>
  <p>
    <a href="https://www.buymeacoffee.com/sterzinhab9"><img height="50" src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=&slug=sterzinhab9&button_colour=FFDD00&font_colour=000000&font_family=Poppins&outline_colour=000000&coffee_colour=ffffff" alt="Buy me a coffee" /></a>
  </p>
  <p><sub>Made by <a href="https://github.com/SterTheStar">Esther</a> with &lt;3</sub></p>
</div>
