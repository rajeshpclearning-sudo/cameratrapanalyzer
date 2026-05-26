"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatFileSize } from "@/lib/format";
import type { FileJobState, JobPollResponse } from "@/lib/types";

const MAX_FILES = 50;
const POLL_MS = 800;
const ACCEPT = "image/jpeg,image/png,image/webp";

type LocalFile = {
  id: string;
  file: File;
  selected: boolean;
};

function Icon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
  );
}

function statusBadge(status: FileJobState["status"]) {
  switch (status) {
    case "done":
      return {
        label: "DONE",
        row: "bg-surface-dim/50 border-outline-variant/20",
        icon: "check_circle",
        iconClass: "text-primary",
        badge: "text-primary bg-primary/10",
      };
    case "analyzing":
      return {
        label: "ANALYZING",
        row: "bg-surface-container-high border-primary/40 pulsing-blue",
        icon: "sync",
        iconClass: "text-[#0091ff] text-sm animate-spin",
        badge: "text-[#0091ff] bg-[#0091ff]/10",
      };
    case "error":
      return {
        label: "ERROR",
        row: "bg-error-container/10 border-error/20",
        icon: "error",
        iconClass: "text-error text-sm",
        badge: "text-error bg-error/10",
      };
    default:
      return {
        label: "PENDING",
        row: "bg-surface-dim/30 border-outline-variant/10",
        icon: "pending",
        iconClass: "text-on-surface-variant text-sm",
        badge: "text-on-surface-variant",
      };
  }
}

