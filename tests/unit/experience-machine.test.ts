import {
  type ExperienceState,
  FOCUS_VIEWS,
  hashFor,
  initialState,
  parseHash,
  reduce,
} from "@/lib/experience/machine";
import { describe, expect, it } from "vitest";

const BRA = { iso3: "BRA", name: "Brazil", flag: "🇧🇷" };

describe("experience machine", () => {
  it("opens and closes the picker only from landing", () => {
    const open = reduce(initialState, { type: "OPEN_PICKER" });
    expect(open.pickerOpen).toBe(true);
    const closed = reduce(open, { type: "CLOSE_PICKER" });
    expect(closed.pickerOpen).toBe(false);
    const running: ExperienceState = { ...initialState, view: { kind: "running" } };
    expect(reduce(running, { type: "OPEN_PICKER" }).pickerOpen).toBe(false);
  });

  it("selecting a country stores it and closes the picker", () => {
    const s = reduce(reduce(initialState, { type: "OPEN_PICKER" }), {
      type: "SELECT_COUNTRY",
      country: BRA,
    });
    expect(s.country).toEqual(BRA);
    expect(s.pickerOpen).toBe(false);
  });

  it("BEGIN requires a country and moves landing → running", () => {
    expect(reduce(initialState, { type: "BEGIN" }).view.kind).toBe("landing");
    const withCountry = { ...initialState, country: BRA };
    const s = reduce(withCountry, { type: "BEGIN" });
    expect(s.view.kind).toBe("running");
    expect(s.runId).toBeNull();
  });

  it("RUN_SAVED stores the id; RUN_DONE lands on ready/overview", () => {
    let s: ExperienceState = { ...initialState, country: BRA, view: { kind: "running" } };
    s = reduce(s, { type: "RUN_SAVED", runId: "run-1" });
    expect(s.runId).toBe("run-1");
    s = reduce(s, { type: "RUN_DONE" });
    expect(s.view).toEqual({ kind: "ready", focus: "overview" });
  });

  it("SET_FOCUS only applies in ready", () => {
    const ready: ExperienceState = {
      ...initialState,
      country: BRA,
      runId: "run-1",
      view: { kind: "ready", focus: "overview" },
    };
    expect(reduce(ready, { type: "SET_FOCUS", focus: "brief" }).view).toEqual({
      kind: "ready",
      focus: "brief",
    });
    expect(reduce(initialState, { type: "SET_FOCUS", focus: "brief" }).view.kind).toBe("landing");
  });

  it("HYDRATE_READY restores a full ready state; RESET keeps the chosen role", () => {
    const s = reduce(initialState, {
      type: "HYDRATE_READY",
      runId: "run-9",
      focus: "sources",
      country: BRA,
      role: { key: "trade" },
    });
    expect(s.view).toEqual({ kind: "ready", focus: "sources" });
    expect(s.runId).toBe("run-9");
    const r = reduce({ ...s, role: { key: "trade" } }, { type: "RESET" });
    expect(r.view.kind).toBe("landing");
    expect(r.country).toBeNull();
    expect(r.role).toEqual({ key: "trade" });
  });

  it("hash codec round-trips and rejects junk", () => {
    const ready: ExperienceState = {
      ...initialState,
      runId: "run-ab12",
      view: { kind: "ready", focus: "opportunities" },
    };
    expect(hashFor(ready)).toBe("#run=run-ab12&focus=opportunities");
    expect(hashFor({ ...ready, view: { kind: "ready", focus: "overview" } })).toBe("#run=run-ab12");
    expect(hashFor(initialState)).toBe("");
    expect(parseHash("#run=run-ab12&focus=opportunities")).toEqual({
      runId: "run-ab12",
      focus: "opportunities",
    });
    expect(parseHash("run=run-ab12&focus=nonsense")).toEqual({
      runId: "run-ab12",
      focus: "overview",
    });
    expect(parseHash("#focus=brief")).toBeNull();
    expect(parseHash("")).toBeNull();
    expect(FOCUS_VIEWS).toContain("overview");
    expect(FOCUS_VIEWS).toContain("counterpart");
    expect(parseHash("#run=r1&focus=counterpart")).toEqual({ runId: "r1", focus: "counterpart" });
    expect(FOCUS_VIEWS).toContain("trade");
    expect(parseHash("#run=r1&focus=profile")).toEqual({ runId: "r1", focus: "profile" });
  });
});
