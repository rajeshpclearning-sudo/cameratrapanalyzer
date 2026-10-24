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
import { CSV_COL } from "@/lib/types";
import type { CsvRow, FileJobState, JobPollResponse, JobStats } from "@/lib/types";
import { buildSpeciesTally } from "@/lib/species-tally";
import {
  buildExifOverridesPayload,
  packUploadChunks,
  prepareUploadFile,
  type PreparedUpload,
} from "@/lib/upload-chunks";
import { pickTrapImageFolder } from "@/lib/pick-folder";

/** Soft guidance only — users may add more; uploads are chunked. */
const RECOMMENDED_FILES = 50;
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
  return (
    state?.status === "done" ||
    state?.status === "skipped" ||
    state?.status === "already_done"
  );
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
  const [navOpen, setNavOpen] = useState(false);
  const [localFiles, setLocalFiles] = useState<LocalFile[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [existingCsv, setExistingCsv] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [poll, setPoll] = useState<JobPollResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** When splitting a large folder across several Vercel-safe POSTs. */
  const [chunkProgress, setChunkProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [stopping, setStopping] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [completedByName, setCompletedByName] = useState<
    Record<string, FileJobState>
  >({});
  const [sessionCsv, setSessionCsv] = useState<{
    content: string;
    filename: string;
  } | null>(null);
  /** CSV returned from Vercel sync POST (in-memory job may not be pollable). */
  const [syncCsvContent, setSyncCsvContent] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const savedHistoryRef = useRef(false);
  const completedByNameRef = useRef(completedByName);
  completedByNameRef.current = completedByName;
  /** Client-side stop for Vercel multi-batch uploads (server cancel alone is not enough). */
  const stopRequestedRef = useRef(false);
  const uploadAbortRef = useRef<AbortController | null>(null);
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
      if (merged.length > RECOMMENDED_FILES) {
        setError(
          `${merged.length} photos in this session (recommended ${RECOMMENDED_FILES}). Larger sets still work; they upload in smaller batches.`,
        );
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

  const onFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = "";
  };

  /**
   * Pick a trap folder / photos without Chrome's webkitdirectory
   * "Upload N files… trust this site?" warning (that dialog cannot be turned off).
   */
  const openFolderPicker = async () => {
    const result = await pickTrapImageFolder();
    if (result.ok) {
      if (result.files.length === 0) {
        setError(
          `No images found in “${result.folderName}”. Pick a folder that contains JPG/PNG photos.`,
        );
        return;
      }
      addFiles(result.files);
      return;
    }
    if (result.cancelled) return;
    // Safari / older browsers: multi-file picker only (not webkitdirectory —
    // that always shows Chrome's trust warning and cannot be suppressed).
    filesInputRef.current?.click();
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
            "This analysis session expired (serverless hosts finish each request separately). Run analysis again — on Vercel the latest deploy completes the batch in one request.",
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
      let csvContent: string | undefined =
        poll.csvContent ?? syncCsvContent ?? undefined;
      if (!csvContent) {
        try {
          const res = await fetch(`/api/jobs/${jobId}/download`);
          if (res.ok) {
            const text = await res.text();
            if (canStoreCsv(text)) csvContent = text;
          }
        } catch {
          // optional cache
        }
      } else if (!canStoreCsv(csvContent)) {
        csvContent = undefined;
      }

      const done = poll.files.filter(
        (f) =>
          f.status === "done" ||
          f.status === "skipped" ||
          f.status === "already_done",
      ).length;
      const errors = poll.files.filter((f) => f.status === "error").length;
      const skipped = poll.files.filter(
        (f) => f.status === "skipped" || f.status === "already_done",
      ).length;

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
  }, [poll, jobId, syncCsvContent]);

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
          f.status === "already_done" ||
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

    const fromSync = poll.csvContent ?? syncCsvContent;
    if (fromSync) {
      setSessionCsv({ content: fromSync, filename: poll.downloadFilename });
      return;
    }

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
  }, [
    jobId,
    poll?.status,
    poll?.csvReady,
    poll?.downloadFilename,
    poll?.csvContent,
    syncCsvContent,
  ]);

  const waitForJobComplete = useCallback((id: string): Promise<JobPollResponse> => {
    return new Promise((resolve, reject) => {
      stopPolling();
      const tick = async () => {
        try {
          if (stopRequestedRef.current) {
            stopPolling();
            void fetch(`/api/jobs/${id}/cancel`, { method: "POST" });
            reject(new DOMException("Stopped by user", "AbortError"));
            return;
          }
          const res = await fetch(`/api/jobs/${id}`);
          if (res.status === 404) {
            stopPolling();
            reject(
              new Error(
                "This analysis session expired. Run analysis again on the latest Vercel deploy.",
              ),
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
            resolve(data);
          }
        } catch {
          // keep polling on transient network errors
        }
      };
      void tick();
      pollRef.current = setInterval(() => void tick(), POLL_MS);
    });
  }, []);

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
    setStopping(false);
    setChunkProgress(null);
    stopRequestedRef.current = false;
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = new AbortController();
    // Keep prior poll visible until the new result arrives (Vercel sync can take a while).
    setJobId(null);
    setSyncCsvContent(null);

    let prepared: PreparedUpload[];
    try {
      prepared = [];
      for (const { file } of selected) {
        if (stopRequestedRef.current) break;
        // Re-read bytes before upload (iOS/Drive pickers can hand empty or stale File handles).
        const buffer = await file.arrayBuffer();
        if (buffer.byteLength === 0) {
          setError(
            `"${file.name}" has no data yet. Open it once in Google Drive/Files, then Choose photos again.`,
          );
          setSubmitting(false);
          setStopping(false);
          return;
        }
        const type =
          file.type && file.type !== "application/octet-stream"
            ? file.type
            : "image/jpeg";
        const fresh = new File([buffer], file.name, {
          type,
          lastModified: file.lastModified,
        });
        // EXIF first, then shrink for Vercel size/time limits.
        prepared.push(await prepareUploadFile(fresh));
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? `Could not read photo: ${err.message}`
          : "Could not read photo from the phone. Try Choose photos again.",
      );
      setSubmitting(false);
      setStopping(false);
      return;
    }

    if (stopRequestedRef.current) {
      setSubmitting(false);
      setStopping(false);
      setChunkProgress(null);
      setError(null);
      setPoll((prev) =>
        prev
          ? { ...prev, status: "cancelled" }
          : null,
      );
      return;
    }

    const chunks = packUploadChunks(prepared);

    let csvForNext: { content: string; filename: string } | null = sessionCsv
      ? { ...sessionCsv }
      : null;
    const existingCsvFile = existingCsv;

    const mergedFiles: FileJobState[] = [];
    const mergedErrors: string[] = [];
    let mergedStats: JobStats | undefined;
    let lastJobId = "";
    let lastDownloadName = "CTA.csv";
    let lastCsvContent: string | undefined;
    let lastSupabase: JobPollResponse["supabase"];
    let anyFailed = false;
    let userStopped = false;

    const applyFileResults = (files: FileJobState[]) => {
      setCompletedByName((prev) => {
        const next = { ...prev };
        for (const f of files) {
          if (
            f.status === "done" ||
            f.status === "skipped" ||
            f.status === "already_done" ||
            f.status === "error"
          ) {
            next[f.name] = f;
          }
        }
        return next;
      });
    };

    const mergeStats = (
      a: JobStats | undefined,
      b: JobStats | undefined,
    ): JobStats | undefined => {
      if (!a && !b) return undefined;
      return {
        emptySkipped: (a?.emptySkipped ?? 0) + (b?.emptySkipped ?? 0),
        burstCopied: (a?.burstCopied ?? 0) + (b?.burstCopied ?? 0),
        burstInferred: (a?.burstInferred ?? 0) + (b?.burstInferred ?? 0),
        alreadyAnalyzed: (a?.alreadyAnalyzed ?? 0) + (b?.alreadyAnalyzed ?? 0),
        llmCalls: (a?.llmCalls ?? 0) + (b?.llmCalls ?? 0),
      };
    };

    try {
      for (let i = 0; i < chunks.length; i++) {
        if (stopRequestedRef.current) {
          userStopped = true;
          break;
        }

        const chunk = chunks[i]!;
        setChunkProgress({ current: i + 1, total: chunks.length });

        const form = new FormData();
        for (const item of chunk) {
          form.append("files", item.file);
        }
        form.append(
          "exifOverrides",
          JSON.stringify(buildExifOverridesPayload(chunk)),
        );

        if (i === 0 && existingCsvFile) {
          form.append("existingCsv", existingCsvFile);
        } else if (csvForNext) {
          const blob = new Blob([csvForNext.content], { type: "text/csv" });
          form.append("existingCsv", blob, csvForNext.filename);
        }

        let result: JobPollResponse | null = null;
        try {
          const res = await fetch("/api/jobs", {
            method: "POST",
            body: form,
            signal: uploadAbortRef.current?.signal,
          });
          const parsed = await readApiJson<
            Partial<JobPollResponse> & { jobId?: string; error?: string }
          >(res);
          if ("error" in parsed) {
            throw new Error(parsed.error);
          }
          const { data } = parsed;
          if (!res.ok || !data.jobId) {
            throw new Error(data.error ?? "Failed to start job");
          }

          lastJobId = data.jobId;
          setJobId(data.jobId);

          if (stopRequestedRef.current) {
            userStopped = true;
            void fetch(`/api/jobs/${data.jobId}/cancel`, { method: "POST" });
            break;
          }

          const syncDone =
            data.status === "completed" ||
            data.status === "failed" ||
            data.status === "cancelled";

          if (syncDone && data.status && data.files && data.total != null) {
            result = {
              jobId: data.jobId,
              status: data.status,
              total: data.total,
              completed: data.completed ?? data.total,
              files: data.files,
              errors: data.errors ?? [],
              csvReady: data.csvReady ?? !!data.csvContent,
              downloadFilename: data.downloadFilename ?? "CTA.csv",
              stats: data.stats,
              supabase: data.supabase,
              csvContent: data.csvContent,
            };
          } else {
            result = await waitForJobComplete(data.jobId);
          }
        } catch (chunkErr) {
          const aborted =
            (chunkErr instanceof DOMException && chunkErr.name === "AbortError") ||
            (chunkErr instanceof Error && chunkErr.name === "AbortError") ||
            stopRequestedRef.current;
          if (aborted) {
            userStopped = true;
            break;
          }
          // Do not abort the whole folder — continue with remaining photos.
          const message =
            chunkErr instanceof Error ? chunkErr.message : String(chunkErr);
          anyFailed = true;
          mergedErrors.push(
            `Batch ${i + 1}/${chunks.length}: ${message}`,
          );
          for (const item of chunk) {
            const errFile: FileJobState = {
              name: item.originalName,
              status: "error",
              error: message,
            };
            mergedFiles.push(errFile);
          }
          applyFileResults(
            chunk.map((item) => ({
              name: item.originalName,
              status: "error" as const,
              error: message,
            })),
          );
        }

        if (result) {
          if (result.status === "failed") anyFailed = true;
          if (result.status === "cancelled") userStopped = true;
          mergedFiles.push(...result.files);
          mergedErrors.push(...(result.errors ?? []));
          mergedStats = mergeStats(mergedStats, result.stats);
          lastDownloadName = result.downloadFilename;
          lastSupabase = result.supabase;
          if (result.csvContent) {
            lastCsvContent = result.csvContent;
            csvForNext = {
              content: result.csvContent,
              filename: result.downloadFilename,
            };
            setSyncCsvContent(result.csvContent);
            setSessionCsv(csvForNext);
          }
          applyFileResults(result.files);
        }

        if (userStopped || stopRequestedRef.current) {
          userStopped = true;
          break;
        }

        const completedCount = mergedFiles.filter(
          (f) =>
            f.status === "done" ||
            f.status === "skipped" ||
            f.status === "already_done" ||
            f.status === "error",
        ).length;

        setPoll({
          jobId: lastJobId || `chunk-${i}`,
          status:
            i < chunks.length - 1
              ? "running"
              : anyFailed
                ? "failed"
                : "completed",
          total: selected.length,
          completed: completedCount,
          files: mergedFiles,
          errors: mergedErrors,
          csvReady: !!lastCsvContent,
          downloadFilename: lastDownloadName,
          stats: mergedStats,
          supabase: lastSupabase,
          csvContent: lastCsvContent,
        });
      }

      const doneOk = mergedFiles.filter(
        (f) =>
          f.status === "done" ||
          f.status === "skipped" ||
          f.status === "already_done",
      ).length;
      const failedN = mergedFiles.filter((f) => f.status === "error").length;
      const already = mergedStats?.alreadyAnalyzed ?? 0;
      const remaining = selected.length - doneOk - failedN;

      const completedCount = mergedFiles.filter(
        (f) =>
          f.status === "done" ||
          f.status === "skipped" ||
          f.status === "already_done" ||
          f.status === "error",
      ).length;

      if (userStopped || stopRequestedRef.current) {
        setPoll({
          jobId: lastJobId || "stopped",
          status: "cancelled",
          total: selected.length,
          completed: completedCount,
          files: mergedFiles,
          errors: mergedErrors,
          csvReady: !!lastCsvContent,
          downloadFilename: lastDownloadName,
          stats: mergedStats,
          supabase: lastSupabase,
          csvContent: lastCsvContent,
        });
        setError(
          `Stopped. Analyzed ${doneOk} of ${selected.length} photos` +
            (remaining > 0
              ? ` — ${remaining} not run. Tap Analyze to continue with the rest.`
              : ".") ,
        );
      } else if (failedN > 0) {
        setError(
          `Finished ${doneOk} of ${selected.length} photos` +
            (already > 0 ? ` (${already} already in log/Supabase)` : "") +
            `. ${failedN} failed — tap Analyze again for remaining errors. ` +
            mergedErrors.slice(0, 3).join(" · "),
        );
      } else if (mergedErrors.length > 0) {
        setError(mergedErrors.join("; "));
      } else {
        setError(null);
      }

      setSubmitting(false);
      setStopping(false);
      setChunkProgress(null);
      stopRequestedRef.current = false;
    } catch (err) {
      if (
        stopRequestedRef.current ||
        (err instanceof DOMException && err.name === "AbortError")
      ) {
        setPoll((prev) =>
          prev ? { ...prev, status: "cancelled" } : prev,
        );
        setError("Stopped. Tap Analyze to continue with remaining photos.");
      } else {
        setError(err instanceof Error ? err.message : "Request failed");
      }
      setSubmitting(false);
      setStopping(false);
      setChunkProgress(null);
      stopRequestedRef.current = false;
    }
  };

  const stopAnalysis = async () => {
    if (stopping) return;
    const runningNow =
      submitting || poll?.status === "running" || poll?.status === "queued";
    if (!runningNow) return;
    setStopping(true);
    stopRequestedRef.current = true;
    uploadAbortRef.current?.abort();
    stopPolling();
    const id = jobId;
    if (id) {
      try {
        await fetch(`/api/jobs/${id}/cancel`, { method: "POST" });
      } catch {
        // Client stop still applies even if cancel request fails (Vercel sync).
      }
    }
  };

  const downloadCsv = () => {
    const csvText = syncCsvContent ?? poll?.csvContent ?? null;
    const filename = poll?.downloadFilename;
    if (csvText && filename) {
      const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
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
    setSyncCsvContent(null);
    stopPolling();
    setSubmitting(false);
    setStopping(false);
    setChunkProgress(null);
    savedHistoryRef.current = false;
    if (csvInputRef.current) csvInputRef.current.value = "";
  };

  const clearAnalysisState = () => {
    setPoll(null);
    setJobId(null);
    setSubmitting(false);
    setStopping(false);
    setChunkProgress(null);
    setCompletedByName({});
    setSessionCsv(null);
    setSyncCsvContent(null);
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
    !!poll &&
    (poll.status === "running" || poll.status === "queued") &&
    !stopping;
  const showStopButton = submitting || analysisRunning || stopping;
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
  const analyzeButtonLabel = submitting
    ? chunkProgress && chunkProgress.total > 1
      ? `Batch ${chunkProgress.current}/${chunkProgress.total}…`
      : "Analyzing…"
    : canRunAnalysis
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
    submitting && chunkProgress && chunkProgress.total > 1
      ? {
          label: "Running",
          icon: "sync" as const,
          chipClass:
            "border-primary/40 bg-primary/10 text-primary",
          detail: `Upload batch ${chunkProgress.current} of ${chunkProgress.total} (Vercel size limit)`,
        }
      : submitting && (!poll || poll.status === "completed" || poll.status === "cancelled" || poll.status === "failed")
      ? {
          label: "Running",
          detail: `Starting analysis of ${unanalyzedSelected.length || "new"} photo(s)…`,
          chipClass: "border-[#0091ff]/40 bg-[#0091ff]/10 text-[#0091ff]",
          icon: "sync",
        }
      : sessionStatusRaw?.label === "Complete" && hasUnanalyzedFiles
        ? null
        : sessionStatusRaw;
  const csvReady = poll?.csvReady && jobId;
  const speciesTally = poll ? buildSpeciesTally(poll.files) : [];

  const sessionLabel =
    localFiles.length > 0
      ? localFiles[0].file.name.replace(/\.[^.]+$/, "").slice(0, 24)
      : "New_Session";

  const navClass = (active: boolean) =>
    active
      ? "flex min-h-11 items-center space-x-sm rounded-xl bg-secondary-container px-sm py-3 font-bold text-on-secondary-container transition-transform active:translate-x-1"
      : "flex min-h-11 w-full items-center space-x-sm rounded-xl px-sm py-3 text-on-surface-variant transition-all hover:bg-surface-container-highest";

  const goToView = (next: View) => {
    setView(next);
    setNavOpen(false);
  };

  const headerPrefix =
    view === "analysis"
      ? "Session"
      : view === "library"
        ? "Library"
        : "Import";
  const headerPrefixDesktop =
    view === "analysis"
      ? "Camera Trap Session /"
      : view === "library"
        ? "Log Library /"
        : "Import Log /";
  const headerTitle =
    view === "analysis"
      ? sessionLabel
      : view === "library"
        ? "Saved runs"
        : "Past analysis";

  return (
    <>
      {navOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-[55] bg-black/50 md:hidden"
          onClick={() => setNavOpen(false)}
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-[60] flex h-screen w-64 flex-col border-r border-outline-variant bg-surface-container-low p-sm transition-transform duration-200 md:translate-x-0 ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-sm py-md">
          <h1 className="text-headline-sm font-bold text-primary">
            WildEye Analyzer
          </h1>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container-highest md:hidden"
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
          >
            <Icon name="close" />
          </button>
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
          <button type="button" onClick={() => goToView("analysis")} className={navClass(view === "analysis")}>
            <Icon name="analytics" />
            <span className="text-label-md">Analysis</span>
          </button>
          <button type="button" onClick={() => goToView("library")} className={navClass(view === "library")}>
            <Icon name="database" />
            <span className="text-label-md">Log Library</span>
          </button>
          <button type="button" onClick={() => goToView("import")} className={navClass(view === "import")}>
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
          className="mb-md min-h-11 w-full rounded-xl bg-primary-container py-3 font-mono text-label-md font-bold text-on-primary-container transition-all hover:brightness-110"
          onClick={() => {
            resetSession();
            goToView("analysis");
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

      <main
        className={`ml-0 flex min-h-screen flex-grow flex-col md:ml-64 ${
          view === "analysis" ? "pb-28 md:pb-0" : ""
        }`}
      >
        <header className="sticky top-0 z-40 border-b border-outline-variant bg-surface-container">
          <div className="flex h-14 w-full items-center justify-between gap-sm px-md md:h-16 md:px-lg">
            <div className="flex min-w-0 items-center gap-sm md:gap-md">
              <button
                type="button"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-on-surface hover:bg-surface-container-highest md:hidden"
                aria-label="Open menu"
                onClick={() => setNavOpen(true)}
              >
                <Icon name="menu" />
              </button>
              <div className="flex min-w-0 items-center gap-xs md:space-x-md">
                <span className="hidden text-headline-sm text-on-surface-variant md:inline">
                  {headerPrefixDesktop}
                </span>
                <span className="shrink-0 text-label-md text-on-surface-variant md:hidden">
                  {headerPrefix}
                </span>
                <span className="truncate text-label-md font-bold text-primary md:text-headline-sm">
                  {headerTitle}
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
            {view === "analysis" && showStopButton && (
              <button
                type="button"
                disabled={stopping}
                onClick={() => void stopAnalysis()}
                className="hidden shrink-0 items-center space-x-xs rounded-xl border border-error/40 bg-error-container/10 px-md py-2 font-mono text-label-md font-bold uppercase text-error transition-all hover:bg-error/10 disabled:opacity-50 md:flex"
              >
                <Icon name="stop_circle" className="text-lg" />
                <span>{stopping ? "Stopping…" : "Stop"}</span>
              </button>
            )}
          </div>
          {view === "analysis" && showProgress && (
            <div className="border-t border-outline-variant/50 px-md pb-sm pt-xs md:px-lg">
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
          <LogLibraryView
            onOpenAnalysis={() => {
              goToView("analysis");
            }}
          />
        ) : view === "import" ? (
          <ImportLogView />
        ) : (
          <>
            {error && (
              <div className="mx-md mt-md hidden rounded-xl border border-error/40 bg-error-container/20 px-md py-sm text-label-md text-error md:mx-lg md:block">
                {error}
              </div>
            )}

            {/* Mobile: keep the latest error above the sticky Analyze bar */}
            {error && (
              <div className="fixed inset-x-0 bottom-[4.5rem] z-[75] px-sm md:hidden">
                <div className="mx-auto max-w-content rounded-xl border border-error/40 bg-error-container px-md py-sm text-label-md text-error shadow-lg">
                  {error}
                </div>
              </div>
            )}

            <div className="mx-auto grid w-full max-w-content grid-cols-12 gap-md p-md md:gap-lg md:p-lg">
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
                    <button type="button" onClick={() => selectAll(true)} className="min-h-11 rounded-lg border border-outline-variant px-sm py-2 font-mono text-[10px] uppercase hover:bg-surface-container-high">
                      Select all
                    </button>
                    <button type="button" onClick={() => selectAll(false)} className="min-h-11 rounded-lg border border-outline-variant px-sm py-2 font-mono text-[10px] uppercase hover:bg-surface-container-high">
                      Deselect all
                    </button>
                    <button type="button" onClick={removeSelected} className="min-h-11 rounded-lg border border-error/30 px-sm py-2 font-mono text-[10px] uppercase text-error hover:bg-error/10">
                      Remove selected
                    </button>
                  </div>
                </div>

                <input ref={filesInputRef} type="file" accept={ACCEPT} multiple hidden data-ui-file-input className="hidden" onChange={onFilesChange} />
                <input ref={csvInputRef} type="file" accept=".csv,text/csv" hidden data-ui-file-input className="hidden" onChange={(e) => setExistingCsv(e.target.files?.[0] ?? null)} />

                {/* Phone-first: single Choose photos CTA (Drive / Files via system picker) */}
                <div className="md:hidden">
                  <button
                    type="button"
                    onClick={() => filesInputRef.current?.click()}
                    className="group flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary/50 bg-surface-container-low px-md py-8 transition-colors active:border-primary"
                  >
                    <Icon name="add_photo_alternate" className="mb-sm text-5xl text-primary" />
                    <span className="text-headline-sm font-semibold">Choose photos</span>
                    <span className="mt-xs max-w-xs text-center text-label-md text-on-surface-variant">
                      Open Google Drive or Files in the picker, then select images (recommended {RECOMMENDED_FILES})
                    </span>
                  </button>
                </div>

                {/* Desktop: folder + individual files */}
                <div className="hidden grid-cols-1 gap-md md:grid md:grid-cols-2">
                  <button type="button" onClick={() => void openFolderPicker()} className="group flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-outline-variant bg-surface-container-low p-lg transition-colors hover:border-primary">
                    <Icon name="folder_zip" className="mb-sm text-4xl text-on-surface-variant group-hover:text-primary" />
                    <span className="text-headline-sm font-semibold">Upload Folder</span>
                    <span className="mt-xs text-center text-label-md text-on-surface-variant">
                      Starts in Downloads — pick your trap folder (no repeated trust popup)
                    </span>
                  </button>
                  <button type="button" onClick={() => filesInputRef.current?.click()} className="group flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-outline-variant bg-surface-container-low p-lg transition-colors hover:border-primary">
                    <Icon name="upload_file" className="mb-sm text-4xl text-on-surface-variant group-hover:text-primary" />
                    <span className="text-headline-sm font-semibold">Individual Files</span>
                    <span className="mt-xs text-label-md text-on-surface-variant">JPEG, PNG, WebP, HEIC (recommended {RECOMMENDED_FILES})</span>
                  </button>
                </div>

                <div className="max-h-[min(60vh,520px)] overflow-y-auto md:max-h-[520px]">
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
                    {selectedCount} of {localFiles.length} selected · tap a photo to preview
                  </p>
                )}
              </section>

              <aside className="col-span-12 flex flex-col space-y-lg xl:col-span-4">
                <div className="rounded-xl border border-outline-variant bg-surface-container p-md">
                  <div className="mb-md flex items-center space-x-sm">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-outline-variant text-sm font-bold text-background">2</span>
                    <h3 className="text-headline-sm font-semibold">
                      <span className="md:hidden">Existing log</span>
                      <span className="hidden md:inline">Existing Log (Optional)</span>
                    </h3>
                  </div>
                  {existingCsv ? (
                    <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-surface-dim p-sm">
                      <div className="flex min-w-0 items-center space-x-sm">
                        <Icon name="description" className="shrink-0 text-primary" />
                        <span className="truncate text-label-md">{existingCsv.name}</span>
                      </div>
                      <button type="button" onClick={() => { setExistingCsv(null); if (csvInputRef.current) csvInputRef.current.value = ""; }} className="flex h-11 w-11 items-center justify-center text-on-surface-variant hover:text-error" aria-label="Remove CSV">
                        <Icon name="close" />
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => csvInputRef.current?.click()} className="flex min-h-11 w-full items-center justify-center space-x-sm rounded-lg border border-dashed border-outline-variant py-3 text-label-md text-on-surface-variant hover:border-primary hover:text-primary md:py-4">
                      <Icon name="upload_file" />
                      <span className="md:hidden">Optional CSV to append</span>
                      <span className="hidden md:inline">Upload CTA_*.csv or Camera_Trap_Analysis*.csv</span>
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
                        className="hidden w-full items-center justify-center space-x-sm rounded-xl bg-primary py-4 text-headline-sm font-bold text-background shadow-lg shadow-primary/10 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 md:flex"
                      >
                        <Icon name="bolt" />
                        <span>{analyzeButtonLabel}</span>
                      </button>
                      {hasUnanalyzedFiles && !canRunAnalysis && (
                        <p className="hidden text-label-md text-on-surface-variant md:block">
                          Check the box next to each new photo in the table above, then click analyze.
                        </p>
                      )}
                    </>
                  )}

                  {submitting && (
                    <button
                      type="button"
                      disabled
                      className="hidden w-full items-center justify-center space-x-sm rounded-xl bg-primary py-4 text-headline-sm font-bold text-background opacity-80 md:flex"
                    >
                      <Icon name="sync" className="animate-spin" />
                      <span>
                        {chunkProgress && chunkProgress.total > 1
                          ? `Batch ${chunkProgress.current}/${chunkProgress.total}…`
                          : "Analyzing…"}
                      </span>
                    </button>
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
                      {(poll.stats.alreadyAnalyzed ?? 0) > 0 &&
                        ` · ${poll.stats.alreadyAnalyzed} already analyzed`}
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

                  {poll?.status === "completed" &&
                    (poll.stats?.alreadyAnalyzed ?? 0) > 0 && (
                      <div className="flex items-start gap-sm rounded-lg border border-outline-variant bg-surface-container-high px-sm py-xs">
                        <Icon name="history" className="mt-0.5 shrink-0 text-on-surface-variant" />
                        <p className="text-label-md text-on-surface-variant">
                          Skipped {poll.stats!.alreadyAnalyzed} photo
                          {poll.stats!.alreadyAnalyzed === 1 ? "" : "s"} already in
                          your log or Supabase (no new AI call, no duplicate row).
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

                  {(poll?.status === "completed" || poll?.status === "cancelled") &&
                    !poll.supabase && (
                      <div className="flex items-start gap-sm rounded-lg border border-outline-variant bg-surface-container-high px-sm py-xs">
                        <Icon name="database" className="mt-0.5 shrink-0 text-on-surface-variant" />
                        <p className="text-label-md text-on-surface-variant">
                          No cloud-save status came back from the server. Open /api/health
                          to check the Supabase connection.
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
                        {poll.supabase.configured &&
                          poll.supabase.saved === 0 &&
                          !poll.supabase.error &&
                          poll.files.some((f) => f.status === "done") && (
                            <div className="flex items-start gap-sm rounded-lg border border-outline-variant bg-surface-container-high px-sm py-xs">
                              <Icon name="database" className="mt-0.5 shrink-0 text-on-surface-variant" />
                              <p className="text-label-md text-on-surface-variant">
                                Analysis finished but 0 rows were saved to Supabase. Check
                                Vercel env vars (URL + Secret key) match .env.local, then redeploy.
                                Open /api/health on your site to test the connection.
                              </p>
                            </div>
                          )}
                      </>
                    )}

                  <button
                    type="button"
                    disabled={!csvReady}
                    onClick={downloadCsv}
                    className={`hidden w-full items-center justify-center space-x-sm rounded-xl border border-primary py-3 font-mono text-label-md font-bold text-primary hover:bg-primary/5 md:flex ${csvReady ? "" : "cursor-not-allowed opacity-50"}`}
                  >
                    <Icon name="download" />
                    <span>
                      {csvReady && poll?.downloadFilename
                        ? `Download ${poll.downloadFilename}`
                        : "Download Result (.CSV)"}
                    </span>
                  </button>

                  {speciesTally.length > 0 && (
                    <div className="rounded-xl border border-outline-variant bg-surface-dim p-sm">
                      <p className="mb-xs font-mono text-[10px] uppercase text-on-surface-variant">
                        Species found
                      </p>
                      <div className="flex flex-wrap gap-xs">
                        {speciesTally.map(({ species, count }) => (
                          <span
                            key={species}
                            className="inline-flex items-center gap-1 rounded-full border border-outline-variant bg-surface-container px-sm py-0.5 font-mono text-[10px]"
                          >
                            <span className="text-on-surface">{species}</span>
                            <span className="font-bold text-primary">×{count}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

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

      {view === "analysis" && (
        <div
          className="fixed inset-x-0 bottom-0 z-[70] border-t border-outline-variant bg-surface-container/95 p-sm backdrop-blur-md md:hidden"
          style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto flex max-w-content gap-sm">
            {showStopButton ? (
              <button
                type="button"
                disabled={stopping}
                onClick={() => void stopAnalysis()}
                className="flex min-h-12 flex-1 items-center justify-center gap-xs rounded-xl border border-error/40 bg-error-container/10 font-mono text-label-md font-bold uppercase text-error disabled:opacity-50"
              >
                <Icon name={stopping ? "sync" : "stop_circle"} className={stopping ? "animate-spin" : ""} />
                <span>
                  {stopping
                    ? "Stopping…"
                    : chunkProgress && chunkProgress.total > 1
                      ? `Stop (batch ${chunkProgress.current}/${chunkProgress.total})`
                      : "Stop"}
                </span>
              </button>
            ) : (
              <button
                type="button"
                disabled={!canRunAnalysis}
                onClick={() => void runAnalysis()}
                className="flex min-h-12 flex-1 items-center justify-center gap-xs rounded-xl bg-primary font-bold text-background disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon name="bolt" />
                <span className="truncate px-1">{analyzeButtonLabel}</span>
              </button>
            )}
            <button
              type="button"
              disabled={!csvReady || submitting}
              onClick={downloadCsv}
              className={`flex min-h-12 min-w-12 items-center justify-center rounded-xl border border-primary text-primary ${csvReady && !submitting ? "" : "cursor-not-allowed opacity-40"}`}
              aria-label="Download CSV"
            >
              <Icon name="download" />
            </button>
          </div>
        </div>
      )}

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
