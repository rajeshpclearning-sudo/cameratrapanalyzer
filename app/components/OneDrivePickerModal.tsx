"use client";

import { useCallback, useEffect, useState } from "react";
import {
  downloadOneDriveImages,
  getOneDriveAccount,
  isOneDriveConfigured,
  isOneDriveFolder,
  isOneDriveImage,
  listOneDriveChildren,
  signInToOneDrive,
  signOutOfOneDrive,
  type OneDriveItem,
  type OneDrivePickedFile,
} from "@/lib/onedrive";

type Crumb = { id: string | "root"; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  onPicked: (files: OneDrivePickedFile[]) => void;
  recommendedMax?: number;
};

export function OneDrivePickerModal({
  open,
  onClose,
  onPicked,
  recommendedMax = 50,
}: Props) {
  const [accountLabel, setAccountLabel] = useState<string | null>(null);
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: "root", name: "OneDrive" }]);
  const [items, setItems] = useState<OneDriveItem[]>([]);
  const [selected, setSelected] = useState<Record<string, OneDriveItem>>({});
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = crumbs[crumbs.length - 1]!;

  const refreshAccount = useCallback(async () => {
    const account = await getOneDriveAccount();
    setAccountLabel(account?.username || account?.name || null);
  }, []);

  const loadFolder = useCallback(async (folderId: string | "root") => {
    setLoading(true);
    setError(null);
    try {
      await signInToOneDrive();
      await refreshAccount();
      const children = await listOneDriveChildren(folderId);
      setItems(children.filter((i) => isOneDriveFolder(i) || isOneDriveImage(i)));
      setSelected({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open OneDrive");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [refreshAccount]);

  useEffect(() => {
    if (!open) return;
    if (!isOneDriveConfigured()) {
      setError(
        "OneDrive is not set up yet. Add NEXT_PUBLIC_AZURE_CLIENT_ID in .env.local / Vercel (see README).",
      );
      return;
    }
    setCrumbs([{ id: "root", name: "OneDrive" }]);
    void loadFolder("root");
  }, [open, loadFolder]);

  const openFolder = (item: OneDriveItem) => {
    setCrumbs((prev) => [...prev, { id: item.id, name: item.name }]);
    void loadFolder(item.id);
  };

  const goCrumb = (index: number) => {
    const next = crumbs.slice(0, index + 1);
    setCrumbs(next);
    void loadFolder(next[next.length - 1]!.id);
  };

  const toggleItem = (item: OneDriveItem) => {
    setSelected((prev) => {
      const copy = { ...prev };
      if (copy[item.id]) delete copy[item.id];
      else copy[item.id] = item;
      return copy;
    });
  };

  const selectedList = Object.values(selected);
  const selectedCount = selectedList.length;

  const confirmPick = async () => {
    if (selectedCount === 0) {
      setError("Select at least one photo or folder.");
      return;
    }
    setDownloading(true);
    setProgress("Preparing download…");
    setError(null);
    try {
      const files = await downloadOneDriveImages(selectedList, {
        maxFiles: Math.max(recommendedMax * 4, 200),
        onProgress: (_c, _t, message) => setProgress(message),
      });
      onPicked(files);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
      setProgress(null);
    }
  };

  const onSignOut = async () => {
    try {
      await signOutOfOneDrive();
      setAccountLabel(null);
      setItems([]);
      setSelected({});
      setCrumbs([{ id: "root", name: "OneDrive" }]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-out failed");
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-md sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Pick photos from OneDrive"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container shadow-xl">
        <div className="flex items-start justify-between gap-sm border-b border-outline-variant px-md py-sm">
          <div>
            <h2 className="text-headline-sm font-semibold">From OneDrive</h2>
            <p className="mt-1 text-label-md text-on-surface-variant">
              {accountLabel
                ? `Signed in as ${accountLabel} (saved in this browser)`
                : "Sign in with Microsoft — saved for later picks on this device"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-highest"
            aria-label="Close"
            disabled={downloading}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-xs border-b border-outline-variant px-md py-2">
          {crumbs.map((c, i) => (
            <button
              key={`${c.id}-${i}`}
              type="button"
              onClick={() => goCrumb(i)}
              disabled={downloading || loading}
              className="rounded px-1 font-mono text-[11px] text-primary hover:underline disabled:opacity-50"
            >
              {c.name}
              {i < crumbs.length - 1 ? " /" : ""}
            </button>
          ))}
        </div>

        <div className="min-h-[240px] flex-1 overflow-y-auto px-md py-sm">
          {error && (
            <p className="mb-sm rounded-lg border border-error/40 bg-error/10 px-sm py-2 text-label-md text-error">
              {error}
            </p>
          )}
          {loading && (
            <p className="text-label-md text-on-surface-variant">Loading folder…</p>
          )}
          {!loading && items.length === 0 && !error && (
            <p className="text-label-md text-on-surface-variant">
              No folders or images here.
            </p>
          )}
          <ul className="space-y-1">
            {items.map((item) => {
              const folder = isOneDriveFolder(item);
              const checked = Boolean(selected[item.id]);
              return (
                <li
                  key={item.id}
                  className="flex items-center gap-sm rounded-lg border border-transparent px-2 py-2 hover:border-outline-variant hover:bg-surface-container-high"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={checked}
                    disabled={downloading}
                    onChange={() => toggleItem(item)}
                    aria-label={`Select ${item.name}`}
                  />
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-sm text-left"
                    disabled={downloading || !folder}
                    onClick={() => {
                      if (folder) openFolder(item);
                      else toggleItem(item);
                    }}
                  >
                    <span className="material-symbols-outlined text-on-surface-variant">
                      {folder ? "folder" : "image"}
                    </span>
                    <span className="truncate text-label-md">{item.name}</span>
                    {folder && (
                      <span className="shrink-0 font-mono text-[10px] text-on-surface-variant">
                        folder
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex flex-col gap-sm border-t border-outline-variant px-md py-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-label-md text-on-surface-variant">
            {progress ||
              `${selectedCount} selected · recommended ~${recommendedMax} photos`}
          </p>
          <div className="flex flex-wrap gap-xs">
            {accountLabel && (
              <button
                type="button"
                onClick={() => void onSignOut()}
                disabled={downloading}
                className="min-h-11 rounded-lg border border-outline-variant px-sm py-2 font-mono text-[10px] uppercase hover:bg-surface-container-high disabled:opacity-50"
              >
                Sign out
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={downloading}
              className="min-h-11 rounded-lg border border-outline-variant px-sm py-2 font-mono text-[10px] uppercase hover:bg-surface-container-high disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void confirmPick()}
              disabled={downloading || selectedCount === 0}
              className="min-h-11 rounded-lg bg-primary px-sm py-2 font-mono text-[10px] uppercase text-background disabled:opacity-50"
            >
              {downloading ? "Downloading…" : `Add ${selectedCount || ""}`.trim()}
            </button>
          </div>
        </div>
        <p className="px-md pb-sm text-[11px] text-on-surface-variant">
          Browsing “{current.name}”. Selecting a folder adds images inside it (one level).
        </p>
      </div>
    </div>
  );
}
