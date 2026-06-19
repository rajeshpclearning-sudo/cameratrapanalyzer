"use client";

import type { CsvRow } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  fileName: string;
  imageUrl: string | null;
  row?: CsvRow;
  status?: string;
  error?: string;
};

function Icon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
  );
}

export function PreviewModal({
  open,
  onClose,
  fileName,
  imageUrl,
  row,
  status,
  error,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-md"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${fileName}`}
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-outline-variant bg-surface-container p-md shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-md flex items-start justify-between gap-sm">
          <h2 className="truncate text-headline-sm font-semibold">{fileName}</h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-on-surface-variant hover:text-primary"
            aria-label="Close preview"
          >
            <Icon name="close" />
          </button>
        </div>

        {imageUrl && (
          <div className="mb-md overflow-hidden rounded-lg border border-outline-variant bg-surface-dim">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={fileName}
              className="mx-auto max-h-[50vh] w-full object-contain"
            />
          </div>
        )}

        {status && (
          <p className="mb-sm font-mono text-label-caps uppercase text-on-surface-variant">
            Status: {status}
          </p>
        )}

        {error && (
          <p className="mb-sm text-label-md text-error">{error}</p>
        )}

        {row ? (
          <table className="w-full border-collapse text-label-md">
            <tbody>
              {[
                ["Species Name", row[3]],
                ["Number of Individuals", row[4]],
                ["Behavior", row[5]],
                ["Date", row[1]],
                ["Time", row[2]],
                ["Status", row[6]],
              ].map(([label, value]) => (
                <tr key={label} className="border-b border-outline-variant/30">
                  <td className="py-2 pr-md text-on-surface-variant">{label}</td>
                  <td className="py-2 font-medium">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          !error && (
            <p className="text-label-md text-on-surface-variant">
              Run analysis to see AI results for this image.
            </p>
          )
        )}
      </div>
    </div>
  );
}
