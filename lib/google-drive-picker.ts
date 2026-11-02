/**
 * Browser Google Drive Picker (Option A): GIS token + Picker UI + Drive download.
 * Requires NEXT_PUBLIC_GOOGLE_CLIENT_ID and NEXT_PUBLIC_GOOGLE_API_KEY.
 * Optional NEXT_PUBLIC_GOOGLE_APP_ID (GCP project number) improves Picker reliability.
 */

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const GIS_SRC = "https://accounts.google.com/gsi/client";
const GAPI_SRC = "https://apis.google.com/js/api.js";
const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);
const IMAGE_MIME_PREFIX = "image/";

export type DrivePickedFile = {
  file: File;
  /** Parent folder name when known (trap folder for Excel columns). */
  trapFolder?: string;
};

export type DrivePickProgress = {
  phase: "auth" | "picking" | "listing" | "downloading";
  current: number;
  total: number;
  message: string;
};

export type DrivePickResult =
  | { ok: true; files: DrivePickedFile[] }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; error: string };

type TokenClient = {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
};

type TokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type PickerDoc = {
  id: string;
  name: string;
  mimeType: string;
  type?: string;
  parentId?: string;
  lastEditedUtc?: number;
};

type DriveFileMeta = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  parents?: string[];
};

type PickerCallbackData = {
  action: string;
  docs?: PickerDoc[];
};

type GooglePickerBuilder = {
  addView: (view: unknown) => GooglePickerBuilder;
  enableFeature: (f: string) => GooglePickerBuilder;
  setOAuthToken: (token: string) => GooglePickerBuilder;
  setDeveloperKey: (key: string) => GooglePickerBuilder;
  setAppId: (id: string) => GooglePickerBuilder;
  setCallback: (cb: (data: PickerCallbackData) => void) => GooglePickerBuilder;
  setTitle: (title: string) => GooglePickerBuilder;
  build: () => { setVisible: (v: boolean) => void };
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (resp: TokenResponse) => void;
            error_callback?: (err: { type?: string; message?: string }) => void;
          }) => TokenClient;
        };
      };
      picker?: {
        Action: { PICKED: string; CANCEL: string };
        Feature: { MULTISELECT_ENABLED: string; NAV_HIDDEN: string };
        ViewId: { DOCS_IMAGES: string; FOLDERS: string };
        DocsViewMode: { LIST: string; GRID: string };
        DocsView: new (viewId?: string) => {
          setIncludeFolders: (v: boolean) => unknown;
          setSelectFolderEnabled: (v: boolean) => unknown;
          setMimeTypes: (mimes: string) => unknown;
          setMode: (mode: string) => unknown;
        };
        PickerBuilder: new () => GooglePickerBuilder;
      };
    };
    gapi?: {
      load: (name: string, cb: () => void) => void;
    };
  }
}

function getConfig(): {
  clientId: string;
  apiKey: string;
  appId: string;
} | null {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? "";
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY?.trim() ?? "";
  const appId = process.env.NEXT_PUBLIC_GOOGLE_APP_ID?.trim() ?? "";
  if (!clientId || !apiKey) return null;
  return { clientId, apiKey, appId };
}

export function isGoogleDrivePickerConfigured(): boolean {
  return getConfig() !== null;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${src}"]`,
    );
    if (existing) {
      if (existing.dataset.loaded === "1") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error(`Failed to load ${src}`)),
        { once: true },
      );
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "1";
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function ensureGoogleApisLoaded(): Promise<void> {
  await Promise.all([loadScript(GIS_SRC), loadScript(GAPI_SRC)]);
  await new Promise<void>((resolve, reject) => {
    if (!window.gapi?.load) {
      reject(new Error("Google API script did not load"));
      return;
    }
    window.gapi.load("picker", () => resolve());
  });
}

function requestAccessToken(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) {
      reject(new Error("Google sign-in script did not load"));
      return;
    }
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(
            new Error(
              resp.error_description ||
                resp.error ||
                "Google sign-in was denied",
            ),
          );
          return;
        }
        resolve(resp.access_token);
      },
      error_callback: (err) => {
        reject(new Error(err.message || err.type || "Google sign-in failed"));
      },
    });
    client.requestAccessToken({ prompt: "" });
  });
}

