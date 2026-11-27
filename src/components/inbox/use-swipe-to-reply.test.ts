import { describe, expect, it } from "vitest";
import { SWIPE_REPLY_THRESHOLD, classifyDrag, swipeOffset } from "./use-swipe-to-reply";

describe("classifyDrag", () => {
  it("stays undecided for tiny movements (finger jitter on a tap)", () => {
    expect(classifyDrag(4, 3)).toBe("pending");
    expect(classifyDrag(-5, 0)).toBe("pending");
  });

  it("treats a mostly vertical drag as scrolling", () => {
    expect(classifyDrag(5, 30)).toBe("scrolling");
    expect(classifyDrag(12, -40)).toBe("scrolling");
  });

  it("treats a clearly horizontal drag to the right as a reply swipe", () => {
    expect(classifyDrag(25, 3)).toBe("swiping");
    expect(classifyDrag(40, 20)).toBe("swiping");
  });

  it("never swipes to the left (that is not the reply gesture)", () => {
    expect(classifyDrag(-40, 2)).toBe("pending");
  });

  it("does not swipe on a diagonal drag that is not clearly horizontal", () => {
    // Ambiguous: stays undecided (bubble doesn't move) until the next movement decides
    expect(classifyDrag(20, 18)).not.toBe("swiping");
    expect(classifyDrag(15, 12)).not.toBe("swiping");
    // …and once it is more vertical than horizontal, it becomes a scroll
    expect(classifyDrag(20, 25)).toBe("scrolling");
  });
});

describe("swipeOffset", () => {
  it("does not move during the decision dead-zone or when dragging left", () => {
    expect(swipeOffset(0)).toBe(0);
    expect(swipeOffset(10)).toBe(0);
    expect(swipeOffset(-50)).toBe(0);
  });

  it("follows the finger 1:1 up to the reply threshold", () => {
    expect(swipeOffset(30)).toBe(20);
    expect(swipeOffset(10 + SWIPE_REPLY_THRESHOLD)).toBe(SWIPE_REPLY_THRESHOLD);
  });

  it("adds elastic resistance past the threshold and caps the travel", () => {
    const justPast = swipeOffset(10 + SWIPE_REPLY_THRESHOLD + 20);
    expect(justPast).toBeGreaterThan(SWIPE_REPLY_THRESHOLD);
    expect(justPast).toBeLessThan(SWIPE_REPLY_THRESHOLD + 20);
    expect(swipeOffset(1000)).toBe(80);
  });

  it("arms the reply once the finger travels threshold + dead-zone", () => {
    expect(swipeOffset(10 + SWIPE_REPLY_THRESHOLD - 1)).toBeLessThan(SWIPE_REPLY_THRESHOLD);
    expect(swipeOffset(10 + SWIPE_REPLY_THRESHOLD)).toBeGreaterThanOrEqual(SWIPE_REPLY_THRESHOLD);
  });
});
