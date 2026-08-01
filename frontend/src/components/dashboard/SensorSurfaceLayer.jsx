import { useMemo } from 'react';
import { ImageOverlay } from 'react-leaflet';
import { SENSOR_RAMP } from '../../theme';

/**
 * SIMULATED RATSENSE activity surface, rendered as a raster image.
 *
 * ============================ READ BEFORE RESTYLING ========================
 * This layer is SIMULATED PILOT DATA modelling the smart-sensor pilot the
 * client's brief describes. It is not a real feed.
 *
 * Interpolation is legitimate here and ONLY here. A grid of fixed sensors
 * samples a continuous field, so estimating between them is what a weather map
 * does. The officer-reported assessments drawn on top are DISCRETE events -
 * the ground between two reports has no true value - so they are never
 * smoothed, never interpolated, and never merged into this surface.
 *
 * The "Simulated sensor data (pilot integration not yet live)" label appears on
 * the toggle, in the legend and in a persistent banner. If a restyle drops any
 * of them this layer becomes indistinguishable from evidence. Do not remove them.
 * ===========================================================================
 *
 * WHY A CANVAS RASTER, NOT CONTOUR POLYGONS:
 * Filled iso-bands were an improvement on coloured grid cells, but 15 stacked
 * vector polygons still read as cartoonish - hard crayon edges where bands meet,
 * and faceted outlines following the marching-squares lattice. Real radar
 * products are RASTERS: a per-pixel field with a continuous colour mapping and
 * no internal edges at all. So this samples the grid bilinearly into an offscreen
 * canvas, maps each pixel through a continuously interpolated ramp, and hands
 * Leaflet one image. The browser then upscales it with its own smoothing.
 *
 * WHERE THE COVERAGE DISCLOSURE LIVES NOW:
 * There used to be a dashed polygon tracing the exact edge of measured ground.
 * It was removed because it stopped telling the truth usefully: opacity now
 * fades to nothing as you approach a sensor's rim, so the polygon enclosed a
 * wide ring of technically-covered-but-invisible ground and read as a stray
 * border around empty space.
 *
 * The claim it carried is unchanged and still made three ways: the raster is
 * TRANSPARENT where no sensor reaches (never a "zero" colour), the legend states
 * that unshaded ground has no sensor and therefore no data, and the coverage
 * figures ("N of M reports located") sit in the dock. Coverage is still never
 * overstated - the field genuinely stops where the sensors do.
 */

// Canvas resolution. Independent of the data grid on purpose: the grid is the
// sampling density of the field, this is the fidelity we draw it at. 640px keeps
// the raster crisp when Leaflet scales it across the viewport without making the
// dataURL huge.
const RASTER_PX = 640;

const hexToRgb = h => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

/**
 * Continuous colour lookup across the ramp.
 *
 * The ramp is a set of discrete stops, but a radar image has no visible steps:
 * a value between two stops must blend between their colours rather than snap to
 * one. This is what removes the banded, posterised look.
 */
function makeColourLut(ramp, steps = 256) {
  const stops = ramp.map(hexToRgb);
  const lut = new Uint8Array(steps * 3);
  for (let i = 0; i < steps; i++) {
    const t = (i / (steps - 1)) * (stops.length - 1);
    const lo = Math.floor(t);
    const hi = Math.min(stops.length - 1, lo + 1);
    const f = t - lo;
    for (let c = 0; c < 3; c++) {
      lut[i * 3 + c] = Math.round(stops[lo][c] * (1 - f) + stops[hi][c] * f);
    }
  }
  return lut;
}

/**
 * Bilinear sample of the field, returning BOTH a value and a coverage fraction.
 *
 * The previous version returned null if any of the four neighbouring cells was
 * no-data. That was a binary decision snapped to the grid lattice, so the
 * boundary came out as a staircase of hard steps - the sharp, angular edges.
 *
 * Instead: interpolate a 1/0 coverage mask alongside the value. A pixel straddling
 * the edge gets a fractional coverage, which multiplies its alpha, so the
 * boundary is a smooth antialiased curve. The value itself is averaged over the
 * covered neighbours only, so no reading is ever pulled toward a no-data zero.
 *
 * Returns null only when NO neighbour has data at all.
 */
function sampleField(values, width, height, gx, gy) {
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  if (x0 < 0 || y0 < 0 || x0 >= width || y0 >= height) return null;

  const fx = gx - x0;
  const fy = gy - y0;
  const corners = [
    [values[y0 * width + x0], (1 - fx) * (1 - fy)],
    [values[y0 * width + x1], fx * (1 - fy)],
    [values[y1 * width + x0], (1 - fx) * fy],
    [values[y1 * width + x1], fx * fy],
  ];

  let vSum = 0;
  let wSum = 0;      // weight of covered corners = the coverage fraction
  for (const [v, w] of corners) {
    if (v === null) continue;
    vSum += v * w;
    wSum += w;
  }
  if (wSum <= 0) return null;
  return { value: vSum / wSum, coverage: wSum };
}

