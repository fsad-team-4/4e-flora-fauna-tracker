import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polygon, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Card, CardContent, Box, Stack, Typography, Chip, Skeleton, Button, Switch, Divider, GlobalStyles } from '@mui/material';
import CenterFocusStrongOutlinedIcon from '@mui/icons-material/CenterFocusStrongOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import 'leaflet/dist/leaflet.css';
import { BRAND, CHART, CATEGORY_COLORS } from '../../theme';
import http from '../../http';

const RAMP = CHART.ramp;                          // sequential blue = rodent severity MAGNITUDE (not status)
// Feeding gets a hue that appears NOWHERE on the blue rodent ramp, so the layers
// separate on colour before shape. Teal is the category colour furthest from the
// ramp; shape (hollow ring vs filled disc) is the second channel.
const FEEDING_INK = CATEGORY_COLORS.flora_health; // teal #0E8A8A
const RODENT_STROKE = '#37474F';
const CLUSTER_DARK = BRAND.slateHover;            // #263238 - dark neutral, so clusters never read as data points
const BAND_LABEL = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };
const SPECIES_LABEL = { cat: 'Cat', pigeon: 'Pigeon', crow: 'Crow', mynah: 'Mynah', other: 'Other' };
const SG_CENTER = [1.3690, 103.8456]; // fallback only; fit-to-data drives the real view
const CLUSTER_PX = 44;                 // merge markers closer than this many screen pixels

// Illustrative estate extent for the SYNTHETIC demo fixtures (one Ang Mo Kio
// estate). Context so "no reports here" reads as a statement about a bounded area
// - a fixed outline, not an official boundary, and it never places data.
const ESTATE_BOUNDARY = [
  [1.37080, 103.84470], [1.37080, 103.84720], [1.36960, 103.84760],
  [1.36740, 103.84700], [1.36730, 103.84500], [1.36840, 103.84440],
];

const srOnly = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };
const SECTION_LABEL = { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: BRAND.textLight, mb: 0.5, display: 'block' };

// Rodent fill from the ramp. Floor lifted off RAMP[0]: the faintest blue vanishes
// on the light Positron basemap, so low-severity points would be missable.
function rampColor(weighted, scaleMax) {
  if (!weighted || !scaleMax) return RAMP[1];
  const frac = Math.min(1, weighted / scaleMax);
  const idx = Math.max(0, Math.min(RAMP.length - 1, Math.ceil(frac * RAMP.length) - 1));
  return RAMP[Math.max(1, idx)];
}

// Disc DIAMETER encodes report count, so one report and six stay distinguishable
// at equal severity (colour). Single markers carry NO interior number - a number
// now means one thing only: a cluster of locations.
const rodentDiameter = count => 22 + Math.min(20, (count - 1) * 5); // 22..42px
const clusterSize = k => 30 + Math.min(16, (k - 1) * 3);            // 30..46px

function fmtDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
}
function speciesSummary(species) {
  return Object.entries(species || {}).map(([k, v]) => `${v} ${SPECIES_LABEL[k] || k}`).join(' · ');
}

// One glyph as raw HTML for an L.divIcon. divIcon markers (unlike SVG paths) sit in
// the tab order and fire click on Enter, which is what makes markers keyboard-
// reachable. A white halo shadow lifts every mark off the grey basemap for contrast.
function glyphHtml({ size, bg, border, color, label = '', radius = '50%', shadow }) {
  const fs = Math.round(Math.max(11, Math.min(15, size * 0.42)));
  return `<div style="width:${size}px;height:${size}px;display:grid;place-items:center;border-radius:${radius};box-sizing:border-box;font:700 ${fs}px/1 Inter,Helvetica,Arial,sans-serif;background:${bg};border:${border};color:${color};${shadow ? `box-shadow:${shadow};` : ''}">${label}</div>`;
}
function makeIcon(html, size) {
  return L.divIcon({ className: 'rk-marker', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2] });
}
function rodentIcon(p, scaleMax) {
  const s = rodentDiameter(p.count);
  return makeIcon(glyphHtml({ size: s, bg: rampColor(p.weightedScore, scaleMax), border: `2px solid ${RODENT_STROKE}`, color: '#fff', shadow: '0 0 0 1.5px #fff, 0 1px 3px rgba(16,24,40,.35)' }), s);
}
function feedingIcon() {
  const s = 24;
  return makeIcon(glyphHtml({ size: s, bg: 'rgba(14,138,138,0.14)', border: `3px solid ${FEEDING_INK}`, color: FEEDING_INK, shadow: '0 0 0 1.5px #fff' }), s);
}
// Cluster = dark rounded-SQUARE badge: a different colour AND a different shape
// from the round data marks, so an aggregate can never be mistaken for one point.
function clusterIcon(kind, k) {
  const s = clusterSize(k);
  const outline = kind === 'feeding' ? FEEDING_INK : RAMP[4];
  return makeIcon(glyphHtml({ size: s, bg: CLUSTER_DARK, border: `2px solid ${outline}`, color: '#fff', label: k, radius: '30%', shadow: '0 1px 5px rgba(16,24,40,.40)' }), s);
}

