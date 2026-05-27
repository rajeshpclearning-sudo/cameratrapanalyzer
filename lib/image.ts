import sharp from "sharp";

const MAX_EDGE = 1024;
const JPEG_QUALITY = 85;

const RASTER_EXT = new Set(["jpg", "jpeg", "png", "webp"]);
const HEIC_EXT = new Set(["heic", "heif"]);

export function isHeic(mime: string, name: string): boolean {
  const lower = mime.toLowerCase();
  if (lower.includes("heic") || lower.includes("heif")) return true;
  const ext = name.split(".").pop()?.toLowerCase();
  return ext !== undefined && HEIC_EXT.has(ext);
}

export function isAcceptedImage(mime: string, name: string): boolean {
  if (isHeic(mime, name)) return true;
  const lower = mime.toLowerCase();
  if (
    lower === "image/jpeg" ||
    lower === "image/png" ||
    lower === "image/webp"
  ) {
    return true;
  }
  const ext = name.split(".").pop()?.toLowerCase();
  return ext !== undefined && RASTER_EXT.has(ext);
}

/** Decode any accepted format to JPEG bytes for EXIF + LLM. */
export async function decodeToJpeg(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

export async function prepareImageForLlm(buffer: Buffer): Promise<Buffer> {
  return decodeToJpeg(buffer);
}

/** Small thumbnail for UI (not sent to LLM). */
export async function createThumbnail(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize({ width: 64, height: 64, fit: "cover" })
    .jpeg({ quality: 70 })
    .toBuffer();
}
