/** Where a node sits: unit coordinates on the stage, and its angle from the centre in degrees. */
export interface RingPosition {
  angle: number;
  x: number;
  y: number;
}

/** The ellipse the neighbours sit on, as fractions of the stage. */
const RADIUS_X = 0.38;
const RADIUS_Y = 0.36;

/** Degrees between neighbours until the arc is full, and the arc's widest span. */
const STEP = 22;
const SPAN = 150;

function arc(count: number, centre: number, clockwise: boolean) {
  if (count === 0) {
    return [];
  }

  const span = Math.min(SPAN, STEP * (count - 1));
  const first = centre - (span / 2) * (clockwise ? 1 : -1);
  const step = count === 1 ? 0 : (span / (count - 1)) * (clockwise ? 1 : -1);

  return Array.from({ length: count }, (_, index) => {
    const angle = first + step * index;
    const radians = (angle * Math.PI) / 180;

    return {
      angle,
      x: 0.5 + RADIUS_X * Math.cos(radians),
      y: 0.5 + RADIUS_Y * Math.sin(radians),
    };
  });
}

/**
 * The notes that mention this one fan out on the left, top to bottom, and the
 * notes it links to on the right, top to bottom, so the side is the direction.
 * Screen y runs down, so an angle above the centre is negative on the right
 * and past 180 on the left.
 */
export function layoutRing(incoming: number, outgoing: number) {
  return {
    incoming: arc(incoming, 180, false),
    outgoing: arc(outgoing, 0, true),
  };
}

/** Clockwise from the top, which is how the arrow keys walk the ring. */
export function clockwiseFrom(angle: number) {
  return (((angle + 90) % 360) + 360) % 360;
}
