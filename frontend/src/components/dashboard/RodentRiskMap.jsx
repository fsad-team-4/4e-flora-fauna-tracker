import { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Circle, Polygon, Popup, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import {
  Card, Box, Stack, Typography, Skeleton, Button, IconButton, Divider, Collapse,
  ToggleButton, ToggleButtonGroup, Paper, Tooltip, GlobalStyles, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, FormControlLabel, Checkbox, CircularProgress,
  Alert, Snackbar, Slider,
} from '@mui/material';
import CenterFocusStrongOutlinedIcon from '@mui/icons-material/CenterFocusStrongOutlined';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import PestControlRodentIcon from '@mui/icons-material/PestControlRodent';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import AddLocationAltOutlinedIcon from '@mui/icons-material/AddLocationAltOutlined';
import 'leaflet/dist/leaflet.css';
import { BRAND, CATEGORY_COLORS, ON_SURFACE, SVG_ACCENT, CHART } from '../../theme';
import { useThemeMode } from '../../contexts/ThemeModeContext';
import { SEVERITY, SG_CENTER, BASEMAPS, TILE_ATTR } from './rodentMapTokens';
import SensorSurfaceLayer from './SensorSurfaceLayer';
import { useSensorSurface, SIMULATED_LABEL } from './sensorSurfaceData';
import http from '../../http';

// Pinned to the LIGHT teal on purpose: it inks the white marker discs, which stay
// white in both modes. Scheme-aware consumers (swatch borders, popup chip) index
// CATEGORY_COLORS[resolvedMode] instead.
const FEEDING_INK = CATEGORY_COLORS.light.flora_health; // teal - a hue no severity band uses
const RODENT_STROKE = '#37474F';
const BAND_ORDER = ['low', 'medium', 'high', 'critical'];
const BAND_LABEL = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };
const SPECIES_LABEL = { cat: 'Cat', pigeon: 'Pigeon', crow: 'Crow', mynah: 'Mynah', other: 'Other' };
const CLUSTER_PX = 44;

// Bound the map to Singapore. Without this the canvas pans to any country, which
// makes an out-of-range coordinate look like a legitimate location rather than
// an obvious error.
const SG_MAX_BOUNDS = [[1.15, 103.6], [1.48, 104.1]];
const SG_MIN_ZOOM = 11;
const WINDOW_OPTIONS = [7, 30, 90];

// SEVERITY, SG_CENTER, BASEMAPS and TILE_ATTR now live in ./rodentMapTokens so the
// small preview card on the assessment page shares them (see that file for the
// contrast rationale behind each severity pairing).
const worstBand = bands => BAND_ORDER[Math.max(...bands.map(b => BAND_ORDER.indexOf(b)), 0)];

const ESTATE_BOUNDARY = [
  [1.37080, 103.84470], [1.37080, 103.84720], [1.36960, 103.84760],
  [1.36740, 103.84700], [1.36730, 103.84500], [1.36840, 103.84440],
];

// VOCABULARY (enforced): "locations" = distinct plotted points; "reports" =
// individual assessments/sightings; "blocks" = estate blocks.
const srOnly = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };
const SECTION_LABEL = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: BRAND.text, mb: 0.75, display: 'block' };
const COVERAGE_INK = ON_SURFACE.warn; // coverage-amber (data quality), distinct from severity

// Leaflet auto-pans a popup into the container but knows nothing about our own
// floating chrome. Padding clears the right toolbar and the bottom dock.
const POPUP_PAN = { autoPanPaddingTopLeft: [16, 90], autoPanPaddingBottomRight: [320, 150] };


