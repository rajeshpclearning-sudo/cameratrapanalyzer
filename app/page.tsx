"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LogLibraryView } from "@/app/components/LogLibraryView";
import { PreviewModal } from "@/app/components/PreviewModal";
import { formatFileSize } from "@/lib/format";
import {
  canStoreCsv,
  saveJobHistory,
} from "@/lib/job-history";
import type { CsvRow, FileJobState, JobPollResponse } from "@/lib/types";

const MAX_FILES = 50;
const POLL_MS = 800;
const ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

type View = "analysis" | "library";

type LocalFile = {
  id: string;
  file: File;
  selected: boolean;
};

type PreviewState = {
  fileId: string;
  fileName: string;
  imageUrl: string;
  row?: CsvRow;
  status?: string;
  error?: string;
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
    case "skipped":
      return {
        label: "SKIPPED",
        row: "bg-surface-container-high/50 border-outline-variant/20",
        icon: "hide_image",
        iconClass: "text-on-surface-variant",
        badge: "text-on-surface-variant bg-surface-container-highest",
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

function isImageFile(f: File): boolean {
  const t = f.type.toLowerCase();
  const ext = f.name.split(".").pop()?.toLowerCase();
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

export default function Home() {
  const [view, setView] = useState<View>("analysis");
  const [localFiles, setLocalFiles] = useState<LocalFile[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [existingCsv, setExistingCsv] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [poll, setPoll] = useState<JobPollResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const savedHistoryRef = useRef(false);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const selectedCount = localFiles.filter((f) => f.selected).length;
  const allSelected =
    localFiles.length > 0 && selectedCount === localFiles.length;

  useEffect(() => {
    const urls: Record<string, string> = {};
    for (const f of localFiles) {
      urls[f.id] = URL.createObjectURL(f.file);
    }
    setThumbUrls((prev) => {
      for (const url of Object.values(prev)) {
        URL.revokeObjectURL(url);
      }
      return urls;
    });
    return () => {
      for (const url of Object.values(urls)) {
        URL.revokeObjectURL(url);
      }
    };
  }, [localFiles]);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const list = Array.from(incoming).filter(isImageFile);

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

  const openPreview = (item: LocalFile) => {
    const pollFile = poll?.files.find((f) => f.name === item.file.name);
    setPreview({
      fileId: item.id,
      fileName: item.file.name,
      imageUrl: thumbUrls[item.id] ?? "",
      row: pollFile?.row,
      status: pollFile?.status ?? "ready",
      error: pollFile?.error,
    });
  };

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
    savedHistoryRef.current = false;
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

  useEffect(() => {
    if (
      poll?.status !== "completed" ||
      !jobId ||
      savedHistoryRef.current
    ) {
      return;
    }
    savedHistoryRef.current = true;

    void (async () => {
      let csvContent: string | undefined;
      try {
        const res = await fetch(`/api/jobs/${jobId}/download`);
        if (res.ok) {
          const text = await res.text();
          if (canStoreCsv(text)) csvContent = text;
        }
      } catch {
        // optional cache
      }

      const done = poll.files.filter(
        (f) => f.status === "done" || f.status === "skipped",
      ).length;
      const errors = poll.files.filter((f) => f.status === "error").length;
      const skipped = poll.files.filter((f) => f.status === "skipped").length;

      saveJobHistory({
        id: jobId,
        completedAt: Date.now(),
        downloadFilename: poll.downloadFilename,
        total: poll.total,
        done,
        errors,
        skipped,
        llmCalls: poll.stats?.llmCalls ?? 0,
        burstCopied: poll.stats?.burstCopied ?? 0,
        csvContent,
      });
    })();
  }, [poll, jobId]);

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

  const resetSession = () => {
    setLocalFiles([]);
    setExistingCsv(null);
    setPoll(null);
    setJobId(null);
    setError(null);
    setPreview(null);
    stopPolling();
    setSubmitting(false);
    savedHistoryRef.current = false;
    if (csvInputRef.current) csvInputRef.current.value = "";
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

  const navClass = (active: boolean) =>
    active
      ? "flex items-center space-x-sm rounded-xl bg-secondary-container px-sm py-3 font-bold text-on-secondary-container transition-transform active:translate-x-1"
      : "flex w-full items-center space-x-sm rounded-xl px-sm py-3 text-on-surface-variant transition-all hover:bg-surface-container-highest";

  return (
    <>
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
              Path A · Local
            </span>
          </div>
        </div>

        <nav className="flex-grow space-y-1">
          <button type="button" onClick={() => setView("analysis")} className={navClass(view === "analysis")}>
            <Icon name="analytics" />
            <span className="text-label-md">Analysis</span>
          </button>
          <button type="button" onClick={() => setView("library")} className={navClass(view === "library")}>
            <Icon name="database" />
            <span className="text-label-md">Log Library</span>
          </button>
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
            resetSession();
            setView("analysis");
          }}
        >
          New Analysis
        </button>

        <div className="space-y-1 border-t border-outline-variant pt-sm">
          <span className="flex cursor-not-allowed items-center space-x-sm rounded-xl px-sm py-2 text-on-surface-variant opacity-50">
            <Icon name="support_agent" />
            <span className="text-label-md">Support</span>
          </span>
        </div>
      </aside>

      <main className="ml-64 flex min-h-screen flex-grow flex-col">
        <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-outline-variant bg-surface-container px-lg">
          <div className="flex items-center space-x-md">
            <span className="text-headline-sm text-on-surface-variant">
              {view === "analysis" ? "Camera Trap Session /" : "Log Library /"}
            </span>
            <span className="text-headline-sm font-bold text-primary">
              {view === "analysis" ? sessionLabel : "Saved runs"}
            </span>
          </div>
        </header>

        {view === "library" ? (
          <LogLibraryView onOpenAnalysis={() => setView("analysis")} />
        ) : (
          <>
            {error && (
              <div className="mx-lg mt-md rounded-xl border border-error/40 bg-error-container/20 px-md py-sm text-label-md text-error">
                {error}
              </div>
            )}

            <div className="mx-auto grid w-full max-w-content grid-cols-12 gap-lg p-lg">
              <section className="col-span-12 flex flex-col space-y-md xl:col-span-8">
                <div className="flex flex-wrap items-center justify-between gap-sm">
                  <div className="flex items-center space-x-sm">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary font-bold text-background">
                      1
                    </span>
                    <h2 className="text-headline-md font-semibold">
                      Select Images
                    </h2>
                  </div>
                  <div className="flex flex-wrap gap-xs">
                    <button type="button" onClick={() => selectAll(true)} className="rounded-lg border border-outline-variant px-sm py-1 font-mono text-[10px] uppercase hover:bg-surface-container-high">
                      Select all
                    </button>
                    <button type="button" onClick={() => selectAll(false)} className="rounded-lg border border-outline-variant px-sm py-1 font-mono text-[10px] uppercase hover:bg-surface-container-high">
                      Deselect all
                    </button>
                    <button type="button" onClick={removeSelected} className="rounded-lg border border-error/30 px-sm py-1 font-mono text-[10px] uppercase text-error hover:bg-error/10">
                      Remove selected
                    </button>
                  </div>
                </div>

                <input ref={folderInputRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={onFolderChange} {...({ webkitdirectory: "" } as React.InputHTMLAttributes<HTMLInputElement>)} />
                <input ref={filesInputRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={onFilesChange} />
                <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => setExistingCsv(e.target.files?.[0] ?? null)} />

                <div className="grid grid-cols-1 gap-md md:grid-cols-2">
                  <button type="button" onClick={() => folderInputRef.current?.click()} className="group flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-outline-variant bg-surface-container-low p-lg transition-colors hover:border-primary">
                    <Icon name="folder_zip" className="mb-sm text-4xl text-on-surface-variant group-hover:text-primary" />
                    <span className="text-headline-sm font-semibold">Upload Folder</span>
                    <span className="mt-xs text-label-md text-on-surface-variant">Including HEIC from traps</span>
                  </button>
                  <button type="button" onClick={() => filesInputRef.current?.click()} className="group flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-outline-variant bg-surface-container-low p-lg transition-colors hover:border-primary">
                    <Icon name="upload_file" className="mb-sm text-4xl text-on-surface-variant group-hover:text-primary" />
                    <span className="text-headline-sm font-semibold">Individual Files</span>
                    <span className="mt-xs text-label-md text-on-surface-variant">JPEG, PNG, WebP, HEIC (max {MAX_FILES})</span>
                  </button>
                </div>

                <div className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container">
                  <div className="grid grid-cols-12 border-b border-outline-variant bg-surface-container-high px-md py-sm font-mono text-[10px] uppercase text-on-surface-variant">
                    <div className="col-span-1 flex justify-center">
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-outline-variant bg-surface-dim text-primary" />
                    </div>
                    <div className="col-span-1" />
                    <div className="col-span-5">Filename</div>
                    <div className="col-span-2">Size</div>
                    <div className="col-span-3 text-right">Status</div>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto">
                    {localFiles.length === 0 ? (
                      <p className="px-md py-lg text-center text-label-md text-on-surface-variant">
                        No images selected. Click a row to preview after adding.
                      </p>
                    ) : (
                      localFiles.map((item) => {
                        const pollFile = poll?.files.find((f) => f.name === item.file.name);
                        const status = pollFile?.status ?? "ready";
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => openPreview(item)}
                            className="grid w-full grid-cols-12 items-center border-b border-outline-variant/30 px-md py-2 text-left font-mono text-label-md transition-colors hover:bg-surface-container-highest"
                          >
                            <div className="col-span-1 flex justify-center" onClick={(e) => e.stopPropagation()}>
                              <input type="checkbox" checked={item.selected} onChange={() => toggleFile(item.id)} className="rounded border-outline-variant bg-surface-dim text-primary" />
                            </div>
                            <div className="col-span-1 flex justify-center">
                              {thumbUrls[item.id] ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={thumbUrls[item.id]} alt="" className="h-10 w-10 rounded object-cover border border-outline-variant/50" />
                              ) : (
                                <Icon name="image" className="text-primary" />
                              )}
                            </div>
                            <div className="col-span-5 truncate pr-xs">{item.file.name}</div>
                            <div className="col-span-2 text-on-surface-variant">{formatFileSize(item.file.size)}</div>
                            <div className="col-span-3 truncate text-right text-on-surface-variant capitalize">{status}</div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
                {localFiles.length > 0 && (
                  <p className="font-mono text-label-md text-on-surface-variant">
                    {selectedCount} of {localFiles.length} selected · click a row to preview
                  </p>
                )}
              </section>

              <aside className="col-span-12 flex flex-col space-y-lg xl:col-span-4">
                <div className="rounded-xl border border-outline-variant bg-surface-container p-md">
                  <div className="mb-md flex items-center space-x-sm">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-outline-variant text-sm font-bold text-background">2</span>
                    <h3 className="text-headline-sm font-semibold">Existing Log (Optional)</h3>
                  </div>
                  {existingCsv ? (
                    <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-surface-dim p-sm">
                      <div className="flex min-w-0 items-center space-x-sm">
                        <Icon name="description" className="shrink-0 text-primary" />
                        <span className="truncate text-label-md">{existingCsv.name}</span>
                      </div>
                      <button type="button" onClick={() => { setExistingCsv(null); if (csvInputRef.current) csvInputRef.current.value = ""; }} className="text-on-surface-variant hover:text-error">
                        <Icon name="close" />
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => csvInputRef.current?.click()} className="flex w-full items-center justify-center space-x-sm rounded-lg border border-dashed border-outline-variant py-4 text-label-md text-on-surface-variant hover:border-primary hover:text-primary">
                      <Icon name="upload_file" />
                      <span>Upload Camera_Trap_Analysis*.csv</span>
                    </button>
                  )}
                </div>

                <div className="flex flex-col space-y-md rounded-xl border border-outline-variant bg-surface-container p-md">
                  <div className="flex items-center space-x-sm">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-outline-variant text-sm font-bold text-background">3</span>
                    <h3 className="text-headline-sm font-semibold">Run Analysis</h3>
                  </div>

                  <button type="button" disabled={submitting || selectedCount === 0} onClick={() => void runAnalysis()} className="flex w-full items-center justify-center space-x-sm rounded-xl bg-primary py-4 text-headline-sm font-bold text-background shadow-lg shadow-primary/10 transition-all hover:brightness-110 disabled:opacity-50">
                    <Icon name="bolt" />
                    <span>{submitting ? "Running…" : "Run Analysis"}</span>
                  </button>

                  {showProgress && (
                    <div className="space-y-sm border-t border-outline-variant pt-md">
                      <div className="flex items-end justify-between">
                        <span className="font-mono text-[10px] uppercase text-on-surface-variant">Processing queue</span>
                        <span className="font-mono text-primary">{poll.completed} / {poll.total}</span>
                      </div>
                      <div className="h-3 w-full overflow-hidden rounded-full border border-outline-variant bg-surface-dim" role="progressbar" aria-valuenow={progressPct}>
                        <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progressPct}%` }} />
                      </div>
                      {poll.stats && (
                        <p className="font-mono text-[10px] text-on-surface-variant">
                          LLM calls: {poll.stats.llmCalls}
                          {poll.stats.emptySkipped > 0 && ` · ${poll.stats.emptySkipped} empty skipped`}
                          {poll.stats.burstCopied > 0 && ` · ${poll.stats.burstCopied} burst copies`}
                        </p>
                      )}
                    </div>
                  )}

                  {statusFiles.length > 0 && (
                    <div className="max-h-[280px] space-y-2 overflow-y-auto pr-xs">
                      {statusFiles.map((f) => {
                        const s = statusBadge(f.status);
                        const local = localFiles.find((lf) => lf.file.name === f.name);
                        return (
                          <button
                            key={f.name}
                            type="button"
                            onClick={() => {
                              if (local && thumbUrls[local.id]) {
                                setPreview({
                                  fileId: local.id,
                                  fileName: f.name,
                                  imageUrl: thumbUrls[local.id],
                                  row: f.row,
                                  status: f.status,
                                  error: f.error,
                                });
                              }
                            }}
                            className={`flex w-full items-center justify-between rounded-lg border p-xs text-left ${s.row}`}
                          >
                            <div className="flex min-w-0 items-center space-x-xs">
                              <Icon name={s.icon} className={s.iconClass} />
                              <span className="max-w-[150px] truncate text-label-md">{f.name}</span>
                            </div>
                            <span className={`shrink-0 rounded px-2 py-0.5 font-mono text-[10px] uppercase ${s.badge}`}>{s.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {poll?.status === "failed" && poll.errors.length > 0 && (
                    <p className="text-label-md text-error">{poll.errors.join("; ")}</p>
                  )}

                  {poll?.status === "completed" && (
                    <p className="text-label-md text-on-surface-variant">
                      Complete. Saved to Log Library if CSV was small enough to cache.
                    </p>
                  )}

                  <button type="button" disabled={!csvReady} onClick={downloadCsv} className={`flex w-full items-center justify-center space-x-sm rounded-xl border border-primary py-3 font-mono text-label-md font-bold text-primary hover:bg-primary/5 ${csvReady ? "" : "cursor-not-allowed opacity-50"}`}>
                    <Icon name="download" />
                    <span>{csvReady && poll?.downloadFilename ? `Download ${poll.downloadFilename}` : "Download Result (.CSV)"}</span>
                  </button>
                </div>

                <div className="relative overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low p-md">
                  <h4 className="mb-xs font-mono text-[10px] uppercase text-on-surface-variant">Path A optimizations</h4>
                  <p className="text-label-md text-on-surface">
                    <span className="font-bold text-primary">HEIC</span> converted server-side ·{" "}
                    <span className="font-bold text-primary">empty frames</span> skip LLM ·{" "}
                    <span className="font-bold text-primary">burst shots</span> within 2s share one analysis
                  </p>
                </div>
              </aside>
            </div>
          </>
        )}
      </main>

      <PreviewModal
        open={!!preview}
        onClose={() => setPreview(null)}
        fileName={preview?.fileName ?? ""}
        imageUrl={preview?.imageUrl ?? null}
        row={preview?.row}
        status={preview?.status}
        error={preview?.error}
      />
    </>
  );
}