// Greedy pixel-distance clustering at the CURRENT zoom. Anchored, O(n^2) - fine for
// tens of points. Positions are never moved: a cluster is only a display glyph at
// its members' centroid, and clicking it zooms in until the real markers separate
// back to their exact reported coordinates.
function clusterByPixel(map, points, zoom) {
  const pts = points.map((p, idx) => ({ p, idx, xy: map.project(L.latLng(p.lat, p.lng), zoom) }));
  const used = new Array(pts.length).fill(false);
  const groups = [];
  for (let i = 0; i < pts.length; i++) {
    if (used[i]) continue;
    const g = [pts[i]]; used[i] = true;
    for (let j = i + 1; j < pts.length; j++) {
      if (!used[j] && pts[i].xy.distanceTo(pts[j].xy) <= CLUSTER_PX) { g.push(pts[j]); used[j] = true; }
    }
    groups.push(g);
  }
  return groups;
}

function RodentPointBody({ p }) {
  return (
    <Box sx={{ minWidth: 190 }}>
      <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.heading }}>
        {p.block || 'Unlabelled block'} · {p.count} report{p.count === 1 ? '' : 's'} at this location
      </Typography>
      <Typography sx={{ fontSize: 12, color: BRAND.textLight, mb: 1 }}>
        Peak {BAND_LABEL[p.riskLevel] || p.riskLevel} · weighted {p.weightedScore}
      </Typography>
      <Stack spacing={0.75} sx={{ maxHeight: 170, overflowY: 'auto' }}>
        {p.assessments.map(a => (
          <Box key={a.id} sx={{ borderTop: `1px solid ${BRAND.border}`, pt: 0.5 }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 0.25 }}>
              <Typography sx={{ fontSize: 11.5, fontWeight: 700 }}>{fmtDate(a.createdAt)}</Typography>
              <Chip label={BAND_LABEL[a.risk_level] || a.risk_level} size="small" sx={{ height: 16, fontSize: 10 }} />
              {a.floor_level && <Typography sx={{ fontSize: 11, color: BRAND.textLight }}>{a.floor_level}</Typography>}
            </Stack>
            <Typography sx={{ fontSize: 11.5, color: BRAND.text, lineHeight: 1.45 }}>{a.observations}</Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

function FeedingPointBody({ p }) {
  return (
    <Box sx={{ minWidth: 190 }}>
      <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.heading }}>
        {p.block || 'Unlabelled block'} · {p.count} feeding sighting{p.count === 1 ? '' : 's'} at this location
      </Typography>
      <Typography sx={{ fontSize: 12, color: BRAND.textLight, mb: 1 }}>{speciesSummary(p.species)}</Typography>
      <Stack spacing={0.75} sx={{ maxHeight: 170, overflowY: 'auto' }}>
        {p.sightings.map(sg => (
          <Box key={sg.id} sx={{ borderTop: `1px solid ${BRAND.border}`, pt: 0.5 }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 0.25 }}>
              <Typography sx={{ fontSize: 11.5, fontWeight: 700 }}>{fmtDate(sg.createdAt)}</Typography>
              {sg.species && <Chip label={SPECIES_LABEL[sg.species] || sg.species} size="small" sx={{ height: 16, fontSize: 10 }} />}
              {sg.floor_level && <Typography sx={{ fontSize: 11, color: BRAND.textLight }}>{sg.floor_level}</Typography>}
            </Stack>
            {sg.notes && <Typography sx={{ fontSize: 11.5, color: BRAND.text, lineHeight: 1.45 }}>{sg.notes}</Typography>}
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

// One layer's markers, clustered at the live zoom. Inside MapContainer so it can
// project to pixels and react to zoom.
function PointClusterLayer({ points, kind, scaleMax }) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  const groups = useMemo(() => clusterByPixel(map, points, zoom), [map, points, zoom]);
  const Body = kind === 'feeding' ? FeedingPointBody : RodentPointBody;

  return groups.map((g, gi) => {
    if (g.length === 1) {
      const p = g[0].p;
      const icon = kind === 'feeding' ? feedingIcon() : rodentIcon(p, scaleMax);
      return (
        <Marker key={`${kind}-${p.lat},${p.lng}`} position={[p.lat, p.lng]} icon={icon}
          keyboard title={`${p.block || 'Unlabelled block'}: ${p.count} ${kind === 'feeding' ? 'feeding sighting' : 'rodent report'}${p.count === 1 ? '' : 's'}`}>
          <Popup><Body p={p} /></Popup>
        </Marker>
      );
    }
    const members = g.map(m => m.p);
    const cLat = members.reduce((s, p) => s + p.lat, 0) / members.length;
    const cLng = members.reduce((s, p) => s + p.lng, 0) / members.length;
    const reports = members.reduce((s, p) => s + p.count, 0);
    const bounds = L.latLngBounds(members.map(p => [p.lat, p.lng]));
    return (
      <Marker key={`${kind}-cluster-${gi}-${cLat},${cLng}`} position={[cLat, cLng]} icon={clusterIcon(kind, members.length)}
        keyboard title={`${members.length} ${kind === 'feeding' ? 'feeding' : 'rodent'} locations here, ${reports} report${reports === 1 ? '' : 's'} - activate to zoom in`}>
        <Popup>
          <Box sx={{ minWidth: 200 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.heading }}>
              {members.length} locations · {reports} {kind === 'feeding' ? 'feeding sighting' : 'report'}{reports === 1 ? '' : 's'} nearby
            </Typography>
            <Button size="small" startIcon={<CenterFocusStrongOutlinedIcon />} onClick={() => map.fitBounds(bounds, { padding: [60, 60], maxZoom: 18 })}
              sx={{ my: 0.75, color: kind === 'feeding' ? FEEDING_INK : RAMP[4] }}>
              Zoom in to separate
            </Button>
            <Stack spacing={1} sx={{ maxHeight: 220, overflowY: 'auto' }}>
              {members.map(p => <Body key={`${p.lat},${p.lng}`} p={p} />)}
            </Stack>
          </Box>
        </Popup>
      </Marker>
    );
  });
}

// Fit to the plotted points (not the boundary) on load and whenever Reset fires.
function FitToData({ latlngs, fitSignal }) {
  const map = useMap();
  useEffect(() => {
    if (!latlngs.length) return;
    if (latlngs.length === 1) map.setView(latlngs[0], 17);
    else map.fitBounds(latlngs, { padding: [40, 40], maxZoom: 17 });
  }, [latlngs, fitSignal, map]);
  return null;
}

// Swatches mirror the map marks so the legend is a true key.
const RodentSwatch = () => <Box aria-hidden sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: RAMP[3], border: `1.5px solid ${RODENT_STROKE}`, boxSizing: 'border-box', flexShrink: 0 }} />;
const FeedingSwatch = () => <Box aria-hidden sx={{ width: 14, height: 14, borderRadius: '50%', border: `3px solid ${FEEDING_INK}`, bgcolor: 'rgba(14,138,138,0.14)', boxSizing: 'border-box', flexShrink: 0 }} />;
const ClusterSwatch = () => <Box aria-hidden sx={{ width: 18, height: 18, borderRadius: '30%', bgcolor: CLUSTER_DARK, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700, border: `2px solid ${RAMP[4]}`, flexShrink: 0 }}>3</Box>;

// A layer filter as a standard switch; the whole row is the label so tapping
// anywhere toggles it. minHeight 44 keeps it a comfortable touch target.
function LayerSwitch({ checked, disabled, onChange, swatch, title, note, count }) {
  return (
    <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minHeight: 44, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
      <Switch checked={checked} disabled={disabled} onChange={onChange} size="small"
        sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: BRAND.slate }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: BRAND.slate } }} />
      {swatch}
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.heading, lineHeight: 1.25 }}>
          {title} <Box component="span" sx={{ fontWeight: 500, color: BRAND.textLight }}>· {count}</Box>
        </Typography>
        <Typography sx={{ fontSize: 11, color: BRAND.textLight, lineHeight: 1.3 }}>{note}</Typography>
      </Box>
    </Box>
  );
}

