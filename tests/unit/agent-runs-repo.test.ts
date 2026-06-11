import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { __resetRunsForTest, getRun, listRuns, saveRun } from "@/services/repo/agent-runs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_STATE } from "../fixtures/agent-state";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ci-runs-"));
  vi.stubEnv("RUNS_DIR", dir);
  __resetRunsForTest();
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
  __resetRunsForTest();
});

describe("agent-runs repo", () => {
  it("saves and reads a run, writing one JSON file", () => {
    const rec = saveRun({
      command: FIXTURE_STATE.command,
      role: "energy",
      state: FIXTURE_STATE,
      createdBy: "exec@example.ae",
      durationMs: 1234,
    });
    expect(rec.id).toMatch(/^run-/);
    expect(rec.iso3).toBe("BRA");
    expect(rec.title).toBe("Brazil — Energy Minister briefing");
    expect(getRun(rec.id)?.state.briefing?.bluf).toContain("biofuels");
    expect(fs.readdirSync(dir)).toEqual([`${rec.id}.json`]);
  });

  it("lists newest-first summaries without the heavy state", () => {
    const a = saveRun({
      command: "a b",
      role: "energy",
      state: FIXTURE_STATE,
      createdBy: "u",
      durationMs: 1,
    });
    const b = saveRun({
      command: "c d",
      role: "trade",
      state: FIXTURE_STATE,
      createdBy: "u",
      durationMs: 1,
    });
    const list = listRuns(8);
    expect(list.length).toBe(2);
    expect(new Set(list.map((r) => r.id))).toEqual(new Set([a.id, b.id]));
    const order = [...list].sort((x, y) => y.createdAt.localeCompare(x.createdAt));
    expect(list).toEqual(order);
    expect(list[0]).not.toHaveProperty("state");
    expect(list[0]).toHaveProperty("classification", "internal");
  });

  it("reloads records from disk after a cold start", () => {
    const rec = saveRun({
      command: "a b",
      role: "energy",
      state: FIXTURE_STATE,
      createdBy: "u",
      durationMs: 1,
    });
    __resetRunsForTest();
    expect(getRun(rec.id)?.id).toBe(rec.id);
    expect(listRuns(8).length).toBe(1);
  });
});
