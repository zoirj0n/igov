import type { VideoVariant } from "./script";

function tsLine(sec: number): string {
  const hh = Math.floor(sec / 3600)
    .toString()
    .padStart(2, "0");
  const mm = Math.floor((sec % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const ss = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  const ms = Math.floor((sec - Math.floor(sec)) * 1000)
    .toString()
    .padStart(3, "0");
  return `${hh}:${mm}:${ss},${ms}`;
}

export function renderSrt(variant: VideoVariant): string {
  const lines: string[] = [];
  variant.scenes.forEach((s, i) => {
    lines.push(`${i + 1}`);
    lines.push(`${tsLine(s.startSec)} --> ${tsLine(s.endSec)}`);
    lines.push(s.narration);
    if (s.onScreenText) lines.push(`[overlay: ${s.onScreenText}]`);
    lines.push("");
  });
  return lines.join("\n");
}
