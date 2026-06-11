import { TradeView } from "@/components/experience/TradeView";
import { I18nProvider } from "@/lib/i18n/context";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FIXTURE_STATE } from "../fixtures/agent-state";

afterEach(cleanup);

function show(state = FIXTURE_STATE) {
  return render(
    <I18nProvider>
      <TradeView state={state} iso3="BRA" countryName="Brazil" />
    </I18nProvider>,
  );
}

describe("TradeView", () => {
  it("renders the bilateral infographic numbers", () => {
    const { getAllByText, getByText } = show();
    expect(getAllByText("$4.3B").length).toBeGreaterThan(0);
    expect(getByText("$1.9B")).toBeTruthy();
    expect(getByText("$2.4B")).toBeTruthy();
    expect(getByText(/UN Comtrade · 2024/)).toBeTruthy();
  });
  it("renders the curated investments with source links and headline total", () => {
    const { getAllByText, getAllByRole } = show();
    expect(getAllByText("$4.3B").length).toBeGreaterThan(0);
    const links = getAllByRole("link");
    expect(links.some((l) => (l as HTMLAnchorElement).href.includes("mubadala.com"))).toBe(true);
  });
  it("labels both ends of the bilateral map and animates the arc", () => {
    const { container } = show();
    const svgTexts = [...container.querySelectorAll("svg text")].map((t) => t.textContent);
    expect(svgTexts).toContain("UAE");
    expect(svgTexts).toContain("Brazil");
    expect(container.querySelector("path.map-arc")).toBeTruthy();
  });

  it("degrades gracefully without trade data", () => {
    const { queryByText, getByText } = show({ ...FIXTURE_STATE, trade: undefined });
    expect(queryByText("$1.9B")).toBeNull();
    expect(getByText(/Mataripe refinery/)).toBeTruthy();
  });
});