function openPicker(opts: {
  accessToken: string;
  apiKey: string;
  appId: string;
}): Promise<PickerDoc[] | null> {
  return new Promise((resolve, reject) => {
    const pickerNs = window.google?.picker;
    if (!pickerNs) {
      reject(new Error("Google Picker did not load"));
      return;
    }

    const imagesView = new pickerNs.DocsView(pickerNs.ViewId.DOCS_IMAGES);
    imagesView.setIncludeFolders(true);
    imagesView.setSelectFolderEnabled(true);
    imagesView.setMode(pickerNs.DocsViewMode.LIST);

    const foldersView = new pickerNs.DocsView(pickerNs.ViewId.FOLDERS);
    foldersView.setIncludeFolders(true);
    foldersView.setSelectFolderEnabled(true);
    foldersView.setMode(pickerNs.DocsViewMode.LIST);

    const builder = new pickerNs.PickerBuilder()
      .addView(imagesView)
      .addView(foldersView)
      .enableFeature(pickerNs.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(opts.accessToken)
      .setDeveloperKey(opts.apiKey)
      .setTitle("Pick camera-trap photos or a folder")
      .setCallback((data) => {
        if (data.action === pickerNs.Action.CANCEL) {
          resolve(null);
          return;
        }
        if (data.action === pickerNs.Action.PICKED) {
          resolve(data.docs ?? []);
        }
      });

    if (opts.appId) {
      builder.setAppId(opts.appId);
    }

    builder.build().setVisible(true);
  });
}

function isImageMeta(name: string, mimeType: string): boolean {
  const mime = (mimeType || "").toLowerCase();
  if (mime.startsWith(IMAGE_MIME_PREFIX) && mime !== "image/vnd.google-apps.photo") {
    return true;
  }
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTS.has(ext);
}

function isFolder(mimeType: string, docType?: string): boolean {
  return (
    mimeType === "application/vnd.google-apps.folder" ||
    docType === "folder"
  );
}

async function driveGetJson<T>(
  url: string,
  accessToken: string,
): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Drive request failed (${res.status})${text ? `: ${text.slice(0, 180)}` : ""}`,
    );
  }
  return (await res.json()) as T;
}

async function listImageChildren(
  folderId: string,
  accessToken: string,
  maxFiles: number,
): Promise<DriveFileMeta[]> {
  const out: DriveFileMeta[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken,files(id,name,mimeType,modifiedTime,parents)",
      pageSize: "100",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await driveGetJson<{
      files?: DriveFileMeta[];
      nextPageToken?: string;
    }>(
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
      accessToken,
    );
    for (const f of data.files ?? []) {
      if (isFolder(f.mimeType)) continue;
      if (!isImageMeta(f.name, f.mimeType)) continue;
      out.push(f);
      if (out.length >= maxFiles) return out;
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}

async function resolveFolderName(
  folderId: string | undefined,
  accessToken: string,
  cache: Map<string, string>,
): Promise<string | undefined> {
  if (!folderId) return undefined;
  const cached = cache.get(folderId);
  if (cached) return cached;
  try {
    const meta = await driveGetJson<{ name?: string }>(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=name&supportsAllDrives=true`,
      accessToken,
    );
    const name = meta.name?.trim();
    if (name) cache.set(folderId, name);
    return name;
  } catch {
    return undefined;
  }
}

async function downloadDriveFile(
  meta: DriveFileMeta,
  accessToken: string,
): Promise<File> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(meta.id)}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw new Error(`Could not download “${meta.name}” (${res.status})`);
  }
  const blob = await res.blob();
  const modifiedMs = meta.modifiedTime
    ? Date.parse(meta.modifiedTime)
    : undefined;
  return new File([blob], meta.name, {
    type: meta.mimeType || blob.type || "application/octet-stream",
    lastModified:
      modifiedMs && Number.isFinite(modifiedMs) ? modifiedMs : Date.now(),
  });
}