const rodentDiameter = count => 26 + Math.min(20, (count - 1) * 5);
const clusterSize = k => 34 + Math.min(16, (k - 1) * 3);
const bandOf = p => (BAND_ORDER.includes(p.riskLevel) ? p.riskLevel : 'high');
// Local calendar date, not a UTC slice of the ISO string - in UTC+8 a 7am report
// would otherwise bucket into yesterday while labels/popups render the local date.
const dayKey = iso => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function fmtDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDay(key) {
  const d = new Date(`${key}T00:00:00`);
  return Number.isNaN(d.getTime()) ? key : d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
}
function speciesSummary(species) {
  return Object.entries(species || {}).map(([k, v]) => `${v} ${SPECIES_LABEL[k] || k}`).join(' · ');
}
function relTimeLabel(from, nowMs) {
  const s = Math.max(0, Math.floor((nowMs - from.getTime()) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `on ${from.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}`;
}
// metres between two lat/lngs - for the radius selection tool
function haversine(a, b) {
  const R = 6371000, toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Marker glyphs: path data copied verbatim from @mui/icons-material
// PestControlRodent / RestaurantRounded, inlined as raw SVG because Leaflet
// divIcons take an HTML string.
const RODENT_PATH = 'm21.31 17.38-2.39-2.13c.52-2.36-1.36-4.25-3.42-4.25-1.16 0-3.5.9-3.5 3.5 0 .97.39 1.84 1.03 2.47l-.71.71C11.5 16.87 11 15.74 11 14.5c0-1.7.96-3.17 2.35-3.93-.7-.36-1.48-.57-2.28-.57-2.38 0-4.37 1.65-4.91 3.87C4.91 13.5 4 12.36 4 11c0-1.66 1.34-3 3-3h2.5C10.88 8 12 6.88 12 5.5S10.88 3 9.5 3H8c-.55 0-1 .45-1 1s.45 1 1 1h1.5c.28 0 .5.22.5.5s-.22.5-.5.5H7c-2.76 0-5 2.24-5 5 0 2.42 1.72 4.44 4 4.9v.03C6 18.73 8.27 21 11.07 21h8.86c1.87 0 2.81-2.34 1.38-3.62M18 19c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1';
const FEEDING_PATH = 'M16 6v6c0 1.1.9 2 2 2h1v7c0 .55.45 1 1 1s1-.45 1-1V3.13c0-.65-.61-1.13-1.24-.98C17.6 2.68 16 4.51 16 6m-5 3H9V3c0-.55-.45-1-1-1s-1 .45-1 1v6H5V3c0-.55-.45-1-1-1s-1 .45-1 1v6c0 2.21 1.79 4 4 4v8c0 .55.45 1 1 1s1-.45 1-1v-8c2.21 0 4-1.79 4-4V3c0-.55-.45-1-1-1s-1 .45-1 1z';
const svgGlyph = d => `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" style="display:block" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
const RODENT_GLYPH = svgGlyph(RODENT_PATH);
const FEEDING_GLYPH = svgGlyph(FEEDING_PATH);
const glyphBox = (glyph, px) => `<div style="width:${px}px;height:${px}px;flex-shrink:0;">${glyph}</div>`;

function makeIcon(html, size, coOccurs = false) {
  return L.divIcon({ className: `rk-marker${coOccurs ? ' rk-coocc' : ''}`, html, iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2] });
}
function rodentIcon(p) {
  const s = rodentDiameter(p.count);
  const band = bandOf(p);
  const sv = SEVERITY[band];
  const badge = band === 'critical'
    ? `<div style="position:absolute;top:-4px;right:-4px;width:13px;height:13px;border-radius:50%;background:#fff;color:${sv.solid};border:1.5px solid ${RODENT_STROKE};display:grid;place-items:center;font:800 9px/1 Inter,Helvetica,Arial,sans-serif;">!</div>`
    : '';
  const html = `<div style="position:relative;width:${s}px;height:${s}px;display:grid;place-items:center;border-radius:50%;box-sizing:border-box;background:${sv.solid};color:${sv.onSolid};border:2.5px solid ${RODENT_STROKE};box-shadow:0 0 0 1.5px #fff,0 1px 3px rgba(16,24,40,.35);">${glyphBox(RODENT_GLYPH, Math.round(s * 0.6))}${badge}</div>`;
  return makeIcon(html, s, p.coOccurs);
}
function feedingIcon(coOccurs = false) {
  const s = 26;
  const html = `<div style="width:${s}px;height:${s}px;display:grid;place-items:center;border-radius:50%;box-sizing:border-box;background:#fff;color:${FEEDING_INK};border:2.5px solid ${FEEDING_INK};box-shadow:0 0 0 1.5px #fff,0 1px 3px rgba(16,24,40,.25);">${glyphBox(FEEDING_GLYPH, 15)}</div>`;
  return makeIcon(html, s, coOccurs);
}
function clusterIcon(kind, k, band, coOccurs = false) {
  const feeding = kind === 'feeding';
  const s = clusterSize(k);
  const col = feeding ? FEEDING_INK : SEVERITY[band || 'high'].solid;
  const fs = Math.round(Math.max(12, Math.min(15, s * 0.42)));
  const glyph = feeding ? FEEDING_GLYPH : RODENT_GLYPH;
  const html = `<div style="width:${s}px;height:${s}px;display:flex;align-items:center;justify-content:center;gap:2px;border-radius:30%;box-sizing:border-box;font:700 ${fs}px/1 Inter,Helvetica,Arial,sans-serif;background:#fff;border:2.5px solid ${col};color:${col};box-shadow:0 1px 4px rgba(16,24,40,.20);">${glyphBox(glyph, fs)}<span>${k}</span></div>`;
  return makeIcon(html, s, coOccurs);
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

function SeverityChip({ band }) {
  const sv = SEVERITY[band] || SEVERITY.high;
  const solidFill = band === 'critical';
  return (
    <Box component="span" sx={{ fontSize: 11, fontWeight: 700, px: 0.8, py: '2px', borderRadius: '999px', bgcolor: solidFill ? sv.solid : sv.fill, color: solidFill ? '#fff' : sv.ink, whiteSpace: 'nowrap' }}>
      {BAND_LABEL[band] || band}
    </Box>
  );
}

// Stacked severity breakdown: one segment per report, ordered low -> critical, so a
// block's mix is legible at a glance without reading the list beneath it.
function SeverityBar({ counts, total }) {
  if (!total) return null;
  return (
    <Box sx={{ display: 'flex', height: 8, borderRadius: '4px', overflow: 'hidden', bgcolor: BRAND.section, mb: 0.75 }}>
      {BAND_ORDER.map(b => counts[b] ? (
        <Tooltip key={b} title={`${counts[b]} ${BAND_LABEL[b]}`}>
          <Box sx={{ width: `${(counts[b] / total) * 100}%`, bgcolor: SEVERITY[b].solid }} />
        </Tooltip>
      ) : null)}
    </Box>
  );
}

// Structured icon + label + value row, so popup facts line up on one grid instead
// of running together as a comma-separated sentence.
function PopupRow({ icon: Icon, label, children }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', py: 0.35 }}>
      <Icon sx={{ fontSize: 15, color: BRAND.textLight, flexShrink: 0 }} />
      <Typography sx={{ fontSize: 12, color: BRAND.textLight, flexGrow: 1 }}>{label}</Typography>
      <Box sx={{ fontSize: 12.5, fontWeight: 700, color: BRAND.heading, display: 'flex', alignItems: 'center', gap: 0.5 }}>{children}</Box>
    </Stack>
  );
}

const POPUP_TITLE_SX = { fontSize: 14.5, fontWeight: 700, color: BRAND.heading, lineHeight: 1.4, flexGrow: 1, minWidth: 0 };

/**
 * Rodent location popup.
 *
 * The count, the peak band and the weighted score used to sit in one run-on chip
 * row above a list that repeated the same facts. They are now a labelled key/value
 * block, the report list is capped (popups are not a table), and the two things an
 * officer can actually DO from here are explicit buttons at the bottom.
 */
function RodentPointBody({ p, onCreateWorkOrder }) {
  const counts = {};
  p.assessments.forEach(a => { const b = BAND_ORDER.includes(a.risk_level) ? a.risk_level : 'high'; counts[b] = (counts[b] || 0) + 1; });
  const recent = p.assessments.slice(0, 3);
  const moreCount = p.assessments.length - recent.length;
  return (
    <Box sx={{ minWidth: 236 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.75 }}>
        <Typography sx={POPUP_TITLE_SX}>{p.block || 'Unlabelled block'}</Typography>
        <SeverityChip band={bandOf(p)} />
      </Stack>

      <Box sx={{ borderTop: `1px solid ${BRAND.border}`, borderBottom: `1px solid ${BRAND.border}`, py: 0.25, mb: 1 }}>
        <PopupRow icon={PestControlRodentIcon} label="Reports">{p.count}</PopupRow>
        <PopupRow icon={InfoOutlinedIcon} label="Weighted score">{p.weightedScore}</PopupRow>
      </Box>
      <SeverityBar counts={counts} total={p.count} />

      <Stack spacing={0.75} sx={{ mt: 1 }}>
        {recent.map(a => (
          <Box key={a.id} sx={{ borderTop: `1px solid ${BRAND.border}`, pt: 0.6 }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 0.25 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{fmtDate(a.createdAt)}</Typography>
              <SeverityChip band={bandOf({ riskLevel: a.risk_level })} />
              {a.floor_level && <Typography sx={{ fontSize: 11.5, color: BRAND.textLight }}>{a.floor_level}</Typography>}
            </Stack>
            <Typography sx={{ fontSize: 12, color: BRAND.text, lineHeight: 1.6 }}>{a.observations}</Typography>
          </Box>
        ))}
        {moreCount > 0 && (
          <Typography sx={{ fontSize: 11.5, color: BRAND.textLight, pt: 0.25 }}>
            +{moreCount} earlier report{moreCount === 1 ? '' : 's'} at this location
          </Typography>
        )}
      </Stack>

      <Stack spacing={0.5} sx={{ mt: 1.25 }}>
        {onCreateWorkOrder && p.block && (
          <Button size="small" variant="contained" fullWidth onClick={() => onCreateWorkOrder(p.block)}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '6px', bgcolor: BRAND.action, '&:hover': { bgcolor: BRAND.actionHover } }}>
            Dispatch pest control
          </Button>
        )}
        {p.block && (
          <Button size="small" fullWidth component={RouterLink} to={`/rodent?block=${encodeURIComponent(p.block)}`}
            sx={{ textTransform: 'none', fontWeight: 700, color: ON_SURFACE.info }}>
            View location details
          </Button>
        )}
      </Stack>
    </Box>
  );
}

/**
 * Raise a work order for a block, straight from the map. Reuses the Action Queue's
 * endpoints: loads the block's PENDING escalations, shows them for the officer to
 * confirm, and only raises on approval - the human gate the brief requires is
 * preserved, nothing is auto-dispatched.
 */
function CreateWorkOrderDialog({ block, open, onClose, onResult }) {
  const [state, setState] = useState({ loading: true, error: false, cluster: null });
  const [notes, setNotes] = useState('');
  const [agency, setAgency] = useState('Pest Control Contractor');
  const [dispatch, setDispatch] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !block) return undefined;
    let alive = true;
    http.get('/api/work-orders/queue')
      .then(r => {
        if (!alive) return;
        const cluster = (r.data.clusters || []).find(c => c.block === (block || '').trim()) || null;
        setState({ loading: false, error: false, cluster });
      })
      .catch(() => { if (alive) setState({ loading: false, error: true, cluster: null }); });
    return () => { alive = false; };
  }, [open, block]);

  const cluster = state.cluster;
  async function raise() {
    if (!cluster) return;
    setBusy(true);
    try {
      const { data } = await http.post('/api/work-orders', {
        assessment_ids: cluster.assessments.map(a => a.id), dispatch, target_agency: agency, notes,
      });
      onResult({ ok: true, msg: `Work order raised for ${data.block_number || block}${data.email_status === 'sent' ? ' and dispatched to the contractor' : ''}.` });
      onClose();
    } catch (e) {
      onResult({ ok: false, msg: e.response?.data?.error || 'Could not raise the work order.' });
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Raise work order · {block}</DialogTitle>
      <DialogContent>
        {state.loading ? (
          <Stack spacing={1}><Skeleton variant="rounded" height={24} /><Skeleton variant="rounded" height={56} /></Stack>
        ) : state.error ? (
          <Alert severity="error">Could not load pending escalations for this block.</Alert>
        ) : !cluster ? (
          <Box>
            <Typography sx={{ fontSize: 13.5, color: BRAND.text, lineHeight: 1.6, mb: 1.5 }}>
              No pending escalations at <b>{block}</b>. Work orders are raised from AI-flagged rodent risks awaiting review, and this block has none right now.
            </Typography>
            <Button component={RouterLink} to="/action-queue" onClick={onClose} variant="outlined" size="small" sx={{ textTransform: 'none' }}>
              Open Action Queue
            </Button>
          </Box>
        ) : (
          <>
            <Typography sx={{ fontSize: 13.5, color: BRAND.text, lineHeight: 1.6, mb: 2 }}>
              Consolidating <b>{cluster.count}</b> pending report{cluster.count === 1 ? '' : 's'} at <b>{block}</b> into one call-out
              {cluster.call_outs_avoided > 0 && <> - avoiding <b>{cluster.call_outs_avoided}</b> extra visit{cluster.call_outs_avoided === 1 ? '' : 's'} (S${(cluster.est_savings || 0).toLocaleString('en-SG')}).</>}
            </Typography>
            <TextField label="Dispatch to" value={agency} onChange={e => setAgency(e.target.value)} size="small" fullWidth sx={{ mb: 2 }} />
            <TextField label="Notes for the contractor (optional)" value={notes} onChange={e => setNotes(e.target.value)} size="small" fullWidth multiline rows={2} sx={{ mb: 1 }} />
            <FormControlLabel
              control={<Checkbox checked={dispatch} onChange={e => setDispatch(e.target.checked)} sx={{ '&.Mui-checked': { color: BRAND.primary } }} />}
              label={<Typography sx={{ fontSize: 14 }}>Email the contractor now</Typography>} />
            <Typography sx={{ fontSize: 12, color: BRAND.textLight, mt: 0.5 }}>A call-out is only raised after your approval here.</Typography>
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy} sx={{ color: BRAND.textLight }}>Cancel</Button>
        {cluster && (
          <Button onClick={raise} disabled={busy} variant="contained" sx={{ bgcolor: BRAND.primary, '&:hover': { bgcolor: BRAND.primaryHover } }}>
            {busy ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : 'Approve & raise'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

function FeedingPointBody({ p }) {
  const { resolvedMode } = useThemeMode();
  const chipInk = CATEGORY_COLORS[resolvedMode].flora_health;
  const chipTint = resolvedMode === 'dark' ? 'rgba(20,163,178,0.14)' : 'rgba(14,138,138,0.14)';
  return (
    <Box sx={{ minWidth: 210 }}>
      <Typography sx={{ fontSize: 14, fontWeight: 700, color: BRAND.heading, lineHeight: 1.4 }}>
        {p.block || 'Unlabelled block'}
      </Typography>
      <Box sx={{ borderTop: `1px solid ${BRAND.border}`, borderBottom: `1px solid ${BRAND.border}`, py: 0.25, mb: 1 }}>
        <PopupRow icon={InfoOutlinedIcon} label="Sightings">{p.count}</PopupRow>
        {speciesSummary(p.species) && (
          <PopupRow icon={InfoOutlinedIcon} label="Species">{speciesSummary(p.species)}</PopupRow>
        )}
      </Box>
      <Stack spacing={1}>
        {p.sightings.map(sg => (
          <Box key={sg.id} sx={{ borderTop: `1px solid ${BRAND.border}`, pt: 0.6 }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 0.25 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{fmtDate(sg.createdAt)}</Typography>
              {sg.species && <Box component="span" sx={{ fontSize: 11, fontWeight: 600, px: 0.8, py: '2px', borderRadius: '6px', bgcolor: chipTint, color: chipInk }}>{SPECIES_LABEL[sg.species] || sg.species}</Box>}
              {sg.floor_level && <Typography sx={{ fontSize: 11.5, color: BRAND.textLight }}>{sg.floor_level}</Typography>}
            </Stack>
            {sg.notes && <Typography sx={{ fontSize: 12, color: BRAND.text, lineHeight: 1.6 }}>{sg.notes}</Typography>}
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

/**
 * Cluster popup, grouped BY BLOCK.
 *
 * Previously it listed one row per plotted point, so three reports on one building
 * printed "Block 123" three times and offered "Zoom in to separate" - useless when
 * every point is anchored to the same block. Members are now folded by block into a
 * single header + incident count + severity breakdown, and the CTA is the real
 * operational command. Zoom-to-separate is only offered when the cluster genuinely
 * spans more than one block.
 */
function ClusterBody({ kind, members, map, bounds, onCreateWorkOrder }) {
  const byBlock = useMemo(() => {
    const m = new Map();
    members.forEach(p => {
      const key = p.block || 'Unlabelled';
      const e = m.get(key) || { block: key, count: 0, bands: [], pts: [] };
      e.count += p.count;
      e.bands.push(bandOf(p));
      e.pts.push(p);
      m.set(key, e);
    });
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [members]);

  const totalReports = members.reduce((s, p) => s + p.count, 0);
  const multiBlock = byBlock.length > 1;
  const single = byBlock.length === 1 ? byBlock[0] : null;

  const bandCounts = {};
  members.forEach(p => { const b = bandOf(p); bandCounts[b] = (bandCounts[b] || 0) + p.count; });

  return (
    <Box sx={{ minWidth: 230 }}>
      {/* one entity header, not one per point */}
      <Typography sx={{ fontSize: 14.5, fontWeight: 700, color: BRAND.heading, lineHeight: 1.4 }}>
        {single ? single.block : `${byBlock.length} blocks`}
      </Typography>
      {/* Single-block clusters used to print the block name in the header AND
          again in the per-block list below, with the same count twice. The
          breakdown list now only appears when it actually breaks something down. */}
      <Box sx={{ borderTop: `1px solid ${BRAND.border}`, borderBottom: `1px solid ${BRAND.border}`, py: 0.25, mb: 1 }}>
        <PopupRow icon={kind === 'feeding' ? InfoOutlinedIcon : PestControlRodentIcon} label={kind === 'feeding' ? 'Sightings' : 'Reports'}>
          {totalReports}
          {kind !== 'feeding' && <SeverityChip band={worstBand(members.map(bandOf))} />}
        </PopupRow>
        {multiBlock && <PopupRow icon={InfoOutlinedIcon} label="Blocks">{byBlock.length}</PopupRow>}
      </Box>

      {kind !== 'feeding' && <SeverityBar counts={bandCounts} total={totalReports} />}

      {multiBlock && (
        <Stack spacing={0.5} sx={{ mt: 1 }}>
          {byBlock.map(b => (
            <Stack key={b.block} direction="row" spacing={0.75} sx={{ alignItems: 'center', borderTop: `1px solid ${BRAND.border}`, pt: 0.6 }}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: BRAND.heading, flexGrow: 1 }}>{b.block}</Typography>
              <Typography sx={{ fontSize: 11.5, color: BRAND.textLight }}>
                {b.count} {kind === 'feeding' ? 'sighting' : 'report'}{b.count === 1 ? '' : 's'}
              </Typography>
              {kind !== 'feeding' && <SeverityChip band={worstBand(b.bands)} />}
            </Stack>
          ))}
        </Stack>
      )}

      <Stack spacing={0.75} sx={{ mt: 1.25 }}>
        {kind !== 'feeding' && single && single.block !== 'Unlabelled' && onCreateWorkOrder && (
          <Button size="small" variant="contained" fullWidth onClick={() => onCreateWorkOrder(single.block)}
            sx={{ textTransform: 'none', fontWeight: 700, bgcolor: BRAND.action, '&:hover': { bgcolor: BRAND.actionHover } }}>
            Dispatch pest control
          </Button>
        )}
        {/* only meaningful when the cluster spans more than one block */}
        {multiBlock && (
          <Button size="small" variant="outlined" fullWidth startIcon={<CenterFocusStrongOutlinedIcon />}
            onClick={() => map.fitBounds(bounds, { padding: [60, 60], maxZoom: 18 })}
            sx={{ textTransform: 'none', borderColor: BRAND.border, color: BRAND.text, '&:hover': { borderColor: BRAND.textLight } }}>
            Separate {byBlock.length} blocks
          </Button>
        )}
        {single && single.block !== 'Unlabelled' && (
          <Button size="small" fullWidth component={RouterLink} to={`/rodent?block=${encodeURIComponent(single.block)}`}
            sx={{ textTransform: 'none', fontWeight: 700, color: ON_SURFACE.info }}>
            View location details
          </Button>
        )}
      </Stack>
    </Box>
  );
}

function PointClusterLayer({ points, kind, dimNonCoOccur, onCreateWorkOrder }) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const groups = useMemo(() => clusterByPixel(map, points, zoom), [map, points, zoom]);
  const Body = kind === 'feeding' ? FeedingPointBody : RodentPointBody;
  const unit = kind === 'feeding' ? 'feeding sighting' : 'report';

  return groups.map((g, gi) => {
    if (g.length === 1) {
      const p = g[0].p;
      return (
        <Marker key={`${kind}-${p.lat},${p.lng}`} position={[p.lat, p.lng]} icon={kind === 'feeding' ? feedingIcon(p.coOccurs) : rodentIcon(p)}
          opacity={dimNonCoOccur && !p.coOccurs ? 0.3 : 1}
          keyboard title={`${p.block || 'Unlabelled block'}: ${p.count} ${unit}${p.count === 1 ? '' : 's'}`}>
          <Popup maxHeight={320} minWidth={220} {...POPUP_PAN}><Body p={p} onCreateWorkOrder={onCreateWorkOrder} /></Popup>
        </Marker>
      );
    }
    const members = g.map(m => m.p);
    const cLat = members.reduce((s, p) => s + p.lat, 0) / members.length;
    const cLng = members.reduce((s, p) => s + p.lng, 0) / members.length;
    const reports = members.reduce((s, p) => s + p.count, 0);
    const clusterCoOccurs = members.some(p => p.coOccurs);
    const bounds = L.latLngBounds(members.map(p => [p.lat, p.lng]));
    const band = kind === 'feeding' ? null : worstBand(members.map(bandOf));
    return (
      <Marker key={`${kind}-cluster-${gi}-${cLat},${cLng}`} position={[cLat, cLng]} icon={clusterIcon(kind, members.length, band, clusterCoOccurs)}
        opacity={dimNonCoOccur && !clusterCoOccurs ? 0.3 : 1}
        keyboard title={`${members.length} ${kind} locations, ${reports} report${reports === 1 ? '' : 's'}`}>
        <Popup maxHeight={340} minWidth={230} {...POPUP_PAN}>
          <ClusterBody kind={kind} members={members} map={map} bounds={bounds} onCreateWorkOrder={onCreateWorkOrder} />
        </Popup>
      </Marker>
    );
  });
}

/**
 * Density view. Overlapping translucent circles sized by report count, in metres so
 * they scale with zoom - where reports concentrate, the overlaps darken.
 *
 * Deliberately NOT called a kernel density estimate: it is additive alpha over
 * weighted discs, not a smoothed KDE surface, and the legend says so.
 */
function DensityLayer({ points }) {
  return points.map(p => {
    const sv = SEVERITY[bandOf(p)];
    return (
      <Circle
        key={`d-${p.lat},${p.lng}`}
        center={[p.lat, p.lng]}
        radius={45 + Math.min(90, p.count * 22)}
        pathOptions={{ color: sv.solid, weight: 0, fillColor: sv.solid, fillOpacity: 0.26 }}
      />
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
function FlyTo({ latlngs, signal }) {
  const map = useMap();
  // Only an actual signal INCREMENT moves the camera - without this, a latlngs
  // identity change re-ran the effect and re-flew the map after the first click.
  const lastSignal = useRef(signal);
  useEffect(() => {
    if (!signal || signal === lastSignal.current || !latlngs.length) return;
    lastSignal.current = signal;
    if (latlngs.length === 1) map.setView(latlngs[0], 18);
    else map.fitBounds(latlngs, { padding: [50, 50], maxZoom: 18 });
  }, [signal, latlngs, map]);
  return null;
}

// Click-to-place the radius selection centre while the tool is armed.
function RadiusPicker({ armed, onPick }) {
  useMapEvents({ click: e => { if (armed) onPick([e.latlng.lat, e.latlng.lng]); } });
  return null;
}

function ToggleChip({ active, disabled, onClick, swatch, label }) {
  return (
    <Box component="button" type="button" onClick={onClick} disabled={disabled} aria-pressed={active}
      sx={{
        display: 'inline-flex', alignItems: 'center', gap: 0.6, px: 1, py: 0.5, borderRadius: '999px',
        font: 'inherit', fontSize: 12, fontWeight: 600, minHeight: 32,
        border: `1px solid ${active && !disabled ? BRAND.slate : BRAND.border}`,
        bgcolor: active && !disabled ? BRAND.section : BRAND.surface,
        color: disabled ? BRAND.textLight : BRAND.text, opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        '&:focus-visible': { outline: `2px solid ${BRAND.accent}`, outlineOffset: 2 },
      }}>
      {swatch}<span>{label}</span>
    </Box>
  );
}

// Swatches mirror the real pin anatomy: the white 1.5px halo keeps the dark ring
// legible on the dark toolbar, and the feeding teal is indexed per scheme.
const RodentSwatch = () => <Box aria-hidden sx={{ width: 13, height: 13, borderRadius: '50%', bgcolor: SEVERITY.high.solid, border: `2px solid ${RODENT_STROKE}`, boxShadow: '0 0 0 1.5px #fff', boxSizing: 'border-box', flexShrink: 0 }} />;
const FeedingSwatch = () => {
  const { resolvedMode } = useThemeMode();
  return <Box aria-hidden sx={{ width: 13, height: 13, borderRadius: '50%', border: `2.5px solid ${CATEGORY_COLORS[resolvedMode].flora_health}`, bgcolor: BRAND.surface, boxSizing: 'border-box', flexShrink: 0 }} />;
};
const CoOccurSwatch = () => {
  const { resolvedMode } = useThemeMode();
  return <Box aria-hidden sx={{ width: 13, height: 13, borderRadius: '50%', bgcolor: SEVERITY.high.solid, border: `2px solid ${CATEGORY_COLORS[resolvedMode].flora_health}`, boxSizing: 'border-box', flexShrink: 0 }} />;
};

function BandMark({ band }) {
  const sv = SEVERITY[band];
  return (
    <Box aria-hidden sx={{ position: 'relative', width: 18, height: 18, borderRadius: '50%', border: `2px solid ${RODENT_STROKE}`, boxShadow: '0 0 0 1.5px #fff', boxSizing: 'border-box', display: 'grid', placeItems: 'center', bgcolor: sv.solid, flexShrink: 0 }}>
      <PestControlRodentIcon sx={{ fontSize: 11, color: sv.onSolid }} />
      {band === 'critical' && (
        <Box sx={{ position: 'absolute', top: -4, right: -5, width: 10, height: 10, borderRadius: '50%', bgcolor: '#fff', border: `1px solid ${RODENT_STROKE}`, color: sv.solid, fontSize: 7, fontWeight: 800, display: 'grid', placeItems: 'center', lineHeight: 1 }}>!</Box>
      )}
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
 * KPI stat card for the bottom dock. The figure is the hook, so it is set large
 * and tabular; the label recedes to uppercase micro-type. `accent` carries
 * semantic meaning (high-risk goes danger-red), never decoration.
 * While the window is reloading it renders as a skeleton rather than a spinner,
 * so the strip keeps its geometry and the wait reads as shorter.
 */
function StatCard({ value, label, accent, hint, loading }) {
  return (
    <Box sx={{ px: 1.5, py: 1.25, borderRadius: '10px', bgcolor: BRAND.section, border: `1px solid ${BRAND.border}`, minWidth: 0 }}>
      {loading ? (
        <>
          <Skeleton variant="text" width={54} height={34} />
          <Skeleton variant="text" width="80%" height={14} />
        </>
      ) : (
        <>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <Typography sx={{ fontSize: 30, fontWeight: 800, lineHeight: 1.05, color: accent || BRAND.ink, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px' }}>
              {value}
            </Typography>
            {hint}
          </Stack>
          {/* labels wrap rather than ellipsis: "High-risk locations" truncated to
              "HIGH-RISK LOCA…" at this column width, which is worse than two lines */}
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.6px', mt: 0.25, lineHeight: 1.35 }}>
            {label}
          </Typography>
        </>
      )}
    </Box>
  );
}

/**
 * Activity histogram sitting behind the day scrubber. Bars are reports per day on
 * the same 0..days.length-1 axis as the slider, so a spike is visible BEFORE the
 * officer scrubs to it. Days at or before the cutoff stay saturated; days after it
 * recede, which makes the scrub position readable from the bars alone.
 */
function ScrubberHistogram({ days, counts, cutoffIdx }) {
  const max = Math.max(1, ...counts);
  return (
    <Box aria-hidden sx={{ position: 'absolute', inset: '0 0 14px 0', display: 'flex', alignItems: 'flex-end', gap: '1px', pointerEvents: 'none' }}>
      {days.map((d, i) => (
        <Box
          key={d}
          sx={{
            flex: 1,
            height: `${Math.max(8, (counts[i] / max) * 100)}%`,
            borderRadius: '2px 2px 0 0',
            bgcolor: i <= cutoffIdx ? ON_SURFACE.danger : BRAND.border,
            opacity: i <= cutoffIdx ? 0.32 : 0.5,
          }}
        />
      ))}
    </Box>
  );
}

/**
 * Rodent Risk & Feeding Map - a full-viewport map page.
 *
 * Chrome is kept off the canvas: metrics live in a slim collapsible bottom dock, and
 * every control (layers, view mode, basemap, legend, radius select) is consolidated
 * into one right-hand toolbar that minimises to an icon. Previously the KPI cards,
 * co-occurrence banner and legend card together covered roughly 40% of the viewport.
 *
 * Positions are reported coordinates only; unmapped reports are counted, never placed.
 */
export default function RodentRiskMap() {
  const { resolvedMode } = useThemeMode();
  const [state, setState] = useState({
    loading: true, error: false, scaleMax: 0, points: [],
    totalAssessments: 0, mappedCount: 0, unmappedCount: 0,
    feeding: { total: 0, mappedCount: 0, unmappedCount: 0, points: [] }, coOccurrenceBlocks: [],
  });
  const [windowDays, setWindowDays] = useState(30);
  const [showRodent, setShowRodent] = useState(true);
  const [showFeeding, setShowFeeding] = useState(true);
  const [showCoOccur, setShowCoOccur] = useState(false);
  const [viewMode, setViewMode] = useState('pins'); // pins | density
  // null = follow the app's colour scheme; a value = the officer picked one. Derived
  // rather than synced in an effect, so a scheme change is reflected immediately
  // without a cascading render, and an explicit choice still wins.
  const [basemapChoice, setBasemapChoice] = useState(null);
  const [toolbarOpen, setToolbarOpen] = useState(true);
  const [legendOpen, setLegendOpen] = useState(false);
  const [dockOpen, setDockOpen] = useState(true);
  const [fitSignal, setFitSignal] = useState(0);
  const [flySignal, setFlySignal] = useState(0);
  const [tileError, setTileError] = useState(false);
  const [woBlock, setWoBlock] = useState(null);
  const [toast, setToast] = useState(null);
  const [reloadSignal, setReloadSignal] = useState(0);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  // temporal scrubber
  const [dayIdx, setDayIdx] = useState(null); // null = whole window
  const [playing, setPlaying] = useState(false);
  // radius selection
  // LAYER B - simulated sensor surface. Off by default: the real reports are the
  // page's evidence, and a smooth field must be an opt-in the officer chose.
  const [showSensors, setShowSensors] = useState(false);
  const [councilFilter, setCouncilFilter] = useState([]);
  const [radiusArmed, setRadiusArmed] = useState(false);
  const [radiusCentre, setRadiusCentre] = useState(null);
  const [radiusM, setRadiusM] = useState(150);
  const playRef = useRef(null);

  useEffect(() => {
    let alive = true;
    http.get('/api/rodent-riskmap', { params: { windowDays } })
      .then(r => { if (alive) { setState({ loading: false, error: false, ...r.data }); setUpdatedAt(new Date()); setDayIdx(null); } })
      .catch(() => { if (alive) setState(s => ({ ...s, loading: false, error: true })); });
    return () => { alive = false; };
  }, [windowDays, reloadSignal]);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const basemap = basemapChoice ?? (resolvedMode === 'dark' ? 'dark' : 'muted');
  const sensorSurface = useSensorSurface({ enabled: showSensors, windowDays, councils: councilFilter });

  const changeWindow = (_e, v) => { if (v) { setState(s => ({ ...s, loading: true })); setWindowDays(v); } };
  const refresh = () => { setState(s => ({ ...s, loading: true })); setReloadSignal(n => n + 1); };

  const { mappedCount, totalAssessments, unmappedCount } = state;
  // memoised: `state.points || []` minted a new array every render, which invalidated
  // every downstream useMemo (time filter, lat/lng lists, selection) on each pass
  const allRodent = useMemo(() => state.points || [], [state.points]);
  const feeding = useMemo(() => state.feeding || { total: 0, mappedCount: 0, unmappedCount: 0, points: [] }, [state.feeding]);
  const allFeeding = useMemo(() => feeding.points || [], [feeding]);
  const coBlocks = useMemo(() => state.coOccurrenceBlocks || [], [state.coOccurrenceBlocks]);

  // ---- temporal axis: every day that actually carries a record ---------------
  const days = useMemo(() => {
    const set = new Set();
    allRodent.forEach(p => (p.assessments || []).forEach(a => set.add(dayKey(a.createdAt))));
    allFeeding.forEach(p => (p.sightings || []).forEach(s => set.add(dayKey(s.createdAt))));
    return [...set].filter(Boolean).sort();
  }, [allRodent, allFeeding]);

  const cutoff = dayIdx == null ? null : days[Math.min(dayIdx, days.length - 1)];

  // reports per day, aligned to `days` - drives the histogram behind the scrubber
  const dayCounts = useMemo(() => {
    const idx = new Map(days.map((d, i) => [d, i]));
    const out = new Array(days.length).fill(0);
    const tally = (list, childKey) => list.forEach(p => (p[childKey] || []).forEach(c => {
      const i = idx.get(dayKey(c.createdAt));
      if (i != null) out[i] += 1;
    }));
    tally(allRodent, 'assessments');
    tally(allFeeding, 'sightings');
    return out;
  }, [days, allRodent, allFeeding]);

  /**
   * Cumulative time filter: keeps records dated on or before the scrubbed day and
   * RECOUNTS each point, so a pin's size and severity reflect only what had been
   * reported by then. A point with nothing left is dropped rather than shown at zero.
   */
  const filterByDay = (list, childKey, recount) => {
    if (!cutoff) return list;
    return list.reduce((acc, p) => {
      const kept = (p[childKey] || []).filter(c => dayKey(c.createdAt) <= cutoff);
      if (kept.length) acc.push(recount(p, kept));
      return acc;
    }, []);
  };
  const rodentPoints = useMemo(
    () => filterByDay(allRodent, 'assessments', (p, kept) => ({
      ...p, assessments: kept, count: kept.length,
      riskLevel: worstBand(kept.map(a => (BAND_ORDER.includes(a.risk_level) ? a.risk_level : 'high'))),
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allRodent, cutoff]
  );
  const feedingPoints = useMemo(
    () => filterByDay(allFeeding, 'sightings', (p, kept) => ({ ...p, sightings: kept, count: kept.length })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allFeeding, cutoff]
  );

  // playback
  useEffect(() => {
    if (!playing || days.length < 2) return undefined;
    playRef.current = setInterval(() => {
      setDayIdx(i => {
        const next = (i == null ? 0 : i + 1);
        if (next >= days.length) { setPlaying(false); return null; }
        return next;
      });
    }, 700);
    return () => clearInterval(playRef.current);
  }, [playing, days.length]);

  const hasGeometry = rodentPoints.length > 0 || feedingPoints.length > 0;
  const highRiskLocations = rodentPoints.filter(p => p.riskLevel === 'high' || p.riskLevel === 'critical').length;

  // Camera targets derive from the UNFILTERED data on purpose: the time-filtered
  // lists change identity on every scrubber step/playback tick, and feeding them
  // to FitToData/FlyTo re-fit the bounds each tick, destroying manual pan/zoom.
  const dataLatLngs = useMemo(
    () => [...allRodent.map(p => [p.lat, p.lng]), ...allFeeding.map(p => [p.lat, p.lng])],
    [allRodent, allFeeding]
  );
  const coOccurLatLngs = useMemo(
    () => [...allRodent.filter(p => p.coOccurs).map(p => [p.lat, p.lng]), ...allFeeding.filter(p => p.coOccurs).map(p => [p.lat, p.lng])],
    [allRodent, allFeeding]
  );

  const rodentCov = compactCoverage({ error: state.error, kind: 'Rodent risk', total: totalAssessments, mapped: mappedCount, locations: allRodent.length, unmapped: unmappedCount, windowDays });
  const feedingCov = compactCoverage({ error: state.error, kind: 'Feeding', total: feeding.total, mapped: feeding.mappedCount, locations: allFeeding.length, unmapped: feeding.unmappedCount, windowDays });

  const totalReports = totalAssessments + feeding.total;
  const totalMapped = mappedCount + feeding.mappedCount;
  const totalUnmapped = unmappedCount + feeding.unmappedCount;
  const locatedPct = totalReports ? Math.round((totalMapped / totalReports) * 100) : 100;
  const poorCoverage = !state.error && totalReports > 0 && locatedPct < 60;

  const flyToCoOccur = () => { setShowCoOccur(true); setFlySignal(n => n + 1); };
  const syncedLabel = state.loading ? 'Syncing…' : updatedAt ? `Synced ${relTimeLabel(updatedAt, nowMs)}` : null;

  // ---- radius selection ------------------------------------------------------
  const selection = useMemo(() => {
    if (!radiusCentre) return null;
    const within = arr => arr.filter(p => haversine(radiusCentre, [p.lat, p.lng]) <= radiusM);
    const r = within(rodentPoints), f = within(feedingPoints);
    const bands = {};
    r.forEach(p => { const b = bandOf(p); bands[b] = (bands[b] || 0) + p.count; });
    return {
      rodentLocations: r.length,
      rodentReports: r.reduce((s, p) => s + p.count, 0),
      feedingLocations: f.length,
      feedingSightings: f.reduce((s, p) => s + p.count, 0),
      blocks: [...new Set([...r, ...f].map(p => p.block).filter(Boolean))],
      bands,
      rows: r,
    };
  }, [radiusCentre, radiusM, rodentPoints, feedingPoints]);

  // CSV, not PDF: a PDF would need a rendering dependency this build does not have,
  // and a CSV is what a contractor can actually paste into a job sheet.
  function exportSelection() {
    if (!selection) return;
    const head = ['block', 'reports', 'peak_risk', 'lat', 'lng'];
    const rows = selection.rows.map(p => [p.block || 'Unlabelled', p.count, bandOf(p), p.lat, p.lng]);
    const csv = [head, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `rodent-selection-${radiusM}m.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const railBtn = { width: 34, height: 34, borderRadius: '8px', color: BRAND.text, '&:hover': { bgcolor: BRAND.section } };

  // Leaflet SVG pathOptions and keyframe rgba() stops cannot resolve CSS vars, so
  // these strokes/glows are mode-indexed literals (the SVG_ACCENT pattern).
  const pulseRgb = resolvedMode === 'dark' ? '240,138,143' : '193,39,45'; // BRAND accent per scheme
  const boundaryInk = resolvedMode === 'dark' ? '#7D8CA3' : BRAND.slate;

  return (
    <Box component="main" sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: BRAND.surface }}>
      <GlobalStyles styles={{
        '.rk-marker': { cursor: 'pointer', background: 'transparent', border: 'none' },
        '.rk-marker:focus-visible': { outline: `3px solid ${BRAND.accent}`, outlineOffset: '2px', borderRadius: '30%' },
        '.rk-marker > div': { transition: 'transform .12s ease' },
        '.rk-marker:hover > div': { transform: 'scale(1.12)' },
        '.rk-coocc > div': { position: 'relative' },
        '.rk-coocc > div::after': { content: '""', position: 'absolute', inset: '-2px', borderRadius: 'inherit', pointerEvents: 'none', animation: 'rkMarkerPulse 1.8s ease-out infinite' },
        '@keyframes rkpulse': { '0%': { boxShadow: `0 0 0 0 rgba(${pulseRgb},.5)` }, '70%': { boxShadow: `0 0 0 7px rgba(${pulseRgb},0)` }, '100%': { boxShadow: `0 0 0 0 rgba(${pulseRgb},0)` } },
        '@keyframes rkMarkerPulse': { '0%': { boxShadow: `0 0 0 0 rgba(${pulseRgb},.45)` }, '70%': { boxShadow: `0 0 0 9px rgba(${pulseRgb},0)` }, '100%': { boxShadow: `0 0 0 0 rgba(${pulseRgb},0)` } },
        // Leaflet's stock chrome follows the scheme: popup panel/tip, the canvas
        // behind tiles, zoom control and attribution strip all ride the em- vars.
        '.leaflet-popup-content-wrapper, .leaflet-popup-tip': { background: BRAND.surface, color: BRAND.text },
        // Leaflet ships a hard 3px drop shadow; swap it for a diffused two-layer
        // elevation and the app's 8px radius so popups match the card system.
        '.leaflet-popup-content-wrapper': {
          borderRadius: '10px',
          border: `1px solid ${BRAND.border}`,
          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.12), 0 4px 6px -4px rgba(0,0,0,0.10)',
        },
        '.leaflet-popup-content': { margin: '12px 14px' },
        'a.leaflet-popup-close-button': { color: `${BRAND.textLight} !important` },
        '.leaflet-container': { background: BRAND.canvas },
        '.leaflet-bar a': { backgroundColor: BRAND.surface, color: BRAND.text, borderBottomColor: BRAND.border },
        '.leaflet-control-attribution': { backgroundColor: `color-mix(in srgb, ${BRAND.surface} 80%, transparent)`, color: BRAND.textLight },
        // react-leaflet freezes MapContainer's style prop at mount, so the armed
        // crosshair is toggled via a class on the map wrapper instead.
        '.rk-radius-armed .leaflet-container': { cursor: 'crosshair' },
      }} />

      {/* ── Slim header. The long "reported positions only" disclaimer is now an
          info tooltip rather than a paragraph of body text under the title. ──── */}
      <Box component="header" sx={{ px: { xs: 2, md: 3 }, py: 1.25, borderBottom: `1px solid ${BRAND.border}`, display: 'flex', alignItems: 'center', gap: { xs: 1, md: 2 }, flexWrap: 'wrap', flexShrink: 0 }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
          <Typography component="h1" sx={{ fontSize: { xs: 16.5, md: 19 }, fontWeight: 800, color: BRAND.heading, letterSpacing: '-0.3px', whiteSpace: 'nowrap' }}>
            Rodent Risk &amp; Feeding Map
          </Typography>
          <Tooltip
            arrow
            title="Reported positions only - nothing is inferred or guessed. Feeding near rodent risk is co-occurrence worth investigating, not proof of cause. Reports filed without a location are counted in the coverage figure but never placed on the map."
          >
            <InfoOutlinedIcon sx={{ fontSize: 16, color: BRAND.textLight, cursor: 'help' }} />
          </Tooltip>
          {syncedLabel && (
            <Typography aria-live="polite" sx={{ fontSize: 12, color: BRAND.textLight, whiteSpace: 'nowrap', ml: 0.5 }}>
              · {syncedLabel}
            </Typography>
          )}
        </Stack>
        <Box sx={{ flexGrow: 1 }} />
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexShrink: 0 }}>
          {coBlocks.length > 0 && (
            <Button onClick={flyToCoOccur} size="small" variant="outlined" disabled={coOccurLatLngs.length === 0}
              startIcon={<Box aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: BRAND.accent, animation: 'rkpulse 1.8s infinite' }} />}
              sx={{ textTransform: 'none', fontWeight: 700, whiteSpace: 'nowrap', borderColor: BRAND.border, color: BRAND.accent, '&:hover': { borderColor: BRAND.accent } }}>
              {coBlocks.length} co-occurrence{coBlocks.length === 1 ? '' : 's'}
            </Button>
          )}
          <ToggleButtonGroup value={windowDays} exclusive onChange={changeWindow} size="small" aria-label="Time window"
            sx={{
              bgcolor: BRAND.section, borderRadius: '999px', p: '3px', gap: '2px',
              '& .MuiToggleButtonGroup-grouped': {
                border: 0, marginLeft: 0, minWidth: 42, px: 1.4, py: 0.35, borderRadius: '999px !important',
                textTransform: 'none', fontSize: 12.5, fontWeight: 600, color: BRAND.text,
                '&:hover': { bgcolor: 'rgba(120,130,145,0.12)' },
                '&.Mui-selected': { bgcolor: BRAND.slate, color: '#fff', '&:hover': { bgcolor: BRAND.slateHover } },
              },
            }}>
            {WINDOW_OPTIONS.map(d => <ToggleButton key={d} value={d}>{d}d</ToggleButton>)}
          </ToggleButtonGroup>
          <IconButton onClick={refresh} disabled={state.loading} size="small" aria-label="Refresh map data" sx={{ color: BRAND.textLight, '&:hover': { color: BRAND.accent } }}>
            <RefreshRoundedIcon sx={{ fontSize: 18 }} />
          </IconButton>
          {/* primary CTA: the one action this page exists to feed */}
          <Button component={RouterLink} to="/rodent" size="small" variant="contained" startIcon={<AddRoundedIcon />}
            sx={{ textTransform: 'none', fontWeight: 700, whiteSpace: 'nowrap', borderRadius: '6px', px: 2, bgcolor: BRAND.action, '&:hover': { bgcolor: BRAND.actionHover } }}>
            Log assessment
          </Button>
        </Stack>
      </Box>

      {/* ── Map ecosystem: canvas + docked controls sidebar ──────────────────
          The controls used to float over the canvas and cover live pins. Docking
          them into a real sidebar means chrome never overlaps data, and the map
          gets a stable width instead of an unpredictable usable area. ───────── */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, flexGrow: 1, minHeight: 0 }}>
      <Box className={radiusArmed ? 'rk-radius-armed' : undefined} sx={{ position: 'relative', flexGrow: 1, minWidth: 0, minHeight: { xs: 400, lg: 0 } }}>
        {state.loading ? (
          <Box sx={{ position: 'absolute', inset: 0, p: 2 }}><Skeleton variant="rounded" width="100%" height="100%" /></Box>
        ) : state.error ? (
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            <Stack spacing={1.5} sx={{ alignItems: 'center' }}>
              <Typography variant="body2" sx={{ color: BRAND.textLight }}>Map unavailable right now.</Typography>
              <Button onClick={refresh} variant="outlined" color="secondary" size="small" sx={{ textTransform: 'none' }}>Try again</Button>
            </Stack>
          </Box>
        ) : (
          <>
            <MapContainer
              center={SG_CENTER}
              zoom={16}
              zoomControl={false}
              maxBounds={SG_MAX_BOUNDS}
              maxBoundsViscosity={0.85}   // bounce back rather than hard-stop
              minZoom={SG_MIN_ZOOM}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer key={basemap} attribution={TILE_ATTR} url={BASEMAPS[basemap].url} subdomains="abcd" maxZoom={20}
                eventHandlers={{ tileerror: () => setTileError(true) }} />
              <ZoomControl position="bottomright" />
              <FitToData latlngs={dataLatLngs} fitSignal={fitSignal} />
              <FlyTo latlngs={coOccurLatLngs} signal={flySignal} />
              <RadiusPicker armed={radiusArmed} onPick={c => { setRadiusCentre(c); setRadiusArmed(false); }} />
              <Polygon positions={ESTATE_BOUNDARY}
                pathOptions={{ color: boundaryInk, weight: 1, opacity: 0.35, dashArray: '3 7', fill: true, fillColor: boundaryInk, fillOpacity: 0.03 }} />

              {radiusCentre && (
                <Circle center={radiusCentre} radius={radiusM}
                  pathOptions={{ color: SVG_ACCENT[resolvedMode].line, weight: 2, dashArray: '5 5', fillColor: SVG_ACCENT[resolvedMode].line, fillOpacity: 0.07 }} />
              )}

              {/* LAYER B - SIMULATED. Drawn first so it sits UNDER the real
                  reports: interpolated field below, discrete evidence on top. */}
              {showSensors && sensorSurface.data && (
                <SensorSurfaceLayer surface={sensorSurface.data} mode={resolvedMode} />
              )}

              {viewMode === 'density' ? (
                <>
                  {showRodent && <DensityLayer points={rodentPoints} />}
                  {showFeeding && feedingPoints.map(p => (
                    <Circle key={`df-${p.lat},${p.lng}`} center={[p.lat, p.lng]} radius={45 + Math.min(90, p.count * 22)}
                      pathOptions={{ color: FEEDING_INK, weight: 0, fillColor: FEEDING_INK, fillOpacity: 0.22 }} />
                  ))}
                </>
              ) : (
                <>
                  {showRodent && <PointClusterLayer points={rodentPoints} kind="rodent" dimNonCoOccur={showCoOccur} onCreateWorkOrder={setWoBlock} />}
                  {showFeeding && <PointClusterLayer points={feedingPoints} kind="feeding" dimNonCoOccur={showCoOccur} />}
                </>
              )}
            </MapContainer>

            {/* Persistent disclosure banner. Sits ON the canvas, not in a panel
                that can be collapsed, so the simulated layer can never be on
                screen without its label. MUST survive any restyling. */}
            {showSensors && (
              <Paper
                elevation={3}
                role="status"
                sx={{
                  position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
                  zIndex: 1200, px: 1.75, py: 0.85, borderRadius: '8px', maxWidth: 'min(92%, 560px)',
                  border: `1px solid ${BRAND.border}`, bgcolor: BRAND.surface,
                  display: 'flex', alignItems: 'center', gap: 1,
                }}
              >
                <Box aria-hidden sx={{ display: 'flex', borderRadius: '3px', overflow: 'hidden', flexShrink: 0 }}>
                  {CHART[resolvedMode].ramp.map(c => (
                    <Box key={c} sx={{ width: 8, height: 12, bgcolor: c }} />
                  ))}
                </Box>
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: BRAND.heading, lineHeight: 1.4 }}>
                  {SIMULATED_LABEL}
                  <Box component="span" sx={{ fontWeight: 500, color: BRAND.text }}>
                    {sensorSurface.data
                      ? ` · ${sensorSurface.data.sensorCount} sensors, as of ${new Date(sensorSurface.data.asOf).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                      : sensorSurface.loading ? ' · loading…' : ''}
                  </Box>
                </Typography>
              </Paper>
            )}

            {tileError && (
              <Paper elevation={2} sx={{ position: 'absolute', top: 12, left: 12, zIndex: 1000, px: 1.5, py: 0.5, borderRadius: '8px' }}>
                <Typography sx={{ fontSize: 12, color: BRAND.text }}>
                  Basemap tiles could not load - positions are still shown.
                </Typography>
              </Paper>
            )}

            {/* ── No plotted geometry ─────────────────────────────────────────── */}
            {!hasGeometry && (
              <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', zIndex: 999, pointerEvents: 'none', px: 2 }}>
                <Card sx={{ pointerEvents: 'auto', maxWidth: 440, textAlign: 'center', p: 3 }}>
                  <Typography sx={{ fontSize: 15, fontWeight: 700, color: BRAND.heading, mb: 0.5 }}>
                    {cutoff ? `No located reports up to ${fmtDay(cutoff)}` : 'No located reports in this period'}
                  </Typography>
                  <Typography sx={{ fontSize: 13.5, color: BRAND.text, lineHeight: 1.6 }}>
                    {cutoff
                      ? 'Move the time scrubber forward, or reset it to the full window.'
                      : totalReports > 0
                        ? `${totalUnmapped} report${totalUnmapped === 1 ? '' : 's'} exist in the last ${windowDays} days but ${totalUnmapped === 1 ? 'was' : 'were'} filed without a position.`
                        : `No rodent assessments or feeding sightings in the last ${windowDays} days.`}
                  </Typography>
                  {cutoff && (
                    <Button onClick={() => { setDayIdx(null); setPlaying(false); }} size="small" variant="outlined" sx={{ mt: 2, textTransform: 'none' }}>
                      Show full window
                    </Button>
                  )}
                </Card>
              </Box>
            )}
          </>
        )}
      </Box>

      {/* ── Docked controls sidebar. Collapses to a 48px rail rather than
          disappearing, so the affordance to reopen it is always on the grid. ── */}
      {!state.error && (toolbarOpen ? (
              <Box component="aside" aria-label="Map controls" sx={{ width: { xs: '100%', lg: 320 }, flexShrink: 0, bgcolor: BRAND.surface, borderLeft: { lg: `1px solid ${BRAND.border}` }, borderTop: { xs: `1px solid ${BRAND.border}`, lg: 'none' }, overflowY: 'auto', maxHeight: { xs: 320, lg: 'none' } }}>
                <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.25, borderBottom: `1px solid ${BRAND.border}`, position: 'sticky', top: 0, bgcolor: BRAND.surface, zIndex: 1 }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: BRAND.text }}>Map controls</Typography>
                  <IconButton size="small" onClick={() => setToolbarOpen(false)} aria-label="Collapse map controls" sx={{ p: 0.25, color: BRAND.textLight }}>
                    <CloseRoundedIcon sx={{ fontSize: 17 }} />
                  </IconButton>
                </Stack>

                <Box sx={{ p: 2 }}>
                  <Typography sx={SECTION_LABEL}>View</Typography>
                  <ToggleButtonGroup value={viewMode} exclusive size="small" fullWidth onChange={(_e, v) => v && setViewMode(v)} sx={{ mb: 1.5 }}>
                    <ToggleButton value="pins" sx={{ textTransform: 'none', fontSize: 12.5, py: 0.4 }}>Pins</ToggleButton>
                    <ToggleButton value="density" sx={{ textTransform: 'none', fontSize: 12.5, py: 0.4 }}>Density</ToggleButton>
                  </ToggleButtonGroup>

                  <Typography sx={SECTION_LABEL}>Layers</Typography>
                  <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', rowGap: 0.75, mb: 1.5 }}>
                    <ToggleChip active={showRodent} disabled={rodentPoints.length === 0} onClick={() => setShowRodent(v => !v)} swatch={<RodentSwatch />} label={`Rodent (${rodentPoints.length})`} />
                    <ToggleChip active={showFeeding} disabled={feedingPoints.length === 0} onClick={() => setShowFeeding(v => !v)} swatch={<FeedingSwatch />} label={`Feeding (${feedingPoints.length})`} />
                    <ToggleChip active={showCoOccur} disabled={coBlocks.length === 0} onClick={() => setShowCoOccur(v => !v)} swatch={<CoOccurSwatch />} label={`Co-occur (${coBlocks.length})`} />
                  </Stack>

                  {/* LAYER B toggle. The label states what the layer IS, not just
                      its name - a reader must not have to hunt for the caveat. */}
                  <Typography sx={SECTION_LABEL}>Sensor pilot</Typography>
                  <Tooltip arrow title={SIMULATED_LABEL}>
                    <span>
                      <ToggleChip
                        active={showSensors}
                        onClick={() => setShowSensors(v => !v)}
                        swatch={<Box aria-hidden sx={{ width: 12, height: 12, borderRadius: '3px', background: `linear-gradient(135deg, ${CHART[resolvedMode].ramp[0]}, ${CHART[resolvedMode].ramp[4]})` }} />}
                        label={`Simulated sensors${sensorSurface.data ? ` (${sensorSurface.data.sensorCount})` : ''}`}
                      />
                    </span>
                  </Tooltip>
                  <Typography sx={{ fontSize: 11, color: BRAND.textLight, lineHeight: 1.5, mt: 0.5, mb: 1.5 }}>
                    {SIMULATED_LABEL}
                  </Typography>

                  {showSensors && sensorSurface.data?.availableCouncils?.length > 0 && (
                    <>
                      <Typography sx={SECTION_LABEL}>Town council</Typography>
                      <Stack spacing={0.4} sx={{ mb: 1.5 }}>
                        {sensorSurface.data.availableCouncils.map(c => {
                          const on = councilFilter.length === 0 || councilFilter.includes(c);
                          return (
                            <Box
                              key={c}
                              component="button"
                              type="button"
                              onClick={() => setCouncilFilter(prev => (
                                prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
                              ))}
                              sx={{
                                textAlign: 'left', cursor: 'pointer', border: 'none', font: 'inherit',
                                fontSize: 11.5, px: 0.75, py: 0.4, borderRadius: '6px',
                                bgcolor: on ? BRAND.navySoft : 'transparent',
                                color: on ? BRAND.heading : BRAND.textLight,
                                '&:focus-visible': { outline: `2px solid ${BRAND.accent}`, outlineOffset: 1 },
                              }}
                            >
                              {c}
                            </Box>
                          );
                        })}
                      </Stack>
                      {/* the council model is circles, not official boundaries */}
                      <Typography sx={{ fontSize: 10.5, color: BRAND.textLight, lineHeight: 1.5, mb: 1.5, fontStyle: 'italic' }}>
                        Council regions are approximate, not official boundaries.
                      </Typography>
                    </>
                  )}

                  <Typography sx={SECTION_LABEL}>Basemap</Typography>
                  <ToggleButtonGroup value={basemap} exclusive size="small" fullWidth onChange={(_e, v) => v && setBasemapChoice(v)} sx={{ mb: 1.5 }}>
                    {Object.entries(BASEMAPS).map(([k, v]) => (
                      <ToggleButton key={k} value={k} sx={{ textTransform: 'none', fontSize: 11.5, py: 0.35 }}>{v.label}</ToggleButton>
                    ))}
                  </ToggleButtonGroup>

                  <Typography sx={SECTION_LABEL}>Area selection</Typography>
                  <Stack spacing={0.75} sx={{ mb: 1 }}>
                    <Button size="small" variant={radiusArmed ? 'contained' : 'outlined'} startIcon={<RadioButtonUncheckedRoundedIcon />}
                      onClick={() => { setRadiusArmed(a => !a); if (radiusCentre) setRadiusCentre(null); }}
                      sx={radiusArmed
                        ? { textTransform: 'none', bgcolor: BRAND.action, '&:hover': { bgcolor: BRAND.actionHover } }
                        : { textTransform: 'none', borderColor: BRAND.border, color: BRAND.slate }}>
                      {radiusArmed ? 'Click the map…' : radiusCentre ? 'Reset selection' : 'Radius select'}
                    </Button>
                    {radiusCentre && (
                      <>
                        <Typography sx={{ fontSize: 11.5, color: BRAND.text }}>Radius · {radiusM} m</Typography>
                        <Slider size="small" min={50} max={600} step={25} value={radiusM} onChange={(_e, v) => setRadiusM(v)} sx={{ mx: 0.5 }} />
                        <Box sx={{ p: 1, borderRadius: '8px', bgcolor: BRAND.section }}>
                          <Typography sx={{ fontSize: 12, color: BRAND.heading, fontWeight: 700 }}>
                            {selection.rodentReports} rodent report{selection.rodentReports === 1 ? '' : 's'}
                          </Typography>
                          <Typography sx={{ fontSize: 11.5, color: BRAND.text }}>
                            {selection.rodentLocations} location{selection.rodentLocations === 1 ? '' : 's'} · {selection.feedingSightings} feeding sighting{selection.feedingSightings === 1 ? '' : 's'}
                          </Typography>
                          <Typography sx={{ fontSize: 11.5, color: BRAND.text }}>
                            {selection.blocks.length ? `Blocks: ${selection.blocks.join(', ')}` : 'No labelled blocks inside'}
                          </Typography>
                          <Button size="small" fullWidth startIcon={<FileDownloadOutlinedIcon />} disabled={!selection.rows.length}
                            onClick={exportSelection}
                            sx={{ mt: 0.75, textTransform: 'none', fontWeight: 700, color: BRAND.accent }}>
                            Export CSV
                          </Button>
                        </Box>
                      </>
                    )}
                  </Stack>

                  <Divider sx={{ my: 1 }} />
                  <Box component="button" type="button" onClick={() => setLegendOpen(v => !v)} aria-expanded={legendOpen}
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: 'transparent', border: 'none', cursor: 'pointer', p: 0, color: BRAND.text, font: 'inherit', '&:focus-visible': { outline: `2px solid ${BRAND.accent}`, outlineOffset: 2 } }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{legendOpen ? 'Hide legend' : 'Legend & scales'}</Typography>
                    <ExpandMoreRoundedIcon sx={{ fontSize: 18, transform: legendOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                  </Box>
                  <Collapse in={legendOpen}>
                    <Box sx={{ pt: 1 }}>
                      <Typography component="h2" sx={SECTION_LABEL}>Rodent severity (peak)</Typography>
                      <Stack spacing={0.5} sx={{ mb: 1 }}>
                        {BAND_ORDER.map(b => (
                          <Stack key={b} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                            <BandMark band={b} />
                            <Typography sx={{ fontSize: 12, color: BRAND.text }}>{BAND_LABEL[b]}</Typography>
                          </Stack>
                        ))}
                      </Stack>
                      <Typography sx={{ fontSize: 11.5, color: BRAND.text, lineHeight: 1.6 }}>
                        Colour = severity · bigger pin = more reports · ! marks critical.
                      </Typography>
                      {showSensors && (
                        <Box sx={{ mt: 1.25, p: 1, borderRadius: '8px', bgcolor: BRAND.section, border: `1px solid ${BRAND.border}` }}>
                          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 0.5 }}>
                            <Box aria-hidden sx={{ display: 'flex', borderRadius: '3px', overflow: 'hidden' }}>
                              {CHART[resolvedMode].ramp.map(c => (
                                <Box key={c} sx={{ width: 10, height: 10, bgcolor: c }} />
                              ))}
                            </Box>
                            <Typography sx={{ fontSize: 11, fontWeight: 700, color: BRAND.text }}>low - high activity</Typography>
                          </Stack>
                          {/* legend states it too - required, not optional */}
                          <Typography sx={{ fontSize: 11, color: BRAND.text, lineHeight: 1.5 }}>
                            {SIMULATED_LABEL}. Interpolated between sensors; reported cases above are never interpolated.
                          </Typography>
                        </Box>
                      )}
                      {viewMode === 'density' && (
                        <Typography sx={{ fontSize: 11.5, color: BRAND.textLight, lineHeight: 1.6, mt: 0.5 }}>
                          Density blends overlapping weighted circles - it is not a smoothed kernel estimate.
                        </Typography>
                      )}
                      <Divider sx={{ my: 1.25 }} />
                      <Typography sx={{ fontSize: 11.5, color: BRAND.text, lineHeight: 1.6 }}>{rodentCov}</Typography>
                      <Typography sx={{ fontSize: 11.5, color: BRAND.text, lineHeight: 1.6 }}>{feedingCov}</Typography>
                      <Button type="button" onClick={() => setFitSignal(n => n + 1)} startIcon={<CenterFocusStrongOutlinedIcon />} fullWidth
                        sx={{ mt: 1.25, borderRadius: '8px', color: BRAND.slate, border: `1px solid ${BRAND.border}`, textTransform: 'none', fontSize: 12.5 }}>
                        Reset view
                      </Button>
                    </Box>
                  </Collapse>
                </Box>
              </Box>
            ) : (
              <Box sx={{ flexShrink: 0, width: { lg: 48 }, borderLeft: { lg: `1px solid ${BRAND.border}` }, borderTop: { xs: `1px solid ${BRAND.border}`, lg: 'none' }, bgcolor: BRAND.surface, display: 'flex', justifyContent: 'center', alignItems: { xs: 'center', lg: 'flex-start' }, py: 1 }}>
                <Tooltip title="Map controls" placement="left">
                  <IconButton onClick={() => setToolbarOpen(true)} aria-label="Open map controls" sx={railBtn}>
                    <TuneRoundedIcon sx={{ fontSize: 19 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            ))}
      </Box>

      {/* ── Bottom dock: metrics + temporal scrubber, ~1 row tall ───────────── */}
      {!state.error && (
        <Box sx={{ flexShrink: 0, borderTop: `1px solid ${BRAND.border}`, bgcolor: BRAND.surface }}>
          <Collapse in={dockOpen}>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={{ xs: 1.5, md: 3 }}
              sx={{ px: { xs: 2, md: 3 }, py: 1.25, alignItems: { md: 'center' } }}
            >
              {/* KPI strip on a 4-column grid - the figures are the hook, so they
                  get the size and the labels recede to micro-type */}
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 2, flexGrow: { md: 1 }, maxWidth: { md: 620 } }}>
                <StatCard loading={state.loading} value={totalAssessments} label="Rodent reports" />
                <StatCard
                  loading={state.loading}
                  value={highRiskLocations}
                  label="High-risk locations"
                  accent={highRiskLocations ? ON_SURFACE.danger : BRAND.ink}
                />
                <StatCard loading={state.loading} value={feeding.total} label="Feeding sightings" />
                <StatCard
                  loading={state.loading}
                  value={`${locatedPct}%`}
                  label={`Located · ${totalMapped}/${totalReports}`}
                  accent={poorCoverage ? COVERAGE_INK : BRAND.ink}
                  hint={poorCoverage ? (
                    <Tooltip title={`Only ${locatedPct}% of reports in this window include a location, so the map may under-represent activity.`}>
                      <InfoOutlinedIcon sx={{ fontSize: 15, color: COVERAGE_INK, cursor: 'help' }} />
                    </Tooltip>
                  ) : null}
                />
              </Box>

              {poorCoverage && !state.loading && (
                <Button component={RouterLink} to="/rodent" size="small" variant="contained" startIcon={<AddLocationAltOutlinedIcon />}
                  sx={{ alignSelf: { md: 'center' }, flexShrink: 0, textTransform: 'none', fontWeight: 700, borderRadius: '6px', px: 2.5, py: 1, bgcolor: BRAND.action, '&:hover': { bgcolor: BRAND.actionHover } }}>
                  Add locations
                </Button>
              )}

              <Box sx={{ flexGrow: 1 }} />

              {/* temporal scrubber - only where there is more than one day to move between */}
              {days.length > 1 && (
                <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', minWidth: { md: 300 }, flexGrow: { md: 0.6 } }}>
                  <Tooltip title={playing ? 'Pause playback' : 'Play activity over time'}>
                    <IconButton size="small" onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Pause' : 'Play'} sx={railBtn}>
                      {playing ? <PauseRoundedIcon sx={{ fontSize: 20 }} /> : <PlayArrowRoundedIcon sx={{ fontSize: 20 }} />}
                    </IconButton>
                  </Tooltip>
                  {/* the scrubber is a data surface, not just a control: the
                      histogram behind it shows where activity actually spiked */}
                  <Box sx={{ flexGrow: 1, minWidth: 140, position: 'relative', height: 40, display: 'flex', alignItems: 'flex-end' }}>
                    <ScrubberHistogram days={days} counts={dayCounts} cutoffIdx={dayIdx == null ? days.length - 1 : dayIdx} />
                    <Slider
                      size="small"
                      min={0}
                      max={days.length - 1}
                      value={dayIdx == null ? days.length - 1 : dayIdx}
                      onChange={(_e, v) => { setPlaying(false); setDayIdx(v); }}
                      aria-label="Activity up to day"
                      valueLabelDisplay="auto"
                      valueLabelFormat={i => `${fmtDay(days[i])} · ${dayCounts[i]} report${dayCounts[i] === 1 ? '' : 's'}`}
                      sx={{ position: 'relative', zIndex: 1, py: 0, mb: '3px' }}
                    />
                  </Box>
                  <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: BRAND.text, whiteSpace: 'nowrap', minWidth: 92 }}>
                    {cutoff ? `up to ${fmtDay(cutoff)}` : 'full window'}
                  </Typography>
                  {cutoff && (
                    <Button size="small" onClick={() => { setDayIdx(null); setPlaying(false); }} sx={{ textTransform: 'none', color: BRAND.textLight, minWidth: 0 }}>
                      Reset
                    </Button>
                  )}
                </Stack>
              )}
            </Stack>
          </Collapse>

          <Box
            component="button"
            type="button"
            onClick={() => setDockOpen(v => !v)}
            aria-expanded={dockOpen}
            sx={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5,
              bgcolor: 'transparent', border: 'none', borderTop: dockOpen ? `1px solid ${BRAND.border}` : 'none',
              cursor: 'pointer', py: 0.4, color: BRAND.textLight, font: 'inherit',
              '&:hover': { bgcolor: BRAND.section },
            }}
          >
            <Typography sx={{ fontSize: 11, fontWeight: 700 }}>{dockOpen ? 'Hide metrics' : 'Show metrics'}</Typography>
            <ExpandMoreRoundedIcon sx={{ fontSize: 16, transform: dockOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
          </Box>
        </Box>
      )}

      {/* Screen-reader equivalent of the map. */}
      {!state.loading && !state.error && hasGeometry && (
        <Box component="section" aria-label="Text list of plotted reports" sx={srOnly}>
          <Typography component="h2">
            Rodent risk: {mappedCount} report{mappedCount === 1 ? '' : 's'} at {allRodent.length} location{allRodent.length === 1 ? '' : 's'}
            {unmappedCount ? `; ${unmappedCount} not located` : ''}.
          </Typography>
          <Box component="ul">
            {rodentPoints.map(p => (
              <li key={`sr-r-${p.lat},${p.lng}`}>
                {p.block || 'Unlabelled block'}: {p.count} report{p.count === 1 ? '' : 's'}, peak {BAND_LABEL[bandOf(p)]} risk.
                <Box component="ul">
                  {p.assessments.map(a => (
                    <li key={a.id}>{fmtDate(a.createdAt)}, {BAND_LABEL[a.risk_level] || a.risk_level} risk{a.floor_level ? `, ${a.floor_level}` : ''}: {a.observations}</li>
                  ))}
                </Box>
              </li>
            ))}
          </Box>
          <Typography component="h2">
            Feeding: {feeding.mappedCount} sighting{feeding.mappedCount === 1 ? '' : 's'} at {allFeeding.length} location{allFeeding.length === 1 ? '' : 's'}
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

      <CreateWorkOrderDialog key={woBlock || 'wo'} block={woBlock} open={Boolean(woBlock)} onClose={() => setWoBlock(null)} onResult={setToast} />
      <Snackbar open={Boolean(toast)} autoHideDuration={5000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast?.ok ? 'success' : 'error'} variant="filled" onClose={() => setToast(null)} sx={{ width: '100%' }}>
          {toast?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
