/**
 * Pack images into upload chunks that fit under Vercel's serverless
 * request body limit (~4.5 MB). Prefer original bytes so EXIF survives.
 */

/** Stay under Vercel FUNCTION_PAYLOAD_TOO_LARGE (~4.5 MB) with multipart overhead. */
export const VERCEL_SAFE_UPLOAD_BYTES = Math.floor(3.5 * 1024 * 1024);

/** Also cap count so Hobby ~60s / analysis time stays reasonable. */
export const MAX_FILES_PER_UPLOAD_CHUNK = 5;

export type PreparedUpload = {
  /** Bytes to send (may be resized if the original alone exceeded the limit). */
  file: File;
  /** Original filename (kept for CSV / already-done matching). */
  originalName: string;
  /** True when browser re-encoded and EXIF may be gone. */
  resized: boolean;
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

/**
 * If a single file is still too big for one Vercel request, shrink it in the
 * browser (EXIF is lost — lastModified becomes the date fallback).
 */
export async function shrinkImageForUpload(
  file: File,
  maxBytes: number = VERCEL_SAFE_UPLOAD_BYTES,
): Promise<PreparedUpload> {
  if (file.size <= maxBytes || isHeicLike(file)) {
    return { file, originalName: file.name, resized: false };
  }

  try {
    const bitmap = await createImageBitmap(file);
    let scale = Math.min(
      1,
      1600 / Math.max(bitmap.width, bitmap.height),
    );
    let quality = 0.85;
    let blob: Blob | null = null;

    for (let attempt = 0; attempt < 6; attempt++) {
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) break;
      ctx.drawImage(bitmap, 0, 0, w, h);
      blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
      });
      if (blob && blob.size <= maxBytes) break;
      quality = Math.max(0.5, quality - 0.1);
      scale *= 0.85;
    }
    bitmap.close();

    if (!blob) {
      return { file, originalName: file.name, resized: false };
    }

    const out = new File([blob], file.name, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
    return { file: out, originalName: file.name, resized: true };
  } catch {
    return { file, originalName: file.name, resized: false };
  }
}

/** Group prepared files into sequential multipart-safe chunks. */
export function packUploadChunks(
  prepared: PreparedUpload[],
  maxBytes: number = VERCEL_SAFE_UPLOAD_BYTES,
  maxFiles: number = MAX_FILES_PER_UPLOAD_CHUNK,
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
