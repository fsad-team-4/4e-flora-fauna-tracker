// angelyn
// TOWN COUNCIL LABELS - the map's only place-naming layer.
//
// WHY THIS EXISTS. The basemap tiles used to supply the region names, but those
// are Singapore PLANNING AREA names, not town councils: the tiles printed "Yio Chu
// Kang" and "Ang Mo Kio" as two places when both are managed by Ang Mo Kio Town
// Council. An officer reading the map by those names would mis-attribute an estate
// to the wrong manager. So the labelled basemap was removed and naming comes from
// here, sourced from /api/town-councils - the same registry the backend uses to
// attribute cases, so a label and a case can never disagree about who is in charge.
//
// APPROXIMATE, AND SAYS SO. These are circles around town centres, not official
// boundaries. The label sits at the town centre, so it names a neighbourhood, it
// does not trace a jurisdiction. The API's boundaries_approximate flag rides
// through to the caveat the parent renders next to the layer toggle.
//
// Labels are non-interactive: they must never intercept a click meant for a pin
// or a hexagon underneath them.
import { useEffect, useState } from 'react';
import { Marker, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import http from '../../http';
import { BRAND } from '../../theme';

// Below this zoom the whole island is in view and 19 labels collide into noise.
// Above it, a label names the estate an officer is actually looking at.
const MIN_LABEL_ZOOM = 12;

function labelIcon(name, dark) {
  // Short form: the map has one kind of region, so repeating "Town Council" on
  // every label spends horizontal space saying nothing.
  const short = name.replace(/ Town Council$/, '');
  const fg = dark ? '#e5e7eb' : BRAND.heading;
  const bg = dark ? 'rgba(17,24,39,.72)' : 'rgba(255,255,255,.78)';
  return L.divIcon({
    className: 'tc-label',
    html: `<div style="
      white-space:nowrap; font-size:11px; font-weight:700; letter-spacing:.3px;
      text-transform:uppercase; color:${fg}; background:${bg};
      padding:2px 7px; border-radius:5px; backdrop-filter:blur(2px);
      transform:translate(-50%,-50%); display:inline-block;
    ">${short}</div>`,
    iconSize: null,
    iconAnchor: [0, 0],
  });
}

/**
 * Fetches the council registry once and renders a name at each council centre.
 * Tracks its own zoom off the map, matching how the other layers in this map do
 * it, so no zoom prop has to be threaded down from the parent.
 */
export default function TownCouncilLabels({ mode = 'light', showRegions = false }) {
  const map = useMap();
  const [councils, setCouncils] = useState([]);
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  useEffect(() => {
    let cancelled = false;
    http.get('/api/town-councils')
      .then(({ data }) => { if (!cancelled) setCouncils(data.councils || []); })
      // Silent: a missing label layer degrades the map, it does not break it. The
      // parent still renders every data layer.
      .catch(() => { if (!cancelled) setCouncils([]); });
    return () => { cancelled = true; };
  }, []);

  if (zoom < MIN_LABEL_ZOOM) return null;

  const dark = mode === 'dark';

  return (
    <>
      {showRegions && councils.map(c => (
        <Circle
          key={`r-${c.id}`}
          center={[c.lat, c.lng]}
          radius={(c.radius_km || 0) * 1000}
          interactive={false}
          pathOptions={{
            color: dark ? '#94a3b8' : BRAND.slate,
            weight: 1,
            // Dashed on purpose: a solid ring reads as a surveyed boundary, which
            // this is not.
            dashArray: '4 5',
            opacity: 0.5,
            fillOpacity: 0.03,
          }}
        />
      ))}
      {councils.map(c => (
        <Marker
          key={c.id}
          position={[c.lat, c.lng]}
          icon={labelIcon(c.name, dark)}
          interactive={false}
          keyboard={false}
        />
      ))}
    </>
  );
}
