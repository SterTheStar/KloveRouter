export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface EndpointDefinition {
  method: HttpMethod;
  badge: string;
  badgeBg: string;
  path: string;
  description: string;
  isExternalUrl?: boolean;
}

export interface EndpointGroup {
  title: string;
  endpoints: EndpointDefinition[];
}

export interface StartupBannerOptions {
  port: number;
  host?: string;
  version: string;
  oauthPort?: number;
}

export const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  white: "\x1b[97m",
  gray: "\x1b[90m",

  // Text Colors
  titleBlue: "\x1b[38;2;91;206;250m",
  saturnGold: "\x1b[38;2;251;191;36m",
  sectionTitle: "\x1b[38;2;165;180;252m", // Indigo-300
  subtle: "\x1b[38;2;148;163;184m",       // Slate-400
  urlBase: "\x1b[38;2;100;116;139m",      // Slate-500
  urlPath: "\x1b[38;2;241;245;249m",      // Slate-100 bold
  bullet: "\x1b[38;2;129;140;248m",

  // Method Badges
  methodPost: "\x1b[38;2;74;222;128m",    // Emerald-400
  methodGet: "\x1b[38;2;96;165;250m",     // Blue-400

  // Category Badge Backgrounds (solid contrast with white bold text)
  bgPanel: "\x1b[48;2;37;99;235m",        // Blue-600
  bgApi: "\x1b[48;2;13;148;136m",          // Teal-600
  bgOpenAi: "\x1b[48;2;16;185;129m",      // Emerald-500
  bgAnthropic: "\x1b[48;2;217;119;6m",    // Amber-600
  bgResponses: "\x1b[48;2;139;92;246m",   // Purple-500
  bgCatalog: "\x1b[48;2;6;182;212m",      // Cyan-500
  bgImages: "\x1b[48;2;236;72;153m",      // Pink-500
  bgAudio: "\x1b[48;2;168;85;247m",       // Violet-500
  bgVideos: "\x1b[48;2;239;68;68m",       // Red-500
  bgOAuth: "\x1b[48;2;245;158;11m",       // Amber-500
};

function padCenter(str: string, width: number): string {
  const totalPadding = Math.max(0, width - str.length);
  const leftPadding = Math.floor(totalPadding / 2);
  const rightPadding = totalPadding - leftPadding;
  return " ".repeat(leftPadding) + str + " ".repeat(rightPadding);
}

export function formatBadge(text: string, bgColor: string, targetWidth = 9): string {
  const centered = padCenter(text, targetWidth);
  return `${bgColor}${ANSI.white}${ANSI.bold} ${centered} ${ANSI.reset}`;
}

export function formatMethod(method: HttpMethod): string {
  const color = method === "POST" ? ANSI.methodPost : ANSI.methodGet;
  return `${color}${ANSI.bold}${method.padEnd(4, " ")}${ANSI.reset}`;
}

