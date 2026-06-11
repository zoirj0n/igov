import type { RoleSelection } from "./roles";

export const FOCUS_VIEWS = [
  "overview",
  "brief",
  "counterpart",
  "opportunities",
  "trade",
  "compare",
  "forecast",
  "profile",
  "sources",
] as const;
export type FocusView = (typeof FOCUS_VIEWS)[number];

export interface CountryChoice {
  iso3: string;
  name: string;
  flag: string;
}

export type ViewState =
  | { kind: "landing" }
  | { kind: "running" }
  | { kind: "ready"; focus: FocusView };

export interface ExperienceState {
  view: ViewState;
  pickerOpen: boolean;
  country: CountryChoice | null;
  role: RoleSelection;
  runId: string | null;
}

export type ExperienceEvent =
  | { type: "OPEN_PICKER" }
  | { type: "CLOSE_PICKER" }
  | { type: "SELECT_COUNTRY"; country: CountryChoice }
  | { type: "SET_ROLE"; role: RoleSelection }
  | { type: "BEGIN" }
  | { type: "RUN_SAVED"; runId: string }
  | { type: "RUN_DONE" }
  | { type: "SET_FOCUS"; focus: FocusView }
  | {
      type: "HYDRATE_READY";
      runId: string;
      focus: FocusView;
      country: CountryChoice;
      role: RoleSelection;
    }
  | { type: "RESET" };

export const initialState: ExperienceState = {
  view: { kind: "landing" },
  pickerOpen: false,
  country: null,
  role: { key: "energy" },
  runId: null,
};

export function reduce(state: ExperienceState, event: ExperienceEvent): ExperienceState {
  switch (event.type) {
    case "OPEN_PICKER":
      return state.view.kind === "landing" ? { ...state, pickerOpen: true } : state;
    case "CLOSE_PICKER":
      return { ...state, pickerOpen: false };
    case "SELECT_COUNTRY":
      return { ...state, country: event.country, pickerOpen: false };
    case "SET_ROLE":
      return { ...state, role: event.role };
    case "BEGIN":
      if (state.view.kind !== "landing" || !state.country) return state;
      return { ...state, view: { kind: "running" }, runId: null };
    case "RUN_SAVED":
      return { ...state, runId: event.runId };
    case "RUN_DONE":
      return state.view.kind === "running"
        ? { ...state, view: { kind: "ready", focus: "overview" } }
        : state;
    case "SET_FOCUS":
      return state.view.kind === "ready"
        ? { ...state, view: { kind: "ready", focus: event.focus } }
        : state;
    case "HYDRATE_READY":
      return {
        view: { kind: "ready", focus: event.focus },
        pickerOpen: false,
        country: event.country,
        role: event.role,
        runId: event.runId,
      };
    case "RESET":
      return { ...initialState, role: state.role };
  }
}

/** URL-hash projection of the state — only saved, ready runs are addressable. */
export function hashFor(state: ExperienceState): string {
  if (state.view.kind !== "ready" || !state.runId) return "";
  return state.view.focus === "overview"
    ? `#run=${state.runId}`
    : `#run=${state.runId}&focus=${state.view.focus}`;
}

export function parseHash(hash: string): { runId: string; focus: FocusView } | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const runId = params.get("run");
  if (!runId) return null;
  const f = params.get("focus") ?? "overview";
  const focus = (FOCUS_VIEWS as readonly string[]).includes(f) ? (f as FocusView) : "overview";
  return { runId, focus };
}
