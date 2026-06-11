import { initialsOf, photoProxySrc } from "@/components/experience/counterpart-utils";
import { describe, expect, it } from "vitest";
import { FIXTURE_STATE } from "../fixtures/agent-state";

describe("counterpart utils", () => {
  it("initialsOf", () => {
    expect(initialsOf("Alexandre Silveira")).toBe("AS");
    expect(initialsOf("Cher")).toBe("C");
    expect(initialsOf("  ")).toBe("?");
  });
  it("photoProxySrc proxies remote urls, passes local paths, undefined when absent", () => {
    const p = { ...FIXTURE_STATE.counterpart!, photoUrl: "https://upload.wikimedia.org/a b.jpg" };
    expect(photoProxySrc(p)).toBe(
      "/api/agent/counterpart-photo?src=https%3A%2F%2Fupload.wikimedia.org%2Fa%20b.jpg",
    );
    expect(photoProxySrc({ ...p, photoUrl: "/cached/x.jpg" })).toBe("/cached/x.jpg");
    expect(photoProxySrc({ ...p, photoUrl: undefined })).toBeUndefined();
  });
});
