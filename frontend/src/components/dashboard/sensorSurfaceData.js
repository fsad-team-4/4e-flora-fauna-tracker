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

// Grid resolution across the sensors' bounding box. 28 left visibly blocky
// rectangles at island scale; 52 gives ~250m cells, which reads as the smooth
// field the weather-map treatment needs while staying well inside the route's
// cap and only emitting cells that actually have a sensor in range.
const GRID_RESOLUTION = 52;

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
