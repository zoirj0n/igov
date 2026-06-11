/**
 * Render a short video brief from scene frames + narration, fully on-prem:
 * macOS `say` for text-to-speech, `ffmpeg` for encoding. Each scene becomes a
 * still-image clip the length of its narration; clips are concatenated to MP4.
 *
 * No cloud, no API keys — matches the sovereign-AI posture. macOS-only (`say`);
 * a Piper fallback would make it portable but is out of scope.
 */
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const EXEC_OPTS = { maxBuffer: 16 * 1024 * 1024, timeout: 120_000 };

export interface VideoScene {
  png: Buffer;
  narration: string;
}

export async function renderVideoBrief(scenes: VideoScene[]): Promise<Buffer> {
  if (scenes.length === 0) throw new Error("no scenes");
  const dir = mkdtempSync(path.join(tmpdir(), "vbrief-"));
  try {
    const clips: string[] = [];
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i]!;
      const frame = path.join(dir, `f${i}.png`);
      const aiff = path.join(dir, `a${i}.aiff`);
      const clip = path.join(dir, `c${i}.mp4`);
      writeFileSync(frame, scene.png);
      // On-prem TTS → AIFF (ffmpeg reads AIFF natively).
      await exec("say", ["-o", aiff, scene.narration.slice(0, 1200)], EXEC_OPTS);
      // Still-image clip the length of the narration.
      await exec(
        "ffmpeg",
        [
          "-y",
          "-loglevel",
          "error",
          "-loop",
          "1",
          "-i",
          frame,
          "-i",
          aiff,
          "-c:v",
          "libx264",
          "-tune",
          "stillimage",
          "-c:a",
          "aac",
          "-b:a",
          "160k",
          "-pix_fmt",
          "yuv420p",
          "-vf",
          "scale=1280:720",
          "-shortest",
          clip,
        ],
        EXEC_OPTS,
      );
      clips.push(clip);
    }

    const listPath = path.join(dir, "list.txt");
    writeFileSync(listPath, clips.map((c) => `file '${c}'`).join("\n"));
    const out = path.join(dir, "out.mp4");
    await exec(
      "ffmpeg",
      [
        "-y",
        "-loglevel",
        "error",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        listPath,
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-pix_fmt",
        "yuv420p",
        out,
      ],
      EXEC_OPTS,
    );
    return readFileSync(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
