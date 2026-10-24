import { gemini, withRetry } from "./gemini";

// A screen recording or screenshot attached to a ticket. It is uploaded to the Gemini Files API (kept for 48 hours) and passed to Argon.
// Measured: a 150 KB phone recording uploads in about 2 s, is processed in about 2 s, and Argon reads it in about 8 s for under 1,000 tokens.

export interface MediaRef {
  uri: string;
  mimeType: string;
  kind: "video" | "image";
  name: string;
}

export const ALLOWED_MEDIA: Record<string, "video" | "image"> = {
  "video/mp4": "video",
  "video/webm": "video",
  "video/quicktime": "video",
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
};
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;

export async function uploadMedia(data: Blob, mimeType: string, displayName: string): Promise<MediaRef> {
  const kind = ALLOWED_MEDIA[mimeType];
  if (!kind) throw new Error(`Unsupported file type ${mimeType}`);
  if (data.size > MAX_MEDIA_BYTES) throw new Error("File is larger than 50 MB");
  const ai = gemini();
  let file = await withRetry(() => ai.files.upload({ file: data, config: { mimeType, displayName: displayName.slice(0, 80) } }));
  for (let i = 0; i < 60 && file.state === "PROCESSING"; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    file = await ai.files.get({ name: file.name! });
  }
  if (file.state !== "ACTIVE" || !file.uri) throw new Error(`The file could not be processed (${file.state})`);
  return { uri: file.uri, mimeType: file.mimeType ?? mimeType, kind, name: file.name ?? "" };
}

/** A media reference coming from a browser is only trusted if it points at the Gemini Files API. */
export function isTrustedMedia(m: unknown): m is MediaRef {
  const r = m as Partial<MediaRef> | null;
  return (
    !!r &&
    typeof r.uri === "string" &&
    r.uri.startsWith("https://generativelanguage.googleapis.com/") &&
    typeof r.mimeType === "string" &&
    r.mimeType in ALLOWED_MEDIA &&
    (r.kind === "video" || r.kind === "image")
  );
}
