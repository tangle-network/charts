import { describe, expect, it } from "vitest";
import { clampPreview, fmtTokens } from "./format";

describe("fmtTokens", () => {
  it("renders both sides when valid", () => {
    expect(fmtTokens(1200, 340)).toBe("1200/340 tok");
    expect(fmtTokens(0, 0)).toBe("0/0 tok");
  });

  it("renders a present side and shows the absent side as 0", () => {
    expect(fmtTokens(1200, undefined)).toBe("1200/0 tok");
    expect(fmtTokens(undefined, 340)).toBe("0/340 tok");
  });

  it("returns undefined when neither side is a valid count", () => {
    expect(fmtTokens(undefined, undefined)).toBeUndefined();
    expect(fmtTokens(Number.NaN, Number.NaN)).toBeUndefined();
    expect(fmtTokens(-5, -1)).toBeUndefined();
  });

  it("drops an invalid side to 0 instead of leaking -5/NaN", () => {
    expect(fmtTokens(-5, 340)).toBe("0/340 tok");
    expect(fmtTokens(1200, Number.NaN)).toBe("1200/0 tok");
  });
});

describe("clampPreview", () => {
  it("passes short text through unchanged", () => {
    expect(clampPreview("hello")).toBe("hello");
    expect(clampPreview("")).toBe("");
  });

  it("truncates over-long text and appends an ellipsis", () => {
    const long = "x".repeat(500);
    const out = clampPreview(long);
    expect(out).toBe(`${"x".repeat(200)}…`);
    expect(out.length).toBe(201);
  });

  it("honors a custom max", () => {
    expect(clampPreview("abcdef", 3)).toBe("abc…");
    expect(clampPreview("abc", 3)).toBe("abc");
  });

  it("never slices through a surrogate pair (no lone surrogate before the ellipsis)", () => {
    // "ab😀cd" with max 3 would cut between 😀's two halves; drop the dangling
    // high surrogate so the result is "ab…", not "ab<lone-surrogate>…".
    expect(clampPreview("ab😀cd", 3)).toBe("ab…");
    // A cut just after a whole pair keeps the emoji intact.
    expect(clampPreview("a😀bc", 3)).toBe("a😀…");
  });
});
