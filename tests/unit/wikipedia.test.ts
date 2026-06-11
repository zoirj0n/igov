import {
  looksLikePerson,
  parseWikiSearchTitles,
  parseWikiSummary,
  pickPersonTitle,
  wikiPersonSummary,
} from "@/services/live/wikipedia";
import { describe, expect, it } from "vitest";

describe("wikipedia parsers", () => {
  it("parseWikiSearchTitles maps all result titles", () => {
    const j = { query: { search: [{ title: "Xi Jinping" }, { title: "Xi'an Expressway" }] } };
    expect(parseWikiSearchTitles(j)).toEqual(["Xi Jinping", "Xi'an Expressway"]);
    expect(parseWikiSearchTitles({})).toEqual([]);
  });

  it("pickPersonTitle prefers titles that actually name the person", () => {
    expect(
      pickPersonTitle("Xi Jinping", ["G30 Lianyungang–Khorgas Expressway", "Xi Jinping"]),
    ).toBe("Xi Jinping");
    expect(pickPersonTitle("Xi Jinping", ["Beijing Ring Road", "China National Highways"])).toBe(
      null,
    );
    expect(pickPersonTitle("Abdulaziz bin Salman Al Saud", ["Abdulaziz bin Salman"])).toBe(
      "Abdulaziz bin Salman",
    );
  });

  it("looksLikePerson accepts biographies and refuses places/things", () => {
    expect(
      looksLikePerson({
        extract: "Xi Jinping (born 15 June 1953) is a Chinese politician.",
        description: "President of China",
      }),
    ).toBe(true);
    expect(
      looksLikePerson({
        extract: "The G30 is an expressway in China connecting Lianyungang and Khorgas.",
        description: "Road in China",
      }),
    ).toBe(false);
    expect(looksLikePerson({ extract: "" })).toBe(false);
  });

  it("parseWikiSummary maps extract, description, thumbnail and page url", () => {
    const j = {
      title: "Alexandre Silveira",
      extract: "Brazilian politician.",
      description: "Brazilian lawyer and politician",
      thumbnail: { source: "https://upload.wikimedia.org/x.jpg" },
      content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Alexandre_Silveira" } },
    };
    expect(parseWikiSummary(j)).toEqual({
      title: "Alexandre Silveira",
      extract: "Brazilian politician.",
      description: "Brazilian lawyer and politician",
      thumbnailUrl: "https://upload.wikimedia.org/x.jpg",
      pageUrl: "https://en.wikipedia.org/wiki/Alexandre_Silveira",
      live: true,
    });
    expect(parseWikiSummary(null)).toBeNull();
  });

  it("wikiPersonSummary returns null when air-gapped (always true under vitest)", async () => {
    expect(await wikiPersonSummary("Alexandre Silveira", "Brazil")).toBeNull();
  });
});
