import { Rectangle, Tooltip as LeafletTooltip } from 'react-leaflet';
import { CHART } from '../../theme';

/**
 * SIMULATED RATSENSE activity surface - the smooth, weather-map-style field.
 *
 * ============================ READ BEFORE RESTYLING ========================
 * This layer is SIMULATED PILOT DATA. It models the smart-sensor pilot the
 * client's brief describes; it is not a real feed.
 *
 * Interpolation is legitimate here and ONLY here. A grid of fixed sensors
 * samples a continuous field, so estimating between them is what a weather map
 * does. The officer-reported assessments rendered on top are DISCRETE events -
 * the space between two reports has no true value - so they are never smoothed,
 * never interpolated, and never merged into this surface.
 *
 * The "Simulated sensor data (pilot integration not yet live)" label is not
 * decoration. It appears on the toggle, in the legend, in a persistent banner
 * and on the API envelope. If a future restyle drops any of those, this layer
 * becomes indistinguishable from evidence. Do not remove them.
 * ===========================================================================
 *
 * Colour comes from CHART.ramp (sequential blue) on purpose: red/amber/green are
 * reserved for status in this app, and a simulated layer must never borrow the
 * visual language of a real severity reading.
 */
// Cell -> ramp step. A cell only exists where a sensor was within range, so
// there is no "zero" step: absent data is an absent rectangle, never a pale one.
function rampColor(value, scaleMax, mode) {
  const ramp = CHART[mode].ramp;
  if (!scaleMax) return ramp[0];
  const t = Math.min(1, Math.max(0, value / scaleMax));
  return ramp[Math.min(ramp.length - 1, Math.floor(t * ramp.length))];
}

export default function SensorSurfaceLayer({ surface, mode = 'light' }) {
  if (!surface?.cells?.length) return null;
  return surface.cells.map((c, i) => (
    <Rectangle
      key={`s-${i}`}
      bounds={[[c.south, c.west], [c.north, c.east]]}
      pathOptions={{
        // no stroke: adjacent cells must read as one continuous field, which is
        // the whole point of the weather-map treatment
        stroke: false,
        fillColor: rampColor(c.value, surface.scaleMax, mode),
        fillOpacity: 0.55,
      }}
      interactive
    >
      <LeafletTooltip direction="top" sticky>
        {`SIMULATED · activity ${c.value} · ${c.sensors} sensor${c.sensors === 1 ? '' : 's'} in range`}
        {c.town_council ? ` · ${c.town_council}` : ''}
      </LeafletTooltip>
    </Rectangle>
  ));
}

