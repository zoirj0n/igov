import { ForecastView } from "@/components/experience/ForecastView";
import { I18nProvider } from "@/lib/i18n/context";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_STATE } from "../fixtures/agent-state";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FORECAST_RESULT = {
  iso3: "BRA",
  metric: "gdp_usd_nominal",
  horizon: 5,
  series: [
    { year: 2022, value: 1.95e12, lower: 1.95e12, upper: 1.95e12, kind: "history" },
    { year: 2023, value: 2.14e12, lower: 2.14e12, upper: 2.14e12, kind: "history" },
    { year: 2024, value: 2.17e12, lower: 2.17e12, upper: 2.17e12, kind: "history" },
    { year: 2025, value: 2.25e12, lower: 2.1e12, upper: 2.4e12, kind: "forecast" },
    { year: 2026, value: 2.33e12, lower: 2.1e12, upper: 2.55e12, kind: "forecast" },
  ],
  alpha: 0.5,
  beta: 0.3,
  rmse: 1.2e10,
  confidence: "med",
  modelName: "Holt's linear trend",
};

describe("ForecastView", () => {
  it("renders (f) markers, scenario name, and model footer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(FORECAST_RESULT), { status: 200 })),
    );

    const { getAllByText, getByText } = render(
      <I18nProvider>
        <ForecastView state={FIXTURE_STATE} iso3="BRA" />
      </I18nProvider>,
    );

    await waitFor(() => {
      // (f) markers on forecast year ticks
      const fMarkers = getAllByText(/\(f\)/);
      expect(fMarkers.length).toBeGreaterThan(0);
      // Scenario name from FIXTURE_STATE.briefing.scenarios[0].name = "Base"
      expect(getByText("Base")).toBeTruthy();
      // Model footer
      expect(getByText(/Holt's linear trend/)).toBeTruthy();
    });
  });

  it("shows unavailable state on fetch failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "not found" }), { status: 404 })),
    );

    const { getByText } = render(
      <I18nProvider>
        <ForecastView state={FIXTURE_STATE} iso3="BRA" />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(getByText(/unavailable/i)).toBeTruthy();
    });
  });
});
