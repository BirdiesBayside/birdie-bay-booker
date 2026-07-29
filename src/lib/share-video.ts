// iOS "Save Video" support.
//
// The share sheet only shows "Save Video" (straight into Photos) when the shared
// item is an actual video FILE of a Photos-compatible type (UTType.movie -> .mp4/.mov).
// Sharing a URL/link, or downloading via an <a download> tag, gives you the Files
// app instead. So to save a step we fetch the MP4 into memory and hand a real
// File object to the Web Share API (navigator.share({ files: [...] })).

export function supportsVideoFileShare(): boolean {
  try {
    if (typeof navigator === "undefined" || !navigator.canShare || !navigator.share) return false;
    const probe = new File([new Blob([], { type: "video/mp4" })], "probe.mp4", { type: "video/mp4" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export async function fetchVideoFile(
  url: string,
  filename: string,
  onProgress?: (pct: number | null) => void,
): Promise<File> {
  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);

  const total = Number(res.headers.get("content-length")) || 0;
  let blob: Blob;

  if (res.body && total > 0) {
    const reader = res.body.getReader();
    const chunks: BlobPart[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value as unknown as BlobPart);
      received += value!.byteLength;
      onProgress?.(Math.round((received / total) * 100));
    }
    blob = new Blob(chunks, { type: "video/mp4" });
  } else {
    onProgress?.(null);
    blob = await res.blob();
  }

  return new File([blob], filename, { type: "video/mp4" });
}

/** Normalise to a single, clean `.mp4` name — iOS keys "Save Video" off the extension + UTI. */
export function mp4Name(name: string): string {
  const base = name.replace(/\.mp4$/i, "").replace(/[^a-z0-9 _-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `${base || "clip"}.mp4`;
}

/** Returns true if the share sheet was opened, false if the user/browser rejected it. */
export async function shareVideoFile(file: File, _title?: string): Promise<boolean> {
  // Re-wrap defensively: the File must have a .mp4 name AND video/mp4 type for iOS
  // to offer "Save Video" (Photos). Any extra share fields (title/text/url) make iOS
  // treat it as a generic multi-item share and only "Save to Files" appears.
  const clean =
    file.type === "video/mp4" && /\.mp4$/i.test(file.name)
      ? file
      : new File([file], mp4Name(file.name), { type: "video/mp4" });

  if (!navigator.canShare?.({ files: [clean] })) return false;
  try {
    await navigator.share({ files: [clean] });
    return true;
  } catch (err) {
    // AbortError = user dismissed the sheet; treat as handled.
    if ((err as DOMException)?.name === "AbortError") return true;
    return false;
  }
}


/** Classic fallback: save the already-fetched file via an object URL. */
export function saveFileFallback(file: File) {
  const objectUrl = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

/**
 * Fetch a highlight clip / full session through the CORS-safe proxy function.
 * The raw Cloudflare Stream download URL has no CORS headers, so a direct
 * fetch() from Safari fails with "Load failed".
 */
export async function fetchClipViaProxy(
  body: { clip_id?: string; recording_session_id?: string; filename: string },
  onProgress?: (pct: number | null) => void,
): Promise<File> {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("You need to be signed in.");

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clip-download-proxy`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `Download failed (${res.status})`;
    try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* ignore */ }
    throw new Error(msg);
  }

  const total = Number(res.headers.get("content-length")) || 0;
  let blob: Blob;
  if (res.body && total > 0) {
    const reader = res.body.getReader();
    const chunks: BlobPart[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value as unknown as BlobPart);
      received += value!.byteLength;
      onProgress?.(Math.round((received / total) * 100));
    }
    blob = new Blob(chunks, { type: "video/mp4" });
  } else {
    onProgress?.(null);
    blob = await res.blob();
  }
  return new File([blob], body.filename, { type: "video/mp4" });
}
