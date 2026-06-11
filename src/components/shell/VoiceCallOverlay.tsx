"use client";

import type { SharedHistory } from "@/components/experience/ChatDock";
import { pickVoice, probeOnPrem, speechLangFor, stripForSpeech } from "@/lib/hooks/useVoice";
import { useI18n } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/messages";
import { useCallback, useEffect, useRef, useState } from "react";

/** Full-screen voice conversation — the ChatGPT-call experience: an animated
 *  orb, no transcripts, a continuous listen → think → speak loop with
 *  barge-in (speaking pauses the moment the user starts talking). Audio goes
 *  to the on-prem transcriber when configured, browser engine otherwise. */

type Phase = "listening" | "thinking" | "speaking" | "paused";

interface AskResponse {
  kind?: "prepare" | "compare" | "general";
  iso3?: string;
  answer?: string | null;
  abstained?: boolean;
}

// ---- per-utterance capture with simple energy-based endpointing ----------

const SILENCE_MS = 1400; // stop this long after speech was last heard
const NO_SPEECH_MS = 8000; // give up if nothing was said at all
const MAX_UTTERANCE_MS = 20_000;
const RMS_THRESHOLD = 0.015;
// Barge-in: require sustained, louder speech so playback echo or background
// noise doesn't cut the assistant off (AEC handles most of it; this is the
// second line of defence).
const BARGE_RMS_THRESHOLD = 0.03;
const BARGE_SUSTAIN_MS = 300;

interface CaptureHandle {
  done: Promise<Blob | null>;
  cancel: () => void;
}

function captureUtterance(stream: MediaStream): CaptureHandle {
  const recorder = new MediaRecorder(stream);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const audioCtx = new AudioContext();
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  audioCtx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);

  let spoke = false;
  let cancelled = false;
  let silentMs = 0;
  let elapsedMs = 0;

  const done = new Promise<Blob | null>((resolve) => {
    const tick = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const rms = Math.sqrt(sum / buf.length);
      elapsedMs += 100;
      if (rms > RMS_THRESHOLD) {
        spoke = true;
        silentMs = 0;
      } else if (spoke) {
        silentMs += 100;
      }
      const giveUp = !spoke && elapsedMs >= NO_SPEECH_MS;
      const endOfSpeech = spoke && silentMs >= SILENCE_MS;
      if (giveUp || endOfSpeech || elapsedMs >= MAX_UTTERANCE_MS) {
        if (recorder.state === "recording") recorder.stop();
      }
    }, 100);

    recorder.onstop = () => {
      window.clearInterval(tick);
      void audioCtx.close().catch(() => {});
      if (cancelled || !spoke) {
        resolve(null);
        return;
      }
      resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
    };
    recorder.start();
  });

  return {
    done,
    cancel: () => {
      cancelled = true;
      if (recorder.state === "recording") recorder.stop();
    },
  };
}

/** Watches the mic while the assistant speaks; resolves true on sustained
 *  user speech (barge-in), false when cancelled. */
function watchForSpeech(stream: MediaStream): { detected: Promise<boolean>; cancel: () => void } {
  const audioCtx = new AudioContext();
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  audioCtx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  let loudMs = 0;
  let stop: (() => void) | null = null;

  const detected = new Promise<boolean>((resolve) => {
    const tick = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const rms = Math.sqrt(sum / buf.length);
      loudMs = rms > BARGE_RMS_THRESHOLD ? loudMs + 100 : 0;
      if (loudMs >= BARGE_SUSTAIN_MS) {
        stop?.();
        resolve(true);
      }
    }, 100);
    stop = () => {
      window.clearInterval(tick);
      void audioCtx.close().catch(() => {});
    };
  });

  return {
    detected,
    cancel: () => {
      stop?.();
    },
  };
}

// ---- single-shot browser recognition (fallback when no on-prem STT) -------

