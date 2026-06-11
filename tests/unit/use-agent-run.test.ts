import { useAgentRun } from "@/lib/hooks/useAgentRun";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_STATE, sseBody } from "../fixtures/agent-state";

function sseResponse(body: string): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(enc.encode(body));
      c.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useAgentRun", () => {
  it("parses trace, final and saved events from the stream", async () => {
    const body = `: connected\n\n${sseBody([
      { event: "trace", state: { ...FIXTURE_STATE, briefing: undefined } },
      { event: "final", state: FIXTURE_STATE },
      { event: "saved", runId: "run-test-1" },
    ])}`;
    const fetchMock = vi.fn(async () => sseResponse(body));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAgentRun());
    await act(async () => {
      await result.current.start("Prepare me for Brazil's Energy Minister", "energy");
    });

    await waitFor(() => {
      expect(result.current.final?.briefing?.title).toBe("Brazil — Energy Minister briefing");
      expect(result.current.runId).toBe("run-test-1");
      expect(result.current.running).toBe(false);
      expect(result.current.error).toBeNull();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agent/run",
      expect.objectContaining({ method: "POST" }),
    );
    const callArgs = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const sent = JSON.parse(callArgs[1].body as string);
    expect(sent).toEqual({ command: "Prepare me for Brazil's Energy Minister", role: "energy" });
  });

  it("surfaces error events and non-OK responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => sseResponse(sseBody([{ event: "error", message: "model offline" }]))),
    );
    const { result } = renderHook(() => useAgentRun());
    await act(async () => {
      await result.current.start("x y", "energy");
    });
    await waitFor(() => expect(result.current.error).toBe("model offline"));

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    const { result: r2 } = renderHook(() => useAgentRun());
    await act(async () => {
      await r2.current.start("x y", "energy");
    });
    await waitFor(() => expect(r2.current.error).toContain("boom"));
  });

  it("a stale aborted run cannot clear running for the new run", async () => {
    const enc = new TextEncoder();

    // Run 1: fetch that hangs until the AbortSignal fires, then rejects with AbortError.
    // This mirrors what a real fetch does when aborted mid-stream.
    const hanging = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new DOMException("The operation was aborted.", "AbortError");
          reject(err);
        });
      });

    // Run 2: immediately delivers a final frame then hangs (stream stays open).
    const finalThenHang = () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(enc.encode(sseBody([{ event: "final", state: FIXTURE_STATE }])));
          },
        }),
        { status: 200 },
      );

    const fetchMock = vi
      .fn()
      .mockImplementationOnce(hanging)
      .mockImplementationOnce(async () => finalThenHang());
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAgentRun());

    // Start run 1 (hangs — fetch never resolves until abort).
    let p1: Promise<void> = Promise.resolve();
    act(() => {
      p1 = result.current.start("a b", "energy");
    });

    // Start run 2: this aborts run 1's AbortController, so hanging() rejects immediately.
    await act(async () => {
      const p2 = result.current.start("c d", "energy");
      // p1 now resolves quickly because the abort signal fired and the fetch rejected.
      await p1;
      void p2;
    });

    // Run 2 delivered its final frame; wait for the state to propagate.
    await waitFor(() => expect(result.current.final).not.toBeNull());

    // Core assertion: run 1's finally must NOT have cleared running=true set by run 2.
    expect(result.current.running).toBe(true);

    // Clean up: abort run 2 so its open stream is torn down.
    act(() => result.current.abort());
  });

  it("reset clears all run state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => sseResponse(sseBody([{ event: "final", state: FIXTURE_STATE }]))),
    );
    const { result } = renderHook(() => useAgentRun());
    await act(async () => {
      await result.current.start("x y", "energy");
    });
    await waitFor(() => expect(result.current.final).not.toBeNull());
    act(() => result.current.reset());
    expect(result.current.state).toBeNull();
    expect(result.current.final).toBeNull();
    expect(result.current.runId).toBeNull();
  });

  it("includes counterpartName in the body when provided", async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse(sseBody([{ event: "final", state: FIXTURE_STATE }])),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAgentRun());
    await act(async () => {
      await result.current.start("x y", "custom", "Jane Doe");
    });
    const callArgs = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(callArgs[1].body as string)).toEqual({
      command: "x y",
      role: "custom",
      counterpartName: "Jane Doe",
    });
  });
});
