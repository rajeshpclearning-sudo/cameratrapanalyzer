/**
 * OneDrive via Microsoft Graph + MSAL (browser).
 * Sign-in once; tokens cached in localStorage and reused on later picks.
 */

import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  type AccountInfo,
  type Configuration,
} from "@azure/msal-browser";

const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPES = ["User.Read", "Files.Read", "Files.Read.All"];

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);

export type OneDriveItem = {
  id: string;
  name: string;
  folder?: { childCount?: number };
  file?: { mimeType?: string };
  size?: number;
  lastModifiedDateTime?: string;
  parentReference?: { path?: string; name?: string };
};

export type OneDrivePickedFile = {
  file: File;
  trapFolder?: string;
};

export function isOneDriveConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_AZURE_CLIENT_ID?.trim());
}

function tenantId(): string {
  return process.env.NEXT_PUBLIC_AZURE_TENANT_ID?.trim() || "common";
}

function clientId(): string {
  return process.env.NEXT_PUBLIC_AZURE_CLIENT_ID?.trim() || "";
}

function redirectUri(): string {
  if (typeof window === "undefined") return "http://localhost:3000";
  return window.location.origin;
}

let msalPromise: Promise<PublicClientApplication> | null = null;

async function getMsal(): Promise<PublicClientApplication> {
  if (!msalPromise) {
    msalPromise = (async () => {
      const config: Configuration = {
        auth: {
          clientId: clientId(),
          authority: `https://login.microsoftonline.com/${tenantId()}`,
          redirectUri: redirectUri(),
          postLogoutRedirectUri: redirectUri(),
        },
        cache: {
          cacheLocation: "localStorage",
        },
      };
      const app = new PublicClientApplication(config);
      await app.initialize();
      return app;
    })();
  }
  return msalPromise;
}

export async function getOneDriveAccount(): Promise<AccountInfo | null> {
  if (!isOneDriveConfigured()) return null;
  const app = await getMsal();
  const accounts = app.getAllAccounts();
  return accounts[0] ?? null;
}

export async function signInToOneDrive(): Promise<AccountInfo> {
  if (!isOneDriveConfigured()) {
    throw new Error(
      "OneDrive is not configured. Set NEXT_PUBLIC_AZURE_CLIENT_ID (see README).",
    );
  }
  const app = await getMsal();
  const existing = app.getAllAccounts()[0];
  if (existing) return existing;

  const result = await app.loginPopup({
    scopes: SCOPES,
    prompt: "select_account",
  });
  if (!result.account) {
    throw new Error("Microsoft sign-in did not return an account");
  }
  return result.account;
}

export async function signOutOfOneDrive(): Promise<void> {
  if (!isOneDriveConfigured()) return;
  const app = await getMsal();
  const account = app.getAllAccounts()[0];
  if (!account) return;
  await app.logoutPopup({ account });
}

async function getAccessToken(): Promise<string> {
  const app = await getMsal();
  let account = app.getAllAccounts()[0];
  if (!account) {
    account = await signInToOneDrive();
  }

  try {
    const silent = await app.acquireTokenSilent({
      account,
      scopes: SCOPES,
    });
    return silent.accessToken;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      const interactive = await app.acquireTokenPopup({
        account,
        scopes: SCOPES,
      });
      return interactive.accessToken;
    }
    throw err;
  }
}

async function graphFetch<T>(
  path: string,
  accessToken: string,
): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `OneDrive request failed (${res.status})${text ? `: ${text.slice(0, 200)}` : ""}`,
    );
  }
  return (await res.json()) as T;
}

export function isOneDriveImage(item: OneDriveItem): boolean {
  if (item.folder) return false;
  const mime = (item.file?.mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  const ext = item.name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTS.has(ext);
}

export function isOneDriveFolder(item: OneDriveItem): boolean {
  return Boolean(item.folder);
}

/** List children of a drive folder (`root` or item id). */
export async function listOneDriveChildren(
  folderId: string | "root" = "root",
): Promise<OneDriveItem[]> {
  const token = await getAccessToken();
  const path =
    folderId === "root"
      ? "/me/drive/root/children?$top=200&$select=id,name,folder,file,size,lastModifiedDateTime,parentReference"
      : `/me/drive/items/${encodeURIComponent(folderId)}/children?$top=200&$select=id,name,folder,file,size,lastModifiedDateTime,parentReference`;

  const data = await graphFetch<{ value?: OneDriveItem[] }>(path, token);
  const items = data.value ?? [];
  // Folders first, then images, then other files hidden from primary list later
  return items.sort((a, b) => {
    const af = a.folder ? 0 : 1;
    const bf = b.folder ? 0 : 1;
    if (af !== bf) return af - bf;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

export async function getOneDriveItem(
  itemId: string,
): Promise<OneDriveItem> {
  const token = await getAccessToken();
  return graphFetch<OneDriveItem>(
    `/me/drive/items/${encodeURIComponent(itemId)}?$select=id,name,folder,file,size,lastModifiedDateTime,parentReference`,
    token,
  );
}

/**
 * Download selected image items (and/or all images in selected folders — shallow).
 */
export async function downloadOneDriveImages(
  items: OneDriveItem[],
  opts?: {
    maxFiles?: number;
    onProgress?: (current: number, total: number, message: string) => void;
  },
): Promise<OneDrivePickedFile[]> {
  const maxFiles = Math.max(1, opts?.maxFiles ?? 200);
  const token = await getAccessToken();
  const toFetch: Array<{ item: OneDriveItem; trapFolder?: string }> = [];

  for (const item of items) {
    if (toFetch.length >= maxFiles) break;
    if (isOneDriveFolder(item)) {
      const children = await listOneDriveChildren(item.id);
      for (const child of children) {
        if (toFetch.length >= maxFiles) break;
        if (!isOneDriveImage(child)) continue;
        toFetch.push({ item: child, trapFolder: item.name });
      }
      continue;
    }
    if (!isOneDriveImage(item)) continue;
    const parentName =
      item.parentReference?.name ||
      item.parentReference?.path?.split("/").filter(Boolean).pop();
    toFetch.push({
      item,
      trapFolder: parentName && parentName !== "root:" ? parentName : undefined,
    });
  }

  if (toFetch.length === 0) {
    throw new Error(
      "No image files found in that OneDrive selection. Pick JPG/PNG/WebP/HEIC photos or a folder of them.",
    );
  }

  const out: OneDrivePickedFile[] = [];
  for (let i = 0; i < toFetch.length; i++) {
    const { item, trapFolder } = toFetch[i]!;
    opts?.onProgress?.(
      i + 1,
      toFetch.length,
      `Getting ${i + 1} of ${toFetch.length} from OneDrive…`,
    );
    const res = await fetch(
      `${GRAPH}/me/drive/items/${encodeURIComponent(item.id)}/content`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      throw new Error(`Could not download “${item.name}” (${res.status})`);
    }
    const blob = await res.blob();
    const modifiedMs = item.lastModifiedDateTime
      ? Date.parse(item.lastModifiedDateTime)
      : undefined;
    const file = new File([blob], item.name, {
      type: item.file?.mimeType || blob.type || "application/octet-stream",
      lastModified:
        modifiedMs && Number.isFinite(modifiedMs) ? modifiedMs : Date.now(),
    });
    out.push({ file, trapFolder });
  }
  return out;
}
