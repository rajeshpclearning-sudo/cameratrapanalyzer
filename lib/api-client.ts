/** Parse JSON API responses without Safari's opaque JSON.parse errors. */
export async function readApiJson<T>(
  res: Response,
): Promise<{ data: T } | { error: string }> {
  const text = await res.text();
  if (!text.trim()) {
    if (res.status === 413) {
      return {
        error:
          "Upload too large. Try fewer photos or smaller JPEGs (under 10 MB each).",
      };
    }
    return {
      error: res.ok
        ? "Empty response from server"
        : `Server error (${res.status}). Check Railway deploy logs and OPENAI_API_KEY.`,
    };
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
