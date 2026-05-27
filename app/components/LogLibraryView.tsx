"use client";

import { useEffect, useState } from "react";
import {
  clearJobHistory,
  deleteJobHistoryEntry,
  downloadCsvFromHistory,
  loadJobHistory,
  type JobHistoryEntry,
} from "@/lib/job-history";

function Icon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
  );
}

type Props = {
  onOpenAnalysis: () => void;
};

export function LogLibraryView({ onOpenAnalysis }: Props) {
  const [entries, setEntries] = useState<JobHistoryEntry[]>([]);

  const refresh = () => setEntries(loadJobHistory());

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="mx-auto w-full max-w-content p-lg">
      <div className="mb-lg flex flex-wrap items-center justify-between gap-sm">
        <div>
          <h2 className="text-headline-md font-semibold">Log Library</h2>
          <p className="text-label-md text-on-surface-variant">
            Past analysis runs saved in this browser (up to 30 entries).
          </p>
        </div>
        <div className="flex gap-xs">
          <button
            type="button"
            onClick={onOpenAnalysis}
            className="rounded-xl bg-primary px-md py-2 font-bold text-background"
          >
            New analysis
          </button>
          {entries.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (confirm("Clear all saved logs from this browser?")) {
                  clearJobHistory();
                  refresh();
                }
              }}
              className="rounded-xl border border-outline-variant px-md py-2 text-on-surface-variant hover:border-error hover:text-error"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-xl text-center">
          <Icon name="database" className="mb-sm text-5xl text-on-surface-variant" />
          <p className="text-label-md text-on-surface-variant">
            No saved runs yet. Complete an analysis to see it here.
          </p>
        </div>
      ) : (
        <ul className="space-y-sm">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-center justify-between gap-md rounded-xl border border-outline-variant bg-surface-container p-md"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-primary">
                  {entry.downloadFilename}
                </p>
                <p className="font-mono text-[11px] text-on-surface-variant">
                  {new Date(entry.completedAt).toLocaleString()} · {entry.done}/
                  {entry.total} ok
                  {entry.skipped > 0 && ` · ${entry.skipped} empty skipped`}
                  {entry.burstCopied > 0 &&
                    ` · ${entry.burstCopied} burst copies`}
                  {entry.errors > 0 && ` · ${entry.errors} errors`}
                </p>
              </div>
              <div className="flex gap-xs">
                {entry.csvContent ? (
                  <button
                    type="button"
                    onClick={() => downloadCsvFromHistory(entry)}
                    className="flex items-center gap-xs rounded-lg border border-primary px-sm py-2 text-primary hover:bg-primary/5"
                  >
                    <Icon name="download" className="text-sm" />
                    Download
                  </button>
                ) : (
                  <span className="px-sm py-2 text-label-md text-on-surface-variant">
                    CSV too large to cache
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    deleteJobHistoryEntry(entry.id);
                    refresh();
                  }}
                  className="rounded-lg border border-outline-variant p-2 text-on-surface-variant hover:text-error"
                  aria-label="Delete entry"
                >
                  <Icon name="delete" className="text-sm" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
