// Pure rules for course file attachments (mirrors the allow-list and limits in supabase/022_material_files.sql).
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

const TYPES: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
  txt: "text/plain", md: "text/markdown", csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
export const ALLOWED_EXTENSIONS = Object.keys(TYPES);
export const PICKER_TYPES = Array.from(new Set(Object.values(TYPES)));

export const extOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

/** The MIME type we upload with, decided from the file extension (pickers often report generic or wrong types). */
export const mimeFor = (name: string): string | null => TYPES[extOf(name)] ?? null;

/** Letters, digits, dot, dash, underscore only; capped; never empty; keeps the extension. */
export function safeFileName(name: string): string {
  const ext = extOf(name);
  const base = (ext ? name.slice(0, name.length - ext.length - 1) : name)
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.-]+/g, "_").replace(/^[._-]+|[._-]+$/g, "").slice(0, 60) || "file";
  return ext ? `${base}.${ext}` : base;
}

export const storagePath = (courseId: string, uniqueId: string, name: string) => `${courseId}/${uniqueId}-${safeFileName(name)}`;

/** Error message, or null if the file may be uploaded. `size` may be unknown (null) — the bucket still enforces the limit. */
export function validateFile(name: string, size: number | null | undefined): string | null {
  if (!mimeFor(name)) return `That file type isn't supported. Use ${ALLOWED_EXTENSIONS.join(", ")}.`;
  if (size != null && size <= 0) return "That file is empty.";
  if (size != null && size > MAX_FILE_BYTES) return `That file is ${fmtSize(size)}; the limit is ${fmtSize(MAX_FILE_BYTES)}.`;
  return null;
}

export const fmtSize = (n: number | null | undefined) =>
  n == null ? "" : n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
