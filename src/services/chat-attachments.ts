import type { Database } from "bun:sqlite";

/**
 * Attachments used to be stored as full data URLs inside `chat_messages`
 * JSON, so every chat load shipped megabytes and an edit-resend rewrote them.
 * They now live in `message_attachments` (payload chunks, one row per
 * component) while the JSON column keeps only cheap metadata and a thumbnail.
 * Listings come from the JSON column; a single payload is fetched on demand.
 */

/** Attachment kinds whose payload is not part of the message list. */
export const HEAVY_ATTACHMENT_KINDS = new Set(["image", "audio", "video", "file"]);

const COMPONENT_SIZE = 1024 * 1024;
/** A URL string longer than this is decoded and stored decoded as bytes. */
const DATA_URL_INLINE_LIMIT = 4096;
/** Previews up to this size are treated as thumbnails safe for listings. */
const THUMBNAIL_LIMIT = 64 * 1024;

export interface AttachmentMeta {
  id?: string;
  kind?: string;
  name?: string;
  mimeType?: string;
  size?: number;
  /** Image thumbnail for listings (small data URL). */
  thumbnail?: string;
  /** Version of the stored payload, used to invalidate client caches. */
  version?: string;
  [key: string]: unknown;
}

export interface ClientAttachment extends AttachmentMeta {
  /** Payload as sent by the client (data URL or raw base64 for audio). */
  data?: string;
  /** Legacy display URL used for inline previews. */
  preview?: string;
}

export interface AttachmentRow {
  id: string;
  kind: string;
  name: string | null;
  mime_type: string | null;
  version: string | null;
  size: number | null;
  chunks: number;
}

export interface AttachmentPayload {
  data_url: string | null;
  preview: string | null;
}

function nowVersion() {
  return new Date().toISOString();
}

/**
 * Keeps only metadata and the thumbnail. The legacy `preview` field is
 * dropped, but a thumbnail is derived from it so already-stored images keep
 * their inline preview.
 */
export function summarizeAttachment(attachment: ClientAttachment): AttachmentMeta {
  if (!attachment || typeof attachment !== "object") return {};
  const { data: _data, preview, ...rest } = attachment;
  // Previews only double as thumbnails when the client already downscaled
  // them; a preview holding the full payload must never reach listings.
  if (!rest.thumbnail && typeof preview === "string" && preview !== _data && preview.length < THUMBNAIL_LIMIT) {
    rest.thumbnail = preview;
  }
  return rest;
}

function attachmentRows(db: Database, messageId: string): AttachmentRow[] {
  return db
    .query(
      `SELECT attachment_id AS id, kind, name, mime_type, version, size, chunks
       FROM message_attachments WHERE message_id = ? AND component = 1 ORDER BY position ASC`,
    )
    .all(messageId) as AttachmentRow[];
}

/**
 * Attachment metadata for a message, merged with the stored rows (authoritative
 * for kind/name/version). Falls back to the JSON summary for legacy rows that
 * were stored before the payload table existed.
 */
export function listMessageAttachments(db: Database, messageId: string, summary: AttachmentMeta[]): AttachmentMeta[] {
  const rows = attachmentRows(db, messageId);
  if (!rows.length) return summary;
  const stored = new Map(rows.map((row) => [row.id, row]));
  const merged = summary.map((item) => {
    const row = stored.get(item.id ?? "");
    return row
      ? { ...item, kind: row.kind, name: row.name ?? item.name, mimeType: row.mime_type ?? item.mimeType, version: row.version ?? undefined }
      : item;
  });
  // Rows without a matching summary entry (for example after a JSON reset).
  for (const row of rows) {
    if (!merged.some((item) => item.id === row.id)) {
      merged.push({ id: row.id, kind: row.kind, name: row.name ?? undefined, mimeType: row.mime_type ?? undefined, version: row.version ?? undefined });
    }
  }
  return merged;
}

/**
 * Payload bytes always come back as a data URL. Clients send either a data
 * URL or bare base64 (audio); text without a mime type is re-wrapped as
 * `text/plain` on write so the stored form is unambiguous.
 */
function decodePayload(kind: string, raw: string): Uint8Array {
  const dataUrl = raw.startsWith("data:");
  if (kind === "text" && !dataUrl) return new TextEncoder().encode(raw);
  const comma = dataUrl ? raw.indexOf(",") : -1;
  const base64 = (comma >= 0 ? raw.slice(comma + 1) : raw).replace(/\s+/g, "");
  try {
    return Buffer.from(base64, "base64");
  } catch {
    return new TextEncoder().encode(raw);
  }
}

function payloadInput(kind: string, mimeType: string | null, raw: string): string {
  if (kind === "text" && !raw.startsWith("data:")) return `data:${mimeType ?? "text/plain"};base64,${Buffer.from(raw, "utf8").toString("base64")}`;
  return raw;
}

/** Mime type declared by a data URL, when the metadata did not carry one. */
function mimeFromDataUrl(raw: string): string | null {
  if (!raw.startsWith("data:")) return null;
  const header = raw.slice(5, raw.indexOf(","));
  const mime = header.split(";")[0];
  return mime.includes("/") ? mime : null;
}

