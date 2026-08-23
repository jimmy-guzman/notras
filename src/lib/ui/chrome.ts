/**
 * How a standalone glyph in a chrome control is drawn (`D51`).
 *
 * The stroke is not lucide's default: its 2 is against a 24-unit `viewBox`, so
 * it scales down with the glyph and 14px would render 1.167px. `strokeWidth`
 * and `absoluteStrokeWidth` both compute from the `size` prop, which sizing by
 * class leaves at 24, so the correction has to be CSS.
 */
export const CHROME_GLYPH = "size-3.5 [stroke-width:2.25]";
