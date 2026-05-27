import sharp from "sharp";

export { isAcceptedImage, isHeic } from "./image-accept";

const MAX_EDGE = 1024;
const JPEG_QUALITY = 85;

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
