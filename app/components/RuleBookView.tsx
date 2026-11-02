"use client";

import { useEffect, useState } from "react";

type FeedbackRow = {
  id: string;
  photoName: string;
  aiSpecies: string;
  correctSpecies: string;
  comment: string;
  createdAt: string;
  status: string;
};

type RulesPayload = {
  title: string;
  station: string;
  rulesMarkdown: string;
  correctionsMarkdown: string;
  pendingFeedback: FeedbackRow[];
  updatedHint: string;
  error?: string;
};

function Icon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
  );
}

function MarkdownBlocks({ text }: { text: string }) {
  if (!text.trim()) {
    return (
      <p className="text-label-md text-on-surface-variant">No content yet.</p>
    );
  }

  const sections = text.split(/\n(?=##\s)/);
  return (
    <div className="space-y-md">
      {sections.map((block, idx) => {
        const lines = block.trim().split("\n");
        const first = lines[0] ?? "";
        const isHeading = first.startsWith("#");
        const title = isHeading ? first.replace(/^#+\s*/, "") : null;
        const body = (isHeading ? lines.slice(1) : lines).join("\n").trim();

        return (
          <section
            key={`${idx}-${title ?? "block"}`}
            className="rounded-xl border border-outline-variant bg-surface-container p-md"
          >
            {title && (
              <h3 className="mb-sm text-headline-sm font-semibold text-primary">
                {title}
              </h3>
            )}
            {body && (
              <pre className="whitespace-pre-wrap font-sans text-label-md leading-relaxed text-on-surface">
                {body}
              </pre>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function RuleBookView() {
  const [data, setData] = useState<RulesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/rules");
        const json = (await res.json()) as RulesPayload;
        if (!res.ok) throw new Error(json.error ?? "Could not load rules");
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load rules");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-content space-y-md px-md py-md md:px-lg">
      <div>
        <h2 className="text-headline-md font-semibold">Species Rules</h2>
        <p className="mt-xs text-label-md text-on-surface-variant">
          Consolidated wild-animal detection rules for Forest First Station C8.
          Preview error reports feed the next analysis; permanent rule-book
          updates appear here after they are committed and deployed.
        </p>
      </div>

      {loading && (
        <p className="font-mono text-label-md text-on-surface-variant">
          Loading rules…
        </p>
      )}
      {error && (
        <div className="rounded-xl border border-error/40 bg-error-container/20 px-md py-sm text-label-md text-error">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="rounded-xl border border-outline-variant bg-surface-dim px-md py-sm">
            <p className="font-mono text-[10px] uppercase text-on-surface-variant">
              Station
            </p>
            <p className="text-label-md text-on-surface">{data.station}</p>
            <p className="mt-sm text-label-md text-on-surface-variant">
              {data.updatedHint}
            </p>
          </div>

          {data.pendingFeedback.length > 0 && (
            <section className="space-y-sm">
              <h3 className="flex items-center gap-sm text-headline-sm font-semibold text-on-surface">
                <Icon name="feedback" className="text-primary" />
                Pending preview feedback
              </h3>
              <ul className="space-y-sm">
                {data.pendingFeedback.map((f) => (
                  <li
                    key={f.id}
                    className="rounded-xl border border-primary/30 bg-primary/5 px-md py-sm text-label-md"
                  >
                    <p className="font-mono text-[10px] uppercase text-on-surface-variant">
                      {f.photoName} · {new Date(f.createdAt).toLocaleString()}
                    </p>
                    <p className="mt-1 text-on-surface">
                      AI: <span className="font-medium">{f.aiSpecies || "—"}</span>
                      {f.correctSpecies ? (
                        <>
                          {" "}
                          → Correct:{" "}
                          <span className="font-medium text-primary">
                            {f.correctSpecies}
                          </span>
                        </>
                      ) : null}
                    </p>
                    <p className="mt-1 text-on-surface-variant">{f.comment}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-sm">
            <h3 className="text-headline-sm font-semibold">{data.title}</h3>
            <MarkdownBlocks text={data.rulesMarkdown} />
          </section>

          <section className="space-y-sm">
            <h3 className="text-headline-sm font-semibold">
              Corrections log (from Git commits)
            </h3>
            <MarkdownBlocks text={data.correctionsMarkdown} />
          </section>
        </>
      )}
    </div>
  );
}
