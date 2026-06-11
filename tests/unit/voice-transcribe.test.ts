// @vitest-environment node
import type { AuthUser } from "@/lib/auth/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/services/audit", () => ({ logAudit: mocks.logAudit }));

import { GET, POST } from "@/app/api/voice/transcribe/route";

const analyst: AuthUser = {
  sub: "u1",
  email: "analyst@example.gov.ae",
  name: "Analyst",
  role: "analyst",
  clearance: "internal",
};

function audioRequest(opts?: { language?: string; bytes?: number }): Request {
  const fd = new FormData();
  fd.set("file", new Blob([new Uint8Array(opts?.bytes ?? 1024)], { type: "audio/webm" }), "a.webm");
  if (opts?.language) fd.set("language", opts.language);
  return new Request("http://test/api/voice/transcribe", { method: "POST", body: fd });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(analyst);
  process.env.WHISPER_URL = "http://whisper:8000";
});

afterEach(() => {
  delete process.env.WHISPER_URL;
  vi.unstubAllGlobals();
});

describe("GET /api/voice/transcribe", () => {
  it("reports enabled when WHISPER_URL is set", async () => {
    const res = await GET();
    expect(await res.json()).toEqual({ enabled: true });
  });

  it("reports disabled when unset", async () => {
    delete process.env.WHISPER_URL;
    const res = await GET();
    expect(await res.json()).toEqual({ enabled: false });
  });

  it("rejects unauthenticated probes", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
});

describe("POST /api/voice/transcribe", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await POST(audioRequest())).status).toBe(401);
  });

  it("returns 503 when on-prem STT is not configured", async () => {
    delete process.env.WHISPER_URL;
    expect((await POST(audioRequest())).status).toBe(503);
  });

  it("rejects missing audio", async () => {
    const fd = new FormData();
    const res = await POST(
      new Request("http://test/api/voice/transcribe", { method: "POST", body: fd }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects oversized audio", async () => {
    const res = await POST(audioRequest({ bytes: 16 * 1024 * 1024 }));
    expect(res.status).toBe(413);
  });

  it("forwards audio to the whisper server and returns the transcript", async () => {
    const upstream = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: "جهزني لاجتماع البرازيل" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", upstream);
    const res = await POST(audioRequest({ language: "ar" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "جهزني لاجتماع البرازيل" });
    const [url, init] = upstream.mock.calls[0]!;
    expect(url).toBe("http://whisper:8000/v1/audio/transcriptions");
    expect((init.body as FormData).get("language")).toBe("ar");
    // Audit records bytes + language only — never the transcript content.
    const auditMeta = mocks.logAudit.mock.calls.find((c) => c[1] === "voice.transcribe.ok")?.[3]
      ?.meta;
    expect(auditMeta).toEqual({ bytes: 1024, language: "ar" });
  });

  it("maps upstream failure to 502 and audits without content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const res = await POST(audioRequest());
    expect(res.status).toBe(502);
    expect(mocks.logAudit.mock.calls.some((c) => c[1] === "voice.transcribe.error")).toBe(true);
  });

  it("maps an upstream timeout (AbortSignal) to 502", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError")),
    );
    const res = await POST(audioRequest());
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("transcription service unreachable");
  });
});
