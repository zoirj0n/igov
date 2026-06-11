"use client";

import type { Locale } from "@/lib/i18n/messages";
import { useCallback, useEffect, useRef, useState } from "react";

// Minimal Web Speech API shapes (not in the standard TS DOM lib).
interface SpeechRecEvent {
  results: { [i: number]: { [j: number]: { transcript: string } } };
}
interface SpeechRecErrorEvent {
  error?: string;
}
interface SpeechRec {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechRecEvent) => void) | null;
  onerror: ((e: SpeechRecErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

function speechRecCtor(): (new () => SpeechRec) | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

const SPEECH_LANG: Record<Locale, string> = { en: "en-US", ar: "ar-AE" };

/** BCP-47 speech tag for a UI locale (recognition + synthesis). */
export function speechLangFor(locale: Locale): string {
  return SPEECH_LANG[locale];
}
// Some engines reject ar-AE for recognition; retried once with this.
const SPEECH_LANG_FALLBACK: Record<Locale, string> = { en: "en-US", ar: "ar-SA" };

export type SpeechInputErrorCode =
  | "not-allowed"
  | "insecure-context"
  | "no-speech"
  | "audio-capture"
  | "network"
  | "language-not-supported"
  | "aborted"
  | "unknown";

/** Mic capture hard-fails on non-secure origins (any host that isn't
 *  localhost or HTTPS) no matter what the site permission says — detect it
 *  up front so the user gets the real reason, not "blocked". */
function insecureContext(): boolean {
  return typeof window !== "undefined" && window.isSecureContext === false;
}

function normalizeRecError(raw: string | undefined): SpeechInputErrorCode {
  switch (raw) {
    case "not-allowed":
    case "service-not-allowed":
      return "not-allowed";
    case "no-speech":
      return "no-speech";
    case "audio-capture":
      return "audio-capture";
    case "network":
      return "network";
    case "language-not-supported":
      return "language-not-supported";
    case "aborted":
      return "aborted";
    default:
      return "unknown";
  }
}

/** Dictation via the browser's speech-recognition engine.
 *  NOTE: Chrome's engine is cloud-backed — voice audio leaves the device.
 *  Acceptable for demo; on-prem STT is tracked separately (TODO-032). */
export function useSpeechInput(
  locale: Locale,
  onResult: (transcript: string) => void,
  onError?: (code: SpeechInputErrorCode) => void,
) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    setSupported(Boolean(speechRecCtor()));
    return () => recRef.current?.abort();
  }, []);

  const start = useCallback(() => {
    const Ctor = speechRecCtor();
    if (!Ctor) return;
    if (insecureContext()) {
      onErrorRef.current?.("insecure-context");
      return;
    }
    // A stale instance (engine never fired onend) must not block restarts.
    recRef.current?.abort();

    const launch = (lang: string, retryOnBadLang: boolean) => {
      const rec = new Ctor();
      recRef.current = rec;
      rec.lang = lang;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      setListening(true);
      rec.onresult = (e) => {
        const transcript = e.results?.[0]?.[0]?.transcript ?? "";
        if (transcript) onResultRef.current(transcript);
      };
      rec.onerror = (e) => {
        recRef.current = null;
        setListening(false);
        const code = normalizeRecError(e?.error);
        // Raw engine error in the console for diagnosis — names only, no audio/PII.
        console.warn("[voice] speech recognition error:", e?.error ?? "(none)");
        if (code === "language-not-supported" && retryOnBadLang) {
          launch(SPEECH_LANG_FALLBACK[locale], false);
          return;
        }
        if (code !== "aborted") onErrorRef.current?.(code);
      };
      rec.onend = () => {
        recRef.current = null;
        setListening(false);
      };
      try {
        rec.start();
      } catch {
        recRef.current = null;
        setListening(false);
        onErrorRef.current?.("unknown");
      }
    };

    launch(SPEECH_LANG[locale], locale === "ar");
  }, [locale]);

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  return { supported, listening, start, stop };
}

const RECORD_LIMIT_MS = 30_000;

/** Push-to-toggle dictation captured with MediaRecorder and transcribed by the
 *  on-prem Whisper proxy (/api/voice/transcribe) — audio never leaves the
 *  deployment. Same surface shape as useSpeechInput. */
function useRecorderInput(
  locale: Locale,
  onResult: (transcript: string) => void,
  onError?: (code: SpeechInputErrorCode) => void,
) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Synchronous re-entrancy guard: start() awaits getUserMedia, so the
  // recorder-state check alone lets a fast double-click open a second stream
  // (orphaned recorder, mic left live). Set before the first await.
  const busyRef = useRef(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        typeof MediaRecorder !== "undefined" &&
        Boolean(navigator.mediaDevices?.getUserMedia),
    );
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const start = useCallback(async () => {
    if (busyRef.current) return;
    if (insecureContext()) {
      onErrorRef.current?.("insecure-context");
      return;
    }
    busyRef.current = true;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      busyRef.current = false;
      const name = err instanceof DOMException ? err.name : "";
      // Raw error name in the console for diagnosis — no audio/PII.
      console.warn("[voice] getUserMedia failed:", name || err);
      onErrorRef.current?.(
        name === "NotAllowedError" || name === "SecurityError"
          ? "not-allowed"
          : name === "NotFoundError" || name === "NotReadableError"
            ? "audio-capture"
            : "unknown",
      );
      return;
    }
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      recorderRef.current = null;
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      try {
        if (blob.size === 0) {
          onErrorRef.current?.("no-speech");
          return;
        }
        const fd = new FormData();
        fd.set("file", blob, "audio.webm");
        fd.set("language", locale);
        const res = await fetch("/api/voice/transcribe", { method: "POST", body: fd });
        if (!res.ok) {
          onErrorRef.current?.("network");
          return;
        }
        const data = (await res.json()) as { text?: string };
        const text = (data.text ?? "").trim();
        if (text) onResultRef.current(text);
        else onErrorRef.current?.("no-speech");
      } finally {
        busyRef.current = false;
        setListening(false);
      }
    };
    setListening(true);
    recorder.start();
    timerRef.current = setTimeout(stop, RECORD_LIMIT_MS);
  }, [locale, stop]);

  return { supported, listening, start, stop };
}

