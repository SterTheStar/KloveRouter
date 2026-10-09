import { useMemo, useState, type ReactNode } from "react";
import {
  RiArrowRightLine as ArrowRight,
  RiCheckLine as Check,
  RiClipboardLine as Clipboard,
  RiExternalLinkLine as ExternalLink,
  RiKey2Line as KeyIcon,
  RiSearchLine as Search,
} from "@remixicon/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { copyToClipboard } from "@/lib/clipboard";

type DocId = "overview" | "quickstart" | "auth" | "models" | "compound-models" | "chat" | "responses" | "messages" | "images" | "speech" | "videos" | "streaming" | "claude-code" | "codex" | "opencode";
type DocGroup = "Guide" | "API reference" | "Integrations";
type DocItem = { id: DocId; title: string; group: DocGroup; description: string; keywords: string };

const docs: DocItem[] = [
  { id: "overview", title: "Overview", group: "Guide", description: "Klove Router API at a glance", keywords: "gateway openai compatible endpoints capabilities" },
  { id: "quickstart", title: "Quickstart", group: "Guide", description: "Make your first request", keywords: "curl node python rust install api key" },
  { id: "auth", title: "Authentication", group: "Guide", description: "API keys and base URLs", keywords: "bearer authorization x-api-key" },
  { id: "models", title: "List models", group: "API reference", description: "Discover available model IDs", keywords: "GET catalog models pool capabilities" },
  { id: "compound-models", title: "Compound models", group: "Guide", description: "Routing and fallback behavior", keywords: "pool priority random member fallback routing" },
  { id: "chat", title: "Chat Completions", group: "API reference", description: "OpenAI chat format", keywords: "POST messages tools stream sse" },
  { id: "responses", title: "Responses", group: "API reference", description: "OpenAI Responses format", keywords: "POST input output response" },
  { id: "messages", title: "Anthropic Messages", group: "API reference", description: "Anthropic-compatible messages", keywords: "POST anthropic claude system content" },
  { id: "images", title: "Image generation", group: "API reference", description: "Generate, edit, and vary images", keywords: "POST images generations edits variations multipart" },
  { id: "speech", title: "Text to speech", group: "API reference", description: "Generate audio from text", keywords: "POST audio speech voice mp3 bytes" },
  { id: "videos", title: "Video generation", group: "API reference", description: "Create and manage video jobs", keywords: "POST GET DELETE videos status content cancel" },
  { id: "streaming", title: "Streaming and errors", group: "API reference", description: "SSE, passthrough, and error handling", keywords: "streaming sse chunks buffer event errors status" },
  { id: "claude-code", title: "Claude Code", group: "Integrations", description: "Connect Claude Code to Klove", keywords: "anthropic base url token env" },
  { id: "codex", title: "Codex CLI", group: "Integrations", description: "Configure a custom Codex provider", keywords: "openai config toml responses wire_api" },
  { id: "opencode", title: "OpenCode", group: "Integrations", description: "Add Klove as a custom provider", keywords: "opencode json npm baseURL model" },
];