export function getRegisteredEndpoints(options: { port: number; host?: string; oauthPort?: number }): EndpointGroup[] {
  const host = options.host || "localhost";
  const port = options.port;
  const oauthPort = options.oauthPort ?? 1455;

  return [
    {
      title: "Control Plane & Management",
      endpoints: [
        {
          method: "GET",
          badge: "PANEL",
          badgeBg: ANSI.bgPanel,
          path: `http://${host}:${port}`,
          description: "Administrative Web Dashboard",
          isExternalUrl: true,
        },
        {
          method: "GET",
          badge: "API",
          badgeBg: ANSI.bgApi,
          path: `http://${host}:${port}/api`,
          description: "System Health & Status API",
          isExternalUrl: true,
        },
      ],
    },
    {
      title: "AI Routing & Gateways",
      endpoints: [
        {
          method: "POST",
          badge: "OPENAI",
          badgeBg: ANSI.bgOpenAi,
          path: "/v1/chat/completions",
          description: "OpenAI Chat Completions & Streaming",
        },
        {
          method: "POST",
          badge: "ANTHROPIC",
          badgeBg: ANSI.bgAnthropic,
          path: "/v1/messages",
          description: "Anthropic Messages API",
        },
        {
          method: "POST",
          badge: "RESPONSES",
          badgeBg: ANSI.bgResponses,
          path: "/v1/responses",
          description: "OpenAI Responses API",
        },
        {
          method: "GET",
          badge: "CATALOG",
          badgeBg: ANSI.bgCatalog,
          path: "/v1/models",
          description: "Unified Model Catalog & Compound Pools",
        },
      ],
    },
    {
      title: "Multimodal & Media Hub",
      endpoints: [
        {
          method: "POST",
          badge: "IMAGES",
          badgeBg: ANSI.bgImages,
          path: "/v1/images/generations",
          description: "Image Generation & Variations",
        },
        {
          method: "POST",
          badge: "IMAGES",
          badgeBg: ANSI.bgImages,
          path: "/v1/images/edits",
          description: "Image Editing & Inpainting",
        },
        {
          method: "POST",
          badge: "AUDIO",
          badgeBg: ANSI.bgAudio,
          path: "/v1/audio/speech",
          description: "Text-to-Speech (TTS)",
        },
        {
          method: "POST",
          badge: "VIDEOS",
          badgeBg: ANSI.bgVideos,
          path: "/v1/videos",
          description: "Async Video Generation Jobs",
        },
        {
          method: "GET",
          badge: "VIDEOS",
          badgeBg: ANSI.bgVideos,
          path: "/v1/videos/:id",
          description: "Video Status & Content Stream",
        },
      ],
    },
    {
      title: "Integrations & OAuth",
      endpoints: [
        {
          method: "GET",
          badge: "OAUTH",
          badgeBg: ANSI.bgOAuth,
          path: `http://${host}:${oauthPort}/auth/callback`,
          description: "OAuth 2.0 Authentication Callback",
          isExternalUrl: true,
        },
      ],
    },
  ];
}

export function formatStartupBanner(options: StartupBannerOptions): string {
  const host = options.host || "localhost";
  const baseUrl = `http://${host}:${options.port}`;
  const groups = getRegisteredEndpoints(options);

  // Find max path length across all endpoints to align descriptions perfectly
  const allEndpoints = groups.flatMap((g) => g.endpoints);
  const maxPathLength = Math.max(
    ...allEndpoints.map((ep) => (ep.isExternalUrl ? ep.path : `${baseUrl}${ep.path}`).length),
  );

  const lines: string[] = [];

  // Header Banner
  lines.push("");
  lines.push(`  ${ANSI.saturnGold}🪐${ANSI.reset} ${ANSI.bold}${ANSI.titleBlue}Saturn Router${ANSI.reset} ${ANSI.saturnGold}v${options.version}${ANSI.reset}`);
  lines.push(`     ${ANSI.dim}Self-hosted AI Control Plane & Proxy Gateway${ANSI.reset}`);
  lines.push(`     ${ANSI.dim}Listening on ${ANSI.reset}${ANSI.bold}http://0.0.0.0:${options.port}${ANSI.reset} ${ANSI.dim}(Local: ${baseUrl})${ANSI.reset}`);
  lines.push("");

  // Endpoint Groups
  for (const group of groups) {
    lines.push(`  ${ANSI.bold}${ANSI.sectionTitle}${group.title}${ANSI.reset}`);

    for (const ep of group.endpoints) {
      const methodStr = formatMethod(ep.method);
      const badgeStr = formatBadge(ep.badge, ep.badgeBg);

      let urlDisplay = "";
      if (ep.isExternalUrl) {
        urlDisplay = `${ANSI.urlPath}${ep.path}${ANSI.reset}`;
      } else {
        urlDisplay = `${ANSI.urlBase}${baseUrl}${ANSI.reset}${ANSI.urlPath}${ep.path}${ANSI.reset}`;
      }

      // Dynamic padding to align all descriptions
      const rawPathLength = (ep.isExternalUrl ? ep.path : `${baseUrl}${ep.path}`).length;
      const spacing = " ".repeat(Math.max(3, maxPathLength - rawPathLength + 4));

      lines.push(
        `    ${ANSI.bullet}●${ANSI.reset} ${methodStr}  ${badgeStr}  ${urlDisplay}${spacing}${ANSI.subtle}${ep.description}${ANSI.reset}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function printStartupBanner(options: StartupBannerOptions): void {
  const banner = formatStartupBanner(options);
  console.log(banner);
}
