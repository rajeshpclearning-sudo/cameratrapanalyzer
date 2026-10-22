import exifr from "exifr";

export type DateTimeFields = {
  date: string;
  timestamp: string;
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function formatFromDate(d: Date): DateTimeFields {
  const dd = String(d.getDate());
  const mmm = MONTHS[d.getMonth()] ?? "Jan";
  const yyyy = d.getFullYear();

  let hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;

  return {
    date: `${dd}-${mmm}-${yyyy}`,
    timestamp: `${hours}:${String(minutes).padStart(2, "0")} ${ampm}`,
  };
}

function coerceExifDate(raw: unknown): Date | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  if (typeof raw === "string" && raw.trim()) {
    // EXIF often uses "YYYY:MM:DD HH:MM:SS"
    const parsed = new Date(
      raw.trim().replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3"),
    );
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

/**
 * Date/time when the trap photo was taken.
 * Prefer EXIF on the *original* image bytes (not a re-encoded JPEG — that strips tags).
 * Fallback: file lastModified (upload/download time — often "today").
 */
export async function extractDateTime(
  buffer: Buffer,
  fallbackDate: Date,
): Promise<DateTimeFields> {
  try {
    const exif = await exifr.parse(buffer, {
      // Camera traps / phones use several of these; order = preference.
      pick: [
        "DateTimeOriginal",
        "DateTimeDigitized",
        "CreateDate",
        "DateTime",
        "ModifyDate",
      ],
    });

    const candidates = [
      exif?.DateTimeOriginal,
      exif?.DateTimeDigitized,
      exif?.CreateDate,
      exif?.DateTime,
      exif?.ModifyDate,
    ];

    for (const raw of candidates) {
      const when = coerceExifDate(raw);
      if (when) return formatFromDate(when);
    }
  } catch {
    // fall through to fallback
  }

  return formatFromDate(fallbackDate);
}
