import { CompareFocusView } from "@/components/experience/CompareFocusView";
import { I18nProvider } from "@/lib/i18n/context";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Minimal Indicator shape (from /api/countries/[iso3]/indicators response)
function makeIndicators(iso3: string, gdp: number) {
  return {
    country: iso3,
    indicators: [
      {
        id: `${iso3}-gdp`,
        countryIso3: iso3,
        metric: "gdp_usd_nominal",
        value: gdp,
        unit: "USD",
        year: 2024,
        source: "World Bank",
        confidence: "high",
      },
      {
        id: `${iso3}-growth`,
        countryIso3: iso3,
        metric: "gdp_growth_pct",
        value: 3.2,
        unit: "%",
        year: 2024,
        source: "World Bank",
        confidence: "high",
      },
    ],
    source: "memory",
  };
}

describe("CompareFocusView", () => {
  it("renders radar axes and both country names in the table", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        const iso = u.includes("/ARE/") ? "ARE" : "BRA";
        const gdp = iso === "ARE" ? 5.5e11 : 2.17e12;
        return new Response(JSON.stringify(makeIndicators(iso, gdp)), { status: 200 });
      }),
    );

    const { getAllByText } = render(
      <I18nProvider>
        <CompareFocusView iso3="BRA" countryName="Brazil" />
      </I18nProvider>,
    );

    await waitFor(() => {
      // Axes labels (metric names from t.metrics) — may appear in both SVG and table
      const gdpLabels = getAllByText("GDP (nominal)");
      expect(gdpLabels.length).toBeGreaterThan(0);
      // Both country names appear (header paragraph + table header)
      const brazilCells = getAllByText("Brazil");
      expect(brazilCells.length).toBeGreaterThan(0);
      const uaeCells = getAllByText("United Arab Emirates");
      expect(uaeCells.length).toBeGreaterThan(0);
    });
  });

  it("shows unavailable state on fetch error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "internal" }), { status: 500 })),
    );

    const { getByText } = render(
      <I18nProvider>
        <CompareFocusView iso3="BRA" countryName="Brazil" />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(getByText(/unavailable/i)).toBeTruthy();
    });
  });
});
