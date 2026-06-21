import { buildSpeciesTally } from "@/lib/species-tally";
import type { CsvRow, FileJobState } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal CsvRow with only the speciesName slot populated. */
function makeRow(speciesName: string): CsvRow {
  return ["photo.jpg", "2024-01-01", "08:00:00", speciesName, "1", "Foraging", "Success"];
}

/** Build a FileJobState with sensible defaults. */
function makeFile(
  overrides: Partial<FileJobState> & { status: FileJobState["status"] },
): FileJobState {
  return {
    name: "photo.jpg",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("buildSpeciesTally — happy path", () => {
  test("returns a single entry when one done file exists", () => {
    const files: FileJobState[] = [
      makeFile({ status: "done", row: makeRow("Deer") }),
    ];
    expect(buildSpeciesTally(files)).toEqual([{ species: "Deer", count: 1 }]);
  });

  test("returns a single entry when one skipped file exists", () => {
    const files: FileJobState[] = [
      makeFile({ status: "skipped", row: makeRow("Fox") }),
    ];
    expect(buildSpeciesTally(files)).toEqual([{ species: "Fox", count: 1 }]);
  });

  test("groups multiple files with the same species", () => {
    const files: FileJobState[] = [
      makeFile({ status: "done", row: makeRow("Deer") }),
      makeFile({ status: "done", row: makeRow("Deer") }),
      makeFile({ status: "done", row: makeRow("Deer") }),
    ];
    expect(buildSpeciesTally(files)).toEqual([{ species: "Deer", count: 3 }]);
  });

  test("counts different species separately", () => {
    const files: FileJobState[] = [
      makeFile({ status: "done", row: makeRow("Deer") }),
      makeFile({ status: "done", row: makeRow("Fox") }),
    ];
    const result = buildSpeciesTally(files);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.species === "Deer")).toEqual({ species: "Deer", count: 1 });
    expect(result.find((r) => r.species === "Fox")).toEqual({ species: "Fox", count: 1 });
  });

  test("mixes done and skipped files in the same tally", () => {
    const files: FileJobState[] = [
      makeFile({ status: "done", row: makeRow("Bear") }),
      makeFile({ status: "skipped", row: makeRow("Bear") }),
    ];
    expect(buildSpeciesTally(files)).toEqual([{ species: "Bear", count: 2 }]);
  });
});

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

describe("buildSpeciesTally — sort order", () => {
  test("sorts results by count descending", () => {
    const files: FileJobState[] = [
      makeFile({ status: "done", row: makeRow("Fox") }),
      makeFile({ status: "done", row: makeRow("Deer") }),
      makeFile({ status: "done", row: makeRow("Deer") }),
      makeFile({ status: "done", row: makeRow("Bear") }),
      makeFile({ status: "done", row: makeRow("Bear") }),
      makeFile({ status: "done", row: makeRow("Bear") }),
    ];
    const result = buildSpeciesTally(files);
    expect(result[0]).toEqual({ species: "Bear", count: 3 });
    expect(result[1]).toEqual({ species: "Deer", count: 2 });
    expect(result[2]).toEqual({ species: "Fox", count: 1 });
  });

  test("most common species is first when counts differ", () => {
    const files: FileJobState[] = [
      makeFile({ status: "done", row: makeRow("Rabbit") }),
      makeFile({ status: "done", row: makeRow("Deer") }),
      makeFile({ status: "done", row: makeRow("Deer") }),
    ];
    const result = buildSpeciesTally(files);
    expect(result[0].species).toBe("Deer");
  });
});

// ---------------------------------------------------------------------------
// Status filtering — only "done" and "skipped" count
// ---------------------------------------------------------------------------

describe("buildSpeciesTally — status filtering", () => {
  test("ignores files with status pending", () => {
    const files: FileJobState[] = [
      makeFile({ status: "pending", row: makeRow("Deer") }),
    ];
    expect(buildSpeciesTally(files)).toEqual([]);
  });

  test("ignores files with status analyzing", () => {
    const files: FileJobState[] = [
      makeFile({ status: "analyzing", row: makeRow("Deer") }),
    ];
    expect(buildSpeciesTally(files)).toEqual([]);
  });

  test("ignores files with status error", () => {
    const files: FileJobState[] = [
      makeFile({ status: "error", row: makeRow("Deer") }),
    ];
    expect(buildSpeciesTally(files)).toEqual([]);
  });

  test("counts only done/skipped when mixed with other statuses", () => {
    const files: FileJobState[] = [
      makeFile({ status: "pending", row: makeRow("Deer") }),
      makeFile({ status: "analyzing", row: makeRow("Deer") }),
      makeFile({ status: "error", row: makeRow("Deer") }),
      makeFile({ status: "done", row: makeRow("Deer") }),
      makeFile({ status: "skipped", row: makeRow("Deer") }),
    ];
    expect(buildSpeciesTally(files)).toEqual([{ species: "Deer", count: 2 }]);
  });
});

// ---------------------------------------------------------------------------
// Row filtering — files without a row are skipped
// ---------------------------------------------------------------------------