// Probe once per page load — server capability doesn't change mid-session,
// and remounts (locale switch, navigation) shouldn't re-fire it.
let onPremProbe: Promise<boolean> | null = null;
export function probeOnPrem(): Promise<boolean> {
  if (!onPremProbe) {
    onPremProbe = fetch("/api/voice/transcribe")
      .then(async (r) => (r.ok ? r.json() : { enabled: false }))
      .then((d: { enabled?: boolean }) => Boolean(d.enabled))
      .catch(() => false);
  }
  return onPremProbe;
}

/** Voice input that prefers the on-prem transcriber when the server has one
 *  configured (data residency), falling back to the browser engine. */
export function useVoiceInput(
  locale: Locale,
  onResult: (transcript: string) => void,
  onError?: (code: SpeechInputErrorCode) => void,
) {
  const [onPrem, setOnPrem] = useState(false);
  useEffect(() => {
    let cancelled = false;
    probeOnPrem().then((enabled) => {
      if (!cancelled) setOnPrem(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const web = useSpeechInput(locale, onResult, onError);
  const recorder = useRecorderInput(locale, onResult, onError);
  const active = onPrem && recorder.supported ? recorder : web;
  return { ...active, onPrem: onPrem && recorder.supported };
}

/** Rank synthesis voices: natural/neural cloud voices first, novelty last.
 *  The naive "first voice whose lang matches" pick lands on whatever sorts
 *  first (often a robotic novelty voice) — score instead. */
export function rankVoice(v: SpeechSynthesisVoice, locale: Locale): number {
  const lang = v.lang.toLowerCase().replace("_", "-");
  const want = SPEECH_LANG[locale].toLowerCase();
  const prefix = locale === "ar" ? "ar" : "en";
  let score = 0;
  if (lang === want) score += 4;
  else if (lang.startsWith(`${prefix}-`) || lang === prefix) score += 2;
  else return -1; // wrong language entirely
  const name = v.name.toLowerCase();
  if (/natural|neural|premium|enhanced/.test(name)) score += 4;
  if (name.includes("google") || name.includes("microsoft")) score += 3;
  if (!v.localService) score += 1; // network voices are usually the better tier
  if (v.default) score += 1;
  // Known macOS novelty voices — actively avoid.
  if (
    /albert|bad news|bahh|bells|boing|bubbles|cellos|jester|organ|superstar|trinoids|whisper|wobble|zarvox/.test(
      name,
    )
  )
    score -= 10;
  return score;
}

export function pickVoice(locale: Locale): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  let best: SpeechSynthesisVoice | undefined;
  let bestScore = 0;
  for (const v of voices) {
    const s = rankVoice(v, locale);
    if (s > bestScore) {
      best = v;
      bestScore = s;
    }
  }
  return best;
}

/** Text-to-speech via the OS speech engine (fully local). */
export function useSpeakAloud(locale: Locale) {
  const [speaking, setSpeaking] = useState(false);

  // getVoices() is empty until the engine's async voice list loads; the
  // voiceschanged listener makes sure a later speak() sees the full list.
  useEffect(() => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!synth) return;
    const warm = () => synth.getVoices();
    warm();
    synth.addEventListener?.("voiceschanged", warm);
    return () => {
      synth.removeEventListener?.("voiceschanged", warm);
      synth.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis || !text.trim()) return;
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = SPEECH_LANG[locale];
      const voice = pickVoice(locale);
      if (voice) {
        utter.voice = voice;
        utter.lang = voice.lang;
      }
      utter.rate = 1;
      utter.onend = () => setSpeaking(false);
      utter.onerror = () => setSpeaking(false);
      setSpeaking(true);
      window.speechSynthesis.speak(utter);
    },
    [locale],
  );

  return { speaking, speak, stop };
}

/** Strip markdown chrome so TTS reads prose, not syntax. */
export function stripForSpeech(markdown: string): string {
  return markdown
    .replace(/^\s*\[CLASSIFICATION:[^\]]*\]\s*/i, "") // server header, not speech
    .replace(/```[\s\S]*?```/g, " ") // code blocks
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → label
    .replace(/^#{1,6}\s+/gm, "") // headings
    .replace(/^\s*[|].*$/gm, " ") // table rows
    .replace(/^\s*[-*+]\s+/gm, "") // list bullets
    .replace(/(\*\*|__|\*|_|~~)/g, "") // emphasis
    .replace(/\s+/g, " ")
    .trim();
}
