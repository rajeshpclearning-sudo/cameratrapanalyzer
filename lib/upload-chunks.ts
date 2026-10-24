/**
 * Pack images into upload chunks that fit under Vercel's serverless
 * request body limit (~4.5 MB) and finish within Hobby time limits.
 *
 * Prefer reading EXIF from the original File, then shrink for upload so
 * many folder photos can be analyzed without 413 / mid-run timeouts.
 */

import {
  extractDateTimeFromFile,
  type DateTimeFields,
} from "./exif";

/** Stay under Vercel FUNCTION_PAYLOAD_TOO_LARGE (~4.5 MB) with multipart overhead. */
export const VERCEL_SAFE_UPLOAD_BYTES = Math.floor(3.5 * 1024 * 1024);

/** Target size after client shrink — keeps requests small and fast. */
export const CLIENT_UPLOAD_TARGET_BYTES = 900_000;

/**
 * Vercel Hobby ~60s: one photo per request is the reliable default.
 * Local / Railway can send a few at once.
 */
export const MAX_FILES_PER_UPLOAD_CHUNK_VERCEL = 1;
export const MAX_FILES_PER_UPLOAD_CHUNK_DEFAULT = 3;

export type PreparedUpload = {
  /** Bytes to send (often resized; EXIF may be gone — use dateOverride). */
  file: File;
  /** Original filename (kept for CSV / already-done matching). */
  originalName: string;
  /** True when browser re-encoded. */
  resized: boolean;
  /** Taken-at from original EXIF (or lastModified), for the server after shrink. */
  dateOverride: DateTimeFields;
};

function isHeicLike(file: File): boolean {
  const n = file.name.toLowerCase();
  const t = (file.type || "").toLowerCase();
  return (
    n.endsWith(".heic") ||
    n.endsWith(".heif") ||
    t.includes("heic") ||
    t.includes("heif")
  );
}

export function maxFilesPerUploadChunk(): number {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (/\.vercel\.app$/i.test(host) || host === "vercel.app") {
      return MAX_FILES_PER_UPLOAD_CHUNK_VERCEL;
    }
  }
  return MAX_FILES_PER_UPLOAD_CHUNK_DEFAULT;
}

async function encodeJpeg(
  bitmap: ImageBitmap,
  scale: number,
  quality: number,
): Promise<Blob | null> {
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
  });
}

/**
 * Read EXIF first, then shrink large JPEGs/PNGs for Vercel-safe upload.
 * HEIC is left as-is (server converts with sharp).
 */
export async function prepareUploadFile(file: File): Promise<PreparedUpload> {
  const dateOverride = await extractDateTimeFromFile(
    file,
    new Date(file.lastModified || Date.now()),
  );

  if (isHeicLike(file) || file.size <= CLIENT_UPLOAD_TARGET_BYTES) {
    return {
      file,
      originalName: file.name,
      resized: false,
      dateOverride,
    };
  }

  try {
    const bitmap = await createImageBitmap(file);
    let scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    let quality = 0.82;
    let blob: Blob | null = null;

    for (let attempt = 0; attempt < 8; attempt++) {
      blob = await encodeJpeg(bitmap, scale, quality);
      if (blob && blob.size <= CLIENT_UPLOAD_TARGET_BYTES) break;
      if (blob && blob.size <= VERCEL_SAFE_UPLOAD_BYTES && attempt >= 4) break;
      quality = Math.max(0.45, quality - 0.08);
      scale *= 0.88;
    }
    bitmap.close();

    if (!blob) {
      return { file, originalName: file.name, resized: false, dateOverride };
    }

    const out = new File([blob], file.name, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
    return {
      file: out,
      originalName: file.name,
      resized: true,
      dateOverride,
    };
  } catch {
    return { file, originalName: file.name, resized: false, dateOverride };
  }
}

/** @deprecated use prepareUploadFile — kept for callers that only need shrink. */
export async function shrinkImageForUpload(
  file: File,
  maxBytes: number = VERCEL_SAFE_UPLOAD_BYTES,
): Promise<PreparedUpload> {
  const prepared = await prepareUploadFile(file);
  if (prepared.file.size <= maxBytes) return prepared;
  // Last resort: already prepared but still huge (rare HEIC) — return as-is.
  return prepared;
}

/** Group prepared files into sequential multipart-safe chunks. */
export function packUploadChunks(
  prepared: PreparedUpload[],
  maxBytes: number = VERCEL_SAFE_UPLOAD_BYTES,
  maxFiles: number = maxFilesPerUploadChunk(),
): PreparedUpload[][] {
  const chunks: PreparedUpload[][] = [];
  let current: PreparedUpload[] = [];
  let currentBytes = 0;

  for (const item of prepared) {
    const size = item.file.size;
    const wouldExceed =
      current.length > 0 &&
      (current.length >= maxFiles || currentBytes + size > maxBytes);

    if (wouldExceed) {
      chunks.push(current);
      current = [];
      currentBytes = 0;
    }

    current.push(item);
    currentBytes += size;
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** JSON map filename → date/time for the jobs API. */
export function buildExifOverridesPayload(
  prepared: PreparedUpload[],
): Record<string, DateTimeFields> {
  const map: Record<string, DateTimeFields> = {};
  for (const p of prepared) {
    map[p.originalName] = p.dateOverride;
  }
  return map;
}
