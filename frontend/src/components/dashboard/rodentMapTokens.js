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
 * DENSITY_RAMP - the hexagon fill scale for Density view. A SEQUENTIAL SINGLE-HUE ramp.
 *
 * WHY NOT THE SEVERITY HUES. The hexagons used to take `SEVERITY[band].solid`, so hue said
 * "peak severity in this cell" while opacity said "how many reports". Two variables on one
 * polygon, pulling against each other: a cell holding one critical report outranked a cell
 * holding twelve medium ones, so the loudest hexagon was not the busiest one. Density view
 * encodes exactly one thing - volume - and severity stays where it is already unambiguous:
 * the pins, the popups and the legend.
 *
 * WHY NOT PURPLE-TO-MAGENTA, WHICH IS WHAT THIS WAS. That ramp satisfied the constraint
 * above - purple and magenta borrow no status hue - but it crossed two hue families at high
 * saturation, so it read as a rainbow rather than as a scale. A reader could tell two steps
 * apart but could not tell which was HIGHER without consulting the legend, because
 * violet-vs-fuchsia has no inherent order. That is the failure mode of every multi-hue data
 * ramp and the reason sequential scales are the standard.
 *
 * WHY NOT YELLOW-TO-RED, the usual sequential choice. Because red is what `critical` means
 * everywhere else on this page - the pins, the severity chips, the high-risk metric card -
 * and putting deep red at the top of a VOLUME scale re-creates exactly the collision the
 * first paragraph describes. A busy-but-low-severity cell would render in the colour that
 * means "critical" a few pixels away from pins that use it to mean precisely that.
 *
 * SO: one hue, five steps, light to deep, in the app's own blue. Lightness alone carries
 * the order, which is what makes it readable without the legend and readable in greyscale.
 * Blue is the only family on this page not already spoken for by a status - and it is the
 * product's primary, so the busiest cells now read as "the data" rather than as an alarm.
 */
export const DENSITY_BREAKS = [1, 2, 3, 5, 9];
export const DENSITY_STEP_LABELS = ['1', '2', '3-4', '5-8', '9+'];

export const DENSITY_RAMP = {
  // Lifted and compressed toward the light end: these are semi-transparent fills over a
  // DARK basemap, so the deepest steps have to stay well clear of the ground or the busiest
  // cells disappear into it - the opposite problem to the light scheme below.
  dark: ['#93C5FD', '#60A5FA', '#3B82F6', '#2563EB', '#1D4ED8'],
  // Deeper throughout, because these sit over a near-white Positron ground where a pale
  // blue at 30% opacity is invisible. Top step is the product's own action blue.
  light: ['#BFDBFE', '#93C5FD', '#60A5FA', '#2563EB', '#1D4ED8'],
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
// EVERY OPTION IS LABEL-FREE, DELIBERATELY.
//
// The CARTO "light_all" variant used to be offered here as "Labelled". It was
// removed: its labels are Singapore PLANNING AREA names, which are not town
// councils. It printed "Yio Chu Kang" and "Ang Mo Kio" as separate places when
// both are managed by one body - Yio Chu Kang SMC sits inside Ang Mo Kio Town
// Council - so the basemap contradicted the estate's actual management structure.
//
// Region naming now comes solely from TownCouncilLabels, which draws council names
// from /api/town-councils. Do not reintroduce a labelled basemap: it would put two
// competing naming schemes on the same canvas.
export const BASEMAPS = {
  // Default. CARTO Positron with no labels: a desaturated near-greyscale ground
  // that gives the data layers the only saturated colour on the canvas.
  muted: { label: 'Muted', url: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png' },
  dark: { label: 'Dark', url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png' },
  /**
   * Aerial imagery. Esri World Imagery, which needs no API key.
   *
   * Answers a question the abstract basemaps cannot: an officer looking at a cluster
   * wants to know whether that pin is a bin centre, a car park or a grass verge, and no
   * amount of grey ground tells them. It complements the Street View link rather than
   * competing with it - the aerial says what the site IS, the panorama says what it
   * LOOKS like from the road.
   *
   * THREE THINGS DIFFER FROM THE CARTO TILES, all of them easy to get wrong:
   *  - the path is {z}/{y}/{x}, y BEFORE x. Using the usual {z}/{x}/{y} silently serves
   *    tiles from the wrong place rather than failing, so the map would look plausible
   *    and be wrong.
   *  - it carries its OWN attribution. Serving Esri imagery under the OpenStreetMap and
   *    CARTO credit would simply be a false statement about the source.
   *  - it stops at zoom 19 in most of the world. Past that the service returns blank
   *    tiles, so the layer caps itself rather than letting the map zoom into nothing.
   */
  satellite: {
    label: 'Aerial',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagery &copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics, and the GIS User Community',
    maxZoom: 19,
    // No {s} placeholder in the URL, so the subdomain list would be dead weight.
    subdomains: undefined,
  },
};

// Fallback credit for the CARTO-served basemaps. A layer may override it with its own
// `attribution`, which the aerial does - see the note above.
export const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
