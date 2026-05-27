import sharp from "sharp";

const EMPTY_STDEV_THRESHOLD = parseFloat(
  process.env.EMPTY_STDEV_THRESHOLD ?? "12",
);
const BURST_GAP_MS = parseInt(process.env.BURST_GAP_MS ?? "2000", 10);

export type FileMeta = {
  name: string;
  lastModified: number;
};

/** Low grayscale variance often indicates empty / uniform trap frames. */
export async function isLikelyEmptyFrame(buffer: Buffer): Promise<boolean> {
  try {
    const stats = await sharp(buffer).rotate().grayscale().stats();
    const stdev = stats.channels[0]?.stdev ?? 255;
    return stdev < EMPTY_STDEV_THRESHOLD;
  } catch {
    return false;
  }
}

export function emptyFrameRow(
  photoName: string,
  date: string,
  timestamp: string,
): [string, string, string, string, string, string] {
  return [
    photoName,
    date,
    timestamp,
    "Empty trail - low image variation",
    "0",
    "N/A",
  ];
}

/**
 * Group file indices into bursts (shots within BURST_GAP_MS).
 * Sorted by lastModified then name before grouping.
 */
export function groupBurstIndices(files: FileMeta[]): number[][] {
  if (files.length === 0) return [];

  const indices = files.map((_, i) => i);
  indices.sort((a, b) => {
    const dt = files[a].lastModified - files[b].lastModified;
    if (dt !== 0) return dt;
    return files[a].name.localeCompare(files[b].name);
  });

  const groups: number[][] = [];
  let current: number[] = [indices[0]!];

  for (let i = 1; i < indices.length; i++) {
    const idx = indices[i]!;
    const prevIdx = current[current.length - 1]!;
    const gap = files[idx].lastModified - files[prevIdx].lastModified;
    if (gap <= BURST_GAP_MS && gap >= 0) {
      current.push(idx);
    } else {
      groups.push(current);
      current = [idx];
    }
  }
  groups.push(current);
  return groups;
}

export function burstGapMs(): number {
  return BURST_GAP_MS;
}
