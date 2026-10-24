/**
 * Places a floating panel at an anchor point inside the viewport, above the
 * anchor's line when it does not fit below.
 */
export function clampToViewport(
  element: HTMLElement,
  anchorLeft: number,
  anchorTop: number
) {
  const rect = element.getBoundingClientRect();
  const margin = 8;

  const left = Math.max(
    margin,
    Math.min(anchorLeft, window.innerWidth - rect.width - margin)
  );

  const top =
    anchorTop + rect.height + margin > window.innerHeight
      ? Math.max(margin, anchorTop - rect.height - 28)
      : anchorTop;

  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
}
