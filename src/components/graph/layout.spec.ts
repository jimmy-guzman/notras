import { describe, expect, it } from "vitest";

import { clockwiseFrom, layoutRing, layoutRound } from "./layout";

describe("layoutRing", () => {
  it("should sit a lone neighbour on each side level with the centre", () => {
    const ring = layoutRing(1, 1);

    expect(ring.incoming).toEqual([{ angle: 180, x: 0.12, y: 0.5 }]);
    expect(ring.outgoing).toEqual([{ angle: 0, x: 0.88, y: 0.5 }]);
  });

  it("should spread neighbours top to bottom on both sides", () => {
    const ring = layoutRing(3, 3);

    expect(ring.incoming.map((node) => node.y)).toEqual(
      [...ring.incoming.map((node) => node.y)].toSorted((a, b) => a - b)
    );
    expect(ring.outgoing.map((node) => node.y)).toEqual(
      [...ring.outgoing.map((node) => node.y)].toSorted((a, b) => a - b)
    );
    expect(ring.incoming.every((node) => node.x < 0.5)).toBe(true);
    expect(ring.outgoing.every((node) => node.x > 0.5)).toBe(true);
  });

  it("should keep a small fan tight and cap a large one at the arc", () => {
    const [top, , bottom] = layoutRing(0, 3).outgoing;
    const wide = layoutRing(0, 20).outgoing;

    expect(bottom?.angle).toBeCloseTo((top?.angle ?? 0) + 44);
    expect((wide.at(-1)?.angle ?? 0) - (wide[0]?.angle ?? 0)).toBeCloseTo(150);
  });

  it("should give nothing for an empty side", () => {
    expect(layoutRing(0, 0)).toEqual({ incoming: [], outgoing: [], top: [] });
  });

  it("should lay what holds the note along the top, left to right, and narrow the sides for it", () => {
    const ring = layoutRing(8, 8, 3);
    const [left, , right] = ring.top;

    expect(ring.top.every((node) => node.y < 0.5)).toBe(true);
    expect(left?.x ?? 1).toBeLessThan(right?.x ?? 0);
    expect(
      (ring.outgoing.at(-1)?.angle ?? 0) - (ring.outgoing[0]?.angle ?? 0)
    ).toBeCloseTo(110);
    expect(
      (layoutRing(8, 8).outgoing.at(-1)?.angle ?? 0) -
        (layoutRing(8, 8).outgoing[0]?.angle ?? 0)
    ).toBeCloseTo(150);
  });
});

describe("layoutRound", () => {
  it("should space members evenly around the ring from the top, clockwise", () => {
    expect(layoutRound(4).map((node) => node.angle)).toEqual([-90, 0, 90, 180]);
    expect(layoutRound(1)[0]?.y ?? 1).toBeLessThan(0.5);
    expect(layoutRound(0)).toEqual([]);
  });
});

describe("clockwiseFrom", () => {
  it("should start at the top and run through the right side first", () => {
    expect(clockwiseFrom(-90)).toBe(0);
    expect(clockwiseFrom(0)).toBe(90);
    expect(clockwiseFrom(180)).toBe(270);
    // Up the left side last, so the lower-left node comes before the upper-left.
    expect(clockwiseFrom(160)).toBeLessThan(clockwiseFrom(200));
  });
});