// Compact one-line coverage per layer - smaller than the old grey box, but always
// on screen (never a hover-only footnote). Carries the reconciliation: reports
// (assessments) vs spots (distinct plotted locations), plus what is not shown.
function compactCoverage({ error, kind, total, mapped, locations, unmapped, windowDays }) {
  const unit = kind === 'Feeding' ? 'sightings' : 'reports';
  if (error) return `${kind}: coverage unavailable.`;
  if (total === 0) return `${kind}: none in the last ${windowDays} days.`;
  if (mapped === 0) return `${kind}: 0 of ${total} ${unit} located - none shown (never guessed).`;
  return `${kind}: ${mapped} of ${total} ${unit} located at ${locations} spot${locations === 1 ? '' : 's'}${unmapped ? `; ${unmapped} not shown` : ''}.`;
}

/**
 * Rodent Risk & Feeding Map. Two honest layers over reported coordinates only:
 *   - Rodent risk: filled blue discs, colour = severity weight, size = report count.
 *   - Feeding sightings: hollow teal rings - a different hue AND shape, so the
 *     layers separate at a glance even overlapping at the smallest size.
 * Nearby markers cluster into dark badges (number = locations) that zoom apart on
 * click; positions never move. A single side panel is the one place to read the
 * map: layer switches, the severity scale, the cluster/boundary key, and the
 * always-visible coverage line. Unmapped reports are counted, never placed.
 */
