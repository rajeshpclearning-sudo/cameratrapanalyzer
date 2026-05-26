import exifr from "exifr";

export type DateTimeFields = {
  date: string;
  timestamp: string;
};

function formatFromDate(d: Date): DateTimeFields {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return {
    date: `${yyyy}-${mm}-${dd}`,
    timestamp: `${hh}:${min}:${ss}`,
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