/**
 * Sign in (if needed), open Google Picker, download selected images (or folder contents).
 * Caps downloads at `maxFiles` (default 50).
 */
export async function pickPhotosFromGoogleDrive(opts?: {
  maxFiles?: number;
  onProgress?: (p: DrivePickProgress) => void;
}): Promise<DrivePickResult> {
  const config = getConfig();
  if (!config) {
    return {
      ok: false,
      cancelled: false,
      error:
        "Google Drive is not set up yet. Ask the admin to add NEXT_PUBLIC_GOOGLE_CLIENT_ID and NEXT_PUBLIC_GOOGLE_API_KEY.",
    };
  }

  const maxFiles = Math.max(1, opts?.maxFiles ?? 50);
  const onProgress = opts?.onProgress;

  try {
    onProgress?.({
      phase: "auth",
      current: 0,
      total: 0,
      message: "Connecting to Google…",
    });
    await ensureGoogleApisLoaded();
    const accessToken = await requestAccessToken(config.clientId);

    onProgress?.({
      phase: "picking",
      current: 0,
      total: 0,
      message: "Open the Google Drive window and pick photos…",
    });
    const docs = await openPicker({
      accessToken,
      apiKey: config.apiKey,
      appId: config.appId,
    });
    if (!docs) {
      return { ok: false, cancelled: true };
    }
    if (docs.length === 0) {
      return {
        ok: false,
        cancelled: false,
        error: "No files were selected in Google Drive.",
      };
    }

    onProgress?.({
      phase: "listing",
      current: 0,
      total: 0,
      message: "Looking up selected Drive items…",
    });

    const folderNameCache = new Map<string, string>();
    const toDownload: Array<{ meta: DriveFileMeta; trapFolder?: string }> = [];

    for (const doc of docs) {
      if (toDownload.length >= maxFiles) break;

      if (isFolder(doc.mimeType, doc.type)) {
        const children = await listImageChildren(
          doc.id,
          accessToken,
          maxFiles - toDownload.length,
        );
        const trapFolder = doc.name;
        folderNameCache.set(doc.id, doc.name);
        for (const child of children) {
          toDownload.push({ meta: child, trapFolder });
        }
        continue;
      }

      if (!isImageMeta(doc.name, doc.mimeType)) continue;

      let meta: DriveFileMeta = {
        id: doc.id,
        name: doc.name,
        mimeType: doc.mimeType,
        parents: doc.parentId ? [doc.parentId] : undefined,
        modifiedTime: doc.lastEditedUtc
          ? new Date(doc.lastEditedUtc).toISOString()
          : undefined,
      };

      try {
        const detailed = await driveGetJson<DriveFileMeta>(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(doc.id)}?fields=id,name,mimeType,modifiedTime,parents&supportsAllDrives=true`,
          accessToken,
        );
        meta = detailed;
      } catch {
        // Keep picker metadata if detail fetch fails.
      }

      const parentId = meta.parents?.[0] ?? doc.parentId;
      const trapFolder = await resolveFolderName(
        parentId,
        accessToken,
        folderNameCache,
      );
      toDownload.push({ meta, trapFolder });
    }

    if (toDownload.length === 0) {
      return {
        ok: false,
        cancelled: false,
        error:
          "No image files found in that Drive selection. Pick JPG/PNG/WebP/HEIC photos or a folder of them.",
      };
    }

    const picked: DrivePickedFile[] = [];
    for (let i = 0; i < toDownload.length; i++) {
      const item = toDownload[i]!;
      onProgress?.({
        phase: "downloading",
        current: i + 1,
        total: toDownload.length,
        message: `Getting ${i + 1} of ${toDownload.length} from Drive…`,
      });
      const file = await downloadDriveFile(item.meta, accessToken);
      picked.push({ file, trapFolder: item.trapFolder });
    }

    return { ok: true, files: picked };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Google Drive picker failed";
    // User closed the consent popup — treat as cancel when message is empty-ish
    if (/popup_closed|access_denied|user.*cancel/i.test(message)) {
      return { ok: false, cancelled: true };
    }
    return { ok: false, cancelled: false, error: message };
  }
}
