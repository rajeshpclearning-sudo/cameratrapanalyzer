"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileListTable } from "@/app/components/FileListTable";
import { ImportLogView } from "@/app/components/ImportLogView";
import { LogLibraryView } from "@/app/components/LogLibraryView";
import { PreviewModal } from "@/app/components/PreviewModal";
import {
  canStoreCsv,
  saveJobHistory,
} from "@/lib/job-history";
import { readApiJson } from "@/lib/api-client";
import { getSessionStatusDisplay } from "@/lib/file-status-display";
import type { CsvRow, FileJobState, JobPollResponse } from "@/lib/types";

const MAX_FILES = 50;
const POLL_MS = 800;
const ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

type View = "analysis" | "library" | "import";

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

function isFileAnalyzed(state?: FileJobState): boolean {
  return state?.status === "done" || state?.status === "skipped";
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
  const [stopping, setStopping] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [completedByName, setCompletedByName] = useState<
    Record<string, FileJobState>
  >({});
  const [sessionCsv, setSessionCsv] = useState<{
    content: string;
    filename: string;
  } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const savedHistoryRef = useRef(false);
  const completedByNameRef = useRef(completedByName);
  completedByNameRef.current = completedByName;
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
      let merged = [...prev, ...added];
      if (merged.length > MAX_FILES) {
        setError(`Maximum ${MAX_FILES} files; remove some before adding more.`);
        merged = merged.slice(0, MAX_FILES);
      } else {
        setError(null);
      }

      const hasPriorAnalysis =
        Object.keys(completedByNameRef.current).length > 0;
      if (added.length > 0 && hasPriorAnalysis) {
        const addedIds = new Set(added.map((f) => f.id));
        merged = merged.map((f) => ({
          ...f,
          selected: isFileAnalyzed(completedByNameRef.current[f.file.name])
            ? false
            : addedIds.has(f.id)
              ? true
              : f.selected,
        }));
      }

      return merged;
    });
  }, []);

  const openPreview = (item: LocalFile) => {
    const pollFile =
      poll?.files.find((f) => f.name === item.file.name) ??
      completedByName[item.file.name];
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
        if (res.status === 404) {
          stopPolling();
          setSubmitting(false);
          setStopping(false);
          setJobId(null);
          setPoll(null);
          setError(
            "This analysis session expired (for example after a server restart). Run analysis again to continue.",
          );
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as JobPollResponse;
        setPoll(data);
        if (
          data.status === "completed" ||
          data.status === "failed" ||
          data.status === "cancelled"
        ) {
          stopPolling();
          setSubmitting(false);
          setStopping(false);
        }
      } catch {
        // keep polling on transient network errors
      }
    };
    void tick();
    pollRef.current = setInterval(() => void tick(), POLL_MS);
  };

  useEffect(() => {
    if (
      (poll?.status !== "completed" && poll?.status !== "cancelled") ||
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
        burstInferred: poll.stats?.burstInferred ?? 0,
        csvContent,
      });
    })();
  }, [poll, jobId]);

  useEffect(() => {
    if (
      !poll ||
      (poll.status !== "completed" &&
        poll.status !== "cancelled" &&
        poll.status !== "failed")
    ) {
      return;
    }

    setCompletedByName((prev) => {
      const next = { ...prev };
      for (const f of poll.files) {
        if (
          f.status === "done" ||
          f.status === "skipped" ||
          f.status === "error"
        ) {
          next[f.name] = f;
        }
      }
      return next;
    });
  }, [poll]);

  useEffect(() => {
    if (!jobId || !poll?.csvReady || !poll.downloadFilename) return;
    if (poll.status !== "completed" && poll.status !== "cancelled") return;

    void (async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/download`);
        if (!res.ok) return;
        const text = await res.text();
        setSessionCsv({ content: text, filename: poll.downloadFilename });
      } catch {
        // optional — next run can still proceed without append
      }
    })();
  }, [jobId, poll?.status, poll?.csvReady, poll?.downloadFilename]);

  const runAnalysis = async () => {
    const selected = localFiles.filter(
      (f) => f.selected && !isFileAnalyzed(completedByName[f.file.name]),
    );
    if (selected.length === 0) {
      setError("Select at least one new image that has not been analyzed yet.");
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
    } else if (sessionCsv) {
      const blob = new Blob([sessionCsv.content], { type: "text/csv" });
      form.append("existingCsv", blob, sessionCsv.filename);
    }

    try {
      const res = await fetch("/api/jobs", { method: "POST", body: form });
      const parsed = await readApiJson<{ jobId?: string; error?: string }>(res);
      if ("error" in parsed) {
        setError(parsed.error);
        setSubmitting(false);
        return;
      }
      const { data } = parsed;
      if (!res.ok || !data.jobId) {
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

  const stopAnalysis = async () => {
    if (!jobId || stopping) return;
    setStopping(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/cancel`, { method: "POST" });
      if (!res.ok) {
        const parsed = await readApiJson<{ error?: string }>(res);
        setError(
          "error" in parsed ? parsed.error : "Failed to stop analysis",
        );
        setStopping(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop analysis");
      setStopping(false);
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
    setCompletedByName({});
    setSessionCsv(null);
    stopPolling();
    setSubmitting(false);
    setStopping(false);
    savedHistoryRef.current = false;
    if (csvInputRef.current) csvInputRef.current.value = "";
  };

  const clearAnalysisState = () => {
    setPoll(null);
    setJobId(null);
    setSubmitting(false);
    setStopping(false);
    setCompletedByName({});
    setSessionCsv(null);
    stopPolling();
    savedHistoryRef.current = false;
  };

  const progressPct =
    poll && poll.total > 0
      ? Math.round((poll.completed / poll.total) * 100)
      : 0;

  const showProgress =
    !!poll &&
    (submitting || poll.status === "running" || poll.status === "queued");
  const analysisRunning =
    !!poll && poll.status === "running" && !stopping;
  const hasUnanalyzedFiles = localFiles.some(
    (f) => !isFileAnalyzed(completedByName[f.file.name]),
  );
  const unanalyzedSelected = localFiles.filter(
    (f) => f.selected && !isFileAnalyzed(completedByName[f.file.name]),
  );
  const sessionFinished =
    (poll?.status === "completed" ||
      poll?.status === "cancelled" ||
      poll?.status === "failed") &&
    !hasUnanalyzedFiles;
  const canRunAnalysis =
    !submitting && !analysisRunning && unanalyzedSelected.length > 0;
  const showAnalyzeButton = !submitting && !analysisRunning;
  const analyzedCount = localFiles.filter((f) =>
    isFileAnalyzed(completedByName[f.file.name]),
  ).length;
  const waitingCount = localFiles.length - analyzedCount;
  const showBatchSummary =
    !!poll &&
    (submitting ||
      analysisRunning ||
      sessionFinished ||
      (poll.status === "completed" && hasUnanalyzedFiles));
  const analyzeButtonLabel = canRunAnalysis
    ? analyzedCount > 0
      ? `Analyze ${unanalyzedSelected.length} new photo${unanalyzedSelected.length === 1 ? "" : "s"}`
      : "Run Analysis"
    : hasUnanalyzedFiles
      ? "Select new photo(s) to analyze"
      : localFiles.length > 0
        ? "All photos analyzed"
        : "Run Analysis";
  const sessionStatusRaw = getSessionStatusDisplay(poll, submitting, stopping);
  const sessionStatus =
    sessionStatusRaw?.label === "Complete" && hasUnanalyzedFiles
      ? null
      : sessionStatusRaw;
  const csvReady = poll?.csvReady && jobId;

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
          <button type="button" onClick={() => setView("import")} className={navClass(view === "import")}>
            <Icon name="cloud_upload" />
            <span className="text-label-md">Import Log</span>
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
        <header className="sticky top-0 z-40 border-b border-outline-variant bg-surface-container">
          <div className="flex h-16 w-full items-center justify-between px-lg">
            <div className="flex min-w-0 items-center gap-md">
              <div className="flex min-w-0 items-center space-x-md">
                <span className="text-headline-sm text-on-surface-variant">
                  {view === "analysis"
                    ? "Camera Trap Session /"
                    : view === "library"
                      ? "Log Library /"
                      : "Import Log /"}
                </span>
                <span className="truncate text-headline-sm font-bold text-primary">
                  {view === "analysis"
                    ? sessionLabel
                    : view === "library"
                      ? "Saved runs"
                      : "Past analysis"}
                </span>
              </div>
              {view === "analysis" && sessionStatus && (
                <span
                  className={`hidden items-center gap-1 rounded-full border px-sm py-1 font-mono text-[10px] uppercase sm:inline-flex ${sessionStatus.chipClass}`}
                >
                  <Icon
                    name={sessionStatus.icon}
                    className={`text-sm ${sessionStatus.label === "Running" ? "animate-spin" : ""}`}
                  />
                  {sessionStatus.label}
                </span>
              )}
            </div>
            {view === "analysis" && (analysisRunning || stopping) && (
              <button
                type="button"
                disabled={stopping}
                onClick={() => void stopAnalysis()}
                className="flex shrink-0 items-center space-x-xs rounded-xl border border-error/40 bg-error-container/10 px-md py-2 font-mono text-label-md font-bold uppercase text-error transition-all hover:bg-error/10 disabled:opacity-50"
              >
                <Icon name="stop_circle" className="text-lg" />
                <span>{stopping ? "Stopping…" : "Stop"}</span>
              </button>
            )}
          </div>
          {view === "analysis" && showProgress && (
            <div className="border-t border-outline-variant/50 px-lg pb-sm pt-xs">
              <div className="flex items-center justify-between gap-sm">
                <p className="truncate font-mono text-[10px] uppercase text-on-surface-variant">
                  {sessionStatus?.detail ?? "Processing photos"}
                </p>
                <span className="shrink-0 font-mono text-[10px] text-primary">
                  {progressPct}%
                </span>
              </div>
              <div
                className="mt-xs h-1.5 w-full overflow-hidden rounded-full bg-surface-dim"
                role="progressbar"
                aria-valuenow={progressPct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    poll?.status === "cancelled"
                      ? "bg-on-surface-variant"
                      : poll?.status === "completed"
                        ? "bg-primary"
                        : "bg-[#0091ff]"
                  }`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
        </header>

        {view === "library" ? (
          <LogLibraryView onOpenAnalysis={() => setView("analysis")} />
        ) : view === "import" ? (
          <ImportLogView />
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

                <input ref={folderInputRef} type="file" accept={ACCEPT} multiple hidden data-ui-file-input className="hidden" onChange={onFolderChange} {...({ webkitdirectory: "" } as React.InputHTMLAttributes<HTMLInputElement>)} />
                <input ref={filesInputRef} type="file" accept={ACCEPT} multiple hidden data-ui-file-input className="hidden" onChange={onFilesChange} />
                <input ref={csvInputRef} type="file" accept=".csv,text/csv" hidden data-ui-file-input className="hidden" onChange={(e) => setExistingCsv(e.target.files?.[0] ?? null)} />

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

                <div className="max-h-[520px] overflow-y-auto">
                  <FileListTable
                    localFiles={localFiles}
                    poll={poll}
                    completedByName={completedByName}
                    thumbUrls={thumbUrls}
                    allSelected={allSelected}
                    onToggleAll={toggleAll}
                    onToggleFile={toggleFile}
                    onOpenPreview={openPreview}
                  />
                </div>
                {localFiles.length > 0 && (
                  <p className="font-mono text-label-md text-on-surface-variant">
                    {analyzedCount > 0 || waitingCount > 0
                      ? `${analyzedCount} analyzed · ${waitingCount} waiting · `
                      : ""}
                    {selectedCount} of {localFiles.length} selected · results appear in the table as each photo is analyzed · click a row to preview
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
                  <div className="flex items-center justify-between gap-sm">
                    <div className="flex items-center space-x-sm">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-outline-variant text-sm font-bold text-background">3</span>
                      <h3 className="text-headline-sm font-semibold">Run Analysis</h3>
                    </div>
                    {sessionStatus && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-sm py-0.5 font-mono text-[10px] uppercase xl:hidden ${sessionStatus.chipClass}`}
                      >
                        <Icon
                          name={sessionStatus.icon}
                          className={`text-sm ${sessionStatus.label === "Running" ? "animate-spin" : ""}`}
                        />
                        {sessionStatus.label}
                      </span>
                    )}
                  </div>

                  {showAnalyzeButton && (
                    <>
                      <button
                        type="button"
                        disabled={!canRunAnalysis}
                        onClick={() => void runAnalysis()}
                        className="flex w-full items-center justify-center space-x-sm rounded-xl bg-primary py-4 text-headline-sm font-bold text-background shadow-lg shadow-primary/10 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Icon name="bolt" />
                        <span>{analyzeButtonLabel}</span>
                      </button>
                      {hasUnanalyzedFiles && !canRunAnalysis && (
                        <p className="text-label-md text-on-surface-variant">
                          Check the box next to each new photo in the table above, then click analyze.
                        </p>
                      )}
                    </>
                  )}

                  {showBatchSummary && (
                    <div className="rounded-xl border border-outline-variant bg-surface-dim p-sm">
                      <div className="flex items-center justify-between gap-sm">
                        <div className="flex items-center gap-xs">
                          <Icon
                            name={sessionStatus?.icon ?? "sync"}
                            className={`text-primary ${sessionStatus?.label === "Running" ? "animate-spin" : ""}`}
                          />
                          <span className="text-label-md font-medium">
                            {sessionStatus?.label ?? "Running"}
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-on-surface-variant">
                          {poll?.completed ?? 0} / {poll?.total ?? 0}
                        </span>
                      </div>
                      {sessionStatus?.detail && (
                        <p className="mt-xs text-label-md text-on-surface-variant">
                          {sessionStatus.detail}
                        </p>
                      )}
                    </div>
                  )}

                  {showProgress && poll.stats && (
                    <p className="font-mono text-[10px] text-on-surface-variant">
                      LLM calls: {poll.stats.llmCalls}
                      {poll.stats.emptySkipped > 0 && ` · ${poll.stats.emptySkipped} empty skipped`}
                      {poll.stats.burstCopied > 0 && ` · ${poll.stats.burstCopied} burst copies`}
                      {poll.stats.burstInferred > 0 && ` · ${poll.stats.burstInferred} burst ID`}
                    </p>
                  )}

                  {poll?.status === "failed" && poll.errors.length > 0 && (
                    <div className="rounded-lg border border-error/30 bg-error-container/10 px-sm py-xs text-label-md text-error">
                      {poll.errors.join("; ")}
                    </div>
                  )}

                  {poll?.status === "cancelled" && (
                    <div className="flex items-start gap-sm rounded-lg border border-outline-variant bg-surface-container-high px-sm py-xs">
                      <Icon name="stop_circle" className="mt-0.5 shrink-0 text-on-surface-variant" />
                      <p className="text-label-md text-on-surface-variant">
                        Analysis stopped early. Download partial results below for photos that already finished.
                      </p>
                    </div>
                  )}

                  {poll?.status === "completed" && !hasUnanalyzedFiles && (
                    <div className="flex items-start gap-sm rounded-lg border border-primary/30 bg-primary/5 px-sm py-xs">
                      <Icon name="check_circle" className="mt-0.5 shrink-0 text-primary" />
                      <p className="text-label-md text-on-surface-variant">
                        All photos analyzed. Saved to Log Library if the CSV was small enough to cache.
                      </p>
                    </div>
                  )}

                  {poll?.status === "completed" && hasUnanalyzedFiles && (
                    <div className="flex items-start gap-sm rounded-lg border border-outline-variant bg-surface-container-high px-sm py-xs">
                      <Icon name="add_photo_alternate" className="mt-0.5 shrink-0 text-primary" />
                      <p className="text-label-md text-on-surface-variant">
                        Batch complete. Upload more photos, then run analysis again — new rows append to your CSV and Supabase.
                      </p>
                    </div>
                  )}

                  {poll?.supabase &&
                    (poll.status === "completed" || poll.status === "cancelled") && (
                      <>
                        {poll.supabase.saved > 0 && (
                          <div className="flex items-start gap-sm rounded-lg border border-primary/30 bg-primary/5 px-sm py-xs">
                            <Icon name="database" className="mt-0.5 shrink-0 text-primary" />
                            <p className="text-label-md text-on-surface-variant">
                              Saved {poll.supabase.saved} row
                              {poll.supabase.saved === 1 ? "" : "s"} to Supabase.
                            </p>
                          </div>
                        )}
                        {!poll.supabase.configured && (
                          <div className="flex items-start gap-sm rounded-lg border border-outline-variant bg-surface-container-high px-sm py-xs">
                            <Icon name="database" className="mt-0.5 shrink-0 text-on-surface-variant" />
                            <p className="text-label-md text-on-surface-variant">
                              Supabase not configured on server. Add SUPABASE_URL and
                              SUPABASE_SERVICE_ROLE_KEY in Railway Variables (or .env.local
                              for local dev).
                            </p>
                          </div>
                        )}
                        {poll.supabase.error && (
                          <div className="flex items-start gap-sm rounded-lg border border-error/30 bg-error-container/10 px-sm py-xs">
                            <Icon name="error" className="mt-0.5 shrink-0 text-error" />
                            <p className="text-label-md text-error">
                              Supabase save failed: {poll.supabase.error}
                            </p>
                          </div>
                        )}
                      </>
                    )}

                  <button
                    type="button"
                    disabled={!csvReady}
                    onClick={downloadCsv}
                    className={`flex w-full items-center justify-center space-x-sm rounded-xl border border-primary py-3 font-mono text-label-md font-bold text-primary hover:bg-primary/5 ${csvReady ? "" : "cursor-not-allowed opacity-50"}`}
                  >
                    <Icon name="download" />
                    <span>
                      {csvReady && poll?.downloadFilename
                        ? `Download ${poll.downloadFilename}`
                        : "Download Result (.CSV)"}
                    </span>
                  </button>

                  {Object.keys(completedByName).length > 0 && (
                    <div className="space-y-xs">
                      <button
                        type="button"
                        onClick={clearAnalysisState}
                        className="flex w-full items-center justify-center space-x-sm rounded-xl border border-error/30 py-3 font-mono text-label-md text-error hover:bg-error/10"
                      >
                        <Icon name="refresh" />
                        <span>Clear results &amp; re-analyze all</span>
                      </button>
                      <p className="text-center font-mono text-[10px] text-on-surface-variant">
                        Only needed to wipe session memory and start over — not required to analyze new photos.
                      </p>
                    </div>
                  )}
                </div>

                <div className="relative overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low p-md">
                  <h4 className="mb-xs font-mono text-[10px] uppercase text-on-surface-variant">Path A optimizations</h4>
                  <p className="text-label-md text-on-surface">
                    <span className="font-bold text-primary">HEIC</span> converted server-side ·{" "}
                    <span className="font-bold text-primary">empty frames</span> skip LLM ·{" "}
                    <span className="font-bold text-primary">burst shots</span> within 2s share one analysis ·{" "}
                    <span className="font-bold text-primary">unidentified</span> burst frames borrow a clear species from neighbors
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
