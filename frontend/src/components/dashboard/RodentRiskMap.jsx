import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polygon, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Card, CardContent, Box, Stack, Typography, Chip, Skeleton, Button, GlobalStyles } from '@mui/material';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import CenterFocusStrongOutlinedIcon from '@mui/icons-material/CenterFocusStrongOutlined';
import 'leaflet/dist/leaflet.css';
import { BRAND, CHART, CATEGORY_COLORS } from '../../theme';
import http from '../../http';

const RAMP = CHART.ramp;                        // sequential blue = rodent severity MAGNITUDE (not status)
// Feeding gets a hue that appears NOWHERE on the blue rodent ramp, so the two
// layers separate on colour even before shape. Teal is the category colour
// furthest from the ramp; shape (hollow ring vs filled disc) is the 2nd channel.
const FEEDING_INK = CATEGORY_COLORS.flora_health; // teal #0E8A8A
const RODENT_STROKE = '#37474F';
const BAND_LABEL = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };
const SPECIES_LABEL = { cat: 'Cat', pigeon: 'Pigeon', crow: 'Crow', mynah: 'Mynah', other: 'Other' };
const SG_CENTER = [1.3690, 103.8456]; // fallback only; the fit-to-data drives the real view
const CLUSTER_PX = 44;                 // merge markers closer than this many screen pixels

// Illustrative estate extent for the SYNTHETIC demo fixtures (one Ang Mo Kio
// estate). Context so "no reports here" reads as a statement about a bounded
// area - a fixed outline, not an official boundary, and it never places data.
const ESTATE_BOUNDARY = [
  [1.37080, 103.84470], [1.37080, 103.84720], [1.36960, 103.84760],
  [1.36740, 103.84700], [1.36730, 103.84500], [1.36840, 103.84440],
];

const srOnly = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };

// Rodent ramp step for a severity-weighted score; onDark flags the darker steps
// that need light text on top.
function rampStep(weighted, scaleMax) {
  if (!weighted || !scaleMax) return { color: RAMP[0], onDark: false };
  const frac = Math.min(1, weighted / scaleMax);
  const idx = Math.max(0, Math.min(RAMP.length - 1, Math.ceil(frac * RAMP.length) - 1));
  return { color: RAMP[idx], onDark: idx >= 3 };
}

// Disc DIAMETER encodes report count, so one report and six stay distinguishable
// even at equal severity (which drives colour).
const rodentDiameter = count => 22 + Math.min(20, (count - 1) * 5); // 22..42px
const clusterSize = k => 32 + Math.min(14, (k - 1) * 3);            // 32..46px

function fmtDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
}
function speciesSummary(species) {
  return Object.entries(species || {}).map(([k, v]) => `${v} ${SPECIES_LABEL[k] || k}`).join(' · ');
}

// One glyph as raw HTML for an L.divIcon. divIcon markers (unlike SVG CircleMarker)
// are in the tab order and fire click on Enter, so this is what makes markers
// keyboard-reachable. The count lives INSIDE the glyph, bound to its marker -
// no detached floating labels.
function glyphHtml({ size, bg, border, color, label, shadow }) {
  const fs = Math.round(Math.max(11, Math.min(15, size * 0.42)));
  return `<div style="width:${size}px;height:${size}px;display:grid;place-items:center;border-radius:50%;box-sizing:border-box;font:700 ${fs}px/1 Inter,Helvetica,Arial,sans-serif;background:${bg};border:${border};color:${color};${shadow ? `box-shadow:${shadow};` : ''}">${label}</div>`;
}
function makeIcon(html, size) {
  return L.divIcon({ className: 'rk-marker', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2] });
}
function rodentIcon(p, scaleMax) {
  const s = rodentDiameter(p.count);
  const { color, onDark } = rampStep(p.weightedScore, scaleMax);
  return makeIcon(glyphHtml({ size: s, bg: color, border: `1.5px solid ${RODENT_STROKE}`, color: onDark ? '#fff' : BRAND.heading, label: p.count > 1 ? p.count : '' }), s);
}
function feedingIcon(p) {
  const s = 24;
  return makeIcon(glyphHtml({ size: s, bg: 'rgba(14,138,138,0.12)', border: `3px solid ${FEEDING_INK}`, color: FEEDING_INK, label: p.count > 1 ? p.count : '' }), s);
}
function clusterIcon(kind, k) {
  const s = clusterSize(k);
  const col = kind === 'feeding' ? FEEDING_INK : RAMP[4];
  const border = kind === 'feeding' ? `3px solid ${col}` : `2px solid ${col}`;
  return makeIcon(glyphHtml({ size: s, bg: '#fff', border, color: col, label: k, shadow: '0 1px 5px rgba(16,24,40,.30)' }), s);
}

