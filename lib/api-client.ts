const UPLOAD_TOO_LARGE =
  "Upload too large for this host (Vercel ~4.5 MB per request). The app now splits big folders into smaller batches automatically — update to the latest deploy, or analyze fewer photos at a time.";

function looksLikePayloadTooLarge(status: number, text: string): boolean {
  if (status === 413) return true;
  return /FUNCTION_PAYLOAD_TOO_LARGE|Request Entity Too Large|payload.?too.?large/i.test(
    text,
  );
}

/** Parse JSON API responses without Safari's opaque JSON.parse errors. */
export async function readApiJson<T>(
  res: Response,
): Promise<{ data: T } | { error: string }> {
  const text = await res.text();
  if (!text.trim()) {
    if (looksLikePayloadTooLarge(res.status, "")) {
      return { error: UPLOAD_TOO_LARGE };
    }
    return {
      error: res.ok
        ? "Empty response from server"
        : `Server error (${res.status}). Check Railway deploy logs and OPENAI_API_KEY.`,
    };
  }

  if (looksLikePayloadTooLarge(res.status, text)) {
    return { error: UPLOAD_TOO_LARGE };
  }

  try {
    return { data: JSON.parse(text) as T };
  } catch {
    const snippet = text.replace(/\s+/g, " ").slice(0, 160);
    return {
      error: res.ok
        ? "Invalid response from server"
        : `Server error (${res.status}): ${snippet}`,
    };
  }
}
