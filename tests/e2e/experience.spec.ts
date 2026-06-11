import { type Page, expect, test } from "@playwright/test";
import { FIXTURE_STATE, sseBody } from "../fixtures/agent-state";

const RUN_ID = "run-e2e-1";

const RUN_RECORD = {
  id: RUN_ID,
  title: FIXTURE_STATE.briefing?.title ?? "",
  iso3: "BRA",
  role: "energy",
  createdAt: "2026-06-10T10:00:00.000Z",
  createdBy: "exec@example.ae",
  classification: "internal",
  command: FIXTURE_STATE.command,
  durationMs: 9800,
  state: FIXTURE_STATE,
};

async function mockRunApis(page: Page) {
  await page.route("**/api/agent/runs", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ runs: [] }),
    }),
  );
  await page.route(`**/api/agent/runs/${RUN_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ run: RUN_RECORD }),
    }),
  );
  await page.route("**/api/agent/run", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `: connected\n\n${sseBody([
        {
          event: "trace",
          state: {
            ...FIXTURE_STATE,
            briefing: undefined,
            trace: FIXTURE_STATE.trace.slice(0, 2),
          },
        },
        { event: "final", state: FIXTURE_STATE },
        { event: "saved", runId: RUN_ID },
      ])}`,
    }),
  );
  await page.route("**/api/country-facts/BRA", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        facts: {
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
          live: false,
        },
      }),
    }),
  );
  await page.route("**/api/insights/forecast*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
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
      }),
    }),
  );
  await page.route("**/api/countries/*/indicators", (route) => {
    const url = route.request().url();
    const iso = url.includes("/ARE/") ? "ARE" : "BRA";
    const gdp = iso === "ARE" ? 5.5e11 : 2.17e12;
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        country: iso,
        indicators: [
          {
            id: `${iso}-gdp-2024`,
            countryIso3: iso,
            metric: "gdp_usd_nominal",
            value: gdp,
            year: 2024,
            unit: "USD",
            source: "World Bank",
            confidence: "high",
          },
        ],
        source: "memory",
      }),
    });
  });
}

async function login(page: Page) {
  await page.goto("/");
  await page.waitForURL(/\/login/);
  await page.getByLabel("Email").fill("exec@example.ae");
  await page.getByLabel("Password").fill("demo");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

test.describe("single-page experience", () => {
  test("ask anything answers with citations; prepare phrasing redirects to the run flow", async ({
    page,
  }) => {
    await login(page);
    await mockRunApis(page);
    await page.route("**/api/chat/ask", async (route) => {
      const body = route.request().postDataJSON() as { question: string };
      if (/prepare me/i.test(body.question)) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ kind: "prepare", iso3: "BRA" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          kind: "general",
          answer: "Indonesia's infrastructure pipeline is **substantial**.",
          abstained: false,
          citations: ["World Bank 2024"],
        }),
      });
    });

    await page.goto("/");
    const ask = page.getByPlaceholder(/or ask anything/i);
    await ask.fill("Indonesia infrastructure");
    await ask.press("Enter");
    await expect(page.getByText(/substantial/)).toBeVisible();
    await expect(page.getByText("World Bank 2024")).toBeVisible();

    await ask.fill("prepare me for Brazil");
    await ask.press("Enter");
    await expect(page.getByText(/biofuels & SAF co-investment/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("golden path: pick country → run → bento → focus views", async ({ page }) => {
    await mockRunApis(page);
    await login(page);

    await page.getByRole("button", { name: /select country/i }).click();
    await page.getByPlaceholder(/search/i).fill("braz");
    await page.getByRole("button", { name: /Brazil/ }).click();

    const begin = page.getByRole("button", { name: /begin briefing/i });
    await expect(begin).toBeEnabled();
    await begin.click();

    await expect(page.getByText(/biofuels & SAF co-investment/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("Alexandre Silveira").first()).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`#run=${RUN_ID}`));

    await page.getByRole("tab", { name: /^Brief$/ }).click();
    await expect(page.getByRole("img", { name: /one-pager/i })).toBeVisible();

    await page.getByRole("tab", { name: /Opportunities/ }).click();
    await expect(page.getByText("SAF joint venture")).toBeVisible();

    await page.getByRole("tab", { name: /Sources/ }).click();
    await expect(page.getByText("World Bank WDI 2024").first()).toBeVisible();

    await page.getByRole("tab", { name: /Counterpart/ }).click();
    await expect(page.getByText(/Government of Brazil/)).toBeVisible();
    await expect(page.getByText(/Identified as of/)).toBeVisible();

    await page.getByRole("tab", { name: /Trade & investment/ }).click();
    await expect(page.getByText("Mataripe", { exact: false })).toBeVisible();
    await expect(page.getByText(/Announced UAE investment/i)).toBeVisible();

    await page.getByRole("tab", { name: /^Compare$/ }).click();
    await expect(page.getByText(/vs United Arab Emirates/i)).toBeVisible();

    await page.getByRole("tab", { name: /^Forecast$/ }).click();
    await expect(page.getByText(/Holt's linear trend/)).toBeVisible();
    await expect(page.getByText(/\(f\)/).first()).toBeVisible();

    await page.getByRole("tab", { name: /^Profile$/ }).click();
    await expect(page.getByText("Brasília")).toBeVisible();
    await expect(page.getByText(/Services · 72%/)).toBeVisible();
  });

  test("#run=<id> rehydrates a saved run after reload", async ({ page }) => {
    await mockRunApis(page);
    await login(page);
    await page.goto(`/#run=${RUN_ID}`);
    await expect(page.getByText(/biofuels & SAF co-investment/i).first()).toBeVisible();
    await expect(page.getByRole("tab", { name: /Overview/ })).toBeVisible();
  });
});
