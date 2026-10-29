import { describe, expect, it } from "vitest";
import { clampPreview, fmtCost, fmtDuration, fmtTokens } from "./format";

describe("fmtDuration", () => {
  it("returns undefined for absent, non-finite, or negative input", () => {
    expect(fmtDuration(undefined)).toBeUndefined();
    expect(fmtDuration(Number.NaN)).toBeUndefined();
    expect(fmtDuration(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(fmtDuration(-5)).toBeUndefined();
    expect(fmtDuration(-1000)).toBeUndefined();
  });

  it("renders sub-second durations in rounded ms", () => {
    expect(fmtDuration(0)).toBe("0ms");
    expect(fmtDuration(4.6)).toBe("5ms");
    expect(fmtDuration(850)).toBe("850ms");
    expect(fmtDuration(999)).toBe("999ms");
  });

  it("renders seconds with one decimal up to a minute", () => {
    expect(fmtDuration(1000)).toBe("1.0s");
    expect(fmtDuration(4200)).toBe("4.2s");
    expect(fmtDuration(59_900)).toBe("59.9s");
  });

  it("renders minutes and seconds past a minute", () => {
    expect(fmtDuration(60_000)).toBe("1m0s");
    expect(fmtDuration(90_000)).toBe("1m30s");
    expect(fmtDuration(605_000)).toBe("10m5s");
  });

  it("carries a rounded second into the minute instead of rendering 60s", () => {
    // Just below two minutes: seconds round to 60 and must roll over.
    expect(fmtDuration(119_999)).toBe("2m0s");
    expect(fmtDuration(119_600)).toBe("2m0s");
  });
});

describe("fmtCost", () => {
  it("returns undefined for absent, non-finite, or negative input", () => {
    expect(fmtCost(undefined)).toBeUndefined();
    expect(fmtCost(Number.NaN)).toBeUndefined();
    expect(fmtCost(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(fmtCost(-0.01)).toBeUndefined();
    expect(fmtCost(-5)).toBeUndefined();
  });

  it("renders exact zero as $0", () => {
    expect(fmtCost(0)).toBe("$0");
  });

  it("renders sub-cent amounts with four decimals", () => {
    expect(fmtCost(0.0032)).toBe("$0.0032");
    expect(fmtCost(0.009999)).toBe("$0.0100");
    expect(fmtCost(0.00001)).toBe("$0.0000");
  });

  it("renders cent-and-above amounts with two decimals", () => {
    expect(fmtCost(0.01)).toBe("$0.01");
    expect(fmtCost(1.2)).toBe("$1.20");
    expect(fmtCost(1234.5)).toBe("$1234.50");
  });
});

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
