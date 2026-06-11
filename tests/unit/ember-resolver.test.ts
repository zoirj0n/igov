import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("ember resolver", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.EMBER_CSV_URL;
    delete (globalThis as { __ciEmberCache?: unknown }).__ciEmberCache;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.EMBER_CSV_URL;
    delete (globalThis as { __ciEmberCache?: unknown }).__ciEmberCache;
  });

  it("returns EMBER_CSV_URL when set", async () => {
    process.env.EMBER_CSV_URL = "https://example.test/override.csv";
    const { resolveEmberCsvUrl } = await import("@/services/ingest/ember-resolver");
    expect(await resolveEmberCsvUrl()).toBe("https://example.test/override.csv");
  });

  it("scrapes csv link from index html", async () => {
    const html = `<a href="https://ember-energy.org/app/uploads/2026/03/yearly_electricity_data-2026.csv">Download</a>`;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(html, { status: 200, headers: { "content-type": "text/html" } }),
      ),
    );
    const { resolveEmberCsvUrl } = await import("@/services/ingest/ember-resolver");
    const url = await resolveEmberCsvUrl();
    expect(url).toContain("yearly_electricity_data-2026.csv");
  });

  it("returns null when no candidate index returns html with csv link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 404 })),
    );
    const { resolveEmberCsvUrl } = await import("@/services/ingest/ember-resolver");
    expect(await resolveEmberCsvUrl()).toBeNull();
  });

  it("caches resolved url in globalThis", async () => {
    const html = `<a href="https://ember-energy.org/cached.csv">x</a>`;
    const fetchMock = vi.fn(async () => new Response(html, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { resolveEmberCsvUrl } = await import("@/services/ingest/ember-resolver");
    await resolveEmberCsvUrl();
    await resolveEmberCsvUrl();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
