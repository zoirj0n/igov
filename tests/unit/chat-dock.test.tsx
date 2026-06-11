import { ChatDock } from "@/components/experience/ChatDock";
import { ToastProvider } from "@/lib/hooks/useToast";
import { I18nProvider } from "@/lib/i18n/context";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function show(onPrepare = vi.fn()) {
  const utils = render(
    <I18nProvider>
      <ToastProvider>
        <ChatDock onPrepare={onPrepare} />
      </ToastProvider>
    </I18nProvider>,
  );
  const input = utils.getByRole("textbox");
  return { ...utils, input, onPrepare };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("ChatDock", () => {
  it("asks and renders a cited answer card", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          kind: "general",
          answer: "Indonesia's grid is **expanding**.",
          abstained: false,
          citations: ["World Bank 2024", "IEA 2025"],
        }),
      ),
    );
    const { input, getByText } = show();
    fireEvent.change(input, { target: { value: "Indonesia infrastructure" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await waitFor(() => {
      expect(getByText(/expanding/)).toBeTruthy();
      expect(getByText("World Bank 2024")).toBeTruthy();
    });
  });

  it("renders the comparison table for compare answers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          kind: "compare",
          answer: "Both lead regionally.",
          abstained: false,
          citations: [],
          comparison: {
            countries: [
              { iso3: "ARE", name: "United Arab Emirates" },
              { iso3: "SGP", name: "Singapore" },
            ],
            rows: [
              {
                metric: "gdp_usd_nominal",
                a: { value: 5.5e11, unit: "USD", year: 2024 },
                b: { value: 5.3e11, unit: "USD", year: 2024 },
              },
            ],
          },
        }),
      ),
    );
    const { input, getByText } = show();
    fireEvent.change(input, { target: { value: "UAE vs Singapore" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await waitFor(() => {
      expect(getByText("Singapore")).toBeTruthy();
      expect(getByText(/Quick comparison/i)).toBeTruthy();
    });
  });

  it("abstains with a run-full-briefing CTA wired to onPrepare", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          kind: "general",
          answer: null,
          abstained: true,
          citations: [],
          suggestIso3: "MAR",
        }),
      ),
    );
    const { input, getByText, onPrepare } = show();
    fireEvent.change(input, { target: { value: "Morocco solar exports" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await waitFor(() => expect(getByText(/Not enough grounded data/i)).toBeTruthy());
    fireEvent.click(getByText(/Run a full briefing/i));
    expect(onPrepare).toHaveBeenCalledWith("MAR");
  });

  it("prepare responses call onPrepare immediately", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ kind: "prepare", iso3: "JPN" })),
    );
    const { input, onPrepare } = show();
    fireEvent.change(input, { target: { value: "prepare me for Japan" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await waitFor(() => expect(onPrepare).toHaveBeenCalledWith("JPN"));
  });
});
