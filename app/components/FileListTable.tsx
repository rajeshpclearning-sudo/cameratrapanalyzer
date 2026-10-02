"use client";

import { getAnalysisDisplay } from "@/lib/analysis-display";
import { getFileStatusDisplay } from "@/lib/file-status-display";
import type { FileJobState, JobPollResponse } from "@/lib/types";

export type LocalFileItem = {
  id: string;
  file: File;
  selected: boolean;
};

type Props = {
  localFiles: LocalFileItem[];
  poll: JobPollResponse | null;
  completedByName?: Record<string, FileJobState>;
  thumbUrls: Record<string, string>;
  allSelected: boolean;
  onToggleAll: () => void;
  onToggleFile: (id: string) => void;
  onOpenPreview: (item: LocalFileItem) => void;
};

function Icon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
  );
}

const thClass =
  "whitespace-nowrap px-sm py-sm text-left font-mono text-[10px] uppercase text-on-surface-variant";
const tdClass = "whitespace-nowrap px-sm py-2 font-mono text-label-md";
const checkboxClass =
  "h-5 w-5 rounded border-outline-variant bg-surface-dim text-primary disabled:opacity-50";

export function FileListTable({
  localFiles,
  poll,
  completedByName = {},
  thumbUrls,
  allSelected,
  onToggleAll,
  onToggleFile,
  onOpenPreview,
}: Props) {
  const jobStatus = poll?.status;
  const running = !!poll && poll.status === "running";

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container">
      {/* Mobile card list */}
      <div className="md:hidden">
        <div className="flex items-center justify-between gap-sm border-b border-outline-variant bg-surface-container-high px-md py-sm">
          <label className="flex min-h-11 items-center gap-sm text-label-md text-on-surface-variant">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={onToggleAll}
              disabled={running || localFiles.length === 0}
              className={checkboxClass}
              aria-label="Select all files"
            />
            Select all
          </label>
          <span className="font-mono text-[10px] uppercase text-on-surface-variant">
            {localFiles.length} photo{localFiles.length === 1 ? "" : "s"}
          </span>
        </div>

        {localFiles.length === 0 ? (
          <p className="px-md py-lg text-center text-label-md text-on-surface-variant">
            No images yet. Choose photos from Google Drive or Files to begin.
          </p>
        ) : (
          <ul className="divide-y divide-outline-variant/40">
            {localFiles.map((item) => {
              const pollFile =
                poll?.files.find((f) => f.name === item.file.name) ??
                completedByName[item.file.name];
              const status = pollFile?.status ?? "ready";
              const statusDisplay = getFileStatusDisplay(status, jobStatus);
              const analysis = getAnalysisDisplay(pollFile);
              const isAnalyzing = pollFile?.status === "analyzing";

              return (
                <li
                  key={item.id}
                  className={`flex items-stretch gap-sm px-sm py-sm ${statusDisplay.rowClass} ${isAnalyzing ? "pulsing-blue" : ""}`}
                >
                  <label
                    className="flex min-h-11 min-w-11 shrink-0 items-center justify-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={() => onToggleFile(item.id)}
                      disabled={running}
                      className={checkboxClass}
                      aria-label={`Select ${item.file.name}`}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => onOpenPreview(item)}
                    className="flex min-w-0 flex-1 items-center gap-sm rounded-lg py-1 text-left active:bg-surface-container-highest"
                  >
                    {thumbUrls[item.id] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumbUrls[item.id]}
                        alt=""
                        className="h-14 w-14 shrink-0 rounded-lg border border-outline-variant/50 object-cover"
                      />
                    ) : (
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-outline-variant/50 bg-surface-dim">
                        <Icon name="image" className="text-primary" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-label-md font-medium text-on-surface">
                        {item.file.name}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <span
                          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] uppercase ${statusDisplay.badgeClass}`}
                        >
                          <Icon
                            name={statusDisplay.icon}
                            className={statusDisplay.iconClass}
                          />
                          {statusDisplay.label}
                        </span>
                        {analysis.species !== "—" && (
                          <span className="truncate font-mono text-[10px] text-on-surface-variant">
                            {analysis.species}
                          </span>
                        )}
                      </div>
                    </div>
                    <Icon
                      name="chevron_right"
                      className="shrink-0 text-on-surface-variant"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[900px] border-collapse text-left">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-high">
              <th className={`${thClass} w-10`}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleAll}
                  disabled={running}
                  className={checkboxClass}
                  aria-label="Select all files"
                />
              </th>
              <th className={`${thClass} w-12`} aria-hidden />
              <th className={`${thClass} min-w-[140px]`}>Filename</th>
              <th className={`${thClass} min-w-[96px]`}>Status</th>
              <th className={`${thClass} min-w-[100px]`}>Date</th>
              <th className={`${thClass} min-w-[100px]`}>Timestamp</th>
              <th className={`${thClass} min-w-[140px]`}>Species Name</th>
            </tr>
          </thead>
          <tbody>
            {localFiles.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-md py-lg text-center text-label-md text-on-surface-variant"
                >
                  No images yet. Upload a folder or individual files to begin.
                </td>
              </tr>
            ) : (
              localFiles.map((item) => {
                const pollFile =
                  poll?.files.find((f) => f.name === item.file.name) ??
                  completedByName[item.file.name];
                const status = pollFile?.status ?? "ready";
                const statusDisplay = getFileStatusDisplay(status, jobStatus);
                const analysis = getAnalysisDisplay(pollFile);
                const isError = pollFile?.status === "error";
                const isAnalyzing = pollFile?.status === "analyzing";

                return (
                  <tr
                    key={item.id}
                    className={`cursor-pointer border-b border-outline-variant/30 transition-colors hover:bg-surface-container-highest ${statusDisplay.rowClass} ${isAnalyzing ? "pulsing-blue" : ""}`}
                    onClick={() => onOpenPreview(item)}
                  >
                    <td
                      className={tdClass}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => onToggleFile(item.id)}
                        disabled={running}
                        className={checkboxClass}
                        aria-label={`Select ${item.file.name}`}
                      />
                    </td>
                    <td className={tdClass}>
                      {thumbUrls[item.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumbUrls[item.id]}
                          alt=""
                          className="h-10 w-10 rounded border border-outline-variant/50 object-cover"
                        />
                      ) : (
                        <Icon name="image" className="text-primary" />
                      )}
                    </td>
                    <td
                      className={`${tdClass} max-w-[200px] truncate font-medium text-on-surface`}
                    >
                      {item.file.name}
                    </td>
                    <td className={tdClass}>
                      <span
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] uppercase ${statusDisplay.badgeClass}`}
                      >
                        <Icon
                          name={statusDisplay.icon}
                          className={statusDisplay.iconClass}
                        />
                        {statusDisplay.label}
                      </span>
                    </td>
                    <td className={`${tdClass} text-on-surface-variant`}>
                      {analysis.date}
                    </td>
                    <td className={`${tdClass} text-on-surface-variant`}>
                      {analysis.timestamp}
                    </td>
                    <td
                      className={`${tdClass} max-w-[180px] truncate ${
                        isError
                          ? "text-error"
                          : isAnalyzing
                            ? "text-[#0091ff]"
                            : "text-on-surface-variant"
                      }`}
                      title={isError ? analysis.species : undefined}
                    >
                      {analysis.species}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