export default function Home() {
  const [localFiles, setLocalFiles] = useState<LocalFile[]>([]);
  const [existingCsv, setExistingCsv] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [poll, setPoll] = useState<JobPollResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const selectedCount = localFiles.filter((f) => f.selected).length;
  const allSelected =
    localFiles.length > 0 && selectedCount === localFiles.length;

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const list = Array.from(incoming).filter((f) => {
      const t = f.type.toLowerCase();
      const ext = f.name.split(".").pop()?.toLowerCase();
      const image =
        t.startsWith("image/") ||
        ext === "jpg" ||
        ext === "jpeg" ||
        ext === "png" ||
        ext === "webp";
      const heic =
        t.includes("heic") ||
        t.includes("heif") ||
        ext === "heic" ||
        ext === "heif";
      return image && !heic;
    });

    setLocalFiles((prev) => {
      const seen = new Set(prev.map((p) => `${p.file.name}-${p.file.size}`));
      const added: LocalFile[] = [];
      for (const file of list) {
        const key = `${file.name}-${file.size}`;
        if (seen.has(key)) continue;
        seen.add(key);
        added.push({
          id: crypto.randomUUID(),
          file,
          selected: true,
        });
      }
      const merged = [...prev, ...added];
      if (merged.length > MAX_FILES) {
        setError(`Maximum ${MAX_FILES} files; remove some before adding more.`);
        return merged.slice(0, MAX_FILES);
      }
      setError(null);
      return merged;
    });
  }, []);

  const onFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = "";
  };

  const onFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = "";
  };

  const toggleFile = (id: string) => {
    setLocalFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, selected: !f.selected } : f)),
    );
  };

  const toggleAll = () => {
    const next = !allSelected;
    setLocalFiles((prev) => prev.map((f) => ({ ...f, selected: next })));
  };

  const selectAll = (on: boolean) => {
    setLocalFiles((prev) => prev.map((f) => ({ ...f, selected: on })));
  };

  const removeSelected = () => {
    setLocalFiles((prev) => prev.filter((f) => !f.selected));
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

  const startPolling = (id: string) => {
    stopPolling();
    const tick = async () => {
      try {
        const res = await fetch(`/api/jobs/${id}`);
        if (!res.ok) return;
        const data = (await res.json()) as JobPollResponse;
        setPoll(data);
        if (data.status === "completed" || data.status === "failed") {
          stopPolling();
          setSubmitting(false);
        }
      } catch {
        // keep polling
      }
    };
    void tick();
    pollRef.current = setInterval(() => void tick(), POLL_MS);
  };

  const runAnalysis = async () => {
    const selected = localFiles.filter((f) => f.selected);
    if (selected.length === 0) {
      setError("Select at least one image.");
      return;
    }

    setError(null);
    setSubmitting(true);
    setPoll(null);
    setJobId(null);

    const form = new FormData();
    for (const { file } of selected) {
      form.append("files", file);
    }
    if (existingCsv) {
      form.append("existingCsv", existingCsv);
    }

    try {
      const res = await fetch("/api/jobs", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to start job");
        setSubmitting(false);
        return;
      }
      setJobId(data.jobId);
      startPolling(data.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      setSubmitting(false);
    }
  };

  const downloadCsv = () => {
    if (!jobId) return;
    window.location.href = `/api/jobs/${jobId}/download`;
  };

  const progressPct =
    poll && poll.total > 0
      ? Math.round((poll.completed / poll.total) * 100)
      : 0;

  const showProgress = submitting && poll;
  const csvReady = poll?.csvReady && jobId;
  const statusFiles = poll?.files ?? [];

  const sessionLabel =
    localFiles.length > 0
      ? localFiles[0].file.name.replace(/\.[^.]+$/, "").slice(0, 24)
      : "New_Session";

  return (
    <>
      {/* Side nav */}
      <aside className="fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r border-outline-variant bg-surface-container-low p-sm">
        <div className="px-sm py-md">
          <h1 className="text-headline-sm font-bold text-primary">
            WildEye Analyzer
          </h1>
        </div>

        <div className="mb-md flex items-center space-x-sm px-sm py-xs">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-outline-variant bg-surface-container-highest">
            <Icon name="forest" className="text-primary text-xl" />
          </div>
          <div className="flex flex-col">
            <span className="text-label-md font-bold text-on-surface">
              Local Station
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
              Active Session
            </span>
          </div>
        </div>

        <nav className="flex-grow space-y-1">
          <a
            href="#"
            className="flex items-center space-x-sm rounded-xl bg-secondary-container px-sm py-3 font-bold text-on-secondary-container transition-transform active:translate-x-1"
          >
            <Icon name="analytics" />
            <span className="text-label-md">Analysis</span>
          </a>
          <span className="flex cursor-not-allowed items-center space-x-sm rounded-xl px-sm py-3 text-on-surface-variant opacity-50">
            <Icon name="database" />
            <span className="text-label-md">Log Library</span>
          </span>
          <span className="flex cursor-not-allowed items-center space-x-sm rounded-xl px-sm py-3 text-on-surface-variant opacity-50">
            <Icon name="menu_book" />
            <span className="text-label-md">Species Guide</span>
          </span>
          <span className="flex cursor-not-allowed items-center space-x-sm rounded-xl px-sm py-3 text-on-surface-variant opacity-50">
            <Icon name="map" />
            <span className="text-label-md">Field Map</span>
          </span>
        </nav>

        <button
          type="button"
          className="mb-md w-full rounded-xl bg-primary-container py-3 font-mono text-label-md font-bold text-on-primary-container transition-all hover:brightness-110"
          onClick={() => {
            setLocalFiles([]);
            setExistingCsv(null);
            setPoll(null);
            setJobId(null);
            setError(null);
            stopPolling();
            setSubmitting(false);
          }}
        >
          New Analysis
        </button>

        <div className="space-y-1 border-t border-outline-variant pt-sm">
          <span className="flex cursor-not-allowed items-center space-x-sm rounded-xl px-sm py-2 text-on-surface-variant opacity-50">
            <Icon name="support_agent" />
            <span className="text-label-md">Support</span>
          </span>
          <span className="flex cursor-not-allowed items-center space-x-sm rounded-xl px-sm py-2 text-on-surface-variant opacity-50">
            <Icon name="logout" />
            <span className="text-label-md">Sign Out</span>
          </span>
        </div>
      </aside>

      {/* Main */}
      <main className="ml-64 flex min-h-screen flex-grow flex-col">
        <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-outline-variant bg-surface-container px-lg">
          <div className="flex items-center space-x-md">
            <span className="text-headline-sm text-on-surface-variant">
              Camera Trap Session /
            </span>
            <span className="text-headline-sm font-bold text-primary">
              {sessionLabel}
            </span>
          </div>
          <div className="flex items-center space-x-md">
            <div className="mr-md flex items-center space-x-sm">
              <button
                type="button"
                className="text-on-surface-variant transition-colors hover:text-primary"
                aria-label="Settings"
              >
                <Icon name="settings" />
              </button>
              <button
                type="button"
                className="text-on-surface-variant transition-colors hover:text-primary"
                aria-label="Help"
              >
                <Icon name="help" />
              </button>
            </div>
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-outline-variant">
              <Icon name="person" className="text-on-surface-variant text-lg" />
            </div>
          </div>
        </header>

        {error && (
          <div className="mx-lg mt-md rounded-xl border border-error/40 bg-error-container/20 px-md py-sm text-label-md text-error">
            {error}
          </div>
        )}

        <div className="mx-auto grid w-full max-w-content grid-cols-12 gap-lg p-lg">
          {/* Step 1 */}
          <section className="col-span-12 flex flex-col space-y-md xl:col-span-8">
            <div className="flex flex-wrap items-center justify-between gap-sm">
              <div className="flex items-center space-x-sm">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary font-bold text-background">
                  1
                </span>
                <h2 className="text-headline-md font-semibold">Select Images</h2>
              </div>
              <div className="flex flex-wrap gap-xs">
                <button
                  type="button"
                  onClick={() => selectAll(true)}
                  className="rounded-lg border border-outline-variant px-sm py-1 font-mono text-label-caps uppercase text-label-caps transition-colors hover:bg-surface-container-high"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => selectAll(false)}
                  className="rounded-lg border border-outline-variant px-sm py-1 font-mono text-label-caps uppercase transition-colors hover:bg-surface-container-high"
                >
                  Deselect all
                </button>
                <button
                  type="button"
                  onClick={removeSelected}
                  className="rounded-lg border border-error/30 px-sm py-1 font-mono text-label-caps uppercase text-error transition-colors hover:bg-error/10"
                >
                  Remove selected
                </button>
              </div>
            </div>

            <input
              ref={folderInputRef}
              type="file"
              accept={ACCEPT}
              multiple
              className="hidden"
              onChange={onFolderChange}
              {...({ webkitdirectory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
            />
            <input
              ref={filesInputRef}
              type="file"
              accept={ACCEPT}
              multiple
              className="hidden"
              onChange={onFilesChange}
            />
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => setExistingCsv(e.target.files?.[0] ?? null)}
            />

            <div className="grid grid-cols-1 gap-md md:grid-cols-2">
              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                className="group flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-outline-variant bg-surface-container-low p-lg transition-colors hover:border-primary"
              >
                <Icon
                  name="folder_zip"
                  className="mb-sm text-4xl text-on-surface-variant group-hover:text-primary"
                />
                <span className="text-headline-sm font-semibold">
                  Upload Folder
                </span>
                <span className="mt-xs text-label-md text-on-surface-variant">
                  Batch process entire directories
                </span>
              </button>
              <button
                type="button"
                onClick={() => filesInputRef.current?.click()}
                className="group flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-outline-variant bg-surface-container-low p-lg transition-colors hover:border-primary"
              >
                <Icon
                  name="upload_file"
                  className="mb-sm text-4xl text-on-surface-variant group-hover:text-primary"
                />
                <span className="text-headline-sm font-semibold">
                  Individual Files
                </span>
                <span className="mt-xs text-label-md text-on-surface-variant">
                  JPEG, PNG, WebP (max {MAX_FILES})
                </span>
              </button>
            </div>

            <div className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container">
              <div className="grid grid-cols-12 border-b border-outline-variant bg-surface-container-high px-md py-sm font-mono text-label-caps uppercase text-on-surface-variant">
                <div className="col-span-1 flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="rounded border-outline-variant bg-surface-dim text-primary focus:ring-primary"
                  />
                </div>
                <div className="col-span-6">Filename</div>
                <div className="col-span-2">Size</div>
                <div className="col-span-3 text-right">Status</div>
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                {localFiles.length === 0 ? (
                  <p className="px-md py-lg text-center text-label-md text-on-surface-variant">
                    No images selected. Use upload zones above.
                  </p>
                ) : (
                  localFiles.map((item) => (
                    <div
                      key={item.id}
                      className="grid grid-cols-12 items-center border-b border-outline-variant/30 px-md py-3 font-mono text-label-md transition-colors hover:bg-surface-container-highest"
                    >
                      <div className="col-span-1 flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={() => toggleFile(item.id)}
                          className="rounded border-outline-variant bg-surface-dim text-primary focus:ring-primary"
                        />
                      </div>
                      <div className="col-span-6 flex items-center space-x-xs truncate">
                        <Icon name="image" className="shrink-0 text-primary" />
                        <span className="truncate">{item.file.name}</span>
                      </div>
                      <div className="col-span-2 text-on-surface-variant">
                        {formatFileSize(item.file.size)}
                      </div>
                      <div className="col-span-3 text-right text-on-surface-variant">
                        Ready
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            {localFiles.length > 0 && (
              <p className="font-mono text-label-md text-on-surface-variant">
                {selectedCount} of {localFiles.length} selected
              </p>
            )}
          </section>

          {/* Sidebar */}
          <aside className="col-span-12 flex flex-col space-y-lg xl:col-span-4">
            {/* Step 2 */}
            <div className="rounded-xl border border-outline-variant bg-surface-container p-md">
              <div className="mb-md flex items-center space-x-sm">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-outline-variant text-sm font-bold text-background">
                  2
                </span>
                <h3 className="text-headline-sm font-semibold">
                  Existing Log (Optional)
                </h3>
              </div>
              {existingCsv ? (
                <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-surface-dim p-sm">
                  <div className="flex min-w-0 items-center space-x-sm">
                    <Icon name="description" className="shrink-0 text-primary" />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-label-md font-medium">
                        {existingCsv.name}
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
                        File ready to append
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setExistingCsv(null);
                      if (csvInputRef.current) csvInputRef.current.value = "";
                    }}
                    className="shrink-0 text-on-surface-variant transition-colors hover:text-error"
                    aria-label="Remove CSV"
                  >
                    <Icon name="close" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => csvInputRef.current?.click()}
                  className="flex w-full items-center justify-center space-x-sm rounded-lg border border-dashed border-outline-variant py-4 text-label-md text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
                >
                  <Icon name="upload_file" />
                  <span>Upload Camera_Trap_Analysis*.csv</span>
                </button>
              )}
            </div>

            {/* Step 3 */}
            <div className="flex flex-col space-y-md rounded-xl border border-outline-variant bg-surface-container p-md">
              <div className="flex items-center space-x-sm">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-outline-variant text-sm font-bold text-background">
                  3
                </span>
                <h3 className="text-headline-sm font-semibold">Run Analysis</h3>
              </div>

              <button
                type="button"
                disabled={submitting || selectedCount === 0}
                onClick={() => void runAnalysis()}
                className="flex w-full items-center justify-center space-x-sm rounded-xl bg-primary py-4 text-headline-sm font-bold text-background shadow-lg shadow-primary/10 transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon name="bolt" />
                <span>{submitting ? "Running…" : "Run Analysis"}</span>
              </button>

              {showProgress && (
                <div className="space-y-sm border-t border-outline-variant pt-md">
                  <div className="flex items-end justify-between">
                    <span className="font-mono text-label-caps uppercase text-on-surface-variant">
                      Processing queue
                    </span>
                    <span className="font-mono text-headline-sm text-primary">
                      {poll.completed} / {poll.total} completed
                    </span>
                  </div>
                  <div
                    className="h-3 w-full overflow-hidden rounded-full border border-outline-variant bg-surface-dim"
                    role="progressbar"
                    aria-valuenow={progressPct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-full rounded-full bg-primary shadow-[0_0_10px_rgba(125,218,152,0.4)] transition-all duration-500"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              )}

              {statusFiles.length > 0 && (
                <div className="max-h-[280px] space-y-2 overflow-y-auto pr-xs">
                  {statusFiles.map((f) => {
                    const s = statusBadge(f.status);
                    return (
                      <div
                        key={f.name}
                        className={`flex items-center justify-between rounded-lg border p-xs ${s.row}`}
                      >
                        <div className="flex min-w-0 items-center space-x-xs">
                          <Icon name={s.icon} className={s.iconClass} />
                          <span className="max-w-[150px] truncate text-label-md">
                            {f.name}
                          </span>
                        </div>
                        <span
                          className={`shrink-0 rounded px-2 py-0.5 font-mono text-[10px] uppercase ${s.badge}`}
                        >
                          {s.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {poll?.status === "failed" && poll.errors.length > 0 && (
                <p className="text-label-md text-error">{poll.errors.join("; ")}</p>
              )}

              {poll?.status === "completed" && (
                <p className="text-label-md text-on-surface-variant">
                  Analysis complete. Download your log below.
                </p>
              )}

              <button
                type="button"
                disabled={!csvReady}
                onClick={downloadCsv}
                className={`flex w-full items-center justify-center space-x-sm rounded-xl border border-primary py-3 font-mono text-label-md font-bold text-primary transition-colors hover:bg-primary/5 ${
                  csvReady ? "" : "cursor-not-allowed opacity-50"
                }`}
              >
                <Icon name="download" />
                <span>
                  {csvReady && poll?.downloadFilename
                    ? `Download ${poll.downloadFilename}`
                    : "Download Result (.CSV)"}
                </span>
              </button>
            </div>

            <div className="relative overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low p-md">
              <div className="absolute right-0 top-0 p-2 opacity-10">
                <Icon name="biotech" className="text-6xl" />
              </div>
              <h4 className="mb-xs font-mono text-label-caps uppercase text-on-surface-variant">
                Vision engine
              </h4>
              <p className="text-label-md text-on-surface">
                Using{" "}
                <span className="font-bold text-primary">GPT-4o mini</span> for
                species, count, and behavior. Date and time from photo EXIF when
                available.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