function encodePayload(_kind: string, mimeType: string | null, bytes: Uint8Array): string {
  // Spread would overflow the stack for multi-megabyte payloads.
  return `data:${mimeType ?? "application/octet-stream"};base64,${Buffer.from(bytes).toString("base64")}`;
}

export interface WriteResult {
  summary: AttachmentMeta[];
  /** False when every attachment was already stored and nothing changed. */
  changed: boolean;
}

/**
 * Persists the client attachments of a message: payloads are chunked into
 * `message_attachments`, metadata returned for the JSON column. Attachments
 * still carrying a payload replace the stored version; metadata-only ones keep
 * whatever is stored.
 */
export function storeMessageAttachments(
  db: Database,
  messageId: string,
  incoming: ClientAttachment[],
): WriteResult {
  const storedRows = attachmentRows(db, messageId);
  const existing = new Set(storedRows.map((row) => row.id));
  // Edits from the summary form carry no payload at all: that is a client not
  // sending payloads, not the user removing media. Only an explicit payload
  // (string `data`) or a missing attachment counts as a change.
  const payloadlessEdit = incoming.length > 0 && incoming.every((item) => !item || typeof item.data !== "string");
  const deleteRows = db.query("DELETE FROM message_attachments WHERE message_id = ? AND attachment_id = ?");
  const insert = db.query(
    "INSERT INTO message_attachments (message_id, attachment_id, position, component, kind, name, mime_type, version, size, chunks, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const summary: AttachmentMeta[] = [];
  let changed = false;

  incoming.forEach((attachment, position) => {
    if (!attachment || typeof attachment !== "object") return;
    const id = typeof attachment.id === "string" && attachment.id ? attachment.id : crypto.randomUUID();
    const meta = summarizeAttachment({ ...attachment, id });
    const kind = typeof meta.kind === "string" ? meta.kind : "text";
    const raw = attachment.data ?? (typeof attachment.preview === "string" && !attachment.thumbnail ? attachment.preview : undefined);

    if (typeof raw !== "string") {
      const row = storedRows.find((item) => item.id === id);
      summary.push(row
        ? { ...meta, id, kind: row.kind, version: row.version ?? undefined, size: row.size ?? undefined }
        : { ...meta, id });
      return;
    }

    // Small strings (text files, short data URLs) stay inline: no row needed.
    if (raw.length <= DATA_URL_INLINE_LIMIT) {
      if (existing.has(id)) {
        deleteRows.run(messageId, id);
        changed = true;
      }
      summary.push({ ...meta, id, data_url: raw });
      return;
    }

    const mimeType = (typeof meta.mimeType === "string" ? meta.mimeType : null) ?? mimeFromDataUrl(raw);
    const bytes = decodePayload(kind, payloadInput(kind, mimeType, raw));
    const chunks = Math.ceil(bytes.length / COMPONENT_SIZE) || 1;
    const version = nowVersion();
    deleteRows.run(messageId, id);
    for (let index = 0; index < chunks; index += 1) {
      insert.run(
        messageId,
        id,
        position,
        index + 1,
        kind,
        typeof meta.name === "string" ? meta.name : null,
        mimeType,
        version,
        bytes.length,
        chunks,
        bytes.slice(index * COMPONENT_SIZE, (index + 1) * COMPONENT_SIZE),
      );
    }
    changed = true;
    summary.push({ ...meta, id, kind, version, size: bytes.length });
  });

  // Attachments removed from the message lose their payload as well.
  if (!payloadlessEdit) {
    for (const id of existing) {
      if (!summary.some((item) => item.id === id)) {
        deleteRows.run(messageId, id);
        changed = true;
      }
    }
  }

  return { summary, changed };
}

/** Loads one stored payload, reassembling its chunks. */
export function loadAttachment(db: Database, messageId: string, attachmentId: string): { row: AttachmentRow | null; payload: AttachmentPayload } {
  const row = db
    .query(
      `SELECT attachment_id AS id, kind, name, mime_type, version, size, chunks
       FROM message_attachments WHERE message_id = ? AND attachment_id = ? AND component = 1`,
    )
    .get(messageId, attachmentId) as AttachmentRow | null;
  if (!row) return { row: null, payload: { data_url: null, preview: null } };
  const chunks = db
    .query("SELECT data FROM message_attachments WHERE message_id = ? AND attachment_id = ? ORDER BY component ASC")
    .all(messageId, attachmentId) as { data: Uint8Array }[];
  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.data.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk.data, offset);
    offset += chunk.data.byteLength;
  }
  const dataUrl = encodePayload(row.kind, row.mime_type, bytes);
  return {
    row,
    payload: {
      data_url: dataUrl,
      preview: row.kind === "image" ? dataUrl : null,
    },
  };
}

/** The payload part of a user message used for search indexing. */
export function attachmentNames(attachments: AttachmentMeta[]): string {
  return attachments
    .map((attachment) => (typeof attachment.name === "string" ? attachment.name : ""))
    .filter(Boolean)
    .join(" ");
}
