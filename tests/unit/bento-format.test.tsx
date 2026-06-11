import { Bento } from "@/components/experience/Bento";
import { I18nProvider } from "@/lib/i18n/context";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FIXTURE_STATE } from "../fixtures/agent-state";

afterEach(cleanup);

describe("Bento number formatting", () => {
  it("compacts big indicator values and never renders raw long numbers", () => {
    const { getAllByText, getByText, queryByText, container } = render(
      <I18nProvider>
        <Bento state={FIXTURE_STATE} mode="ready" />
      </I18nProvider>,
    );
    // GDP legitimately appears in both the key-indicators and market tiles.
    expect(getAllByText("$2.2T").length).toBeGreaterThanOrEqual(1);
    expect(getByText("89%")).toBeTruthy();
    expect(queryByText(/2170000000000/)).toBeNull();
    // Adjacent SVG axis year labels (2020 + 2024) concatenate to 8 digits in
    // textContent; raw indicator values are 10+ digits — that is the leak
    // this guards against.
    expect(container.textContent).not.toMatch(/\d{9,}/);
  });

  it("formats the forecast headline value compactly", () => {
    const { getByText } = render(
      <I18nProvider>
        <Bento
          state={{
            ...FIXTURE_STATE,
            forecast: { ...FIXTURE_STATE.forecast!, label: "GDP", next: 2_331_456_789_012 },
          }}
          mode="ready"
        />
      </I18nProvider>,
    );
    expect(getByText("$2.3T")).toBeTruthy();
  });
});
