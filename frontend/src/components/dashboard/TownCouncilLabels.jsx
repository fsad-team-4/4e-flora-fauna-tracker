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

/**
 * THE ZOOM WINDOW IS THE FIX FOR PINS COVERING LABELS.
 *
 * Labels used to show from 12 upward - which is every working zoom - so at 16-18, where
 * the pins actually live, two marker layers competed for the same pixels and the pins
 * won by covering the names.
 *
 * They now have a CEILING as well as a floor, because a council label answers "which
 * town am I in", and that question is only open while you can see several towns. Once
 * you are zoomed into one estate you already know, and the name is redundant chrome
 * sitting on top of the data. Below 12 the whole island is in frame and 19 labels
 * collide into noise; above 15 the pins own the canvas.
 */
const MIN_LABEL_ZOOM = 12;
const MAX_LABEL_ZOOM = 15;

/**
 * THE LABEL SITS BELOW THE TOWN CENTRE, NOT ON IT. This is the fix for pins covering
 * the council names.
 *
 * The zoom window above stopped the two layers competing at close range, but inside the
 * window they still collided - and collided systematically, not by chance. A council
 * label is anchored at the town centre, and the town centre is also roughly where that
 * council's reports are, so the marker for a council's busiest cluster landed on the
 * label naming it. Sembawang, Nee Soon and Ang Mo Kio were all unreadable for exactly
 * that reason while every council with no data nearby read fine.
 *
 * Z-ORDER COULD NOT FIX IT, in either direction. The pins are the data and must stay on
 * top, so raising the label above them is out; and suppressing a label under a pin would
 * have hidden precisely the three names the officer was trying to read. The only answer
 * that keeps BOTH readable is to stop them sharing a pixel.
 *
 * 46px clears the largest marker this map draws: clusterSize() caps at 50px anchored at
 * its centre, so 25px up from the coordinate, plus its 4.5px halo and the co-occurrence
 * ring, plus half a label and a small gap.
 *
 * WHAT IT COSTS, stated because the offset is a lie about position: the shift is in
 * PIXELS, so its ground distance grows as you zoom out - 0.22km at zoom 15, 1.76km at the
 * zoom-12 floor, which is the worst case. Checked against the registry rather than
 * assumed: the smallest radius of the 19 councils is Jalan Kayu at 2.2km, so even at the
 * floor the name stays inside the council it names. These labels never claimed to be
 * surveyed either - they name a neighbourhood, which is what the approximate-boundaries
 * caveat beside the layer toggle already says. A name 1.76km off centre still names the
 * right council; a name nobody can read names nothing.
 */
const LABEL_OFFSET_PX = 46;

// Own pane, below Leaflet's markerPane (600), so the stacking is DECIDED rather than
// left to DOM order. Even inside the window the pins are the data and must win; a label
// that loses deterministically can be designed around, one that loses at random cannot.
const LABEL_PANE = 'tcLabelPane';
const LABEL_PANE_Z = 580;

function labelIcon(name, dark) {
  // Short form: the map has one kind of region, so repeating "Town Council" on
  // every label spends horizontal space saying nothing.
  const short = name.replace(/ Town Council$/, '');
  const fg = dark ? '#e5e7eb' : BRAND.heading;
  // Opaquer than before, with a hairline edge. The offset separates the label from the
  // marker it used to sit under, but markers move with the data and a label can still end
  // up ADJACENT to one - at which point the plate is what keeps the text off the pin's
  // halo rather than blending into it.
  const bg = dark ? 'rgba(17,24,39,.9)' : 'rgba(255,255,255,.92)';
  const edge = dark ? 'rgba(255,255,255,.14)' : 'rgba(16,24,40,.10)';
  return L.divIcon({
    className: 'tc-label',
    html: `<div style="
      white-space:nowrap; font-size:11px; font-weight:700; letter-spacing:.3px;
      text-transform:uppercase; color:${fg}; background:${bg};
      padding:2px 7px; border-radius:5px; backdrop-filter:blur(2px);
      border:1px solid ${edge};
      transform:translate(-50%,calc(-50% + ${LABEL_OFFSET_PX}px)); display:inline-block;
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

  // One pane for the layer, created once per map.
  useEffect(() => {
    if (!map.getPane(LABEL_PANE)) {
      const pane = map.createPane(LABEL_PANE);
      pane.style.zIndex = String(LABEL_PANE_Z);
      // never intercept a click meant for a pin underneath
      pane.style.pointerEvents = 'none';
    }
  }, [map]);

  if (zoom < MIN_LABEL_ZOOM || zoom > MAX_LABEL_ZOOM) return null;

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
          pane={LABEL_PANE}
          interactive={false}
          keyboard={false}
        />
      ))}
    </>
  );
}
