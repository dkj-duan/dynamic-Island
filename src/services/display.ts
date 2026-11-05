/** Screen sizes are CSS pixels, so Windows display scaling is applied already. */
export const LARGE_DISPLAY_MIN_WIDTH = 2304;

/** Width of the monitor the window currently sits on, in CSS pixels. */
export function displayWidth(): number {
  const screen = window.screen;
  return screen.availWidth || screen.width || window.innerWidth;
}

export function largeDisplayForWidth(width: number): boolean {
  return width >= LARGE_DISPLAY_MIN_WIDTH;
}

/** Settings page zoom, tuned by monitor width so small UI text stays crisp. */
export function settingsZoomForWidth(width: number): number {
  if (width >= 3000) return 1.2;
  if (width >= 2200) return 1.16;
  if (width >= 1600) return 1.12;
  return 1.06;
}

/** Extra capsule scale on wide monitors, on top of the user's size setting. */
export function islandScaleForWidth(width: number): number {
  if (width >= 2900) return 1.12;
  if (width >= 2200) return 1.06;
  return 1;
}

export function isLargeDisplay(): boolean {
  return largeDisplayForWidth(displayWidth());
}

/** Mirrors the tier onto `<html data-large-display>` and returns it. */
export function applyDisplayTier(): boolean {
  const large = isLargeDisplay();
  document.documentElement.dataset.largeDisplay = String(large);
  return large;
}

/** Re-arm the pixel-ratio query after it fires; media queries are immutable. */
function watchPixelRatio(onChange: () => void): () => void {
  let media = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  const handle = () => {
    onChange();
    media.removeEventListener("change", handle);
    media = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    media.addEventListener("change", handle);
  };
  media.addEventListener("change", handle);
  return () => media.removeEventListener("change", handle);
}

/**
 * Applies the display tier on mount and whenever the window is resized,
 * refocused, or moved to a monitor with a different scale factor.
 */
export function watchDisplayTier(
  onChange?: (large: boolean) => void,
): () => void {
  const update = () => {
    const large = applyDisplayTier();
    onChange?.(large);
  };
  update();
  window.addEventListener("resize", update);
  window.addEventListener("focus", update);
  const stopPixelRatio = watchPixelRatio(update);
  return () => {
    window.removeEventListener("resize", update);
    window.removeEventListener("focus", update);
    stopPixelRatio();
  };
}
