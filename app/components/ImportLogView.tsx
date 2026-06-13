"use client";

import { useRef, useState } from "react";
import { readApiJson } from "@/lib/api-client";
import {
  findPriorImport,
  recordImport,
  type ImportHistoryEntry,
} from "@/lib/import-history";
import { CSV_HEADER, type CsvRow } from "@/lib/types";
import type { PersistSightingsResult } from "@/lib/persist-sightings";

function Icon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
  );
}

type PreviewResponse = {
  filename: string;
  rowCount: number;
  sampleRows: CsvRow[];
};

type ImportResponse = {
  filename: string;
  rowCount: number;
  jobId: string;
  supabase: PersistSightingsResult;
};

const ACCEPT = ".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function formatImportDate(epochMs: number): string {
  return new Date(epochMs).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function ImportLogView() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [priorImport, setPriorImport] = useState<ImportHistoryEntry | null>(null);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const clearFile = () => {
    setFile(null);
    setPreview(null);
    setPriorImport(null);
    setImportResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadForPreview = async (selected: File) => {
    setFile(selected);
    setPreview(null);
    setPriorImport(null);
    setImportResult(null);
    setError(null);
    setLoading(true);

    const form = new FormData();
    form.append("file", selected);
    form.append("dryRun", "true");

    try {
      const res = await fetch("/api/import-sightings", {
        method: "POST",
        body: form,
      });
      const parsed = await readApiJson<PreviewResponse>(res);
      if ("error" in parsed) {
        setError(parsed.error);
        return;
      }
      if (!res.ok) {
        setError("Failed to preview file");
        return;
      }
      setPreview(parsed.data);
      setPriorImport(findPriorImport(selected.name));
    } catch {
      setError("Network error while previewing file");
    } finally {
      setLoading(false);
    }
  };

  const runImport = async () => {
    if (!file) return;
    setImporting(true);
    setError(null);
    setImportResult(null);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/import-sightings", {
        method: "POST",
        body: form,
      });
      const parsed = await readApiJson<ImportResponse>(res);
      if ("error" in parsed) {
        setError(parsed.error);
        return;
      }
      if (!res.ok) {
        setError("Failed to import file");
        return;
      }
      const data = parsed.data;
      setImportResult(data);
      if (
        data.rowCount > 0 &&
        (data.supabase.inserted > 0 || !data.supabase.error)
      ) {
        recordImport({
          filename: file.name,
          displayName: file.name,
          importedAt: Date.now(),
          rowCount: data.rowCount,
          jobId: data.jobId,
        });
        setPriorImport(findPriorImport(file.name));
      }
    } catch {
      setError("Network error while importing");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-content p-lg">
      <div className="mb-lg">
        <h2 className="text-headline-md font-semibold">Import Log</h2>
        <p className="text-label-md text-on-surface-variant">
          Upload past analysis from Excel or CSV. Rows are saved to Supabase — no
          photo analysis needed.
        </p>
      </div>

      {error && (
        <div className="mb-md rounded-xl border border-error/40 bg-error-container/20 px-md py-sm text-label-md text-error">
          {error}
        </div>
      )}

      <div className="mb-lg rounded-xl border border-outline-variant bg-surface-container p-md">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            const selected = e.target.files?.[0];
            if (selected) void uploadForPreview(selected);
          }}
        />

        {file ? (
          <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-surface-dim p-sm">
            <div className="flex min-w-0 items-center space-x-sm">
              <Icon name="description" className="shrink-0 text-primary" />
              <span className="truncate text-label-md">{file.name}</span>
            </div>
            <button
              type="button"
              onClick={clearFile}
              className="text-on-surface-variant hover:text-error"
              disabled={loading || importing}
            >
              <Icon name="close" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-outline-variant bg-surface-container-low py-xl transition-colors hover:border-primary"
          >
            <Icon name="cloud_upload" className="mb-sm text-5xl text-on-surface-variant" />
            <span className="text-headline-sm font-semibold">Upload analysis file</span>
            <span className="mt-xs text-label-md text-on-surface-variant">
              .xlsx, .xls, or .csv (max 10 MB)
            </span>
          </button>
        )}
      </div>

      <div className="mb-lg rounded-xl border border-outline-variant bg-surface-container-low p-md">
        <p className="mb-xs font-mono text-[10px] uppercase text-on-surface-variant">
          Required columns (row 1)
        </p>
        <p className="text-label-md text-on-surface">{CSV_HEADER.join(", ")}</p>
        <p className="mt-sm text-label-md text-on-surface-variant">
          Excel files use the first worksheet. If this browser imported a file with
          the same name before, you will see a warning and must click{" "}
          <strong>Import anyway</strong> to add duplicate rows.
        </p>
      </div>

      {loading && (
        <div className="mb-lg flex items-center gap-sm text-label-md text-on-surface-variant">
          <Icon name="sync" className="animate-spin text-primary" />
          Reading file…
        </div>
      )}

      {preview && !loading && (
        <div className="mb-lg space-y-md">
          {priorImport && (
            <div className="flex items-start gap-sm rounded-lg border border-amber-500/40 bg-amber-500/10 px-sm py-xs">
              <Icon name="warning" className="mt-0.5 shrink-0 text-amber-400" />
              <p className="text-label-md text-on-surface-variant">
                <span className="font-medium text-on-surface">
                  {priorImport.displayName}
                </span>{" "}
                was imported earlier on {formatImportDate(priorImport.importedAt)}.
                Importing again will add duplicate rows to Supabase.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-sm">
            <p className="text-label-md text-on-surface-variant">
              <span className="font-semibold text-on-surface">{preview.rowCount}</span>{" "}
              row{preview.rowCount === 1 ? "" : "s"} ready to import
            </p>
            <button
              type="button"
              disabled={importing || preview.rowCount === 0}
              onClick={() => void runImport()}
              className={`flex items-center space-x-xs rounded-xl px-md py-2 font-bold disabled:cursor-not-allowed disabled:opacity-50 ${
                priorImport
                  ? "bg-amber-600 text-white hover:brightness-110"
                  : "bg-primary text-background hover:brightness-110"
              }`}
            >
              <Icon name="database" className="text-lg" />
              <span>
                {importing
                  ? "Importing…"
                  : priorImport
                    ? "Import anyway"
                    : "Import to Supabase"}
              </span>
            </button>
          </div>

          {preview.sampleRows.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-outline-variant">
              <table className="w-full min-w-[640px] text-left text-label-md">
                <thead className="border-b border-outline-variant bg-surface-container-high">
                  <tr>
                    {CSV_HEADER.map((col) => (
                      <th
                        key={col}
                        className="px-sm py-2 font-mono text-[10px] uppercase text-on-surface-variant"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.sampleRows.map((row, i) => (
                    <tr
                      key={i}
                      className="border-b border-outline-variant/50 last:border-0"
                    >
                      {row.map((cell, j) => (
                        <td key={j} className="px-sm py-2 text-on-surface">
                          {cell || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.rowCount > preview.sampleRows.length && (
                <p className="border-t border-outline-variant px-sm py-2 text-label-md text-on-surface-variant">
                  Showing first {preview.sampleRows.length} of {preview.rowCount} rows
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {importResult && (
        <div className="space-y-sm">
          {importResult.supabase.inserted > 0 && (
            <div className="flex items-start gap-sm rounded-lg border border-primary/30 bg-primary/5 px-sm py-xs">
              <Icon name="database" className="mt-0.5 shrink-0 text-primary" />
              <p className="text-label-md text-on-surface-variant">
                Saved {importResult.supabase.inserted} row
                {importResult.supabase.inserted === 1 ? "" : "s"} to Supabase.
              </p>
            </div>
          )}
          {!importResult.supabase.configured && (
            <div className="flex items-start gap-sm rounded-lg border border-outline-variant bg-surface-container-high px-sm py-xs">
              <Icon name="database" className="mt-0.5 shrink-0 text-on-surface-variant" />
              <p className="text-label-md text-on-surface-variant">
                Supabase not configured on server. Parsed {importResult.rowCount}{" "}
                row{importResult.rowCount === 1 ? "" : "s"} but nothing was saved.
                Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Railway Variables
                (or .env.local for local dev).
              </p>
            </div>
          )}
          {importResult.supabase.error && (
            <div className="flex items-start gap-sm rounded-lg border border-error/30 bg-error-container/10 px-sm py-xs">
              <Icon name="error" className="mt-0.5 shrink-0 text-error" />
              <p className="text-label-md text-error">
                Supabase save failed: {importResult.supabase.error}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
