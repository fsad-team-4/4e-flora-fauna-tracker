import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polygon, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Card, CardContent, Box, Stack, Typography, Skeleton, Button, IconButton, Switch, Divider, Collapse, Select, MenuItem, Paper, GlobalStyles } from '@mui/material';
import CenterFocusStrongOutlinedIcon from '@mui/icons-material/CenterFocusStrongOutlined';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import 'leaflet/dist/leaflet.css';
import { BRAND, CHART, CATEGORY_COLORS } from '../../theme';
import http from '../../http';

const RAMP = CHART.ramp;                          // sequential blue = rodent severity MAGNITUDE (not status)
// Feeding gets a hue nowhere on the blue ramp; shape (ring vs disc) is the 2nd channel.
const FEEDING_INK = CATEGORY_COLORS.flora_health; // teal #0E8A8A
const RODENT_STROKE = '#37474F';
const BAND_LABEL = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };
const SPECIES_LABEL = { cat: 'Cat', pigeon: 'Pigeon', crow: 'Crow', mynah: 'Mynah', other: 'Other' };
const SG_CENTER = [1.3690, 103.8456];
const CLUSTER_PX = 44;
const WINDOW_OPTIONS = [7, 14, 30, 60, 90];

// Illustrative estate extent for the SYNTHETIC demo fixtures - context so "no
// reports here" is meaningful; a fixed outline, never places data.
const ESTATE_BOUNDARY = [
  [1.37080, 103.84470], [1.37080, 103.84720], [1.36960, 103.84760],
  [1.36740, 103.84700], [1.36730, 103.84500], [1.36840, 103.84440],
];

// VOCABULARY (enforced): "locations" = distinct plotted points; "reports" =
// individual assessments/sightings; "blocks" = estate blocks. No other synonyms.
const srOnly = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };
const SECTION_LABEL = { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: BRAND.textLight, mb: 0.5, display: 'block' };

// Rodent fill from the ramp; floor lifted off RAMP[0] which vanishes on the grey basemap.
function rampColor(weighted, scaleMax) {
  if (!weighted || !scaleMax) return RAMP[1];
  const frac = Math.min(1, weighted / scaleMax);
  const idx = Math.max(0, Math.min(RAMP.length - 1, Math.ceil(frac * RAMP.length) - 1));
  return RAMP[Math.max(1, idx)];
}
const rodentDiameter = count => 22 + Math.min(20, (count - 1) * 5); // 22..42px
const clusterSize = k => 30 + Math.min(16, (k - 1) * 3);            // 30..46px

function fmtDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
}
function speciesSummary(species) {
  return Object.entries(species || {}).map(([k, v]) => `${v} ${SPECIES_LABEL[k] || k}`).join(' · ');
}

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
// Cluster = light rounded-SQUARE badge, tinted + coloured to its layer so its
// identity (rodent vs feeding) is legible before opening it. Square shape keeps
// it distinct from round data marks; light weight keeps severe discs on top.
function clusterIcon(kind, k) {
  const feeding = kind === 'feeding';
  const s = clusterSize(k);
  const col = feeding ? FEEDING_INK : RAMP[4];
  const bg = feeding ? 'rgba(14,138,138,0.16)' : 'rgba(37,106,191,0.16)';
  return makeIcon(glyphHtml({ size: s, bg, border: `2px solid ${col}`, color: col, label: k, radius: '30%', shadow: '0 1px 4px rgba(16,24,40,.20)' }), s);
}

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

