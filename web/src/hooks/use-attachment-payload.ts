import { useEffect, useState } from "react";
import { attachments as attachmentsApi } from "../api/client";
import type { ChatAttachmentMeta } from "../types";
import { queryCache } from "../lib/query-cache";

const ATTACHMENT_TTL_MS = 10 * 60_000;

const attachmentKey = (chatId: string, messageId: string, attachmentId: string) =>
  `attachments:${chatId}:${messageId}:${attachmentId}`;

interface AttachmentPayload {
  data_url: string | null;
  preview: string | null;
}

/**
 * Loads one attachment payload on demand. Chat listings only carry metadata
 * and thumbnails, so media is fetched when the user asks to see it. Payloads
 * are cached by attachment (payloads are replaced, never mutated), so
 * reopening a chat needs no new request.
 */
export function useAttachmentPayload(
  chatId: string,
  messageId: string,
  attachment: ChatAttachmentMeta,
  enabled: boolean,
) {
  const inline = typeof attachment.data_url === "string" ? attachment.data_url : attachment.thumbnail ?? null;
  const key = attachmentKey(chatId, messageId, attachment.id);
  const cached = queryCache.get<AttachmentPayload>(key, ATTACHMENT_TTL_MS).value;
  const [loaded, setLoaded] = useState<AttachmentPayload | null>(cached ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    setLoaded(queryCache.get<AttachmentPayload>(key, ATTACHMENT_TTL_MS).value ?? null);
  }, [key, attachment.version]);

  useEffect(() => {
    // Text attachments travel inline; only heavy media needs a request.
    if (!enabled || attachment.kind === "text" || typeof attachment.data_url === "string") return;
    if (queryCache.get<AttachmentPayload>(key, ATTACHMENT_TTL_MS).value) return;
    let cancelled = false;
    queryCache
      .getOrFetch(key, ATTACHMENT_TTL_MS, () => attachmentsApi.get(chatId, messageId, attachment.id))
      .then((payload) => {
        if (!cancelled) setLoaded(payload as AttachmentPayload);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attachment.data_url, attachment.kind, chatId, enabled, key, messageId]);

  const url = loaded?.preview ?? loaded?.data_url ?? inline;
  return { url, loading: enabled && !loaded && !failed && attachment.kind !== "text", failed };
}
