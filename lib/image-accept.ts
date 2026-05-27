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
