import type { AuthUser } from "@/lib/auth/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/services/audit", () => ({ logAudit: mocks.logAudit }));

import { POST } from "@/app/api/export/deck/route";

const analyst: AuthUser = {
  sub: "u1",
  email: "analyst@example.gov.ae",
  name: "Analyst",
  role: "analyst",
  clearance: "internal",
};

const validBody = {
  format: "pptx",
  briefing: {
    title: "UAE–Brazil Energy Brief",
    countryIso3: "bra",
    classification: "internal",
    body: "Deepen renewables cooperation.\n\nMinisterial visit in two weeks.",
    talkingPoints: ["Open with ethanol JV", "Raise port logistics"],
    risks: ["Currency volatility"],
    opportunities: ["Green hydrogen offtake — strong solar complementarity"],
    citations: ["World Bank WDI", "UN Comtrade"],
    confidence: "med",
  },
};

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://test/api/export/deck", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(analyst);
});

describe("POST /api/export/deck", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await post(validBody);
    expect(res.status).toBe(401);
  });

  it("denies below-clearance export and audits the denial", async () => {
    const res = await post({
      ...validBody,
      briefing: { ...validBody.briefing, classification: "secret" },
    });
    expect(res.status).toBe(403);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      analyst,
      "briefing.export.pptx.denied",
      "briefing",
      expect.objectContaining({ resourceId: "live:BRA", classification: "secret" }),
    );
  });

  it("rejects malformed payloads", async () => {
    const res = await post({ briefing: { title: "x" } });
    expect(res.status).toBe(400);
  });

  it("renders a PPTX deck from a live briefing and audits success", async () => {
    const res = await post(validBody);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    expect(res.headers.get("x-classification")).toBe("internal");
    expect(res.headers.get("content-disposition")).toContain(".pptx");
    const buf = Buffer.from(await res.arrayBuffer());
    // PPTX is a zip container — must start with the PK magic bytes.
    expect(buf.subarray(0, 2).toString("ascii")).toBe("PK");
    expect(buf.length).toBeGreaterThan(10_000);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      analyst,
      "briefing.export.pptx.ok",
      "briefing",
      expect.objectContaining({ resourceId: "live:BRA" }),
    );
  });

  it("renders an Arabic RTL deck when lang=ar", async () => {
    const res = await post({ ...validBody, lang: "ar" });
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 2).toString("ascii")).toBe("PK");
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(buf);
    const slideNames = Object.keys(zip.files).filter((n) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(n),
    );
    const xml = (
      await Promise.all(slideNames.map((n) => zip.files[n]!.async("string")))
    ).join("\n");
    expect(xml).toContain("نقاط الحديث");
    expect(xml).toContain('rtl="1"');
  });

  it("renders a PDF when format=pdf", async () => {
    const res = await post({ ...validBody, format: "pdf" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });
});
