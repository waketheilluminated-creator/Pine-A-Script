export const COLLAPSED_PANEL_HEIGHT = 37;
export const PANEL_COLLAPSE_THRESHOLD = 100;
export const DEFAULT_PANEL_HEIGHT = 245;

export function snapPanelHeight(height, viewportHeight) {
  const bounded = Math.max(COLLAPSED_PANEL_HEIGHT, Math.min(viewportHeight * 0.65, height));
  return bounded <= PANEL_COLLAPSE_THRESHOLD ? COLLAPSED_PANEL_HEIGHT : bounded;
}

export function resolvePanelHeight(viewportHeight, pointerY) {
  return snapPanelHeight(viewportHeight - 28 - pointerY, viewportHeight);
}

export function isPanelCollapsed(height) {
  return height === COLLAPSED_PANEL_HEIGHT;
}
