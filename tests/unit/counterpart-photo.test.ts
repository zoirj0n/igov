import { cacheKeyFor, isAllowedPhotoSrc } from "@/app/api/agent/counterpart-photo/route";
import { describe, expect, it } from "vitest";

describe("isAllowedPhotoSrc", () => {
  it("allows only https upload.wikimedia.org", () => {
    expect(isAllowedPhotoSrc("https://upload.wikimedia.org/wikipedia/commons/a/ab/X.jpg")).toBe(
      true,
    );
    expect(isAllowedPhotoSrc("http://upload.wikimedia.org/x.jpg")).toBe(false);
    expect(isAllowedPhotoSrc("https://upload.wikimedia.org.evil.com/x.jpg")).toBe(false);
    expect(isAllowedPhotoSrc("https://evil.com/upload.wikimedia.org/x.jpg")).toBe(false);
    expect(isAllowedPhotoSrc("not a url")).toBe(false);
  });
});

describe("cacheKeyFor", () => {
  it("never collides for same-prefix Wikimedia urls (the stuck-photo bug)", () => {
    const a = cacheKeyFor(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Alexandre_Silveira.jpg",
    );
    const b = cacheKeyFor(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Suhail_Al_Mazrouei.jpg",
    );
    expect(a).not.toBe(b);
  });
  it("is deterministic and filesystem-safe", () => {
    const url = "https://upload.wikimedia.org/wikipedia/commons/a/ab/X.jpg";
    expect(cacheKeyFor(url)).toBe(cacheKeyFor(url));
    expect(cacheKeyFor(url)).toMatch(/^[a-f0-9]{40}$/);
  });
});
