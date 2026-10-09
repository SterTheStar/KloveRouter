import type { Page } from "../types";

export type AppRoute = {
  page: Page;
  providerId?: string;
  chatId?: string;
};

const pagePaths: Partial<Record<Page, string>> = {
  dashboard: "/providers",
  chat: "/chat",
  models: "/models",
  "model-pools": "/compound-models",
  stats: "/stats",
  usage: "/usage",
  "request-logs": "/request-logs",
  keys: "/api-keys",
  settings: "/settings",
  login: "/login",
};

export function pathForPage(page: Page, id?: string): string {
  if (page === "provider-detail") return id ? `/providers/${encodeURIComponent(id)}` : "/";
  if (page === "chat" && id) return `/chats/${encodeURIComponent(id)}`;
  return pagePaths[page] ?? "/";
}

export function pathForRoute(route: AppRoute): string {
  if (route.page === "provider-detail") return pathForPage(route.page, route.providerId);
  if (route.page === "chat" && route.chatId) return pathForPage(route.page, route.chatId);
  return pathForPage(route.page);
}

function decodePathPart(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

export function routeFromPath(pathname: string): AppRoute {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/" || path === "/providers") return { page: "dashboard" };
  if (path === "/chat" || path === "/chats") return { page: "chat" };

  const providerMatch = path.match(/^\/providers\/([^/]+)$/);
  if (providerMatch) {
    const providerId = decodePathPart(providerMatch[1]);
    if (providerId) return { page: "provider-detail", providerId };
  }

  const chatMatch = path.match(/^\/chats\/([^/]+)$/);
  if (chatMatch) {
    const chatId = decodePathPart(chatMatch[1]);
    if (chatId) return { page: "chat", chatId };
  }

  const staticRoutes: Record<string, Page> = {
    "/models": "models",
    "/compound-models": "model-pools",
    "/stats": "stats",
    "/usage": "usage",
    "/request-logs": "request-logs",
    "/api-keys": "keys",
    "/settings": "settings",
    "/login": "login",
  };
  const page = staticRoutes[path];
  return page ? { page } : { page: "dashboard" };
}

export function navigateToRoute(route: AppRoute, replace = false): void {
  const path = pathForRoute(route);
  if (window.location.pathname === path) return;
  if (replace) window.history.replaceState(null, "", path);
  else window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function shouldHandleLinkClick(event: React.MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}