const codeSamples: Record<string, Record<string, string>> = {
  quickstart: {
    cURL: `curl "$KLOVE_BASE_URL/chat/completions" \\
  -H "Authorization: Bearer $KLOVE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"provider/model-id","messages":[{"role":"user","content":"Hello!"}]}'`,
    "Node.js": `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.KLOVE_API_KEY,
  baseURL: process.env.KLOVE_BASE_URL,
});

const result = await client.chat.completions.create({
  model: "provider/model-id",
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(result.choices[0]?.message.content);`,
    Python: `from openai import OpenAI
import os

client = OpenAI(
    api_key=os.environ["KLOVE_API_KEY"],
    base_url=os.environ["KLOVE_BASE_URL"],
)

result = client.chat.completions.create(
    model="provider/model-id",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(result.choices[0].message.content)`,
    Rust: `// Cargo.toml dependencies: reqwest = { version = "0.12", features = ["json"] }, serde_json = "1", tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
use reqwest::Client;
use serde_json::json;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let base = std::env::var("KLOVE_BASE_URL")?;
    let key = std::env::var("KLOVE_API_KEY")?;
    let response = Client::new()
        .post(format!("{base}/chat/completions"))
        .bearer_auth(key)
        .json(&json!({
            "model": "provider/model-id",
            "messages": [{"role": "user", "content": "Hello!"}]
        }))
        .send().await?.error_for_status()?;
    println!("{}", response.text().await?);
    Ok(())
}`,
  },
  chat: {
    cURL: `curl "$KLOVE_BASE_URL/chat/completions" \\
  -H "Authorization: Bearer $KLOVE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"provider/model-id","messages":[{"role":"user","content":"Explain streaming"}],"stream":true}'`,
    "Node.js": `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.KLOVE_API_KEY,
  baseURL: process.env.KLOVE_BASE_URL,
});

const stream = await client.chat.completions.create({
  model: "provider/model-id",
  messages: [{ role: "user", content: "Explain streaming" }],
  stream: true,
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}`,
    Python: `import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["KLOVE_API_KEY"],
    base_url=os.environ["KLOVE_BASE_URL"],
)

stream = client.chat.completions.create(
    model="provider/model-id",
    messages=[{"role": "user", "content": "Explain streaming"}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="", flush=True)`,
    Rust: `// Cargo.toml dependencies: reqwest = { version = "0.12", features = ["json", "stream"] }, serde_json = "1", tokio = { version = "1", features = ["macros", "rt-multi-thread"] }, futures-util = "0.3"
use futures_util::TryStreamExt;
use reqwest::Client;
use serde_json::json;
use std::{env, io::{self, Write}};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let base = "{{KLOVE_API_BASE}}";
    let key = env::var("KLOVE_API_KEY")?;
    let response = Client::new().post(format!("{base}/chat/completions"))
        .bearer_auth(key)
        .json(&json!({"model":"provider/model-id", "messages":[{"role":"user","content":"Hi"}], "stream":true}))
        .send().await?.error_for_status()?;
    let mut chunks = response.bytes_stream();
    while let Some(chunk) = chunks.try_next().await? {
        io::stdout().write_all(&chunk)?;
        io::stdout().flush()?;
    }
    Ok(())
}`,
  },
  images: {
    cURL: `curl "$KLOVE_BASE_URL/images/generations" \\
  -H "Authorization: Bearer $KLOVE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"provider/image-model","prompt":"A glass observatory in the mountains"}'`,
    "Node.js": `const baseURL = "{{KLOVE_API_BASE}}";
const apiKey = process.env.KLOVE_API_KEY;
const result = await fetch(baseURL + "/images/generations", {
  method: "POST", headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
  body: JSON.stringify({ model: "provider/image-model", prompt: "A glass observatory in the mountains" }),
});
console.log(await result.json());`,
    Python: `import os
import requests

BASE_URL = "{{KLOVE_API_BASE}}"
API_KEY = os.environ["KLOVE_API_KEY"]

response = requests.post(
    f"{BASE_URL}/images/generations",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={"model": "provider/image-model", "prompt": "A glass observatory in the mountains"},
)
response.raise_for_status()
print(response.json())`,
    Rust: `// Cargo.toml dependencies: reqwest = { version = "0.12", features = ["json"] }, serde_json = "1", tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
use reqwest::Client;
use serde_json::json;
use std::env;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let base = "{{KLOVE_API_BASE}}";
    let key = env::var("KLOVE_API_KEY")?;
    let response = Client::new().post(format!("{base}/images/generations"))
        .bearer_auth(key)
        .json(&json!({"model":"provider/image-model", "prompt":"A glass observatory in the mountains"}))
        .send().await?.error_for_status()?;
    println!("{}", response.text().await?);
    Ok(())
}`,
  },
};

function CodeBlock({ code, language = "json", label }: { code: string; language?: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const appOrigin = window.location.origin;
  const apiBase = `${appOrigin}/v1`;
  const displayCode = code
    .replaceAll("{{KLOVE_API_BASE}}", apiBase)
    .replaceAll("http://localhost:3000/v1", apiBase)
    .replaceAll("http://localhost:3000", appOrigin)
    .replaceAll("$KLOVE_BASE_URL", apiBase)
    .replaceAll("process.env.KLOVE_BASE_URL", JSON.stringify(apiBase))
    .replaceAll('os.environ["KLOVE_BASE_URL"]', JSON.stringify(apiBase))
    .replaceAll('std::env::var("KLOVE_BASE_URL")?', JSON.stringify(apiBase));
  return <div className="overflow-hidden rounded-xl border border-border bg-card">
    <div className="flex h-10 items-center justify-between border-b border-border bg-muted/30 px-3 text-xs text-muted-foreground">
      <span>{label ?? language}</span>
      <Button size="xs" variant="ghost" className="h-7 gap-1.5" onClick={() => { void copyToClipboard(displayCode).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1200); }); }}>
        {copied ? <Check className="size-3.5" /> : <Clipboard className="size-3.5" />}{copied ? "Copied" : "Copy"}
      </Button>
    </div>
    <pre className="overflow-x-auto p-4 text-[12px] leading-6 text-foreground"><code>{displayCode}</code></pre>
  </div>;
}

function ExampleTabs({ sample, languages = ["cURL", "Node.js", "Python", "Rust"] }: { sample: keyof typeof codeSamples; languages?: string[] }) {
  const [language, setLanguage] = useState(languages[0]);
  return <div className="space-y-2">
    <div className="flex flex-wrap gap-1 rounded-lg bg-muted/50 p-1">
      {languages.map((name) => <button key={name} className={`rounded-md px-3 py-1.5 text-xs transition-colors ${language === name ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`} onClick={() => setLanguage(name)}>{name}</button>)}
    </div>
    <CodeBlock code={codeSamples[sample][language]} language={language} />
  </div>;
}

function SectionTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="mb-7 space-y-2"><p className="text-xs font-semibold tracking-[0.08em] text-primary">{eyebrow}</p><h1 className="text-3xl font-semibold tracking-tight">{title}</h1><p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p></div>;
}

function Endpoint({ method, path, description }: { method: string; path: string; description: string }) {
  const color = method === "GET" ? "text-emerald-400" : method === "DELETE" ? "text-red-400" : "text-sky-400";
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-card px-4 py-3"><Badge variant="outline" className={`font-mono ${color}`}>{method}</Badge><code className="text-sm font-medium">{path}</code><span className="ml-auto text-xs text-muted-foreground">{description}</span></div>;
}

function Callout({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-primary/25 bg-primary/5 px-4 py-3 text-sm leading-6 text-muted-foreground">{children}</div>;
}

export default function DocsPage() {
  const [active, setActive] = useState<DocId>("overview");
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => docs.filter((item) => `${item.title} ${item.description} ${item.keywords}`.toLowerCase().includes(search.trim().toLowerCase())), [search]);
  const selected = docs.find((item) => item.id === active)!;

  return <div className="min-h-full bg-background">
    <div className="grid min-h-full w-full min-w-0 md:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="flex flex-col border-b bg-muted/10 p-4 md:sticky md:top-0 md:h-svh md:overflow-hidden md:border-b-0 md:border-r md:p-5">
        <div className="shrink-0">
        <div className="mb-6 px-2 pt-1">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="size-8 shrink-0 text-foreground">
              <path d="M5.6906 6.00001L3.16512 1.62576C4.50811 0.605527 6.18334 0 8 0C8.37684 0 8.74759 0.0260554 9.11056 0.076463L5.6906 6.00001Z" fill="currentColor" />
              <path d="M5.11325 9L1.69363 3.07705C0.632438 4.43453 0 6.14341 0 8C0 8.33866 0.0210434 8.67241 0.0618939 9H5.11325Z" fill="currentColor" />
              <path d="M4.89635 15.3757C2.93947 14.5512 1.37925 12.9707 0.581517 11H7.42265L4.89635 15.3757Z" fill="currentColor" />
              <path d="M8 16C7.62316 16 7.25241 15.9739 6.88944 15.9235L10.3094 10L12.8349 14.3742C11.4919 15.3945 9.81666 16 8 16Z" fill="currentColor" />
              <path d="M16 8C16 9.85659 15.3676 11.5655 14.3064 12.9229L10.8868 7H15.9381C15.979 7.32759 16 7.66141 16 8Z" fill="currentColor" />
              <path d="M11.1036 0.624326C13.0605 1.44877 14.6208 3.02927 15.4185 5H8.57735L11.1036 0.624326Z" fill="currentColor" />
            </svg>
            <span className="text-xl font-semibold tracking-tight">Klove Docs</span>
          </div>
        </div>
        <div className="relative mb-5"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search documentation" placeholder="Search docs..." className="h-10 pl-9" value={search} onChange={(event) => { const value = event.target.value; setSearch(value); const match = docs.find((item) => `${item.title} ${item.description} ${item.keywords}`.toLowerCase().includes(value.trim().toLowerCase())); if (match) setActive(match.id); }} /></div>
        </div>
        <nav className="min-h-0 space-y-5 md:flex-1 md:overflow-y-auto md:overscroll-contain md:pr-1" aria-label="Documentation navigation">
          {(["Guide", "API reference", "Integrations"] as DocGroup[]).map((section) => {
            const items = filtered.filter((item) => item.group === section);
            if (!items.length) return null;
            return <div key={section}><div className="mb-2 px-2 text-xs font-semibold tracking-wide text-muted-foreground">{section}</div><div className="space-y-0.5">{items.map((item) => <button key={item.id} onClick={() => setActive(item.id)} className={`group flex w-full items-center justify-between rounded-lg px-2.5 py-2.5 text-left text-sm font-medium transition-colors ${active === item.id ? "bg-primary/10 text-primary" : "text-foreground/80 hover:bg-muted"}`}><span>{item.title}</span>{active === item.id && <ArrowRight className="size-3.5 shrink-0" />}</button>)}</div></div>;
          })}
          {!filtered.length && <div className="px-2 py-8 text-center text-sm text-muted-foreground">No documentation matches “{search}”.</div>}
        </nav>
        <footer className="mt-6 shrink-0 border-t border-border/60 pt-3 md:mt-0">
          <div className="flex h-9 items-center justify-between gap-2">
            <a href="/providers" className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="truncate">Open Klove Router</span>
              <ArrowRight className="ml-auto size-4 shrink-0" />
            </a>
            <a href="/api-keys" aria-label="Open API Keys" title="API Keys" className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <KeyIcon className="size-4" />
            </a>
          </div>
        </footer>
      </aside>
      <article className="min-w-0 px-5 py-7 md:px-10 md:py-9 lg:px-14">
        <div className="mx-auto max-w-4xl">
          <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
            <div><h1 className="text-xl font-semibold tracking-tight">Developer documentation</h1><p className="mt-1 text-sm text-muted-foreground">API reference, integration guides, and working examples.</p></div>
          </header>
          <div className="mb-7 flex items-center gap-2 text-xs text-muted-foreground"><a href="/docs#overview" className="hover:text-foreground hover:underline">Docs</a><span>/</span><span>{selected.group}</span><span>/</span><span className="text-foreground">{selected.title}</span></div>
          <div className="flex flex-col gap-5 [&>*]:!my-0">
            <DocContent id={active} />
          </div>
        </div>
      </article>
    </div>
  </div>;
}

