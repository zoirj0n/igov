/**
 * Safety layer (spec §5d).
 *
 *   1. screenPassages   — detect prompt-injection markers in retrieved passages.
 *                          Suspicious passages are flagged; caller can drop / wrap.
 *   2. piiRedact         — remove PII patterns from output text. Aggressiveness
 *                          scales with classification (public = redact more).
 *   3. outputSafety      — final guardrail on assistant output: strip control
 *                          chars, prompt-injection echoes, classify result.
 */

import type { Classification } from "@/types";

// ─── Injection screen ──────────────────────────────────────────────────────

/**
 * Regex set for prompt-injection markers commonly seen in adversarial docs.
 * Tuned for high precision over recall (we'd rather miss a sophisticated
 * attempt than nuke a legitimate passage that uses words like "system").
 */
const INJECTION_PATTERNS: { name: string; re: RegExp }[] = [
  {
    name: "ignore_previous",
    re: /\bignore (all |any |the )?(previous|prior|above|earlier) (instructions?|directives?|rules?|prompt)\b/i,
  },
  {
    name: "disregard_previous",
    re: /\b(disregard|forget) (all |any |the )?(previous|above|prior|earlier)\b/i,
  },
  { name: "fake_system", re: /<\|im_start\|>\s*system|<\s*system\s*>/i },
  { name: "fake_assistant", re: /<\|im_start\|>\s*assistant|^\s*assistant:/im },
  { name: "claude_role_hijack", re: /\b(human|user|assistant)\s*:\s*you (are|will be) (now|a)\b/i },
  { name: "jailbreak_dan", re: /\bDAN\b|\bdo anything now\b/i },
  {
    name: "credential_emit",
    re: /\b(reveal|output|print|share) (your |the )?(api[\s_-]?key|password|secret|token|credentials)/i,
  },
  { name: "tool_command", re: /\bexecute (the )?(following|next) (command|shell|code)\b/i },
  { name: "url_javascript", re: /javascript:\s*[a-z]/i },
  { name: "data_uri_html", re: /data:text\/html/i },
];

export interface InjectionFinding {
  passageId: string;
  patternName: string;
  excerpt: string;
}

export interface ScreenResult {
  cleanPassages: { id: string; text: string }[];
  flagged: InjectionFinding[];
}

export function screenPassages(passages: { id: string; text: string }[]): ScreenResult {
  const flagged: InjectionFinding[] = [];
  const clean: { id: string; text: string }[] = [];
  for (const p of passages) {
    let hit = false;
    for (const { name, re } of INJECTION_PATTERNS) {
      const m = p.text.match(re);
      if (m) {
        const matchStart = m.index ?? 0;
        const excerptStart = Math.max(0, matchStart - 20);
        // Clamp end to text length so the excerpt isn't asymmetric (start was
        // already floored at 0).
        const excerptEnd = Math.min(p.text.length, matchStart + m[0].length + 60);
        flagged.push({
          passageId: p.id,
          patternName: name,
          excerpt: p.text.slice(excerptStart, excerptEnd),
        });
        hit = true;
        break; // one finding per passage is enough to drop it
      }
    }
    if (!hit) clean.push(p);
  }
  return { cleanPassages: clean, flagged };
}

// ─── PII redaction ─────────────────────────────────────────────────────────

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_INTL_RE = /\+\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{2,4}[\s.-]?\d{0,4}/g;
const PHONE_LOCAL_RE = /\b0\d{1,3}[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/g;
const SSN_LIKE_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g;
const CREDIT_CARD_RE = /\b(?:\d[ -]?){13,19}\b/g;
const NATIONAL_ID_AE_RE = /\b784-\d{4}-\d{7}-\d\b/g; // UAE Emirates ID format

export interface PiiRedaction {
  kind: "email" | "phone" | "ssn" | "iban" | "credit_card" | "national_id";
  count: number;
}

export interface RedactResult {
  text: string;
  redactions: PiiRedaction[];
}

/**
 * Redact PII patterns. Aggressiveness:
 *   - public  → redact all PII
 *   - internal → redact emails, phones, IDs, financial
 *   - confidential → redact financial + IDs only (emails OK for named officials)
 *   - secret → redact financial only (names/contacts OK at this tier)
 */
export function piiRedact(text: string, classification: Classification): RedactResult {
  const redactions: PiiRedaction[] = [];
  let out = text;

  const should = {
    email: classification === "public" || classification === "internal",
    phone: classification === "public" || classification === "internal",
    ssn: true,
    iban: true,
    credit: true,
    nationalId: classification !== "secret",
  };

  function apply(
    re: RegExp,
    kind: PiiRedaction["kind"],
    placeholder: string,
    enabled: boolean,
  ): void {
    if (!enabled) return;
    const matches = out.match(re);
    if (matches && matches.length > 0) {
      redactions.push({ kind, count: matches.length });
      out = out.replace(re, placeholder);
    }
  }

  apply(EMAIL_RE, "email", "[REDACTED:email]", should.email);
  apply(PHONE_INTL_RE, "phone", "[REDACTED:phone]", should.phone);
  apply(PHONE_LOCAL_RE, "phone", "[REDACTED:phone]", should.phone);
  apply(NATIONAL_ID_AE_RE, "national_id", "[REDACTED:id]", should.nationalId);
  apply(SSN_LIKE_RE, "ssn", "[REDACTED:id]", should.ssn);
  apply(IBAN_RE, "iban", "[REDACTED:account]", should.iban);
  apply(CREDIT_CARD_RE, "credit_card", "[REDACTED:card]", should.credit);

  return { text: out, redactions };
}

// ─── Final output guardrail ────────────────────────────────────────────────

// Match actual C0 control chars (0x00-0x1F) + DEL (0x7F), preserving
// whitespace we keep (TAB \t = 0x09, LF \n = 0x0A, CR \r = 0x0D).
// The prior literal range /[ --]/ matched 0x20-0x2D (space + punct + digits)
// — a bypass: malicious output with embedded NUL/BS/ESC was not stripped.
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional - this regex's job is to strip control chars
const CONTROL_CHARS = new RegExp(
  "[" +
    "\x00-\x08" + // NUL..BS (skip TAB 0x09)
    "\x0B\x0C" + // VT, FF  (skip LF 0x0A)
    "\x0E-\x1F" + // SO..US  (skip CR 0x0D)
    "\x7F" + // DEL
    "]",
  "g",
);
export interface OutputSafetyResult {
  text: string;
  redactions: PiiRedaction[];
  echoedInjection: boolean;
}

/**
 * Final pass on assistant output before surfacing.
 * 1. Strip control characters.
 * 2. PII redact appropriate to classification.
 * 3. Detect whether output echoes an injection marker that slipped through.
 */
export function outputSafety(text: string, classification: Classification): OutputSafetyResult {
  let clean = text.replace(CONTROL_CHARS, "");
  const pii = piiRedact(clean, classification);
  clean = pii.text;
  // Quick echo check on output itself
  const echoedInjection = INJECTION_PATTERNS.some((p) => p.re.test(clean));
  return { text: clean, redactions: pii.redactions, echoedInjection };
}
