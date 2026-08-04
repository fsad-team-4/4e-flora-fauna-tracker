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
 * DENSITY_RAMP - the hexagon fill scale for Density view. Deep purple to magenta.
 *
 * WHY NOT THE SEVERITY HUES. The hexagons used to take `SEVERITY[band].solid`, so
 * hue said "peak severity in this cell" while opacity said "how many reports". Two
 * variables on one polygon, pulling against each other: a cell holding one critical
 * report outranked a cell holding twelve medium ones, so the loudest hexagon was not
 * the busiest one. Density view now encodes exactly one thing - volume - and severity
 * stays where it is already unambiguous: the pins, the popups and the legend.
 *
 * WHY PURPLE-TO-MAGENTA. Volume is not a status, so it must not borrow the status
 * hues. Purple and magenta are the two data inks the design system already reserves
 * for non-semantic encoding (theme.js NEON), and neither collides with the severity
 * scale (blue/amber/red/crimson) or with feeding (teal). Crimson is deliberately NOT
 * the top step - crimson is what `critical` means everywhere else on this page.
 *
 * WHY FIXED BREAKS, NOT SHARE-OF-MAX. Steps are absolute report counts, so a cell's
 * colour depends only on that cell. Scaling to the busiest cell would have recoloured
 * a quiet hexagon whenever a different hexagon got busier, without anything about it
 * changing - and scrubbing the timeline would have repainted the whole grid. The
 * legend prints these exact numbers.
 */
export const DENSITY_BREAKS = [1, 2, 3, 5, 9];
export const DENSITY_STEP_LABELS = ['1', '2', '3-4', '5-8', '9+'];

export const DENSITY_RAMP = {
  // Lifted off true violet-900 at the low end: on the dark basemap a #4C1D95 fill at
  // 30% opacity was indistinguishable from the ground.
  dark: ['#6D28D9', '#8B5CF6', '#A855F7', '#D946EF', '#F472B6'],
  // Deeper throughout, because these are semi-transparent fills over a near-white
  // Positron ground - the dark set washes out to pastel on it.
  light: ['#5B21B6', '#7C3AED', '#9333EA', '#C026D3', '#DB2777'],
};

/** Index into DENSITY_RAMP for an absolute report count. */
export const densityStep = count => {
  let i = 0;
  for (let k = 0; k < DENSITY_BREAKS.length; k++) if (count >= DENSITY_BREAKS[k]) i = k;
  return i;
};

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
