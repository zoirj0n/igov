/**
 * Sentence-aware text chunker.
 *
 * Approximates: 1 token ≈ 4 chars (Anthropic / OpenAI rule of thumb).
 * Target: ~500 tokens per chunk, ~50 tokens overlap.
 * Splits on sentence boundaries first; falls back to hard char window if
 * a single sentence exceeds the target size.
 */

export interface ChunkerOptions {
  targetTokens?: number; // default 500
  overlapTokens?: number; // default 50
  charsPerToken?: number; // default 4
}

export interface TextChunk {
  text: string;
  /** char offset in original text where this chunk starts */
  start: number;
  end: number;
}

const _SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z؀-ۿ])/g;

export function chunkText(text: string, opts: ChunkerOptions = {}): TextChunk[] {
  const targetTokens = opts.targetTokens ?? 500;
  const overlapTokens = opts.overlapTokens ?? 50;
  const cpt = opts.charsPerToken ?? 4;
  const targetChars = targetTokens * cpt;
  const overlapChars = overlapTokens * cpt;

  if (!text.trim()) return [];

  const sentences = splitSentences(text);
  const out: TextChunk[] = [];
  let buf: { text: string; start: number; end: number }[] = [];
  let bufLen = 0;

  function flushBuffer(): void {
    if (buf.length === 0) return;
    // length-guarded above, indices are safe.
    const start = (buf[0] as { start: number }).start;
    const end = (buf[buf.length - 1] as { end: number }).end;
    const merged = text.slice(start, end);
    out.push({ text: merged, start, end });
  }

  for (const s of sentences) {
    // Sentence alone larger than target → hard-split it
    if (s.text.length > targetChars) {
      flushBuffer();
      buf = [];
      bufLen = 0;
      let off = s.start;
      while (off < s.end) {
        const sliceEnd = Math.min(off + targetChars, s.end);
        out.push({ text: text.slice(off, sliceEnd), start: off, end: sliceEnd });
        if (sliceEnd >= s.end) break;
        off = sliceEnd - overlapChars; // step forward with overlap
        if (off <= 0) off = sliceEnd;
      }
      continue;
    }
    if (bufLen + s.text.length + 1 > targetChars && buf.length > 0) {
      flushBuffer();
      // start next buffer with overlap from tail of previous
      const tail = takeTail(buf, overlapChars);
      buf = tail;
      bufLen = tail.reduce((n, x) => n + x.text.length + 1, 0);
    }
    buf.push(s);
    bufLen += s.text.length + 1;
  }
  flushBuffer();
  return out;
}

interface Sent {
  text: string;
  start: number;
  end: number;
}

function splitSentences(text: string): Sent[] {
  const out: Sent[] = [];
  // Find every sentence-end position
  const re = /[^.!?\n]+(?:[.!?]+|$)/g;
  let m: RegExpExecArray | null = re.exec(text);
  while (m !== null) {
    const raw = m[0];
    if (raw.trim()) {
      out.push({ text: raw.trim(), start: m.index, end: m.index + raw.length });
    }
    if (re.lastIndex === m.index) re.lastIndex++; // safety
    m = re.exec(text);
  }
  return out;
}

function takeTail(buf: Sent[], maxChars: number): Sent[] {
  const out: Sent[] = [];
  let len = 0;
  for (let i = buf.length - 1; i >= 0; i--) {
    const s = buf[i]!;
    len += s.text.length + 1;
    out.unshift(s);
    if (len >= maxChars) break;
  }
  return out;
}