// Full detail for ONE location (used in a single-location popup).
function RodentPointBody({ p }) {
  return (
    <Box sx={{ minWidth: 200 }}>
      <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.heading }}>
        {p.block || 'Unlabelled block'} · {p.count} report{p.count === 1 ? '' : 's'}
      </Typography>
      <Typography sx={{ fontSize: 12, color: BRAND.textLight, mb: 1 }}>
        Peak {BAND_LABEL[p.riskLevel] || p.riskLevel} · weighted {p.weightedScore}
      </Typography>
      <Stack spacing={0.75}>
        {p.assessments.map(a => (
          <Box key={a.id} sx={{ borderTop: `1px solid ${BRAND.border}`, pt: 0.5 }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 0.25 }}>
              <Typography sx={{ fontSize: 11.5, fontWeight: 700 }}>{fmtDate(a.createdAt)}</Typography>
              <Box component="span" sx={{ fontSize: 10, fontWeight: 700, px: 0.6, py: '1px', borderRadius: '4px', bgcolor: BRAND.section, color: BRAND.text }}>{BAND_LABEL[a.risk_level] || a.risk_level}</Box>
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
    <Box sx={{ minWidth: 200 }}>
      <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.heading }}>
        {p.block || 'Unlabelled block'} · {p.count} feeding sighting{p.count === 1 ? '' : 's'}
      </Typography>
      <Typography sx={{ fontSize: 12, color: BRAND.textLight, mb: 1 }}>{speciesSummary(p.species)}</Typography>
      <Stack spacing={0.75}>
        {p.sightings.map(sg => (
          <Box key={sg.id} sx={{ borderTop: `1px solid ${BRAND.border}`, pt: 0.5 }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 0.25 }}>
              <Typography sx={{ fontSize: 11.5, fontWeight: 700 }}>{fmtDate(sg.createdAt)}</Typography>
              {sg.species && <Box component="span" sx={{ fontSize: 10, fontWeight: 700, px: 0.6, py: '1px', borderRadius: '4px', bgcolor: BRAND.section, color: BRAND.text }}>{SPECIES_LABEL[sg.species] || sg.species}</Box>}
              {sg.floor_level && <Typography sx={{ fontSize: 11, color: BRAND.textLight }}>{sg.floor_level}</Typography>}
            </Stack>
            {sg.notes && <Typography sx={{ fontSize: 11.5, color: BRAND.text, lineHeight: 1.45 }}>{sg.notes}</Typography>}
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

// One layer's markers, clustered at the live zoom (positions never move; a cluster
// is a display glyph that zooms apart on click).
function PointClusterLayer({ points, kind, scaleMax, dimNonCoOccur }) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  const groups = useMemo(() => clusterByPixel(map, points, zoom), [map, points, zoom]);
  const Body = kind === 'feeding' ? FeedingPointBody : RodentPointBody;
  const unit = kind === 'feeding' ? 'feeding sighting' : 'report';

  return groups.map((g, gi) => {
    if (g.length === 1) {
      const p = g[0].p;
      const icon = kind === 'feeding' ? feedingIcon() : rodentIcon(p, scaleMax);
      return (
        <Marker key={`${kind}-${p.lat},${p.lng}`} position={[p.lat, p.lng]} icon={icon}
          opacity={dimNonCoOccur && !p.coOccurs ? 0.3 : 1}
          keyboard title={`${p.block || 'Unlabelled block'}: ${p.count} ${unit}${p.count === 1 ? '' : 's'}`}>
          <Popup maxHeight={300} minWidth={200}><Body p={p} /></Popup>
        </Marker>
      );
    }
    // cluster: compact SUMMARY only (no per-report dump), plus zoom-to-separate.
    const members = g.map(m => m.p);
    const cLat = members.reduce((s, p) => s + p.lat, 0) / members.length;
    const cLng = members.reduce((s, p) => s + p.lng, 0) / members.length;
    const reports = members.reduce((s, p) => s + p.count, 0);
    const clusterCoOccurs = members.some(p => p.coOccurs);
    const bounds = L.latLngBounds(members.map(p => [p.lat, p.lng]));
    return (
      <Marker key={`${kind}-cluster-${gi}-${cLat},${cLng}`} position={[cLat, cLng]} icon={clusterIcon(kind, members.length)}
        opacity={dimNonCoOccur && !clusterCoOccurs ? 0.3 : 1}
        keyboard title={`${members.length} ${kind} locations, ${reports} report${reports === 1 ? '' : 's'} - activate to zoom in`}>
        <Popup maxHeight={300} minWidth={210}>
          <Box sx={{ minWidth: 200 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.heading }}>
              {members.length} {kind} locations · {reports} report{reports === 1 ? '' : 's'}
            </Typography>
            <Button size="small" startIcon={<CenterFocusStrongOutlinedIcon />} onClick={() => map.fitBounds(bounds, { padding: [60, 60], maxZoom: 18 })}
              sx={{ my: 0.5, px: 0, color: kind === 'feeding' ? FEEDING_INK : RAMP[4], textTransform: 'none' }}>
              Zoom in to separate
            </Button>
            <Stack spacing={0.5}>
              {members.map(p => (
                <Stack key={`${p.lat},${p.lng}`} direction="row" spacing={0.75} sx={{ alignItems: 'baseline', borderTop: `1px solid ${BRAND.border}`, pt: 0.5 }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 700, color: BRAND.heading }}>{p.block || 'Unlabelled'}</Typography>
                  <Typography sx={{ fontSize: 11.5, color: BRAND.textLight }}>
                    {p.count} {kind === 'feeding' ? 'sighting' : 'report'}{p.count === 1 ? '' : 's'}{kind === 'feeding' ? '' : ` · peak ${BAND_LABEL[p.riskLevel] || p.riskLevel}`}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Box>
        </Popup>
      </Marker>
    );
  });
}

function FitToData({ latlngs, fitSignal }) {
  const map = useMap();
  useEffect(() => {
    if (!latlngs.length) return;
    if (latlngs.length === 1) map.setView(latlngs[0], 17);
    else map.fitBounds(latlngs, { padding: [40, 40], maxZoom: 17 });
  }, [latlngs, fitSignal, map]);
  return null;
}
// Fly to the co-occurrence locations when the finding card asks (signal bump).
function FlyTo({ latlngs, signal }) {
  const map = useMap();
  useEffect(() => {
    if (!signal || !latlngs.length) return;
    if (latlngs.length === 1) map.setView(latlngs[0], 18);
    else map.fitBounds(latlngs, { padding: [50, 50], maxZoom: 18 });
  }, [signal, latlngs, map]);
  return null;
}

const RodentSwatch = () => <Box aria-hidden sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: RAMP[3], border: `1.5px solid ${RODENT_STROKE}`, boxSizing: 'border-box', flexShrink: 0 }} />;
const FeedingSwatch = () => <Box aria-hidden sx={{ width: 14, height: 14, borderRadius: '50%', border: `3px solid ${FEEDING_INK}`, bgcolor: 'rgba(14,138,138,0.14)', boxSizing: 'border-box', flexShrink: 0 }} />;
const ClusterSwatch = () => <Box aria-hidden sx={{ width: 18, height: 18, borderRadius: '30%', bgcolor: 'rgba(37,106,191,0.16)', color: RAMP[4], display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700, border: `2px solid ${RAMP[4]}`, flexShrink: 0 }}>3</Box>;
const CoOccurSwatch = () => <Box aria-hidden sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: RAMP[3], border: `2px solid ${FEEDING_INK}`, boxSizing: 'border-box', flexShrink: 0 }} />;