describe("buildSpeciesTally — row filtering", () => {
  test("ignores done files that have no row", () => {
    const files: FileJobState[] = [
      makeFile({ status: "done" }), // row is undefined
    ];
    expect(buildSpeciesTally(files)).toEqual([]);
  });

  test("ignores skipped files that have no row", () => {
    const files: FileJobState[] = [
      makeFile({ status: "skipped" }), // row is undefined
    ];
    expect(buildSpeciesTally(files)).toEqual([]);
  });

  test("counts files that have a row even when mixed with row-less files", () => {
    const files: FileJobState[] = [
      makeFile({ status: "done" }),              // no row — ignored
      makeFile({ status: "done", row: makeRow("Wolf") }),
    ];
    expect(buildSpeciesTally(files)).toEqual([{ species: "Wolf", count: 1 }]);
  });
});

// ---------------------------------------------------------------------------
// Species name normalisation
// ---------------------------------------------------------------------------

describe("buildSpeciesTally — species name normalisation", () => {
  test("trims leading whitespace from species name", () => {
    const files: FileJobState[] = [
      makeFile({ status: "done", row: makeRow("  Deer") }),
    ];
    expect(buildSpeciesTally(files)).toEqual([{ species: "Deer", count: 1 }]);
  });

  test("trims trailing whitespace from species name", () => {
    const files: FileJobState[] = [
      makeFile({ status: "done", row: makeRow("Deer   ") }),
    ];
    expect(buildSpeciesTally(files)).toEqual([{ species: "Deer", count: 1 }]);
  });

  test("trims surrounding whitespace from species name", () => {
    const files: FileJobState[] = [
      makeFile({ status: "done", row: makeRow("  Fox  ") }),
    ];
    expect(buildSpeciesTally(files)).toEqual([{ species: "Fox", count: 1 }]);
  });

  test("falls back to Unknown when species name is empty string", () => {
    const files: FileJobState[] = [
      makeFile({ status: "done", row: makeRow("") }),
    ];
    expect(buildSpeciesTally(files)).toEqual([{ species: "Unknown", count: 1 }]);
  });

  test("falls back to Unknown when species name is whitespace only", () => {
    const files: FileJobState[] = [
      makeFile({ status: "done", row: makeRow("   ") }),
    ];
    expect(buildSpeciesTally(files)).toEqual([{ species: "Unknown", count: 1 }]);
  });

  test("groups whitespace-only and empty-string rows under the same Unknown bucket", () => {
    const files: FileJobState[] = [
      makeFile({ status: "done", row: makeRow("") }),
      makeFile({ status: "done", row: makeRow("   ") }),
      makeFile({ status: "skipped", row: makeRow("") }),
    ];
    expect(buildSpeciesTally(files)).toEqual([{ species: "Unknown", count: 3 }]);
  });

  test("treats differently-trimmed names as the same species", () => {
    const files: FileJobState[] = [
      makeFile({ status: "done", row: makeRow("Deer") }),
      makeFile({ status: "done", row: makeRow("  Deer  ") }),
    ];
    expect(buildSpeciesTally(files)).toEqual([{ species: "Deer", count: 2 }]);
  });

  test("treats species names as case-sensitive", () => {
    // The function does NOT normalise case — "deer" and "Deer" are distinct.
    const files: FileJobState[] = [
      makeFile({ status: "done", row: makeRow("deer") }),
      makeFile({ status: "done", row: makeRow("Deer") }),
    ];
    const result = buildSpeciesTally(files);
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("buildSpeciesTally — edge cases", () => {
  test("returns empty array for empty input", () => {
    expect(buildSpeciesTally([])).toEqual([]);
  });

  test("returns empty array when all files are pending with no row", () => {
    const files: FileJobState[] = [
      makeFile({ status: "pending" }),
      makeFile({ status: "pending" }),
    ];
    expect(buildSpeciesTally(files)).toEqual([]);
  });

  test("handles a large number of files correctly", () => {
    const files: FileJobState[] = Array.from({ length: 1000 }, (_, i) =>
      makeFile({ status: "done", row: makeRow(i % 2 === 0 ? "Deer" : "Fox") }),
    );
    const result = buildSpeciesTally(files);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ species: "Deer", count: 500 });
    expect(result[1]).toEqual({ species: "Fox", count: 500 });
  });

  test("handles a single file with skipped status and empty species", () => {
    const files: FileJobState[] = [
      makeFile({ status: "skipped", row: makeRow("") }),
    ];
    expect(buildSpeciesTally(files)).toEqual([{ species: "Unknown", count: 1 }]);
  });

  test("handles special characters in species names", () => {
    const files: FileJobState[] = [
      makeFile({ status: "done", row: makeRow("Mus musculus (House Mouse)") }),
      makeFile({ status: "done", row: makeRow("Mus musculus (House Mouse)") }),
    ];
    expect(buildSpeciesTally(files)).toEqual([
      { species: "Mus musculus (House Mouse)", count: 2 },
    ]);
  });

  test("returns correct structure — array of objects with species and count", () => {
    const files: FileJobState[] = [
      makeFile({ status: "done", row: makeRow("Bear") }),
    ];
    const result = buildSpeciesTally(files);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("species");
    expect(result[0]).toHaveProperty("count");
    expect(typeof result[0].species).toBe("string");
    expect(typeof result[0].count).toBe("number");
  });

  test("Unknown species bucket is sorted alongside named species by count", () => {
    const files: FileJobState[] = [
      makeFile({ status: "done", row: makeRow("") }),
      makeFile({ status: "done", row: makeRow("") }),
      makeFile({ status: "done", row: makeRow("Deer") }),
    ];
    const result = buildSpeciesTally(files);
    expect(result[0]).toEqual({ species: "Unknown", count: 2 });
    expect(result[1]).toEqual({ species: "Deer", count: 1 });
  });
});
