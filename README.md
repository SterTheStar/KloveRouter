<div align="center">
  <img src="web/src/assets/klove-wordmark.svg" width="290" height="96" alt="Klove" />
  <p>A self-hosted control plane for routing AI requests across providers and models.</p>
  <p>
    <img alt="Bun" src="https://img.shields.io/badge/Bun-1.x-171717?logo=bun&logoColor=white" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" />
    <img alt="React" src="https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white" />
    <img alt="Elysia" src="https://img.shields.io/badge/Elysia-1.x-7C3AED" />
    <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-Klove%20NC--SA-6B7280" /></a>
    <img alt="Last commit" src="https://img.shields.io/github/last-commit/SterTheStar/KloveRouter?logo=github&color=171717" />
  </p>
</div>

## What Klove does

Klove gives applications one API and one admin panel for multiple AI providers. Route OpenAI-compatible, Responses, and Anthropic Messages requests; manage provider credentials and models; and inspect request activity, token usage, and estimated costs.

Compound models expose a stable `pool/<id>` model that routes across selected provider models. Choose priority fallback or random selection, set member fallback behavior, and configure token limits.

## Integrations

| Integration | Credentials | API support |
| --- | --- | --- |
| OpenAI-compatible providers | API key | Chat Completions and Responses, including streaming |
| OpenAI-compatible media providers | API key | Image generation, edits and variations; text-to-speech; asynchronous video generation |
| Anthropic | API key | Messages API, tools, thinking, and streaming |
| Codex | OAuth | Responses-compatible requests and account rotation |
| Antigravity | Google OAuth | Gemini, Claude, and supported GPT-family models |
| ChatGPT | Session credentials | ChatGPT-backed models, depending on account access |

## Quick start

### Requirements

- [Bun](https://bun.sh/) 1.x
- A modern browser
- Credentials or an OAuth account for the providers you want to connect

### Install and start

```bash
git clone https://github.com/SterTheStar/KloveRouter.git
cd KloveRouter
bun install
cp .env.example .env
bun run start
```

Open [http://localhost:6999](http://localhost:6999). The example environment file sets port `6999`; if `PORT` is unset, Klove uses `3000`.

On first launch, complete the setup in the web panel. You can optionally set bootstrap values in `.env`; see the comments in `.env.example`. Before exposing the service beyond a trusted network, set strong, unique values for `JWT_SECRET`, `KLOVE_ENCRYPTION_KEY`, and `DEFAULT_PASSWORD`.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` (the example `.env` uses `6999`) | Panel and API port; listens on `0.0.0.0`. |
| `DB_PATH` | `./data/klove.db` | SQLite database path. |
| `DEFAULT_PASSWORD` | Generated during setup unless supplied | Optional first-run bootstrap password. |
| `PROFILE_NAME` | Set during setup | Optional first-run profile name. |
| `JWT_SECRET` | Generated during setup unless supplied | Signs panel sessions. |
| `KLOVE_ENCRYPTION_KEY` | Generated during setup unless supplied | Encrypts stored provider credentials. |
| `LOG_LEVEL` | `info` | Set to `debug` for additional diagnostics. |
| `NODE_ENV` | Development | Set to `production` to serve the built frontend from Bun. |

Keep the encryption key available with the database backup. Without the key used to encrypt credentials, those credentials cannot be recovered.

### OAuth callbacks

Codex and Antigravity use callback endpoints on port `1455`:

```text
http://localhost:1455/auth/callback
http://localhost:1455/antigravity/callback
```

Make port `1455` reachable from the browser completing the OAuth sign-in.

## Development

Install dependencies, then run the backend and frontend together:

```bash
bun install
bun run dev
```

Or start them separately:

```bash
bun run dev:backend
bun run dev:frontend
```

Build the frontend and check TypeScript with:

```bash
bun run build
bunx tsc --noEmit
```

## API examples

Create an API key in the Klove panel, then list available models:

```bash
curl http://localhost:6999/v1/models \
  -H "Authorization: Bearer $KLOVE_API_KEY"
```

Send a streaming Chat Completions request. Use a provider-prefixed model ID or a compound model ID such as `pool/reliable-chat`:

```bash
curl --no-buffer http://localhost:6999/v1/chat/completions \
  -H "Authorization: Bearer $KLOVE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "pool/reliable-chat",
    "messages": [{ "role": "user", "content": "Explain event streams briefly." }],
    "stream": true
  }'
```

Klove also accepts the OpenAI Responses API at `/v1/responses` and Anthropic Messages requests at `/v1/messages`. Responses from reasoning-capable models may include `reasoning_content` in streamed Chat Completions deltas when the provider supplies it.

OpenAI-compatible image endpoints are available at `/v1/images/generations`, `/v1/images/edits`, and `/v1/images/variations`. Text-to-speech is available at `/v1/audio/speech`. Video generation uses `/v1/videos` with the compatible list, retrieve, content, cancel, and delete operations. Set `model` to `provider/model` (or a compound model ID where supported), and mark each model's generation capabilities in the Models panel. Binary media responses are streamed through the gateway and their delivered byte count appears in Request Logs.

## Data and privacy

- Application data is stored in SQLite at `DB_PATH`.
- Provider secrets and OAuth tokens are encrypted before they are stored.
- Public API responses do not expose provider credentials.
- Request logs include operational metadata, token counts, account labels, and client IP addresses. Prompt and completion bodies are not stored in request logs; media prompt/input values are redacted and only their character count is retained.
- `.env` files and the `data/` directory are excluded from Git.

Back up the SQLite database and its encryption key together.

## License

Klove is source-available under the [Klove NC-SA License 1.0.0](LICENSE), a modified form of PolyForm Noncommercial 1.0.0. Noncommercial use, study, modification, and redistribution are permitted under the license terms. Copies, forks, and derivative works must provide their complete source under the same license, and public network deployments must publish the corresponding source. Commercial use requires a separate written license.

The license includes noncommercial restrictions and is not OSI-approved.

<div align="center">
  <h2>Support</h2>
  <p>If Klove is useful to you, consider supporting its development.</p>
  <p>
    <a href="https://www.buymeacoffee.com/sterzinhab9"><img height="50" src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=&slug=sterzinhab9&button_colour=FFDD00&font_colour=000000&font_family=Poppins&outline_colour=000000&coffee_colour=ffffff" alt="Buy me a coffee" /></a>
  </p>
  <p><sub>Made by <a href="https://github.com/SterTheStar">Esther</a> with &lt;3</sub></p>
</div>
