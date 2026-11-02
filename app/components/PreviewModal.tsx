"use client";

import { useEffect, useState } from "react";
import { isArmedHumanSpecies } from "@/lib/burst-species";
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
  const [reportOpen, setReportOpen] = useState(false);
  const [correctSpecies, setCorrectSpecies] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState(false);

  useEffect(() => {
    if (!open) {
      setReportOpen(false);
      setCorrectSpecies("");
      setComment("");
      setSubmitError(null);
      setSubmitOk(false);
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const armedHuman = row ? isArmedHumanSpecies(row[3] ?? "") : false;
  const aiSpecies = row?.[3] ?? "";

  const submitFeedback = async () => {
    setSubmitting(true);
    setSubmitError(null);
    setSubmitOk(false);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoName: fileName,
          aiSpecies,
          correctSpecies: correctSpecies.trim(),
          comment: comment.trim(),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save feedback");
      setSubmitOk(true);
      setReportOpen(false);
      setCorrectSpecies("");
      setComment("");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not save feedback");
    } finally {
      setSubmitting(false);
    }
  };

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

        {armedHuman && (
          <p className="mb-sm rounded-lg border border-error/40 bg-error-container/20 px-md py-sm font-mono text-label-md font-bold text-error">
            Weapon detected with human — review this frame carefully.
          </p>
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
                  <td
                    className={`py-2 font-medium ${
                      label === "Species Name" && armedHuman ? "text-error" : ""
                    }`}
                  >
                    {value}
                  </td>
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

        {row && (
          <div className="mt-md space-y-sm border-t border-outline-variant pt-md">
            {submitOk && (
              <p className="rounded-lg border border-primary/30 bg-primary/10 px-md py-sm text-label-md text-primary">
                Thanks — your correction will guide the next analysis. When rules
                are committed to GitHub, Species Rules also updates.
              </p>
            )}

            {!reportOpen ? (
              <button
                type="button"
                onClick={() => {
                  setReportOpen(true);
                  setSubmitOk(false);
                  setSubmitError(null);
                }}
                className="flex min-h-11 w-full items-center justify-center gap-sm rounded-xl border border-error/40 bg-error-container/10 font-mono text-label-md font-bold uppercase text-error hover:bg-error/10"
              >
                <Icon name="report" />
                Mark error / add feedback
              </button>
            ) : (
              <div className="space-y-sm rounded-xl border border-outline-variant bg-surface-dim p-md">
                <p className="text-label-md font-semibold text-on-surface">
                  What should this photo be?
                </p>
                <label className="block space-y-1">
                  <span className="font-mono text-[10px] uppercase text-on-surface-variant">
                    Correct species (optional)
                  </span>
                  <input
                    type="text"
                    value={correctSpecies}
                    onChange={(e) => setCorrectSpecies(e.target.value)}
                    placeholder="e.g. Elephant, Human, No animal detected"
                    className="w-full rounded-lg border border-outline-variant bg-surface-container px-sm py-2 text-label-md text-on-surface"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="font-mono text-[10px] uppercase text-on-surface-variant">
                    Comments
                  </span>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={3}
                    placeholder="What did the AI get wrong? What should it look for next time?"
                    className="w-full rounded-lg border border-outline-variant bg-surface-container px-sm py-2 text-label-md text-on-surface"
                  />
                </label>
                {submitError && (
                  <p className="text-label-md text-error">{submitError}</p>
                )}
                <div className="flex flex-wrap gap-sm">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void submitFeedback()}
                    className="min-h-11 flex-1 rounded-xl bg-primary px-md font-bold text-background disabled:opacity-50"
                  >
                    {submitting ? "Saving…" : "Submit feedback"}
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => setReportOpen(false)}
                    className="min-h-11 rounded-xl border border-outline-variant px-md text-label-md text-on-surface-variant"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
