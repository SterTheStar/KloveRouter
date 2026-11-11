import { chats as chatsApi, models, providers, settings, updates } from "../api/client";
import { queryCache, queryKeys } from "./query-cache";
import type { AppUpdateStatusResponse, UserProfile } from "../types";

export interface BootHandlers {
  onProfile: (profile: UserProfile) => void;
  onUpdateStatus: (status: AppUpdateStatusResponse) => void;
}

export interface BootTask {
  id: string;
  label: string;
  run: (handlers: BootHandlers) => Promise<unknown>;
}

export const SESSION_STEP_LABEL = "Verifying session";

/**
 * Real startup work run behind the splash screen once the session is valid.
 * Data tasks warm the shared query cache so pages render without a spinner.
 * Every task is best-effort: a failure never blocks the app from opening.
 */
export const BOOT_TASKS: BootTask[] = [
  {
    id: "profile",
    label: "Loading profile",
    run: (h) => settings.profile().then(h.onProfile),
  },
  {
    id: "providers",
    label: "Loading providers",
    run: () => queryCache.getOrFetch(queryKeys.providers, 30_000, providers.list),
  },
  {
    id: "models",
    label: "Loading models",
    run: () => queryCache.getOrFetch(queryKeys.models, 30_000, models.listAll),
  },
  {
    id: "chat-hints",
    label: "Loading chat history",
    run: () => queryCache.getOrFetch(queryKeys.chatHints, 60_000, chatsApi.hints),
  },
  {
    id: "updates",
    label: "Checking for updates",
    run: (h) => updates.status().then((status) => {
      if (status) h.onUpdateStatus(status);
    }),
  },
];

/** Session verification counts as the first step, followed by every task. */
export const BOOT_TOTAL_STEPS = BOOT_TASKS.length + 1;
