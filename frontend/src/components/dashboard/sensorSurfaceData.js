import { useEffect, useState } from 'react';
import http from '../../http';

/**
 * Data access for the SIMULATED RATSENSE surface.
 *
 * Its own module (not the layer component) because a file exporting both a
 * component and hooks/constants breaks React Fast Refresh.
 *
 * THE DISCLOSURE STRING LIVES HERE AND NOWHERE ELSE. The toggle, the legend, the
 * canvas banner and the API envelope all show the same sentence; keeping one
 * definition is what stops a later edit fixing the wording in three places and
 * missing the fourth.
 */
export const SIMULATED_LABEL = 'Simulated sensor data (pilot integration not yet live)';

// Grid resolution across the sensors' bounding box. The surface is contoured
// client-side with marching squares, so this is the sampling density of the
// field rather than the size of a drawn cell: at 180 the iso-lines are smooth
// at every usable zoom, and nothing renders per-cell.
const GRID_RESOLUTION = 180;

/**
 * Band thresholds, shared by the contour layer AND the legend so they can never
 * disagree. Bands start above zero because a band at 0 would be indistinguish-
 * able from unmeasured ground, which is a different claim.
 */
export function bandThresholds(scaleMax, steps) {
  if (!scaleMax || scaleMax <= 0) return [];
  return Array.from({ length: steps }, (_, i) => ((i + 1) / (steps + 1)) * scaleMax);
}

export function useSensorSurface({ enabled, windowDays = 30, councils = null, asOf = null }) {
  const [state, setState] = useState({ loading: false, error: false, data: null });
  // councils is a new array identity each render; key on its content so the
  // effect does not refetch on every parent render
  const councilKey = councils?.length ? councils.join(',') : '';

  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const params = { windowDays, gridResolution: GRID_RESOLUTION };
    if (councilKey) params.councils = councilKey;
    if (asOf) params.asOf = asOf;

    // `loading` is set from the request callbacks rather than synchronously in
    // the effect body, which would trigger a cascading render.
    http.get('/api/sensor-surface', { params })
      .then(r => { if (alive) setState({ loading: false, error: false, data: r.data }); })
      .catch(() => { if (alive) setState({ loading: false, error: true, data: null }); });
    return () => { alive = false; };
  }, [enabled, windowDays, councilKey, asOf]);

  return state;
}