interface SpeechRec {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult:
    | ((e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}

function webSpeechOnce(locale: Locale): { done: Promise<string | null>; cancel: () => void } {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return { done: Promise.resolve(null), cancel: () => {} };
  const rec = new Ctor();
  rec.lang = speechLangFor(locale);
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  let result: string | null = null;
  const done = new Promise<string | null>((resolve) => {
    rec.onresult = (e) => {
      result = e.results?.[0]?.[0]?.transcript ?? null;
    };
    rec.onerror = () => resolve(result);
    rec.onend = () => resolve(result);
    rec.start();
  });
  return { done, cancel: () => rec.abort() };
}

function speakAsync(text: string, locale: Locale): { done: Promise<void>; cancel: () => void } {
  const synth = window.speechSynthesis;
  if (!synth || !text.trim()) return { done: Promise.resolve(), cancel: () => {} };
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = speechLangFor(locale);
  const voice = pickVoice(locale);
  if (voice) {
    utter.voice = voice;
    utter.lang = voice.lang;
  }
  const done = new Promise<void>((resolve) => {
    utter.onend = () => resolve();
    utter.onerror = () => resolve();
  });
  synth.speak(utter);
  return { done, cancel: () => synth.cancel() };
}

// ---- the overlay -----------------------------------------------------------

export function VoiceCallOverlay({
  onClose,
  sessionId,
  sharedHistory,
}: {
  onClose: () => void;
  /** Shared with the chat panel so both modes are one conversation. */
  sessionId?: string;
  sharedHistory?: SharedHistory;
}) {
  const { t, locale } = useI18n();
  const c = t.shell.call;
  const [phase, setPhase] = useState<Phase>("listening");
  const [error, setError] = useState<string | null>(null);

  const runningRef = useRef(true);
  const pausedRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const ownHistoryRef = useRef<SharedHistory>([]);
  const historyRef = useRef<SharedHistory>(sharedHistory ?? ownHistoryRef.current);
  const sessionIdRef = useRef(
    sessionId ??
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? `call-${crypto.randomUUID()}`
        : `call-${Math.random().toString(36).slice(2)}`),
  );

  const endCall = useCallback(() => {
    runningRef.current = false;
    cancelRef.current?.();
    window.speechSynthesis?.cancel();
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") endCall();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [endCall]);

  useEffect(() => {
    let alive = true;
    const history = historyRef.current;

    async function listenOnce(onPrem: boolean): Promise<string | null> {
      if (onPrem && streamRef.current) {
        const cap = captureUtterance(streamRef.current);
        cancelRef.current = cap.cancel;
        const blob = await cap.done;
        cancelRef.current = null;
        if (!blob || !runningRef.current) return null;
        setPhase("thinking");
        const fd = new FormData();
        fd.set("file", blob, "audio.webm");
        fd.set("language", locale);
        const res = await fetch("/api/voice/transcribe", { method: "POST", body: fd });
        if (!res.ok) return null;
        const data = (await res.json()) as { text?: string };
        return (data.text ?? "").trim() || null;
      }
      const rec = webSpeechOnce(locale);
      cancelRef.current = rec.cancel;
      const text = await rec.done;
      cancelRef.current = null;
      return text?.trim() || null;
    }

    async function askOnce(q: string): Promise<AskResponse | null> {
      try {
        const res = await fetch("/api/chat/ask", {
          method: "POST",
          headers: { "content-type": "application/json", "x-session-id": sessionIdRef.current },
          body: JSON.stringify({ question: q, history: history.slice(-6) }),
        });
        if (!res.ok) return null;
        return (await res.json()) as AskResponse;
      } catch {
        return null;
      }
    }

    /** Speak with barge-in: cancelled the moment sustained user speech is
     *  heard. Returns true if the user interrupted. */
    async function speakWithBargeIn(text: string): Promise<boolean> {
      setPhase("speaking");
      const s = speakAsync(text, locale);
      const watcher = streamRef.current ? watchForSpeech(streamRef.current) : null;
      cancelRef.current = () => {
        s.cancel();
        watcher?.cancel();
      };
      const interrupted = await Promise.race([
        s.done.then(() => false),
        watcher ? watcher.detected : new Promise<boolean>(() => {}),
      ]);
      s.cancel();
      watcher?.cancel();
      cancelRef.current = null;
      return interrupted === true;
    }

    async function run() {
      let onPrem = false;
      try {
        onPrem = await probeOnPrem();
        if (onPrem) {
          // AEC/noise suppression matter: the mic stays open during playback
          // for barge-in, and must not hear the assistant's own voice.
          streamRef.current = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          });
        }
      } catch {
        setError(t.chat.voiceErrors["not-allowed"]);
        return;
      }
      while (runningRef.current && alive) {
        if (pausedRef.current) {
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }
        setPhase("listening");
        const text = await listenOnce(onPrem);
        if (!runningRef.current || !alive) break;
        if (!text) continue;
        setPhase("thinking");
        history.push({ role: "user", content: text });
        let res = await askOnce(text);
        if (!runningRef.current || !alive) break;
        // Stay in the call: a "prepare" classification becomes a spoken
        // overview instead of navigating away mid-conversation.
        if (res?.kind === "prepare" && res.iso3) {
          res = await askOnce(
            `Give a concise spoken overview of ${res.iso3} for a UAE leadership meeting: key economic facts, top cooperation opportunities, main risks.`,
          );
          if (!runningRef.current || !alive) break;
        }
        let reply: string = c.fallback;
        if (res?.answer && !res.abstained) reply = stripForSpeech(res.answer);
        const interrupted = await speakWithBargeIn(reply);
        history.push({
          role: "assistant",
          content: interrupted ? `${reply} [interrupted by user]` : reply,
        });
      }
    }

    void run();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function togglePause() {
    pausedRef.current = !pausedRef.current;
    if (pausedRef.current) {
      cancelRef.current?.();
      window.speechSynthesis?.cancel();
      setPhase("paused");
    } else {
      setPhase("listening");
    }
  }

  const orbAnim =
    phase === "listening"
      ? "animate-pulse [animation-duration:2.2s]"
      : phase === "speaking"
        ? "animate-pulse [animation-duration:0.9s]"
        : phase === "thinking"
          ? ""
          : "opacity-60";

  return (
    <div
      role="dialog"
      aria-label={c.title}
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-ink-50/95 backdrop-blur-2xl"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(45% 40% at 50% 45%, rgba(146,114,42,0.25), transparent 70%)",
        }}
      />

      {/* The orb */}
      <div className="relative grid place-items-center">
        {phase === "listening" && (
          <>
            <span className="absolute h-56 w-56 animate-ping rounded-full bg-ae-gold/15 [animation-duration:2.8s]" />
            <span className="absolute h-44 w-44 animate-ping rounded-full bg-ae-gold/20 [animation-duration:2.1s]" />
          </>
        )}
        {phase === "speaking" && (
          <span className="absolute h-48 w-48 animate-ping rounded-full bg-tamm-cyan/20 [animation-duration:1.1s]" />
        )}
        {phase === "thinking" && (
          <span className="absolute h-44 w-44 animate-spin rounded-full border-4 border-ae-gold/10 border-t-ae-gold/70 [animation-duration:1.4s]" />
        )}
        <div
          className={`grid h-36 w-36 place-items-center rounded-full bg-gradient-to-br from-ae-gold via-ae-goldDark to-ink-800 shadow-pop transition-transform duration-500 ${orbAnim} ${
            phase === "speaking" ? "scale-110" : "scale-100"
          }`}
        >
          <span className="text-5xl text-white/90" aria-hidden>
            ✦
          </span>
        </div>
      </div>

      {/* One status word — the only text on screen */}
      <p aria-live="polite" className="mt-10 text-sm font-medium tracking-wide text-ink-500">
        {error ?? c[phase]}
      </p>

      {/* Call controls */}
      <div className="mt-12 flex items-center gap-6">
        <button
          type="button"
          onClick={togglePause}
          className={`grid h-14 w-14 place-items-center rounded-full border text-xl transition ${
            phase === "paused"
              ? "border-ae-gold bg-ae-gold/15 text-ae-gold"
              : "border-ink-200 bg-ink-100 text-ink-700 hover:bg-ink-150"
          }`}
          aria-label={phase === "paused" ? c.resume : c.mute}
          title={phase === "paused" ? c.resume : c.mute}
        >
          <span aria-hidden>{phase === "paused" ? "🎙️" : "🔇"}</span>
        </button>
        <button
          type="button"
          onClick={endCall}
          className="grid h-16 w-16 place-items-center rounded-full bg-signal-risk text-2xl text-white shadow-pop transition hover:brightness-110"
          aria-label={c.end}
          title={c.end}
        >
          <span aria-hidden>✕</span>
        </button>
      </div>
    </div>
  );
}
