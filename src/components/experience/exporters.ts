export function triggerDownload(url: string, name: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadSvg(svg: string, name = "country-one-pager.svg"): void {
  triggerDownload(URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })), name);
}

export async function exportOnePager(
  payload: Record<string, unknown>,
  filename: string,
): Promise<void> {
  const res = await fetch("/api/export/onepager", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return;
  triggerDownload(URL.createObjectURL(await res.blob()), filename);
}

/** Animated MP4 brief from the structured deck. Throws with the server's
 *  message on failure (e.g. ffmpeg missing) so the caller can toast it. */
export async function exportDeckVideo(
  deck: Record<string, unknown>,
  filename = "country-brief.mp4",
): Promise<void> {
  const res = await fetch("/api/export/video", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deck }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  triggerDownload(URL.createObjectURL(await res.blob()), filename);
}