// Greedy pixel-distance clustering at the CURRENT zoom. Anchored and O(n^2), which
// is fine for tens of points. Positions are never moved: a cluster is only a
// display glyph at its members' centroid, and clicking it zooms in until the real
// markers separate back to their exact reported coordinates.
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

// Popup body for one rodent location (reused for a singleton and inside a cluster).
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

// One layer's markers, clustered at the live zoom. Rendered inside MapContainer so
// it can project to pixels and react to zoom.
function PointClusterLayer({ points, kind, scaleMax }) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  const groups = useMemo(() => clusterByPixel(map, points, zoom), [map, points, zoom]);
  const Body = kind === 'feeding' ? FeedingPointBody : RodentPointBody;

  return groups.map((g, gi) => {
    if (g.length === 1) {
      const p = g[0].p;
      const icon = kind === 'feeding' ? feedingIcon(p) : rodentIcon(p, scaleMax);
      return (
        <Marker key={`${kind}-${p.lat},${p.lng}`} position={[p.lat, p.lng]} icon={icon}
          keyboard title={`${p.block || 'Unlabelled block'}: ${p.count} ${kind === 'feeding' ? 'feeding sighting' : 'rodent report'}${p.count === 1 ? '' : 's'}`}>
          <Popup><Body p={p} /></Popup>
        </Marker>
      );
    }
    // cluster: centroid glyph + click-to-zoom-in + a list of every location behind it
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

// Fit to the plotted points (not the boundary) on load and whenever the reset
// control fires. Never invents a view: with no points there is nothing to fit.
function FitToData({ latlngs, fitSignal }) {
  const map = useMap();
  useEffect(() => {
    if (!latlngs.length) return;
    if (latlngs.length === 1) map.setView(latlngs[0], 17);
    else map.fitBounds(latlngs, { padding: [40, 40], maxZoom: 17 });
  }, [latlngs, fitSignal, map]);
  return null;
}

function LayerToggle({ active, disabled, onClick, swatch, label }) {
  return (
    <Box component="button" type="button" onClick={onClick} disabled={disabled} aria-pressed={active}
      sx={{
        display: 'inline-flex', alignItems: 'center', gap: 0.75, minHeight: 44, px: 1.5, py: 0.75,
        borderRadius: '999px', font: 'inherit', fontSize: 12.5, fontWeight: 600,
        border: `1px solid ${active && !disabled ? BRAND.slate : BRAND.border}`,
        bgcolor: active && !disabled ? BRAND.section : '#fff',
        color: disabled ? BRAND.textLight : BRAND.text, opacity: disabled ? 0.55 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        '&:focus-visible': { outline: `2px solid ${BRAND.primary}`, outlineOffset: 2 },
      }}>
      {swatch}
      <span>{label}</span>
      {active ? <VisibilityOutlinedIcon sx={{ fontSize: 16 }} /> : <VisibilityOffOutlinedIcon sx={{ fontSize: 16 }} />}
    </Box>
  );
}
const RodentSwatch = () => <Box aria-hidden sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: RAMP[3], flexShrink: 0 }} />;
const FeedingSwatch = () => <Box aria-hidden sx={{ width: 12, height: 12, borderRadius: '50%', border: `3px solid ${FEEDING_INK}`, boxSizing: 'border-box', flexShrink: 0 }} />;

// Coverage sentence for one layer - the map's honesty about its own reach.
function coverageLine({ error, total, mapped, unmapped, noun, windowDays }) {
  if (error) return `${noun} coverage unavailable.`;
  if (total === 0) return `No ${noun} in the last ${windowDays} days.`;
  if (mapped === 0) return `0 of ${total} ${noun} in the last ${windowDays} days have a recorded location - nothing is shown at a guessed position.`;
  return `${mapped} of ${total} ${noun} in the last ${windowDays} days have a recorded location${unmapped ? `; the other ${unmapped} ${unmapped === 1 ? 'is' : 'are'} not shown (never placed at a guessed spot)` : ''}.`;
}

