import { getCurrentUser } from "@/lib/auth/server";
import { logAudit } from "@/services/audit";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** On-prem speech-to-text proxy (TODO-032). Forwards captured audio to a
 *  self-hosted OpenAI-compatible transcription server (speaches /
 *  faster-whisper / whisper.cpp), keeping voice audio inside the deployment —
 *  unlike the browser Web Speech engine, which is cloud-backed in Chrome.
 *  Transcript content is never logged (no PII in logs). */

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const ALLOWED_LANGS = new Set(["ar", "en"]);

function whisperUrl(): string | undefined {
  return process.env.WHISPER_URL || undefined;
}

/** Capability probe: the client uses this to pick on-prem STT over Web Speech. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  return NextResponse.json({ enabled: Boolean(whisperUrl()) });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const base = whisperUrl();
  if (!base) {
    return NextResponse.json({ error: "on-prem transcription not configured" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart form data" }, { status: 400 });
  }
  const file = form.get("file") as Blob | string | null;
  // Duck-typed: instanceof Blob fails across realms (undici File vs global Blob).
  const isBlob =
    file !== null &&
    typeof file === "object" &&
    typeof file.size === "number" &&
    typeof file.arrayBuffer === "function";
  if (!isBlob || file.size === 0) {
    return NextResponse.json({ error: "missing audio file" }, { status: 400 });
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "audio too large" }, { status: 413 });
  }
  const langRaw = form.get("language");
  const language = typeof langRaw === "string" && ALLOWED_LANGS.has(langRaw) ? langRaw : undefined;

  const upstream = new FormData();
  upstream.set("file", file, "audio.webm");
  upstream.set("model", process.env.WHISPER_MODEL ?? "Systran/faster-whisper-small");
  if (language) upstream.set("language", language);

  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/v1/audio/transcriptions`, {
      method: "POST",
      body: upstream,
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      logAudit(user, "voice.transcribe.error", "voice", {
        meta: { status: res.status },
      });
      return NextResponse.json({ error: "transcription failed" }, { status: 502 });
    }
    const data = (await res.json()) as { text?: string };
    logAudit(user, "voice.transcribe.ok", "voice", {
      meta: { bytes: file.size, language: language ?? "auto" },
    });
    return NextResponse.json({ text: data.text ?? "" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "transcription error";
    logAudit(user, "voice.transcribe.error", "voice", { meta: { error: message } });
    return NextResponse.json({ error: "transcription service unreachable" }, { status: 502 });
  }
}
