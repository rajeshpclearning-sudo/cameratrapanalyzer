import sharp from "sharp";

const MAX_EDGE = 1024;
const JPEG_QUALITY = 85;

const SUPPORTED = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export function isSupportedImage(mime: string, name: string): boolean {
  const lower = mime.toLowerCase();
  if (SUPPORTED.has(lower)) return true;
  const ext = name.split(".").pop()?.toLowerCase();
  return ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "webp";
}

export function isHeic(mime: string, name: string): boolean {
  const lower = mime.toLowerCase();
  if (lower.includes("heic") || lower.includes("heif")) return true;
  const ext = name.split(".").pop()?.toLowerCase();
  return ext === "heic" || ext === "heif";
}

export async function prepareImageForLlm(buffer: Buffer): Promise<Buffer> {
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