export default function RodentRiskMap() {
  const [state, setState] = useState({
    loading: true, error: false, windowDays: 30, scaleMax: 0, points: [],
    totalAssessments: 0, mappedCount: 0, unmappedCount: 0,
    feeding: { total: 0, mappedCount: 0, unmappedCount: 0, points: [] },
  });
  const [showRodent, setShowRodent] = useState(true);
  const [showFeeding, setShowFeeding] = useState(true);
  const [fitSignal, setFitSignal] = useState(0);
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    let alive = true;
    http.get('/api/rodent-riskmap')
      .then(r => { if (alive) setState({ loading: false, error: false, ...r.data }); })
      .catch(() => { if (alive) setState(s => ({ ...s, loading: false, error: true })); });
    return () => { alive = false; };
  }, []);

  const { scaleMax, mappedCount, totalAssessments, unmappedCount, windowDays } = state;
  const rodentPoints = state.points || [];
  const feeding = state.feeding || { total: 0, mappedCount: 0, unmappedCount: 0, points: [] };
  const feedingPoints = feeding.points || [];
  const hasGeometry = rodentPoints.length > 0 || feedingPoints.length > 0;

  const dataLatLngs = useMemo(() => {
    const rp = state.points || [];
    const fp = state.feeding?.points || [];
    return [...rp.map(p => [p.lat, p.lng]), ...fp.map(p => [p.lat, p.lng])];
  }, [state.points, state.feeding]);

  const rodentCov = compactCoverage({ error: state.error, kind: 'Rodent risk', total: totalAssessments, mapped: mappedCount, locations: rodentPoints.length, unmapped: unmappedCount, windowDays });
  const feedingCov = compactCoverage({ error: state.error, kind: 'Feeding', total: feeding.total, mapped: feeding.mappedCount, locations: feedingPoints.length, unmapped: feeding.unmappedCount, windowDays });

  const panel = (
    <Box sx={{ order: { xs: 2, md: 1 }, width: { xs: '100%', md: 268 }, flexShrink: 0 }}>
      <Box sx={{ border: `1px solid ${BRAND.border}`, borderRadius: '10px', p: 1.75 }}>
        <Typography component="h3" sx={SECTION_LABEL}>Layers</Typography>
        <LayerSwitch checked={showRodent} disabled={rodentPoints.length === 0} onChange={() => setShowRodent(v => !v)}
          swatch={<RodentSwatch />} title="Rodent risk" note="Filled discs" count={`${rodentPoints.length} location${rodentPoints.length === 1 ? '' : 's'}`} />
        <LayerSwitch checked={showFeeding} disabled={feedingPoints.length === 0} onChange={() => setShowFeeding(v => !v)}
          swatch={<FeedingSwatch />} title="Feeding" note="Hollow rings (one category)" count={`${feedingPoints.length} location${feedingPoints.length === 1 ? '' : 's'}`} />

        <Divider sx={{ my: 1.25 }} />
        <Typography component="h3" sx={SECTION_LABEL}>Rodent severity</Typography>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 0.5 }}>
          <Typography sx={{ fontSize: 11, color: BRAND.textLight }}>less</Typography>
          <Box aria-hidden sx={{ flexGrow: 1, height: 8, borderRadius: 4, background: `linear-gradient(90deg, ${RAMP.join(',')})` }} />
          <Typography sx={{ fontSize: 11, color: BRAND.textLight }}>more</Typography>
        </Stack>
        <Typography sx={{ fontSize: 11, color: BRAND.textLight, lineHeight: 1.4 }}>
          Colour = severity weight · disc size = number of reports · scale max {scaleMax}
        </Typography>

        <Divider sx={{ my: 1.25 }} />
        <Typography component="h3" sx={SECTION_LABEL}>Also on the map</Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.75 }}>
          <ClusterSwatch />
          <Typography sx={{ fontSize: 11.5, color: BRAND.textLight, lineHeight: 1.35 }}>Cluster - number = locations grouped here; click or zoom in to split</Typography>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Box aria-hidden sx={{ width: 16, borderTop: `2px dashed ${BRAND.slate}`, opacity: 0.6, flexShrink: 0 }} />
          <Typography sx={{ fontSize: 11.5, color: BRAND.textLight }}>Estate boundary (demo extent)</Typography>
        </Stack>

        <Divider sx={{ my: 1.25 }} />
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'flex-start' }}>
          <InfoOutlinedIcon sx={{ fontSize: 15, color: BRAND.textLight, mt: '1px', flexShrink: 0 }} />
          <Box>
            <Typography sx={{ fontSize: 12, color: BRAND.text, lineHeight: 1.45 }}>{rodentCov}</Typography>
            <Typography sx={{ fontSize: 12, color: BRAND.text, lineHeight: 1.45 }}>{feedingCov}</Typography>
          </Box>
        </Stack>

        <Button type="button" onClick={() => setFitSignal(n => n + 1)} startIcon={<CenterFocusStrongOutlinedIcon />} fullWidth
          sx={{ mt: 1.25, minHeight: 44, borderRadius: '8px', color: BRAND.slate, border: `1px solid ${BRAND.border}`, textTransform: 'none', fontSize: 13,
            '&:hover': { borderColor: BRAND.slate }, '&:focus-visible': { outline: `2px solid ${BRAND.primary}`, outlineOffset: 2 } }}>
          Reset view
        </Button>
      </Box>
    </Box>
  );

  const mapCol = (
    <Box sx={{ order: { xs: 1, md: 2 }, flexGrow: 1, minWidth: 0 }}>
      {tileError && (
        <Typography sx={{ fontSize: 12, color: BRAND.textLight, mb: 0.75 }}>
          Basemap tiles could not load - positions and the reports behind them are still shown.
        </Typography>
      )}
      <Box sx={{ height: { xs: 380, md: 480 }, borderRadius: '10px', overflow: 'hidden', border: `1px solid ${BRAND.border}` }}>
        <MapContainer center={SG_CENTER} zoom={16} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd" maxZoom={20}
            eventHandlers={{ tileerror: () => setTileError(true) }}
          />
          <FitToData latlngs={dataLatLngs} fitSignal={fitSignal} />
          <Polygon positions={ESTATE_BOUNDARY}
            pathOptions={{ color: BRAND.slate, weight: 1.5, opacity: 0.6, dashArray: '6 6', fill: true, fillColor: BRAND.slate, fillOpacity: 0.04 }} />
          {showRodent && <PointClusterLayer points={rodentPoints} kind="rodent" scaleMax={scaleMax} />}
          {showFeeding && <PointClusterLayer points={feedingPoints} kind="feeding" scaleMax={scaleMax} />}
        </MapContainer>
      </Box>
    </Box>
  );

  return (
    <Card>
      <GlobalStyles styles={{
        '.rk-marker': { cursor: 'pointer', background: 'transparent', border: 'none' },
        '.rk-marker:focus-visible': { outline: `3px solid ${BRAND.primary}`, outlineOffset: '2px', borderRadius: '30%' },
      }} />
      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography component="h2" variant="h6" fontWeight={700} sx={{ color: BRAND.heading }}>
          Rodent Risk & Feeding Map
        </Typography>
        <Typography variant="body2" sx={{ color: BRAND.textLight, mb: 2 }}>
          Reported positions only, last {windowDays} days. Feeding sitting near rodent risk is
          co-occurrence worth investigating - not proof of cause.
        </Typography>

        {state.loading ? (
          <Skeleton variant="rounded" height={440} />
        ) : state.error ? (
          <Typography variant="body2" sx={{ color: BRAND.textLight, py: 6, textAlign: 'center' }}>
            Map unavailable right now.
          </Typography>
        ) : !hasGeometry ? (
          // No coordinates at all: say so where the map would be, rather than
          // render an empty map that looks broken.
          <Box sx={{ py: 6, px: 3, textAlign: 'center', bgcolor: BRAND.section, borderRadius: '10px', border: `1px dashed ${BRAND.border}` }}>
            <Typography sx={{ fontSize: 14, fontWeight: 700, color: BRAND.heading, mb: 0.5 }}>Nothing to plot yet</Typography>
            <Typography variant="body2" sx={{ color: BRAND.textLight }}>
              No rodent assessments or feeding sightings in the last {windowDays} days have a recorded location.
              {(unmappedCount + feeding.unmappedCount) > 0 && ` ${unmappedCount + feeding.unmappedCount} report(s) exist but were filed without a position, so they are not shown.`}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, alignItems: 'flex-start' }}>
            {panel}
            {mapCol}
          </Box>
        )}

        {/* Screen-reader equivalent of the map: every plotted location and the
            reports behind it, so the data is never locked inside a canvas. */}
        {!state.loading && !state.error && hasGeometry && (
          <Box component="section" aria-label="Text list of plotted reports" sx={srOnly}>
            <Typography component="h3">
              Rodent risk: {mappedCount} report{mappedCount === 1 ? '' : 's'} at {rodentPoints.length} location{rodentPoints.length === 1 ? '' : 's'}
              {unmappedCount ? `; ${unmappedCount} not located` : ''}.
            </Typography>
            <Box component="ul">
              {rodentPoints.map(p => (
                <li key={`sr-r-${p.lat},${p.lng}`}>
                  {p.block || 'Unlabelled block'}: {p.count} report{p.count === 1 ? '' : 's'}, peak {BAND_LABEL[p.riskLevel] || p.riskLevel} risk.
                  <Box component="ul">
                    {p.assessments.map(a => (
                      <li key={a.id}>{fmtDate(a.createdAt)}, {BAND_LABEL[a.risk_level] || a.risk_level} risk{a.floor_level ? `, ${a.floor_level}` : ''}: {a.observations}</li>
                    ))}
                  </Box>
                </li>
              ))}
            </Box>
            <Typography component="h3">
              Feeding: {feeding.mappedCount} sighting{feeding.mappedCount === 1 ? '' : 's'} at {feedingPoints.length} location{feedingPoints.length === 1 ? '' : 's'}
              {feeding.unmappedCount ? `; ${feeding.unmappedCount} not located` : ''}.
            </Typography>
            <Box component="ul">
              {feedingPoints.map(p => (
                <li key={`sr-f-${p.lat},${p.lng}`}>
                  {p.block || 'Unlabelled block'}: {speciesSummary(p.species)}.
                  <Box component="ul">
                    {p.sightings.map(sg => (
                      <li key={sg.id}>{fmtDate(sg.createdAt)}{sg.species ? `, ${SPECIES_LABEL[sg.species] || sg.species}` : ''}{sg.floor_level ? `, ${sg.floor_level}` : ''}{sg.notes ? `: ${sg.notes}` : ''}</li>
                    ))}
                  </Box>
                </li>
              ))}
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
