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

export async function extractDateTime(
  buffer: Buffer,
  fallbackDate: Date,
): Promise<DateTimeFields> {
  try {
    const exif = await exifr.parse(buffer, {
      pick: ["DateTimeOriginal", "CreateDate", "ModifyDate"],
    });

    const raw =
      exif?.DateTimeOriginal ?? exif?.CreateDate ?? exif?.ModifyDate;
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
      return formatFromDate(raw);
    }
    if (typeof raw === "string") {
      const parsed = new Date(raw.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3"));
      if (!Number.isNaN(parsed.getTime())) {
        return formatFromDate(parsed);
      }
    }
  } catch {
    // fall through to fallback
  }

  return formatFromDate(fallbackDate);
}
