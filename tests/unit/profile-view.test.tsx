import { ProfileView } from "@/components/experience/ProfileView";
import { I18nProvider } from "@/lib/i18n/context";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FACTS = {
  iso3: "BRA",
  capital: "Brasília",
  currency: "Brazilian real (BRL)",
  politicalSystem: "Federal presidential republic",
  language: "Portuguese",
  populationM: 211,
  gdpPerCapitaUsd: 10300,
  tradePctGdp: 34,
  sectors: { agriculture: 6, industry: 22, services: 72 },
  year: 2023,
  source: "World Bank",
  live: true,
};

describe("ProfileView", () => {
  it("fetches facts and renders the one-pager", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ facts: FACTS }), { status: 200 })),
    );
    const { getByText } = render(
      <I18nProvider>
        <ProfileView iso3="BRA" countryName="Brazil" />
      </I18nProvider>,
    );
    await waitFor(() => {
      expect(getByText("Brasília")).toBeTruthy();
      expect(getByText("$10,300")).toBeTruthy();
      expect(getByText(/Services · 72%/)).toBeTruthy();
      expect(getByText(/World Bank · 2023/)).toBeTruthy();
    });
  });
  it("shows the unavailable state on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 404 })),
    );
    const { getByText } = render(
      <I18nProvider>
        <ProfileView iso3="XXX" countryName="Nowhere" />
      </I18nProvider>,
    );
    await waitFor(() => expect(getByText(/unavailable/i)).toBeTruthy());
  });
});
