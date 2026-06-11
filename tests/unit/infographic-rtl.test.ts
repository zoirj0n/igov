import type { AgentState, Briefing } from "@/services/agent/state";
import { countryOnePagerSvg } from "@/services/export/infographic";
import { describe, expect, it } from "vitest";
import { FIXTURE_STATE } from "../fixtures/agent-state";

const LRI = "⁦";
const PDI = "⁩";

// Arabic brief whose talking point embeds an LTR value — the scramble case.
const arBriefing: Briefing = {
  ...(FIXTURE_STATE.briefing as Briefing),
  title: "إحاطة تنفيذية — البرازيل",
  bluf: "يجب على الوزير توسيع التعاون في الطاقة المتجددة (46.5%) مع البرازيل.",
  whyNow: "النمو المتوقع مرتفع.",
  talkingPoints: ["حصة الطاقة المتجددة تبلغ 46.5% وهي فرصة كبيرة."],
  heroMetric: { label: "الناتج المحلي المتوقع", value: "$2.29 trillion", delta: "▲ 4.8%" },
};

const arState: AgentState = { ...FIXTURE_STATE, briefingAr: arBriefing };

describe("one-pager RTL bidi", () => {
  it("isolates LTR runs embedded in Arabic text (numbers stay intact)", () => {
    const svg = countryOnePagerSvg(arState, { locale: "ar" });
    expect(svg).toContain(`${LRI}46.5%${PDI}`);
  });

  it("does not force direction=rtl on a pure-LTR value like the hero metric", () => {
    const svg = countryOnePagerSvg(arState, { locale: "ar" });
    // The hero value text element must carry the value without an rtl override.
    const idx = svg.indexOf("$2.29 trillion");
    expect(idx).toBeGreaterThan(0);
    const openTag = svg.lastIndexOf("<text", idx);
    const tag = svg.slice(openTag, idx);
    expect(tag).not.toContain('direction="rtl"');
  });

  it("leaves the English one-pager free of bidi isolates", () => {
    const svg = countryOnePagerSvg(FIXTURE_STATE, { locale: "en" });
    expect(svg).not.toContain(LRI);
    expect(svg).not.toContain(PDI);
  });
});
