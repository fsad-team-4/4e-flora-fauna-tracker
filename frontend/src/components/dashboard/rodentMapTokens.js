/**
 * Shared rodent-map tokens.
 *
 * Their own module rather than exports on RodentRiskMap.jsx: a file that exports
 * both components and constants breaks React Fast Refresh. Both the full-page map
 * and the small preview card import from here, so pin colours and basemaps cannot
 * drift apart between the two surfaces.
 */

/**
 * SEVERITY - semantic intent colours for rodent risk bands.
 *
 * `solid` is the marker FILL (a graphic, so the 3:1 bar applies - #F59E0B measures
 * 2.15:1 and would be illegal as text). `ink` on `fill` is the text pairing and
 * clears AA at 5.3-7.2:1. Hue does not encode order on its own, so every severity
 * is also carried by a text label in popups/legend and critical keeps its "!"
 * badge - never colour alone.
 */
export const SEVERITY = {
  low: { solid: '#3B82F6', fill: 'var(--em-info-bg)', ink: 'var(--em-info-ink)', onSolid: '#fff' },
  medium: { solid: '#F59E0B', fill: 'var(--em-warn-bg)', ink: 'var(--em-warn-ink)', onSolid: '#111827' },
  high: { solid: '#EF4444', fill: 'var(--em-danger-bg)', ink: 'var(--em-danger-ink)', onSolid: '#fff' },
  critical: { solid: '#B91C1C', fill: '#B91C1C', ink: '#FFFFFF', onSolid: '#fff' },
};

export const SG_CENTER = [1.3690, 103.8456];

/**
 * Basemap options. CARTO styles, so no API key is needed - a Mapbox/MapLibre vector
 * style would require an access token this build does not have. "Muted" drops road
 * labels entirely, which is what actually stops street type competing with the pins.
 */
export const BASEMAPS = {
  // Default. CARTO Positron with no labels: a desaturated near-greyscale ground
  // that gives the data layers the only saturated colour on the canvas. The
  // previous default was the LABELLED variant, whose road casings and green park
  // fills competed directly with the severity hues.
  muted: { label: 'Muted', url: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png' },
  labelled: { label: 'Labelled', url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png' },
  dark: { label: 'Dark', url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png' },
};

export const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