function LayerSwitch({ checked, disabled, onChange, swatch, title, note, count }) {
  return (
    <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minHeight: 44, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
      <Switch checked={checked} disabled={disabled} onChange={onChange} size="small" inputProps={{ 'aria-label': `${title} layer` }}
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

function compactCoverage({ error, kind, total, mapped, locations, unmapped, windowDays }) {
  const unit = kind === 'Feeding' ? 'sightings' : 'reports';
  if (error) return `${kind}: coverage unavailable.`;
  if (total === 0) return `${kind}: none in the last ${windowDays} days.`;
  if (mapped === 0) return `${kind}: 0 of ${total} ${unit} located - none shown (never guessed).`;
  return `${kind}: ${mapped} of ${total} ${unit} located at ${locations} location${locations === 1 ? '' : 's'}${unmapped ? `; ${unmapped} not shown` : ''}.`;
}

/**
 * Rodent Risk & Feeding Map. Two honest layers over reported coordinates only:
 * blue discs (colour = severity, size = report count) and teal feeding rings.
 * The map is the surface; a collapsible floating panel holds the legend + layer
 * switches. Co-occurrence (feeding + rodent in one block) is surfaced as a finding
 * with a fly-to, not buried in a toggle. Nearby marks cluster into tinted per-layer
 * badges that zoom apart on click; positions never move; unmapped reports are
 * counted, never placed.
 */
export default function RodentRiskMap() {
  const [state, setState] = useState({
    loading: true, error: false, scaleMax: 0, points: [],
    totalAssessments: 0, mappedCount: 0, unmappedCount: 0,
    feeding: { total: 0, mappedCount: 0, unmappedCount: 0, points: [] }, coOccurrenceBlocks: [],
  });
  const [windowDays, setWindowDays] = useState(30);
  const [showRodent, setShowRodent] = useState(true);
  const [showFeeding, setShowFeeding] = useState(true);
  const [showCoOccur, setShowCoOccur] = useState(false);
  const [showLegend, setShowLegend] = useState(true);
  const [showCovDetails, setShowCovDetails] = useState(false);
  const [fitSignal, setFitSignal] = useState(0);
  const [flySignal, setFlySignal] = useState(0);
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    let alive = true;
    http.get('/api/rodent-riskmap', { params: { windowDays } })
      .then(r => { if (alive) setState({ loading: false, error: false, ...r.data }); })
      .catch(() => { if (alive) setState(s => ({ ...s, loading: false, error: true })); });
    return () => { alive = false; };
  }, [windowDays]);

  // Changing the window shows the skeleton while the refetch is in flight. Done in
  // the handler (not the effect) so it isn't a synchronous setState-in-effect.
  const changeWindow = e => { setState(s => ({ ...s, loading: true })); setWindowDays(e.target.value); };

  const { scaleMax, mappedCount, totalAssessments, unmappedCount } = state;
  const rodentPoints = state.points || [];
  const feeding = state.feeding || { total: 0, mappedCount: 0, unmappedCount: 0, points: [] };
  const feedingPoints = feeding.points || [];
  const hasGeometry = rodentPoints.length > 0 || feedingPoints.length > 0;
  const coBlocks = state.coOccurrenceBlocks || [];

  const dataLatLngs = useMemo(() => {
    const rp = state.points || [];
    const fp = state.feeding?.points || [];
    return [...rp.map(p => [p.lat, p.lng]), ...fp.map(p => [p.lat, p.lng])];
  }, [state.points, state.feeding]);
  const coOccurLatLngs = useMemo(() => {
    const rp = (state.points || []).filter(p => p.coOccurs).map(p => [p.lat, p.lng]);
    const fp = (state.feeding?.points || []).filter(p => p.coOccurs).map(p => [p.lat, p.lng]);
    return [...rp, ...fp];
  }, [state.points, state.feeding]);

  const rodentCov = compactCoverage({ error: state.error, kind: 'Rodent risk', total: totalAssessments, mapped: mappedCount, locations: rodentPoints.length, unmapped: unmappedCount, windowDays });
  const feedingCov = compactCoverage({ error: state.error, kind: 'Feeding', total: feeding.total, mapped: feeding.mappedCount, locations: feedingPoints.length, unmapped: feeding.unmappedCount, windowDays });

  const rodentFrac = totalAssessments ? unmappedCount / totalAssessments : 0;
  const feedingFrac = feeding.total ? feeding.unmappedCount / feeding.total : 0;
  const poorCoverage = !state.error && (rodentFrac >= 0.4 || feedingFrac >= 0.4);
  const worstPct = Math.round(Math.max(rodentFrac, feedingFrac) * 100);

  const flyToCoOccur = () => { setShowCoOccur(true); setFlySignal(n => n + 1); };

  const legendBody = (
    <Box sx={{ p: 1.5, maxHeight: { md: 400 }, overflowY: 'auto' }}>
      <Typography component="h3" sx={SECTION_LABEL}>Layers</Typography>
      <LayerSwitch checked={showRodent} disabled={rodentPoints.length === 0} onChange={() => setShowRodent(v => !v)}
        swatch={<RodentSwatch />} title="Rodent risk" note="Filled discs" count={`${rodentPoints.length} location${rodentPoints.length === 1 ? '' : 's'}`} />
      <LayerSwitch checked={showFeeding} disabled={feedingPoints.length === 0} onChange={() => setShowFeeding(v => !v)}
        swatch={<FeedingSwatch />} title="Feeding" note="Hollow rings (one category)" count={`${feedingPoints.length} location${feedingPoints.length === 1 ? '' : 's'}`} />
      <LayerSwitch checked={showCoOccur} disabled={coBlocks.length === 0} onChange={() => setShowCoOccur(v => !v)}
        swatch={<CoOccurSwatch />} title="Highlight co-occurrence" note="Dim blocks without both signals" count={`${coBlocks.length} block${coBlocks.length === 1 ? '' : 's'}`} />

      <Divider sx={{ my: 1.25 }} />
      <Typography component="h3" sx={SECTION_LABEL}>Rodent severity</Typography>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 0.75 }}>
        <Typography sx={{ fontSize: 11, color: BRAND.textLight }}>less</Typography>
        <Box aria-hidden sx={{ flexGrow: 1, height: 8, borderRadius: 4, background: `linear-gradient(90deg, ${RAMP.join(',')})` }} />
        <Typography sx={{ fontSize: 11, color: BRAND.textLight }}>more</Typography>
      </Stack>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
        <Stack direction="row" spacing={0.6} sx={{ alignItems: 'center' }}>
          <Box aria-hidden sx={{ width: 15, height: 15, borderRadius: '50%', bgcolor: RAMP[1], border: `2px solid ${RODENT_STROKE}`, flexShrink: 0 }} />
          <Typography sx={{ fontSize: 11, color: BRAND.textLight }}>low · 1</Typography>
        </Stack>
        <Stack direction="row" spacing={0.6} sx={{ alignItems: 'center' }}>
          <Box aria-hidden sx={{ width: 26, height: 26, borderRadius: '50%', bgcolor: RAMP[4], border: `2px solid ${RODENT_STROKE}`, flexShrink: 0 }} />
          <Typography sx={{ fontSize: 11, color: BRAND.textLight }}>high · several</Typography>
        </Stack>
      </Stack>
      <Typography sx={{ fontSize: 11, color: BRAND.textLight, mt: 0.25 }}>colour = severity · size = reports · max {scaleMax}</Typography>

      <Divider sx={{ my: 1.25 }} />
      <Typography component="h3" sx={SECTION_LABEL}>Also on the map</Typography>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.75 }}>
        <ClusterSwatch />
        <Typography sx={{ fontSize: 11.5, color: BRAND.textLight, lineHeight: 1.35 }}>Cluster (tinted to its layer) - number = locations; click or zoom to split</Typography>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Box aria-hidden sx={{ width: 16, borderTop: `2px dashed ${BRAND.slate}`, opacity: 0.6, flexShrink: 0 }} />
        <Typography sx={{ fontSize: 11.5, color: BRAND.textLight }}>Estate boundary (demo extent)</Typography>
      </Stack>

      {!poorCoverage && (
        <>
          <Divider sx={{ my: 1.25 }} />
          <Typography sx={{ fontSize: 12, color: BRAND.text, lineHeight: 1.45 }}>{rodentCov}</Typography>
          <Typography sx={{ fontSize: 12, color: BRAND.text, lineHeight: 1.45 }}>{feedingCov}</Typography>
        </>
      )}

      <Button type="button" onClick={() => setFitSignal(n => n + 1)} startIcon={<CenterFocusStrongOutlinedIcon />} fullWidth
        sx={{ mt: 1.25, minHeight: 44, borderRadius: '8px', color: BRAND.slate, border: `1px solid ${BRAND.border}`, textTransform: 'none', fontSize: 13,
          '&:hover': { borderColor: BRAND.slate }, '&:focus-visible': { outline: `2px solid ${BRAND.primary}`, outlineOffset: 2 } }}>
        Reset view
      </Button>
    </Box>
  );

  return (
    <Card>
      <GlobalStyles styles={{
        '.rk-marker': { cursor: 'pointer', background: 'transparent', border: 'none' },
        '.rk-marker:focus-visible': { outline: `3px solid ${BRAND.primary}`, outlineOffset: '2px', borderRadius: '30%' },
      }} />
      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ justifyContent: 'space-between', alignItems: { sm: 'flex-start' }, mb: 1.5 }}>
          <Box>
            <Typography component="h2" variant="h6" fontWeight={700} sx={{ color: BRAND.heading }}>
              Rodent Risk & Feeding Map
            </Typography>
            <Typography variant="body2" sx={{ color: BRAND.textLight }}>
              Reported positions only. Feeding near rodent risk is co-occurrence worth investigating - not proof of cause.
            </Typography>
          </Box>
          <Select value={windowDays} onChange={changeWindow} size="small"
            aria-label="Time window" sx={{ fontSize: 13, minWidth: 140, flexShrink: 0, alignSelf: { xs: 'flex-start', sm: 'auto' } }}>
            {WINDOW_OPTIONS.map(d => <MenuItem key={d} value={d} sx={{ fontSize: 13 }}>Last {d} days</MenuItem>)}
          </Select>
        </Stack>

        {/* Data quality: a headline stat + a real button; numbers behind a disclosure. */}
        {!state.loading && poorCoverage && (
          <Box sx={{ p: 1.25, mb: 1.5, borderRadius: '8px', bgcolor: '#FFF4E5', border: '1px solid #F0D9B5' }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
              <WarningAmberRoundedIcon sx={{ fontSize: 18, color: '#8A5200', flexShrink: 0 }} />
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#6B4200', flexGrow: 1, minWidth: 160 }}>
                {worstPct}% of reports have no recorded location
              </Typography>
              <Button component={RouterLink} to="/rodent" size="small" variant="outlined"
                sx={{ minHeight: 36, textTransform: 'none', fontSize: 12.5, color: '#6B4200', borderColor: '#E0C08A', '&:hover': { borderColor: '#8A5200', bgcolor: 'transparent' } }}>
                Add locations
              </Button>
              <IconButton size="small" onClick={() => setShowCovDetails(v => !v)} aria-label={showCovDetails ? 'Hide coverage details' : 'Show coverage details'} sx={{ color: '#8A5200' }}>
                <ExpandMoreRoundedIcon sx={{ fontSize: 20, transform: showCovDetails ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
              </IconButton>
            </Stack>
            <Collapse in={showCovDetails}>
              <Box sx={{ pl: 3.5, pt: 0.75 }}>
                <Typography sx={{ fontSize: 12, color: '#8A5200', lineHeight: 1.5 }}>{rodentCov}</Typography>
                <Typography sx={{ fontSize: 12, color: '#8A5200', lineHeight: 1.5 }}>{feedingCov}</Typography>
              </Box>
            </Collapse>
          </Box>
        )}

        {/* Co-occurrence surfaced as a finding, not just a filter. */}
        {!state.loading && !state.error && coBlocks.length > 0 && (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', p: 1.25, mb: 1.5, borderRadius: '8px', bgcolor: BRAND.section, border: `1px solid ${BRAND.border}`, flexWrap: 'wrap', rowGap: 0.5 }}>
            <CoOccurSwatch />
            <Typography sx={{ fontSize: 13, color: BRAND.text, flexGrow: 1, minWidth: 180 }}>
              <b>{coBlocks.length} block{coBlocks.length === 1 ? '' : 's'}</b> show feeding and rodent risk together - worth investigating.
            </Typography>
            <Button size="small" onClick={flyToCoOccur} endIcon={<ArrowForwardRoundedIcon />}
              disabled={coOccurLatLngs.length === 0}
              sx={{ minHeight: 36, textTransform: 'none', fontSize: 12.5, color: BRAND.slate, border: `1px solid ${BRAND.border}`, '&:hover': { borderColor: BRAND.slate } }}>
              Show on map
            </Button>
          </Stack>
        )}

        {state.loading ? (
          <Skeleton variant="rounded" height={460} />
        ) : state.error ? (
          <Typography variant="body2" sx={{ color: BRAND.textLight, py: 6, textAlign: 'center' }}>
            Map unavailable right now.
          </Typography>
        ) : !hasGeometry ? (
          <Box sx={{ py: 6, px: 3, textAlign: 'center', bgcolor: BRAND.section, borderRadius: '10px', border: `1px dashed ${BRAND.border}` }}>
            <Typography sx={{ fontSize: 14, fontWeight: 700, color: BRAND.heading, mb: 0.5 }}>Nothing to plot yet</Typography>
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
            {/* relative wrapper: legend floats over the map on desktop, stacks below on mobile */}
            <Box sx={{ position: 'relative' }}>
              <Box sx={{ height: { xs: 420, md: 560 }, borderRadius: '10px', overflow: 'hidden', border: `1px solid ${BRAND.border}` }}>
                <MapContainer center={SG_CENTER} zoom={16} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    subdomains="abcd" maxZoom={20}
                    eventHandlers={{ tileerror: () => setTileError(true) }}
                  />
                  <FitToData latlngs={dataLatLngs} fitSignal={fitSignal} />
                  <FlyTo latlngs={coOccurLatLngs} signal={flySignal} />
                  <Polygon positions={ESTATE_BOUNDARY}
                    pathOptions={{ color: BRAND.slate, weight: 1.5, opacity: 0.6, dashArray: '6 6', fill: true, fillColor: BRAND.slate, fillOpacity: 0.04 }} />
                  {showRodent && <PointClusterLayer points={rodentPoints} kind="rodent" scaleMax={scaleMax} dimNonCoOccur={showCoOccur} />}
                  {showFeeding && <PointClusterLayer points={feedingPoints} kind="feeding" scaleMax={scaleMax} dimNonCoOccur={showCoOccur} />}
                </MapContainer>
              </Box>

              <Paper elevation={3} sx={{
                position: { xs: 'static', md: 'absolute' }, left: { md: 12 }, bottom: { md: 12 }, zIndex: 1000,
                width: { xs: '100%', md: 250 }, mt: { xs: 1.5, md: 0 },
                borderRadius: '10px', border: `1px solid ${BRAND.border}`, overflow: 'hidden',
              }}>
                <Box component="button" type="button" onClick={() => setShowLegend(v => !v)} aria-expanded={showLegend}
                  sx={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, px: 1.5, minHeight: 44,
                    bgcolor: '#fff', border: 'none', cursor: 'pointer', font: 'inherit',
                    '&:focus-visible': { outline: `2px solid ${BRAND.primary}`, outlineOffset: -2 } }}>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: BRAND.heading }}>Legend & layers</Typography>
                  <ExpandMoreRoundedIcon sx={{ fontSize: 20, color: BRAND.textLight, transform: showLegend ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                </Box>
                <Collapse in={showLegend}>
                  <Divider />
                  {legendBody}
                </Collapse>
              </Paper>
            </Box>
          </>
        )}

        {/* Screen-reader equivalent of the map. */}
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
