/**
 * Open a folder picker that starts one level up from a nested trap folder
 * when possible (Downloads / Documents), instead of reopening the last folder.
 *
 * Native <input webkitdirectory> always remembers the previous folder — we
 * prefer showDirectoryPicker with a fresh id so startIn is honored.
 */

export type FolderPickResult =
  | { ok: true; files: File[]; folderName: string }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; error: string };

function isImageFileName(name: string, type: string): boolean {
  const t = type.toLowerCase();
  const ext = name.split(".").pop()?.toLowerCase();
  return (
    t.startsWith("image/") ||
    ext === "jpg" ||
    ext === "jpeg" ||
    ext === "png" ||
    ext === "webp" ||
    ext === "heic" ||
    ext === "heif"
  );
}

async function filesFromDirectoryHandle(
  dir: FileSystemDirectoryHandle,
): Promise<File[]> {
  const out: File[] = [];
  // TypeScript DOM libs vary; iterate via entries() when values() is missing.
  const iterable = dir as FileSystemDirectoryHandle & {
    values?: () => AsyncIterableIterator<FileSystemHandle>;
    entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>;
  };
  if (typeof iterable.values === "function") {
    for await (const entry of iterable.values()) {
      if (entry.kind !== "file") continue;
      const file = await (entry as FileSystemFileHandle).getFile();
      if (isImageFileName(file.name, file.type)) out.push(file);
    }
    return out;
  }
  if (typeof iterable.entries === "function") {
    for await (const [, entry] of iterable.entries()) {
      if (entry.kind !== "file") continue;
      const file = await (entry as FileSystemFileHandle).getFile();
      if (isImageFileName(file.name, file.type)) out.push(file);
    }
  }
  return out;
}

type ShowDirectoryPickerOpts = {
  id?: string;
  mode?: "read" | "readwrite";
  startIn?:
    | "desktop"
    | "documents"
    | "downloads"
    | "music"
    | "pictures"
    | "videos"
    | FileSystemHandle;
};

/**
 * Prefer Chrome/Edge directory picker starting in Downloads so the user
 * chooses a trap folder each time (not the previous nested folder).
 */
export async function pickTrapImageFolder(): Promise<FolderPickResult> {
  const w = window as Window & {
    showDirectoryPicker?: (
      options?: ShowDirectoryPickerOpts,
    ) => Promise<FileSystemDirectoryHandle>;
  };

  if (typeof w.showDirectoryPicker !== "function") {
    return {
      ok: false,
      cancelled: false,
      error: "unsupported",
    };
  }

  try {
    // New id each time → browser has no remembered path for this id →
    // startIn: "downloads" is used (parent level vs last "Folder upload N").
    const id = `cta${Date.now().toString(36)}`.slice(0, 32);
    const dir = await w.showDirectoryPicker({
      id,
      mode: "read",
      startIn: "downloads",
    });
    const files = await filesFromDirectoryHandle(dir);
    return { ok: true, files, folderName: dir.name };
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "AbortError") {
      return { ok: false, cancelled: true };
    }
    return {
      ok: false,
      cancelled: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
