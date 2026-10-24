/**
 * Pick trap photos without Chrome's webkitdirectory "trust this site?" interstitial.
 *
 * That warning is a Chrome security feature for <input webkitdirectory> and cannot
 * be disabled. We use the File System Access API instead (directory or multi-file).
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

type WellKnownDirectory =
  | "desktop"
  | "documents"
  | "downloads"
  | "music"
  | "pictures"
  | "videos";

type ShowDirectoryPickerOpts = {
  id?: string;
  mode?: "read" | "readwrite";
  startIn?: WellKnownDirectory | FileSystemHandle;
};

type ShowOpenFilePickerOpts = {
  id?: string;
  multiple?: boolean;
  startIn?: WellKnownDirectory | FileSystemHandle;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
};

function freshPickerId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}`.slice(0, 32);
}

const IMAGE_OPEN_TYPES = [
  {
    description: "Camera trap images",
    accept: {
      "image/*": [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"],
    },
  },
];

/**
 * Pick a folder (Chrome/Edge) starting in Downloads — no webkitdirectory trust dialog.
 * Falls back to multi-file picker (user can Select All inside a folder).
 */
export async function pickTrapImageFolder(): Promise<FolderPickResult> {
  const w = window as Window & {
    showDirectoryPicker?: (
      options?: ShowDirectoryPickerOpts,
    ) => Promise<FileSystemDirectoryHandle>;
    showOpenFilePicker?: (
      options?: ShowOpenFilePickerOpts,
    ) => Promise<FileSystemFileHandle[]>;
  };

  // 1) Directory picker (preferred): choose the trap folder itself.
  if (typeof w.showDirectoryPicker === "function") {
    try {
      const dir = await w.showDirectoryPicker({
        // Fresh id so Chrome honors startIn (Downloads) instead of last nested folder.
        id: freshPickerId("ctad"),
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
      // Fall through to multi-file picker (still no webkitdirectory warning).
    }
  }

  // 2) Multi-file picker: open Downloads, enter folder, Select All — no trust interstitial.
  if (typeof w.showOpenFilePicker === "function") {
    try {
      const handles = await w.showOpenFilePicker({
        id: freshPickerId("ctaf"),
        multiple: true,
        startIn: "downloads",
        types: IMAGE_OPEN_TYPES,
      });
      const files: File[] = [];
      for (const h of handles) {
        const file = await h.getFile();
        if (isImageFileName(file.name, file.type)) files.push(file);
      }
      return { ok: true, files, folderName: "selected photos" };
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

  return {
    ok: false,
    cancelled: false,
    error: "unsupported",
  };
}
