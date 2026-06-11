"use client";

import type { AgentState } from "@/services/agent/state";
import { useCallback, useRef, useState } from "react";

export interface RunEvent {
  event: "trace" | "final" | "error" | "saved";
  state?: AgentState;
  message?: string;
  runId?: string;
}

export interface AgentRunHandle {
  running: boolean;
  /** Latest accumulated state (every trace frame carries the full object). */
  state: AgentState | null;
  final: AgentState | null;
  /** Persisted run record id, present once the server emits `saved`. */
  runId: string | null;
  error: string | null;
  start: (command: string, role: string, counterpartName?: string) => Promise<void>;
  abort: () => void;
  reset: () => void;
}

export function useAgentRun(): AgentRunHandle {
  const [running, setRunning] = useState(false);
  const [state, setState] = useState<AgentState | null>(null);
  const [final, setFinal] = useState<AgentState | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const genRef = useRef(0);

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    genRef.current++;
    setRunning(false);
    setState(null);
    setFinal(null);
    setRunId(null);
    setError(null);
  }, []);

  const start = useCallback(async (command: string, role: string, counterpartName?: string) => {
    abortRef.current?.abort();
    const gen = ++genRef.current;
    setRunning(true);
    setState(null);
    setFinal(null);
    setRunId(null);
    setError(null);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command, role, ...(counterpartName ? { counterpartName } : {}) }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `agent run failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        if (gen !== genRef.current) break;
        for (const frame of frames) {
          const line = frame.trim();
          if (!line.startsWith("data:")) continue;
          const ev = JSON.parse(line.slice(5).trim()) as RunEvent;
          if (ev.event === "trace" && ev.state) setState(ev.state);
          else if (ev.event === "final" && ev.state) {
            setState(ev.state);
            setFinal(ev.state);
          } else if (ev.event === "saved" && ev.runId) setRunId(ev.runId);
          else if (ev.event === "error") setError(ev.message ?? "agent error");
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (gen === genRef.current) setRunning(false);
    }
  }, []);

  return { running, state, final, runId, error, start, abort, reset };
}