/**
 * Per-pixel proximity to the NEAREST REAL SENSOR, 1 at a sensor and 0 at the
 * influence radius.
 *
 * This is what removes the "gear teeth". Each sensor's support is a hard disc of
 * identical radius, so the union of 33 of them is a chain of circular arcs
 * meeting at cusps - a cog profile - and a flat alpha floor outlined every one
 * of those arcs crisply.
 *
 * Fading opacity with distance from an actual sensor dissolves the cusps because
 * neighbouring discs fade into each other instead of butting up. It is also the
 * more honest encoding: an IDW estimate 1.1km from the only sensor near it is a
 * weaker claim than one taken at the sensor, and now it looks like one.
 *
 * Uses squared distances in kilometre space - no sqrt, no haversine - because
 * this runs once per pixel over ~400k pixels.
 */
function makeProximity(surface) {
  const b = surface.bounds;
  const R = surface.influenceRadiusKm || 1.2;
  const midLat = (b.south + b.north) / 2;
  const KM_LAT = 110.574;
  const KM_LNG = 111.320 * Math.cos((midLat * Math.PI) / 180);
  const pts = (surface.sensors || []).map(s => ({
    x: s.lng * KM_LNG,
    y: s.lat * KM_LAT,
  }));
  const R2 = R * R;
  return (lat, lng) => {
    if (!pts.length) return 1;
    const x = lng * KM_LNG;
    const y = lat * KM_LAT;
    let best = Infinity;
    for (const p of pts) {
      const dx = x - p.x;
      const dy = y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) { best = d2; if (best === 0) break; }
    }
    if (best >= R2) return 0;
    const t = 1 - Math.sqrt(best) / R;
    // smoothstep: eases in at the rim and out near the sensor, so there is no
    // visible ring where the fade starts
    return t * t * (3 - 2 * t);
  };
}

/** Paint the field into a canvas and return a data URL, or null if unpaintable. */
function rasterise(surface, ramp) {
  const grid = surface?.grid;
  if (!grid?.values?.length || !surface.scaleMax) return null;

  const { width, height, values } = grid;
  const canvas = document.createElement('canvas');
  canvas.width = RASTER_PX;
  canvas.height = RASTER_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const img = ctx.createImageData(RASTER_PX, RASTER_PX);
  const lut = makeColourLut(ramp);
  const lutMax = 255;
  const proximity = makeProximity(surface);
  const b = surface.bounds;

  for (let py = 0; py < RASTER_PX; py++) {
    // canvas y grows downward (north at the top); the grid is row-major from the
    // SOUTH edge up, so the vertical axis is flipped here
    const gy = ((RASTER_PX - 1 - py) / (RASTER_PX - 1)) * (height - 1);
    for (let px = 0; px < RASTER_PX; px++) {
      const gx = (px / (RASTER_PX - 1)) * (width - 1);
      const sample = sampleField(values, width, height, gx, gy);
      const o = (py * RASTER_PX + px) * 4;
      if (sample === null) {
        img.data[o + 3] = 0;   // fully transparent: no data, not "zero"
        continue;
      }
      const t = Math.max(0, Math.min(1, sample.value / surface.scaleMax));
      const idx = Math.round(t * lutMax) * 3;
      img.data[o] = lut[idx];
      img.data[o + 1] = lut[idx + 1];
      img.data[o + 2] = lut[idx + 2];
      // Weak returns faint, strong ones near-solid, as on a real radar product.
      // The 0.32 FLOOR is load-bearing: covered-but-quiet ground NEAR A SENSOR
      // must stay clearly visible, because "measured, and quiet" is a different
      // claim from "never measured".
      // `sample.coverage` antialiases the outer boundary; `prox` fades each
      // sensor's disc out toward its rim so the union stops looking like a cog.
      // Together they mean the field simply stops being drawn where no sensor
      // reaches - no outline needed to say so.
      const lat = b.south + (gy / (height - 1)) * (b.north - b.south);
      const lng = b.west + (gx / (width - 1)) * (b.east - b.west);
      const prox = proximity(lat, lng);
      const alpha = (0.32 + 0.6 * t) * sample.coverage * prox;
      img.data[o + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

export default function SensorSurfaceLayer({ surface, mode = 'light' }) {
  const ramp = SENSOR_RAMP[mode] || SENSOR_RAMP.light;

  const { url, bounds } = useMemo(() => {
    if (!surface?.grid?.values?.length) return { url: null, bounds: null };
    const b = surface.bounds;
    return {
      url: rasterise(surface, ramp),
      bounds: [[b.south, b.west], [b.north, b.east]],
    };
  }, [surface, ramp]);

  if (!url) return null;

  return (
    <>
      <ImageOverlay
        url={url}
        bounds={bounds}
        opacity={1}          // per-pixel alpha is baked into the raster
        interactive={false}
        // no image-rendering override: the browser's default smoothing is what
        // keeps the field continuous when Leaflet scales it up
        zIndex={200}
      />

    </>
  );
}
