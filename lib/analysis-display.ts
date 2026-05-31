import type { FileJobState } from "./types";

export type AnalysisDisplay = {
  date: string;
  timestamp: string;
  species: string;
  individuals: string;
  behavior: string;
};

const DASH = "—";

const emptyCells = (): AnalysisDisplay => ({
  date: DASH,
  timestamp: DASH,
  species: DASH,
  individuals: DASH,
  behavior: DASH,
});

/** Map poll file state to table cells for CSV columns (excludes photo name). */
export function getAnalysisDisplay(
  pollFile?: FileJobState,
): AnalysisDisplay {
  if (!pollFile) return emptyCells();

  if (pollFile.status === "analyzing") {
    return {
      ...emptyCells(),
      species: "Analyzing…",
    };
  }

  if (pollFile.status === "skipped" && !pollFile.row) {
    return {
      ...emptyCells(),
      species: "Not analyzed",
    };
  }

  if (pollFile.status === "pending") {
    return {
      ...emptyCells(),
      species: "Waiting…",
    };
  }

  if (pollFile.status === "error") {
    return {
      ...emptyCells(),
      species: pollFile.error ?? "Error",
    };
  }

  if (pollFile.row) {
    return {
      date: pollFile.row[1],
      timestamp: pollFile.row[2],
      species: pollFile.row[3],
      individuals: pollFile.row[4],
      behavior: pollFile.row[5],
    };
  }

  return emptyCells();
}