/**
 * Rodent Risk & Feeding Map. Two honest layers over reported coordinates only:
 *   - Rodent risk: filled blue discs, colour = severity weight, size = report count.
 *   - Feeding sightings: hollow teal rings - a different hue AND a different shape,
 *     so the layers separate at a glance even overlapping at the smallest size.
 * Nearby markers cluster (click a cluster to zoom in / list what's behind it);
 * positions never move. Unmapped reports are counted, never placed.
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

  // keyed on the raw state fields so the memo stays stable across renders
  const dataLatLngs = useMemo(() => {
    const rp = state.points || [];
    const fp = state.feeding?.points || [];
    return [...rp.map(p => [p.lat, p.lng]), ...fp.map(p => [p.lat, p.lng])];
  }, [state.points, state.feeding]);

  const rodentCoverage = coverageLine({ error: state.error, total: totalAssessments, mapped: mappedCount, unmapped: unmappedCount, noun: 'rodent assessments', windowDays });
  const feedingCoverage = coverageLine({ error: state.error, total: feeding.total, mapped: feeding.mappedCount, unmapped: feeding.unmappedCount, noun: 'feeding sightings', windowDays });
  // reports-vs-locations reconciliation, only when they differ (i.e. reports stack)
  const rodentRecon = mappedCount > rodentPoints.length ? `${mappedCount} report${mappedCount === 1 ? '' : 's'} at ${rodentPoints.length} location${rodentPoints.length === 1 ? '' : 's'}.` : null;
  const feedingRecon = feeding.mappedCount > feedingPoints.length ? `${feeding.mappedCount} sightings at ${feedingPoints.length} locations.` : null;

  return (
    <Card>
      <GlobalStyles styles={{
        '.rk-marker': { cursor: 'pointer', background: 'transparent', border: 'none' },
        '.rk-marker:focus-visible': { outline: `3px solid ${BRAND.primary}`, outlineOffset: '2px', borderRadius: '50%' },
      }} />
      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography component="h2" variant="h6" fontWeight={700} sx={{ color: BRAND.heading }}>
          Rodent Risk & Feeding Map
        </Typography>
        <Typography variant="body2" sx={{ color: BRAND.textLight, mb: 1.5 }}>
          Reported positions only, over the last {windowDays} days. Blue discs are rodent risk
          (colour = severity, size = number of reports); teal rings are feeding sightings. Where the
          two sit close together, that is co-occurrence worth investigating - not proof of cause.
        </Typography>

        {/* coverage - one line per layer, kept prominent (the map's honesty about itself) */}
        {!state.loading && (
          <Box sx={{ p: 1.5, mb: 2, bgcolor: BRAND.section, borderRadius: '8px' }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', mb: 0.75 }}>
              <RodentSwatch />
              <Typography sx={{ fontSize: 13, color: BRAND.text, lineHeight: 1.5 }}>
                {rodentCoverage}{rodentRecon ? <Box component="span" sx={{ color: BRAND.textLight }}> {rodentRecon}</Box> : null}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
              <FeedingSwatch />
              <Typography sx={{ fontSize: 13, color: BRAND.text, lineHeight: 1.5 }}>
                {feedingCoverage}{feedingRecon ? <Box component="span" sx={{ color: BRAND.textLight }}> {feedingRecon}</Box> : null}
              </Typography>
            </Stack>
          </Box>
        )}

        {/* controls: independent layer toggles + reset view (44px touch targets, wraps at 375px) */}
        {!state.loading && !state.error && hasGeometry && (
          <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
            <LayerToggle active={showRodent} disabled={rodentPoints.length === 0} onClick={() => setShowRodent(v => !v)}
              swatch={<RodentSwatch />} label={`Rodent risk · ${rodentPoints.length} location${rodentPoints.length === 1 ? '' : 's'}`} />
            <LayerToggle active={showFeeding} disabled={feedingPoints.length === 0} onClick={() => setShowFeeding(v => !v)}
              swatch={<FeedingSwatch />} label={`Feeding · ${feedingPoints.length} location${feedingPoints.length === 1 ? '' : 's'}`} />
            <Button type="button" onClick={() => setFitSignal(n => n + 1)} startIcon={<CenterFocusStrongOutlinedIcon />}
              sx={{ minHeight: 44, borderRadius: '999px', color: BRAND.slate, border: `1px solid ${BRAND.border}`, textTransform: 'none', fontSize: 12.5,
                '&:hover': { borderColor: BRAND.slate }, '&:focus-visible': { outline: `2px solid ${BRAND.primary}`, outlineOffset: 2 } }}>
              Reset view
            </Button>
          </Stack>
        )}

        {state.loading ? (
          <Skeleton variant="rounded" height={420} />
        ) : state.error ? (
          <Typography variant="body2" sx={{ color: BRAND.textLight, py: 6, textAlign: 'center' }}>
            Map unavailable right now.
          </Typography>
        ) : !hasGeometry ? (
          // No coordinates at all: say so where the map would be - don't render an
          // empty map that looks broken.
          <Box sx={{ py: 6, px: 3, textAlign: 'center', bgcolor: BRAND.section, borderRadius: '10px', border: `1px dashed ${BRAND.border}` }}>
            <Typography sx={{ fontSize: 14, fontWeight: 700, color: BRAND.heading, mb: 0.5 }}>
              Nothing to plot yet
            </Typography>
            <Typography variant="body2" sx={{ color: BRAND.textLight }}>
              No rodent assessments or feeding sightings in the last {windowDays} days have a recorded location.
              {(unmappedCount + feeding.unmappedCount) > 0 && ` ${unmappedCount + feeding.unmappedCount} report(s) exist but were filed without a position, so they are not shown.`}
            </Typography>
          </Box>
        ) : (
          <>
            {tileError && (
              <Typography sx={{ fontSize: 12, color: BRAND.textLight, mb: 0.75 }}>
                Basemap tiles could not load - positions and the reports behind them are still shown.
              </Typography>
            )}
            <Box sx={{ height: 420, borderRadius: '10px', overflow: 'hidden', border: `1px solid ${BRAND.border}` }}>
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

            {/* legend: names both layers, both scales, the cluster glyph and the boundary */}
            <Stack spacing={0.75} sx={{ mt: 1.5 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
                <RodentSwatch />
                <Typography sx={{ fontSize: 11.5, color: BRAND.textLight }}>Rodent risk</Typography>
                <Typography sx={{ fontSize: 11, color: BRAND.textLight }}>less</Typography>
                <Box aria-hidden sx={{ width: 84, height: 8, borderRadius: 4, background: `linear-gradient(90deg, ${RAMP.join(',')})` }} />
                <Typography sx={{ fontSize: 11, color: BRAND.textLight }}>more severe</Typography>
                <Typography sx={{ fontSize: 11.5, color: BRAND.textLight }}>· max {scaleMax} (severity-weighted) · bigger disc = more reports</Typography>
              </Stack>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
                <FeedingSwatch />
                <Typography sx={{ fontSize: 11.5, color: BRAND.textLight }}>Feeding sighting (one category) · number = sightings at that location</Typography>
              </Stack>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
                <Box aria-hidden sx={{ width: 16, height: 16, borderRadius: '50%', bgcolor: '#fff', border: `2px solid ${RAMP[4]}`, display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 700, color: RAMP[4], flexShrink: 0 }}>3</Box>
                <Typography sx={{ fontSize: 11.5, color: BRAND.textLight }}>Cluster of nearby locations (number = locations) · click or zoom in to separate</Typography>
              </Stack>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Box aria-hidden sx={{ width: 14, borderTop: `2px dashed ${BRAND.slate}`, opacity: 0.6, flexShrink: 0 }} />
                <Typography sx={{ fontSize: 11.5, color: BRAND.textLight }}>Estate boundary (demo extent)</Typography>
              </Stack>
            </Stack>
          </>
        )}

        {/* Screen-reader equivalent of the map: every plotted location and the reports
            behind it, so the data is never locked inside an inaccessible canvas. */}
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