function DocContent({ id }: { id: DocId }) {
  switch (id) {
    case "overview": return <><SectionTitle eyebrow="Klove Router" title="One API for your model providers" description="Klove Router exposes authenticated OpenAI-compatible chat, Responses, and media APIs, plus an Anthropic Messages endpoint. Chat requests can route to individual providers or compound models; media requests route to a direct provider model." /><div className="grid gap-3 sm:grid-cols-2">{[["Chat & tools", "Chat Completions with streaming, tool calls, and multimodal message content.", "chat"], ["Responses", "Responses API-compatible requests for clients built on the OpenAI Responses format.", "responses"], ["Anthropic Messages", "A Messages-compatible interface for Claude Code and Anthropic SDK clients.", "messages"], ["Media", "Image generation, image edits and variations, text-to-speech, and asynchronous video jobs.", "images"]].map(([title, body, target]) => <a key={title} href={`/docs#${target}`} className="group rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><div className="mb-1 flex items-center justify-between font-medium">{title}<ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" /></div><p className="text-sm leading-6 text-muted-foreground">{body}</p></a>)}</div><h2 className="mb-3 mt-9 text-lg font-semibold">Endpoint reference</h2><div className="space-y-2"><Endpoint method="GET" path="/v1/models" description="List active provider and compound models" to="models" /><Endpoint method="POST" path="/v1/chat/completions" description="OpenAI Chat Completions" to="chat" /><Endpoint method="POST" path="/v1/responses" description="OpenAI Responses" to="responses" /><Endpoint method="POST" path="/v1/messages" description="Anthropic Messages" to="messages" /><Endpoint method="POST" path="/v1/images/generations" description="Generate images" to="images" /><Endpoint method="POST" path="/v1/images/edits" description="Edit images · multipart upload" to="images" /><Endpoint method="POST" path="/v1/images/variations" description="Image variations · multipart upload" to="images" /><Endpoint method="POST" path="/v1/audio/speech" description="Text-to-speech audio bytes" to="speech" /><Endpoint method="POST" path="/v1/videos" description="Create a video job" to="videos" /><Endpoint method="GET" path="/v1/videos" description="List Klove-created jobs" to="videos" /><Endpoint method="GET" path="/v1/videos/:id" description="Retrieve job status" to="videos" /><Endpoint method="GET" path="/v1/videos/:id/content" description="Download video content" to="videos" /><Endpoint method="POST" path="/v1/videos/:id/cancel" description="Cancel a job" to="videos" /><Endpoint method="DELETE" path="/v1/videos/:id" description="Delete a job" to="videos" /></div><div className="mt-7 space-y-3"><Callout>Media support depends on the selected active model and the upstream provider. Media routes require a direct <code>provider/model</code> ID; compound models are currently for chat-compatible routes.</Callout><Callout>Authenticated API requests appear in <a href="/request-logs" className="font-medium text-foreground underline underline-offset-4 hover:text-primary">Request Logs</a>. Text streams report delivered characters; speech and video content streams report delivered bytes.</Callout></div></>;
    case "quickstart": return <><SectionTitle eyebrow="Guide" title="Make your first request" description="Use a gateway API key and a model ID returned by the catalog. Set the base URL to your Klove server, including /v1." /><Callout>Examples below use this Klove instance's base URL: <code>{window.location.origin}/v1</code>. Keep the API key in an environment variable and never ship it in browser code.</Callout><div className="mt-6"><ExampleTabs sample="quickstart" /></div><h2 className="mb-3 mt-8 text-lg font-semibold">What you need</h2><ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground"><li>A gateway API key created on the <a href="/api-keys" className="text-foreground underline underline-offset-4 hover:text-primary">API Keys page</a>.</li><li>An active provider with an enabled model, or an enabled compound model.</li><li>The exact public model ID from <a href="/docs#models" className="text-foreground underline underline-offset-4 hover:text-primary"><code>GET /v1/models</code></a>.</li></ul></>;
    case "auth": return <><SectionTitle eyebrow="Guide" title="Authentication" description="Authenticate requests with a Klove API key. The gateway validates the key before routing the request." /><div className="space-y-3"><p className="text-sm leading-6 text-muted-foreground">OpenAI-compatible endpoints accept the standard bearer token header. The Anthropic Messages endpoint also accepts the Anthropic <code>x-api-key</code> header; bearer authentication works through the gateway key verifier.</p><CodeBlock language="http" code={`Authorization: Bearer $KLOVE_API_KEY\nContent-Type: application/json`} /><p className="text-sm leading-6 text-muted-foreground">The OpenAI-compatible base URL for this instance is <code>{window.location.origin}/v1</code>. Use HTTPS and secret storage in deployed environments.</p><Callout>Missing or invalid keys return HTTP 401. Do not put secrets in source control, client-side bundles, or URLs.</Callout></div></>;
    case "models": return <>
      <SectionTitle eyebrow="API reference · GET" title="List available models" description="Fetch active models visible to the API key. Use the exact returned id as the model field in requests." />
      <Endpoint method="GET" path="/v1/models" description="Requires a valid API key" />
      <div className="mt-5 space-y-4">
        <CodeBlock language="bash" code={`curl "$KLOVE_BASE_URL/models" \\
  -H "Authorization: Bearer $KLOVE_API_KEY"`} />
        <CodeBlock language="json" code={`{
  "object": "list",
  "data": [
    {
      "id": "provider/model-id",
      "object": "model",
      "created": 1735689600,
      "owned_by": "provider",
      "context_window": 128000,
      "max_output_tokens": 8192,
      "capabilities": { "tools": true, "streaming": true }
    },
    { "id": "pool/reliable-chat", "object": "model", "owned_by": "klove" }
  ]
}`} />
        <p className="text-sm leading-6 text-muted-foreground">Provider IDs use <code>provider/model</code>; when a public model ID is configured, that value appears after the slash instead of the upstream model ID. Active compound models use <code>pool/slug</code>. Disabled models and pool members hidden by catalog rules are omitted. Capability, context, and reasoning metadata is included where available.</p>
      </div>
    </>;
    case "compound-models": return <><SectionTitle eyebrow="Guide" title="Compound model routing" description="A compound model exposes one stable pool ID and routes compatible chat requests to its configured provider models." /><CodeBlock language="bash" code={`curl "$KLOVE_BASE_URL/chat/completions" \\
  -H "Authorization: Bearer $KLOVE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"pool/reliable-chat","messages":[{"role":"user","content":"Hello"}]}'`} /><h2 className="mb-3 mt-7 text-lg font-semibold">Strategies</h2><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border bg-card p-4"><h3 className="mb-1 font-medium">Priority</h3><p className="text-sm leading-6 text-muted-foreground">Members are attempted in configured order. A member's fallback setting controls whether the router may continue after an eligible failure.</p></div><div className="rounded-xl border bg-card p-4"><h3 className="mb-1 font-medium">Random</h3><p className="text-sm leading-6 text-muted-foreground">The router shuffles the member order for each request. Fallback settings still control whether it may try another member.</p></div></div><h2 className="mb-3 mt-7 text-lg font-semibold">Fallback behavior</h2><p className="mb-4 text-sm leading-6 text-muted-foreground">Fallback can proceed when an enabled member is incompatible with the request, the provider connection fails, or the upstream returns a retryable response such as 401, 403, 404, 408, 409, 425, 429, or 5xx. A failure from a member with fallback disabled ends the attempt. Requests stop falling back after output has started so the client does not receive mixed partial answers.</p><Callout>Compound models are available on <code>/v1/chat/completions</code>, <code>/v1/responses</code>, and <code>/v1/messages</code>. Image, speech, and video endpoints currently require a direct provider model ID.</Callout></>;
    case "chat": return <><SectionTitle eyebrow="API reference · POST" title="Chat Completions" description="Send messages using the familiar OpenAI Chat Completions schema. Set stream to true to receive Server-Sent Events as the upstream produces output." /><Endpoint method="POST" path="/v1/chat/completions" description="application/json" /><h2 className="mb-3 mt-6 text-lg font-semibold">Request examples</h2><ExampleTabs sample="chat" /><h2 className="mb-3 mt-7 text-lg font-semibold">Non-streaming response</h2><CodeBlock language="json" code={`{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "created": 1735689600,
  "model": "provider/model-id",
  "choices": [{ "index": 0, "message": { "role": "assistant", "content": "Hello!" }, "finish_reason": "stop" }],
  "usage": {
    "prompt_tokens": 200,
    "completion_tokens": 2,
    "total_tokens": 202,
    "prompt_tokens_details": { "cached_tokens": 8, "cache_write_tokens": 64 }
  }
}`} /><p className="mt-4 text-sm leading-6 text-muted-foreground">Usage can include cached and cache-write input counts when the upstream reports them. These appear in <code>prompt_tokens_details</code>; <code>prompt_tokens</code> includes the full input count. Supported request fields and tool behavior depend on the provider model.</p></>;
    case "responses": return <><SectionTitle eyebrow="API reference · POST" title="Responses API" description="Use the OpenAI Responses-style input and output contract for clients that target /v1/responses." /><Endpoint method="POST" path="/v1/responses" description="application/json · stream supported" /><CodeBlock language="json" code={`{
  "model": "provider/model-id",
  "input": "Summarize the purpose of an API gateway.",
  "stream": false
}`} /><h2 className="mb-3 mt-6 text-lg font-semibold">Response shape</h2><CodeBlock language="json" code={`{
  "id": "resp_...",
  "object": "response",
  "status": "completed",
  "model": "provider/model-id",
  "output": [{
    "type": "message", "role": "assistant",
    "content": [{ "type": "output_text", "text": "..." }]
  }],
  "usage": {
    "input_tokens": 200,
    "input_tokens_details": { "cached_tokens": 8, "cache_write_tokens": 64 },
    "output_tokens": 2,
    "output_tokens_details": { "reasoning_tokens": 0 },
    "total_tokens": 202
  }
}`} /><Callout>Response fields and supported features can vary with the selected provider and model.</Callout><p className="mt-4 text-sm leading-6 text-muted-foreground">Usage can include cache read and write counts in <code>input_tokens_details</code> when the upstream reports them. Responses-only upstream models should be called through this endpoint. Chat-only upstreams may be adapted by the gateway when compatible; unsupported features can return an incompatibility error.</p></>;
    case "messages": return <><SectionTitle eyebrow="API reference · POST" title="Anthropic Messages" description="Send Anthropic-style message requests to /v1/messages. Klove translates the message format for compatible upstreams and returns an Anthropic-shaped response." /><Endpoint method="POST" path="/v1/messages" description="Anthropic Messages-compatible" /><CodeBlock language="json" code={`{
  "model": "provider/model-id",
  "max_tokens": 1024,
  "messages": [{ "role": "user", "content": "Hello" }]
}`} /><h2 className="mb-3 mt-6 text-lg font-semibold">Response shape</h2><CodeBlock language="json" code={`{
  "id": "msg_...",
  "type": "message",
  "role": "assistant",
  "model": "provider/model-id",
  "content": [{ "type": "text", "text": "Hello!" }],
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 128,
    "output_tokens": 2,
    "cache_read_input_tokens": 8,
    "cache_creation_input_tokens": 64
  }
}`} /><p className="mt-4 text-sm leading-6 text-muted-foreground">Authentication supports <code>x-api-key</code> and bearer credentials. Streaming requests use Anthropic event framing. The response includes <code>cache_read_input_tokens</code> and <code>cache_creation_input_tokens</code>; these reflect upstream usage when the provider reports cache details. When cached input is reported, <code>input_tokens</code> counts the uncached input. Model capability differences still apply.</p></>;
    case "images": return <><SectionTitle eyebrow="API reference · Images" title="Image generation and editing" description="The gateway exposes OpenAI-compatible image generation, edit, and variation routes. Requests use an active direct provider model whose image capability is not disabled." /><div className="space-y-2"><Endpoint method="POST" path="/v1/images/generations" description="JSON prompt request" /><Endpoint method="POST" path="/v1/images/edits" description="multipart/form-data upload" /><Endpoint method="POST" path="/v1/images/variations" description="multipart/form-data upload" /></div><h2 className="mb-3 mt-6 text-lg font-semibold">Generate an image</h2><ExampleTabs sample="images" /><h2 className="mb-3 mt-7 text-lg font-semibold">Edit and variation uploads</h2><CodeBlock language="bash" label="cURL · multipart/form-data" code={`curl "$KLOVE_BASE_URL/images/edits" \\
  -H "Authorization: Bearer $KLOVE_API_KEY" \\
  -F "model=provider/image-model" \\
  -F "prompt=Add warm sunset light" \\
  -F "image=@input.png"

curl "$KLOVE_BASE_URL/images/variations" \\
  -H "Authorization: Bearer $KLOVE_API_KEY" \\
  -F "model=provider/image-model" \\
  -F "image=@input.png"`} /><h2 className="mb-3 mt-7 text-lg font-semibold">Typical response</h2><CodeBlock language="json" code={`{
  "created": 1735689600,
  "data": [{ "url": "https://..." }]
}`} /><p className="mt-4 text-sm leading-6 text-muted-foreground">Klove streams the upstream response through without reshaping the JSON. OpenAI-compatible providers commonly return a <code>data</code> array containing a URL or <code>b64_json</code>; fields and upload constraints depend on the provider. Media endpoints require a direct <code>provider/model</code> ID; compound models are not routed on these endpoints.</p></>;
    case "speech": return <><SectionTitle eyebrow="API reference · Audio" title="Text to speech" description="Generate speech from text using an active direct provider model whose text-to-speech capability is not disabled. The response body is audio bytes, not a JSON envelope." /><Endpoint method="POST" path="/v1/audio/speech" description="application/json → provider audio bytes" /><CodeBlock language="json" code={`{
  "model": "provider/tts-model",
  "input": "Welcome to Klove Router.",
  "voice": "alloy",
  "response_format": "mp3"
}`} /><CodeBlock language="bash" label="Save generated audio" code={`curl "$KLOVE_BASE_URL/audio/speech" \\
  -H "Authorization: Bearer $KLOVE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"provider/tts-model","input":"Welcome to Klove Router.","voice":"alloy"}' \\
  --output speech.mp3`} /><p className="mt-4 text-sm leading-6 text-muted-foreground">The gateway streams the upstream response body and content type through; save it to a file or consume it as a byte stream. Available voices, formats, and speed controls are provider-specific. Compound models are not routed on media endpoints.</p></>;
    case "videos": return <><SectionTitle eyebrow="API reference · Video" title="Video generation jobs" description="Create a video job, poll its provider status, then download its content. Klove stores jobs created through this gateway and substitutes a Klove-owned ID in the response." /><div className="space-y-2"><Endpoint method="POST" path="/v1/videos" description="Create a job" /><Endpoint method="GET" path="/v1/videos" description="List Klove-created jobs · limit / after" /><Endpoint method="GET" path="/v1/videos/:id" description="Retrieve provider status" /><Endpoint method="GET" path="/v1/videos/:id/content" description="Download · optional variant query" /><Endpoint method="POST" path="/v1/videos/:id/cancel" description="Cancel job" /><Endpoint method="DELETE" path="/v1/videos/:id" description="Delete job" /></div><h2 className="mb-3 mt-6 text-lg font-semibold">Create a job</h2><CodeBlock language="bash" code={`curl "$KLOVE_BASE_URL/videos" \\
  -H "Authorization: Bearer $KLOVE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"provider/video-model","prompt":"A slow aerial shot over a forest"}'`} /><h2 className="mb-3 mt-6 text-lg font-semibold">Poll and download</h2><CodeBlock language="bash" code={`# Use the id returned by POST /v1/videos.
curl "$KLOVE_BASE_URL/videos/$VIDEO_ID" \\
  -H "Authorization: Bearer $KLOVE_API_KEY"

# Poll the status above until it is complete, then download the content.
curl "$KLOVE_BASE_URL/videos/$VIDEO_ID/content" \\
  -H "Authorization: Bearer $KLOVE_API_KEY" \\
  --output generated.mp4

# Optional: request a provider-specific content variant.
curl "$KLOVE_BASE_URL/videos/$VIDEO_ID/content?variant=preview" \\
  -H "Authorization: Bearer $KLOVE_API_KEY" \\
  --output preview.mp4

# List locally tracked jobs. The cursor is a Klove video ID.
curl "$KLOVE_BASE_URL/videos?limit=20&after=$VIDEO_ID" \\
  -H "Authorization: Bearer $KLOVE_API_KEY"

# Optional job operations.
curl -X POST "$KLOVE_BASE_URL/videos/$VIDEO_ID/cancel" \\
  -H "Authorization: Bearer $KLOVE_API_KEY"
curl -X DELETE "$KLOVE_BASE_URL/videos/$VIDEO_ID" \\
  -H "Authorization: Bearer $KLOVE_API_KEY"`} /><h2 className="mb-3 mt-6 text-lg font-semibold">Create response</h2><CodeBlock language="json" code={`{
  "id": "video_<klove-id>",
  "status": "<provider status>",
  "model": "provider/video-model"
}`} /><h2 className="mb-3 mt-6 text-lg font-semibold">List response</h2><CodeBlock language="json" code={`{
  "object": "list",
  "data": [],
  "has_more": false
}`} /><p className="mt-4 text-sm leading-6 text-muted-foreground">The creation request may be JSON or multipart form data. Klove requires the upstream creation response to include an ID, stores its mapping, and returns the Klove ID. List pagination accepts <code>limit</code> (1–100, default 20) and <code>after</code> (a Klove video ID); the list only contains jobs created through Klove. Status values and available content variants depend on the provider.</p><Callout>Video requests require an active OpenAI-compatible provider/model and an upstream that implements the compatible video job routes. The gateway forwards provider errors and does not normalize video status names.</Callout></>;
    case "streaming": return <><SectionTitle eyebrow="API reference" title="Streaming and errors" description="Chat, Responses, and Anthropic Messages can stream text as Server-Sent Events. Speech audio and video content are streamed as bytes, not SSE. Consume each response incrementally." /><h2 className="mb-3 text-lg font-semibold">OpenAI Chat stream</h2><CodeBlock language="text/event-stream" code={`data: {"choices":[{"delta":{"content":"Hello"},"index":0}]}

data: {"choices":[{"delta":{"content":" there"},"index":0}]}

data: [DONE]`} /><p className="mt-4 text-sm leading-6 text-muted-foreground">Set <code>stream: true</code> on <code>/v1/chat/completions</code>, <code>/v1/responses</code>, or <code>/v1/messages</code>. Audio and video content endpoints stream the provider response body. For best time-to-first-token, avoid middleware and reverse proxies that buffer response bodies; disable proxy buffering for these routes when applicable.</p><h2 className="mb-3 mt-7 text-lg font-semibold">Common status codes</h2><div className="space-y-2">{[["400", "Invalid request, missing required field, or incompatible endpoint."], ["401", "Missing or invalid Klove API key."], ["404", "Unknown model or video job."], ["429", "Upstream quota or throttling response; not a Klove-wide rate limit."], ["502", "Provider returned an invalid or unusable response."], ["503", "Provider, credential, or video job is temporarily unavailable."], ["5xx", "Gateway or upstream provider error."]].map(([code, text]) => <div key={code} className="flex gap-4 rounded-lg border bg-card px-4 py-3 text-sm"><code className="font-semibold text-primary">{code}</code><span className="text-muted-foreground">{text}</span></div>)}</div><Callout>Provider errors may be returned in the provider's native error envelope. Check the HTTP status and response body; do not assume every error uses one identical schema.</Callout></>;
    case "claude-code": return <><SectionTitle eyebrow="Integration" title="Use Klove with Claude Code" description="Claude Code can connect through its Anthropic-compatible API configuration. Choose a model ID visible from Klove's model catalog." /><p className="mb-4 text-sm leading-6 text-muted-foreground">Set the gateway base URL and key in your shell. The value for <code>ANTHROPIC_BASE_URL</code> is the server root (without an extra <code>/v1</code>), because Claude Code appends the Anthropic API path.</p><CodeBlock language="bash" code={`export ANTHROPIC_BASE_URL="http://localhost:3000"
export ANTHROPIC_AUTH_TOKEN="$KLOVE_API_KEY"
export ANTHROPIC_MODEL="provider/model-id"
claude`} /><Callout>Use the exact model ID supported by your gateway. Claude Code may send Anthropic-specific request fields; compatibility depends on the selected upstream model. See Anthropic's gateway guide for the current Claude Code environment settings.</Callout><a className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline" href="https://docs.anthropic.com/en/docs/claude-code/llm-gateway" target="_blank" rel="noreferrer">Claude Code gateway documentation <ExternalLink className="size-3.5" /></a></>;
    case "codex": return <><SectionTitle eyebrow="Integration" title="Use Klove with Codex CLI" description="Configure Codex CLI with a custom Responses-compatible model provider. The model must support the Responses API contract for the best compatibility." /><p className="mb-4 text-sm leading-6 text-muted-foreground">Add a custom provider to <code>~/.codex/config.toml</code>. For a local gateway, set the base URL to the Klove server's <code>/v1</code> endpoint.</p><CodeBlock language="toml" code={`model_provider = "klove"
model = "provider/model-id"

[model_providers.klove]
name = "Klove Router"
base_url = "http://localhost:3000/v1"
env_key = "KLOVE_API_KEY"
wire_api = "responses"

# Export KLOVE_API_KEY before launching Codex.`} /><Callout>Codex CLI configuration evolves. Confirm your installed CLI accepts the custom provider fields and Responses wire API. If your selected upstream only supports Chat Completions, Codex may not work with this configuration.</Callout><a className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline" href="https://developers.openai.com/codex/config-reference" target="_blank" rel="noreferrer">Codex configuration reference <ExternalLink className="size-3.5" /></a></>;
    case "opencode": return <><SectionTitle eyebrow="Integration" title="Use Klove with OpenCode" description="Define Klove as a custom OpenAI-compatible provider in OpenCode, then select one of the model IDs exposed by Klove." /><p className="mb-4 text-sm leading-6 text-muted-foreground">Add a provider entry to <code>opencode.json</code>. This configuration uses OpenCode's current custom OpenAI-compatible provider package and maps a short OpenCode model name to Klove's full public model ID.</p><CodeBlock language="json" code={`{
  "$schema": "https://opencode.ai/config.json",
  "model": "klove/chat",
  "providers": {
    "klove": {
      "name": "Klove Router",
      "env": ["KLOVE_API_KEY"],
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": { "baseURL": "http://localhost:3000/v1" },
      "models": {
        "chat": { "name": "Model via Klove", "modelID": "provider/model-id" }
      }
    }
  }
}`} /><p className="mt-4 text-sm leading-6 text-muted-foreground">Export <code>KLOVE_API_KEY</code> before launching OpenCode. Replace <code>provider/model-id</code> with an ID returned by Klove. Verify the selected model's endpoint compatibility; this provider uses Chat Completions.</p><a className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline" href="https://opencode.ai/v2/docs/providers" target="_blank" rel="noreferrer">OpenCode provider documentation <ExternalLink className="size-3.5" /></a></>;
  }
}
