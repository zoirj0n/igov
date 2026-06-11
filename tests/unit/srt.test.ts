import type { VideoVariant } from "@/services/video/script";
import { renderSrt } from "@/services/video/srt";
import { describe, expect, it } from "vitest";

const sample: VideoVariant = {
  id: "v_test",
  style: "executive",
  title: "Test",
  hook: "Hook here",
  classification: "internal",
  confidence: "med",
  citations: ["World Bank, 2025"],
  scenes: [
    {
      index: 0,
      startSec: 0,
      endSec: 5,
      visual: "X",
      onScreenText: "Open",
      narration: "First scene narration.",
      source: "World Bank, 2025",
    },
    {
      index: 1,
      startSec: 5,
      endSec: 12,
      visual: "Y",
      onScreenText: "",
      narration: "Second scene narration.",
      source: undefined,
    },
  ],
};

describe("SRT renderer", () => {
  it("emits HH:MM:SS,mmm timestamps and indexed cues", () => {
    const out = renderSrt(sample);
    expect(out).toContain("1\n00:00:00,000 --> 00:00:05,000");
    expect(out).toContain("First scene narration.");
    expect(out).toContain("[overlay: Open]");
    expect(out).toContain("2\n00:00:05,000 --> 00:00:12,000");
    expect(out).toContain("Second scene narration.");
  });

  it("skips overlay annotation when empty", () => {
    const out = renderSrt(sample);
    const secondCue = out.split("\n\n")[1] ?? "";
    expect(secondCue).not.toContain("[overlay:");
  });
});
