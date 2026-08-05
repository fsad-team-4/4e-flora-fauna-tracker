import { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Circle, Polygon, Popup, Tooltip as LeafletTooltip, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import {
  Card, Box, Stack, Typography, Skeleton, Button, IconButton, Divider, Collapse,
  ToggleButton, ToggleButtonGroup, Paper, Tooltip, GlobalStyles, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, FormControlLabel, Checkbox, CircularProgress,
  Alert, Snackbar, Slider, Switch, LinearProgress,
} from '@mui/material';
import CenterFocusStrongOutlinedIcon from '@mui/icons-material/CenterFocusStrongOutlined';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import PestControlRodentIcon from '@mui/icons-material/PestControlRodent';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import AddLocationAltOutlinedIcon from '@mui/icons-material/AddLocationAltOutlined';
import 'leaflet/dist/leaflet.css';
import { BRAND, CATEGORY_COLORS, ON_SURFACE, SVG_ACCENT, SENSOR_RAMP, TREND } from '../../theme';
import { useThemeMode } from '../../contexts/ThemeModeContext';
import { useUser } from '../../contexts/UserContext';
import { SEVERITY, SG_CENTER, BASEMAPS, TILE_ATTR, DENSITY_RAMP, DENSITY_STEP_LABELS, densityStep } from './rodentMapTokens';
import SensorSurfaceLayer from './SensorSurfaceLayer';
import VendorBriefingDialog from './VendorBriefingDialog';
import VenueDetailDrawer from './VenueDetailDrawer';
import { useSensorSurface, SIMULATED_LABEL, bandThresholds } from './sensorSurfaceData';
import TownCouncilLabels from './TownCouncilLabels';
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
// A briefing is a contractor call-out conversation, so the action only appears
// where one is plausibly warranted. Offering it on a low/medium cluster would
// be noise, and would nudge officers toward escalating things that do not need it.
const URGENT_BANDS = new Set(['high', 'critical']);
const warrantsBriefing = assessments =>
  (assessments || []).some(a => URGENT_BANDS.has(a.risk_level));

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

/**
 * Teardrop pin.
 *
 * ================ WHY THE ANCHOR MOVES, AND WHY THAT MATTERS ===============
 * A circular marker is anchored at its CENTRE - the dot sits on the coordinate.
 * A teardrop is anchored at its TIP, because the tip is what points at the
 * ground. Keeping the centre anchor would silently shift every reported position
 * north by half a marker; at estate zoom that is a building or two.
 * So iconAnchor is [w/2, h] and the popup opens from the tip.
 * ===========================================================================
 *
 * The drop shadow is a real SVG filter rather than a CSS box-shadow, because a
 * box-shadow would trace the icon's square bounding box, not the pin outline.
 */
function teardropIcon({ size, fill, stroke, glyph, glyphPx, badge = '', extraClass = '', coOccurs = false }) {
  const w = size;
  const h = Math.round(size * 1.3);
  const cx = w / 2;
  const cy = w / 2;
  // circle head + a tip that meets the ground point
  const d = `M ${cx} ${h} C ${cx - w * 0.34} ${h - w * 0.42}, 1 ${cy + w * 0.34}, 1 ${cy}`
    + ` a ${cx - 1} ${cx - 1} 0 1 1 ${w - 2} 0`
    + ` c 0 ${w * 0.34 - 0}, ${-w * 0.34 + w * 0.34} ${w * 0.1}, ${-cx + 1} ${h - cy}`
    + ` Z`;
  const html = `
    <div class="rk-pin${extraClass}" style="position:relative;width:${w}px;height:${h}px;">
      <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;overflow:visible;">
        <defs>
          <filter id="rkDrop" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="rgba(16,24,40,.45)"/>
          </filter>
        </defs>
        <path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="2" filter="url(#rkDrop)"/>
      </svg>
      <div style="position:absolute;left:0;top:${Math.round(cy - glyphPx / 2)}px;width:${w}px;display:flex;justify-content:center;pointer-events:none;">
        ${glyphBox(glyph, glyphPx)}
      </div>
      ${badge}
    </div>`;
  return L.divIcon({
    className: `rk-marker${coOccurs ? ' rk-coocc' : ''}`,
    html,
    iconSize: [w, h],
    iconAnchor: [w / 2, h],      // the TIP is the coordinate
    popupAnchor: [0, -h + 4],
  });
}
function rodentIcon(p) {
  const s = rodentDiameter(p.count);
  const band = bandOf(p);
  const sv = SEVERITY[band];
  const badge = band === 'critical'
    ? `<div style="position:absolute;top:-3px;right:-3px;width:13px;height:13px;border-radius:50%;background:#fff;color:${sv.solid};border:1.5px solid ${RODENT_STROKE};display:grid;place-items:center;font:800 9px/1 Inter,Helvetica,Arial,sans-serif;z-index:1;">!</div>`
    : '';
  // The pulse marks `critical` and nothing else. It is the band the backend
  // assigned - NOT a reading of the observation text. Pulsing "fresh gnaw marks
  // and live sightings" would mean classifying prose the model never scored, and
  // the animation would then be asserting a severity nobody recorded.
  const pulse = band === 'critical' ? ' rk-pin-critical' : '';
  return teardropIcon({
    size: s, fill: sv.solid, stroke: RODENT_STROKE,
    glyph: RODENT_GLYPH, glyphPx: Math.round(s * 0.52),
    badge, extraClass: pulse, coOccurs: p.coOccurs,
  });
}
function feedingIcon(coOccurs = false) {
  // white body so feeding stays visually distinct from the filled rodent pins
  return teardropIcon({
    size: 26, fill: '#fff', stroke: FEEDING_INK,
    glyph: FEEDING_GLYPH, glyphPx: 14, coOccurs,
  });
}
function clusterIcon(kind, k, band, coOccurs = false) {
  const feeding = kind === 'feeding';
  const s = clusterSize(k);
  const col = feeding ? FEEDING_INK : SEVERITY[band || 'high'].solid;
  const fs = Math.round(Math.max(12, Math.min(15, s * 0.42)));
  const glyph = feeding ? FEEDING_GLYPH : RODENT_GLYPH;
  const html = `<div style="width:${s}px;height:${s}px;display:flex;align-items:center;justify-content:center;gap:2px;border-radius:30%;box-sizing:border-box;font:700 ${fs}px/1 Inter,Helvetica,Arial,sans-serif;background:#fff;border:2.5px solid ${col};color:${col};box-shadow:0 0 0 3px #fff,0 0 0 4.5px rgba(16,24,40,.55),0 2px 5px rgba(16,24,40,.35);">${glyphBox(glyph, fs)}<span>${k}</span></div>`;
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
function RodentPointBody({ p, onCreateWorkOrder, onDraftBriefing, onOpenVenue }) {
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
        {/* high/critical only - see warrantsBriefing */}
        {onDraftBriefing && warrantsBriefing(p.assessments) && (
          <Button size="small" variant="outlined" fullWidth startIcon={<AutoAwesomeOutlinedIcon sx={{ fontSize: 16 }} />}
            onClick={() => onDraftBriefing(p.assessments.map(a => a.id), p.block)}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '6px', borderColor: BRAND.border, color: ON_SURFACE.info, '&:hover': { borderColor: ON_SURFACE.info } }}>
            Draft vendor briefing
          </Button>
        )}
        {p.block && onOpenVenue && (
          // opens a drawer rather than navigating to /rodent - the officer keeps
          // the map they were reading
          <Button size="small" fullWidth onClick={() => onOpenVenue(p.block)}
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
function ClusterBody({ kind, members, map, bounds, onCreateWorkOrder, onDraftBriefing, onOpenVenue }) {
  // every report behind this cluster, so the briefing covers the whole hotspot
  const clusterAssessments = useMemo(
    () => members.flatMap(p => p.assessments || []),
    [members],
  );
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
        {/* high/critical only - see warrantsBriefing */}
        {kind !== 'feeding' && onDraftBriefing && warrantsBriefing(clusterAssessments) && (
          <Button size="small" variant="outlined" fullWidth startIcon={<AutoAwesomeOutlinedIcon sx={{ fontSize: 16 }} />}
            onClick={() => onDraftBriefing(clusterAssessments.map(a => a.id), single ? single.block : null)}
            sx={{ textTransform: 'none', fontWeight: 700, borderColor: BRAND.border, color: ON_SURFACE.info, '&:hover': { borderColor: ON_SURFACE.info } }}>
            Draft vendor briefing
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
        {single && single.block !== 'Unlabelled' && onOpenVenue && (
          <Button size="small" fullWidth onClick={() => onOpenVenue(single.block)}
            sx={{ textTransform: 'none', fontWeight: 700, color: ON_SURFACE.info }}>
            View location details
          </Button>
        )}
      </Stack>
    </Box>
  );
}

function PointClusterLayer({ points, kind, dimNonCoOccur, onCreateWorkOrder, onDraftBriefing, markerRefs, onOpenVenue }) {
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
        <Marker
          key={`${kind}-${p.lat},${p.lng}`}
          // registered by coordinate so the Action required list can open this
          // exact popup. Cleared on unmount, or the map would hold refs to
          // markers that no longer exist after a filter change.
          ref={markerRefs ? (el => {
            const k = `${p.lat},${p.lng}`;
            if (el) markerRefs.current.set(k, el); else markerRefs.current.delete(k);
          }) : undefined}
          position={[p.lat, p.lng]} icon={kind === 'feeding' ? feedingIcon(p.coOccurs) : rodentIcon(p)}
          opacity={dimNonCoOccur && !p.coOccurs ? 0.3 : 1}
          keyboard title={`${p.block || 'Unlabelled block'}: ${p.count} ${unit}${p.count === 1 ? '' : 's'}`}>
          <Popup maxHeight={320} minWidth={220} {...POPUP_PAN}><Body p={p} onCreateWorkOrder={onCreateWorkOrder} onDraftBriefing={onDraftBriefing} onOpenVenue={onOpenVenue} /></Popup>
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
      <Marker
        key={`${kind}-cluster-${gi}-${cLat},${cLng}`}
        // A cluster registers under EVERY member's coordinate. Focusing a block
        // from the Action required list has to open SOMETHING, and at estate zoom
        // a block frequently still groups with its neighbours - registering only
        // single markers meant the map flew there and opened nothing. Opening the
        // cluster is also the more useful answer: it shows the block in the
        // company of whatever it is clustered with.
        ref={markerRefs ? (el => {
          members.forEach(mp => {
            const k = `${mp.lat},${mp.lng}`;
            if (el) markerRefs.current.set(k, el); else if (markerRefs.current.get(k) === el) markerRefs.current.delete(k);
          });
        }) : undefined}
        position={[cLat, cLng]} icon={clusterIcon(kind, members.length, band, clusterCoOccurs)}
        opacity={dimNonCoOccur && !clusterCoOccurs ? 0.3 : 1}
        keyboard title={`${members.length} ${kind} locations, ${reports} report${reports === 1 ? '' : 's'}`}>
        <Popup maxHeight={340} minWidth={230} {...POPUP_PAN}>
          <ClusterBody kind={kind} members={members} map={map} bounds={bounds} onCreateWorkOrder={onCreateWorkOrder} onDraftBriefing={onDraftBriefing} onOpenVenue={onOpenVenue} />
        </Popup>
      </Marker>
    );
  });
}

/**
 * Density view: HEXAGONAL BINNING.
 *
 * ================== WHY BINS AND NOT A HEATMAP =============================
 * This replaced a stack of translucent discs, one per location, sized by count at
 * 0.26 alpha. Overlaps compounded into muddy blobs with hard arc seams where the
 * circles crossed, and the darkness of any spot depended on how many disc edges
 * happened to cover it - not on how many reports were there.
 *
 * The tempting fix is a smooth thermal heatmap (leaflet.heat is even already a
 * dependency, used by the fauna page). It is the WRONG tool here and is
 * deliberately not used: a heatmap smooths discrete events into a continuous
 * field, painting warm colour onto ground where nobody reported anything. This
 * project already draws that line for the simulated sensor grid - a fixed sensor
 * samples a field that genuinely exists between readings, so interpolating it is
 * honest; an officer's report is a discrete event, and the ground between two
 * reports has no true value.
 *
 * Binning is not interpolation. Each hexagon states one fact: "N reports fall
 * inside this cell." No value is invented for unobserved ground, and a cell with
 * no reports is not drawn at all - absent, not "cold". That is the same no-data
 * rule the sensor raster follows.
 * ===========================================================================
 *
 * Cells are sized in METRES, so a hexagon always covers the same patch of estate
 * no matter the zoom, and the legend states the cell width. Fixed-screen-size
 * bins would silently change what a cell means as you zoom.
 */
/**
 * Cell width by zoom, in metres.
 *
 * A single fixed size cannot work: 140m cells are one block wide - right for
 * inspecting an estate - but at island zoom they are sub-pixel and the layer
 * looks empty. The ladder keeps a cell roughly the same SIZE ON SCREEN while its
 * GROUND meaning changes with zoom, which is how binned maps normally behave.
 *
 * The trade is that "how many reports in a cell" means something different at
 * each zoom, so the current cell width is printed in every tooltip and in the
 * legend. A bin count with an unstated cell size would be a meaningless number.
 */
const HEX_LADDER = [
  { maxZoom: 12, m: 2400 },
  { maxZoom: 13, m: 1400 },
  { maxZoom: 14, m: 800 },
  { maxZoom: 15, m: 450 },
  { maxZoom: 16, m: 260 },
  { maxZoom: Infinity, m: 140 },   // ~one block frontage
];
const hexMetresFor = zoom => (HEX_LADDER.find(l => zoom <= l.maxZoom) || HEX_LADDER[HEX_LADDER.length - 1]).m;
const fmtCell = m => (m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`);
const M_PER_DEG_LAT = 110574;

/**
 * Bin points into pointy-top hexagons using axial coordinates.
 *
 * Works in a local metre space centred on the data, so the hexagons stay regular:
 * binning in raw degrees would stretch every cell east-west by the cos(lat)
 * factor and the grid would visibly shear.
 */
function hexBin(points, hexM) {
  if (!points.length) return [];
  const lat0 = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const mPerDegLng = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const toM = p => [(p.lng) * mPerDegLng, (p.lat) * M_PER_DEG_LAT];
  const toLatLng = (x, y) => [y / M_PER_DEG_LAT, x / mPerDegLng];

  const size = hexM / Math.sqrt(3);       // circumradius of a pointy-top hex
  const cells = new Map();
  for (const p of points) {
    const [x, y] = toM(p);
    // pixel -> axial, then cube-round so a point lands in exactly one cell
    const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / size;
    const r = ((2 / 3) * y) / size;
    let rx = Math.round(q);
    let rz = Math.round(-q - r);
    let ry = Math.round(r);
    const dx = Math.abs(rx - q);
    const dy = Math.abs(ry - r);
    const dz = Math.abs(rz - (-q - r));
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy > dz) ry = -rx - rz;
    const key = `${rx},${ry}`;
    const cell = cells.get(key) || { q: rx, r: ry, count: 0, locations: 0, band: 'low' };
    cell.count += p.count;
    cell.locations += 1;
    // the cell inherits the WORST band present in it, never an average - a
    // critical report must not be softened by the quiet ones beside it
    if (SEVERITY_RANK[bandOf(p)] > SEVERITY_RANK[cell.band]) cell.band = bandOf(p);
    cells.set(key, cell);
  }

  return [...cells.values()].map(c => {
    const cx = size * (Math.sqrt(3) * c.q + (Math.sqrt(3) / 2) * c.r);
    const cy = size * ((3 / 2) * c.r);
    const ring = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 30);
      ring.push(toLatLng(cx + size * Math.cos(a), cy + size * Math.sin(a)));
    }
    return { ...c, ring, centre: toLatLng(cx, cy) };
  });
}

const SEVERITY_RANK = { low: 0, medium: 1, high: 2, critical: 3 };

function DensityLayer({ points, monoColor = null, mode = 'light' }) {
  // Re-bin on zoom so the cells stay a usable size on screen at every scale.
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const hexM = hexMetresFor(zoom);
  const cells = useMemo(() => hexBin(points, hexM), [points, hexM]);
  const ramp = DENSITY_RAMP[mode] || DENSITY_RAMP.light;
  return cells.map(c => {
    // Feeding bins in one flat colour: it has no volume scale of its own on this
    // page, and a second five-step ramp beside the rodent one would read as a
    // comparison between two things that are not on the same scale.
    const step = densityStep(c.count);
    const fill = monoColor || ramp[step];
    // Opacity climbs with the SAME variable the hue does, so the two reinforce
    // instead of encoding different things. The 0.30 floor keeps a one-report cell
    // clearly visible - "measured, and quiet" must not fade to nothing, or a sparse
    // cell becomes indistinguishable from no cell at all.
    const t = monoColor ? 0.5 : step / (ramp.length - 1);
    return (
      <Polygon
        key={`hx-${c.q},${c.r}`}
        positions={c.ring}
        // rk-hex carries a short fade/scale-in so switching to Density reads as a
        // transition rather than a hard repaint
        className="rk-hex"
        pathOptions={{
          color: fill,
          weight: 1,
          opacity: 0.55,
          fillColor: fill,
          fillOpacity: 0.3 + 0.32 * t,
        }}
      >
        <LeafletTooltip direction="top" offset={[0, -4]} opacity={1} className="rk-hex-tip">
          <span style={{ fontWeight: 700 }}>{c.count} report{c.count === 1 ? '' : 's'}</span>
          {` across ${c.locations} location${c.locations === 1 ? '' : 's'}`}
          <br />
          {/* Peak severity is still REPORTED here even though it is no longer drawn -
              the shading dropped it, the readout must not. */}
          {monoColor ? `${fmtCell(hexM)} cell` : `peak severity ${c.band} · ${fmtCell(hexM)} cell`}
        </LeafletTooltip>
      </Polygon>
    );
  });
}

/**
 * Fly to one reported location and open its popup.
 *
 * The popup open is deferred to the moveend, because Leaflet will not lay a
 * popup out correctly while the map is still animating - it opens against the
 * pre-flight viewport and lands off-screen.
 */
function FocusPoint({ focus, markerRefs }) {
  const map = useMap();
  const lastN = useRef(0);
  useEffect(() => {
    if (!focus || focus.n === lastN.current) return undefined;
    lastN.current = focus.n;
    // The marker may not exist yet at moveend: focusing also switches the view
    // to pins, and that layer re-renders (and re-registers its refs) after the
    // flight starts. It can also still be inside a cluster until the new zoom
    // settles. So retry briefly rather than giving up on the first miss.
    // Poll for the marker across the whole flight rather than hanging off
    // moveend. Two things make moveend unreliable here: it never fires at all if
    // the map is already at the target, and focusing ALSO switches the view to
    // pins, so the layer re-registers its refs after the event has passed.
    // ~2s of polling covers the 0.7s flight plus the re-render.
    let tries = 0;
    let timer = null;
    const open = () => {
      const m = markerRefs.current.get(focus.key);
      if (m && m.openPopup) { m.openPopup(); return; }
      if (tries++ < 40) timer = setTimeout(open, 50);
    };
    map.flyTo(focus.latlng, Math.max(map.getZoom(), 17), { duration: 0.7 });
    // Wait for the flight AND the re-render before opening. Opening immediately
    // did fire - and the popup was then destroyed, because switching to pins
    // remounts the marker layer underneath it. 900ms clears the 0.7s flight plus
    // React's commit; the poll then covers any further delay.
    timer = setTimeout(open, 900);
    return () => { if (timer) clearTimeout(timer); };
  }, [focus, map, markerRefs]);
  return null;
}

/**
 * KEEP SINGAPORE, AND ONLY SINGAPORE, IN VIEW.
 *
 * maxBounds on its own does not achieve this. Leaflet can only honour bounds while
 * the viewport is SMALLER than they are; at a fixed minZoom of 11 an ordinary
 * desktop viewport spans about 0.55 degrees of longitude against the 0.5 degrees
 * SG_MAX_BOUNDS covers, so the constraint is unsatisfiable and Malaysia and
 * Indonesia appear at the edges however tight the bounds are.
 *
 * So the floor is DERIVED, not hardcoded: getBoundsZoom() reports the deepest zoom
 * at which the bounds still fit the current container, and that becomes minZoom.
 * Zoomed all the way out you get Singapore filling the frame and nothing beyond it.
 *
 * It is recomputed on resize because the answer depends on container size - the
 * map lives in a panel that changes width when the toolbar collapses, and a floor
 * computed for a wide container would let a narrow one zoom out too far.
 */
function LockToSingapore({ bounds }) {
  const map = useMap();
  useEffect(() => {
    const b = L.latLngBounds(bounds);
    const apply = () => {
      // inside=TRUE, and the choice is the whole point.
      //
      // inside=false gives the deepest zoom at which Singapore fits within the
      // view - about zoom 11, which is the hardcoded floor this replaced. At that
      // zoom the viewport spans roughly 0.82 degrees of longitude while Singapore
      // spans 0.5, so the leftover frame is filled by Malaysia and Indonesia. That
      // is unavoidable: the island and the viewport are different shapes.
      //
      // inside=true instead gives the shallowest zoom at which the VIEW fits inside
      // the BOUNDS. The trade is real - fully zoomed out you no longer see the whole
      // island at once, it is cropped to the viewport's aspect - but nothing outside
      // Singapore is ever on screen, which is the requirement.
      const floor = map.getBoundsZoom(b, true);
      map.setMinZoom(floor);
      if (map.getZoom() < floor) map.setZoom(floor);
      map.setMaxBounds(b);
    };
    apply();
    map.on('resize', apply);
    return () => map.off('resize', apply);
  }, [map, bounds]);
  return null;
}

/**
 * Frame the data ONCE, then leave the camera alone.
 *
 * This effect listed `latlngs` as a trigger, and every fetch builds a fresh array,
 * so changing the window to 7d - or just pressing Refresh - re-fitted the map. An
 * officer who had zoomed into a block to read it lost that view on every reload,
 * with no way to keep it.
 *
 * Now it fits on the first arrival of data and afterwards only when the officer
 * asks, via the "fit to data" button's fitSignal. Same lastSignal-ref shape FlyTo
 * uses below, for the same reason: an identity change is not an intent.
 *
 * This does not contradict the camera-target comment further down - that defends
 * deriving targets from unfiltered data, not re-framing on every fetch.
 */
function FitToData({ latlngs, fitSignal }) {
  const map = useMap();
  const lastSignal = useRef(fitSignal);
  const framedOnce = useRef(false);
  useEffect(() => {
    if (!latlngs.length) return;
    const asked = fitSignal !== lastSignal.current;
    if (framedOnce.current && !asked) return;
    lastSignal.current = fitSignal;
    framedOnce.current = true;
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
/**
 * One collapsible section of the controls drawer.
 *
 * A hand-rolled disclosure rather than MUI's Accordion: Accordion brings its own
 * paper, elevation, margins and a summary min-height that fights a 320px drawer,
 * and every one of those would have had to be overridden back off.
 */
/**
 * A layer row: swatch, name, count, switch.
 *
 * The count is rendered separately from the label so "0" reads as "this layer has
 * nothing in it" rather than being baked into the name - and the row is disabled
 * from the same fact, so the two can never disagree.
 */
function LayerSwitch({ checked, disabled, onChange, swatch, label, count }) {
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: 'center', minHeight: 34, opacity: disabled ? 0.5 : 1 }}
    >
      <Box sx={{ display: 'flex', flexShrink: 0 }}>{swatch}</Box>
      <Typography sx={{ fontSize: 13, fontWeight: 600, color: BRAND.heading, flexGrow: 1, minWidth: 0 }}>
        {label}
        {count != null && (
          <Box component="span" sx={{ ml: 0.6, fontSize: 12, fontWeight: 600, color: BRAND.textLight, fontVariantNumeric: 'tabular-nums' }}>
            {count}
          </Box>
        )}
      </Typography>
      <Switch
        size="small"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        slotProps={{ input: { 'aria-label': `${label} layer` } }}
        sx={{
          flexShrink: 0,
          '& .MuiSwitch-switchBase.Mui-checked': { color: '#fff' },
          '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: ON_SURFACE.info, opacity: 1 },
        }}
      />
    </Stack>
  );
}

function PanelSection({ title, open, onToggle, children }) {
  return (
    <Box sx={{ '& + &': { mt: 1.5, pt: 1.5, borderTop: `1px solid ${BRAND.border}` } }}>
      <Stack
        component="button"
        type="button"
        direction="row"
        onClick={onToggle}
        aria-expanded={open}
        sx={{
          width: '100%', alignItems: 'center', justifyContent: 'space-between',
          background: 'none', border: 0, p: 0, cursor: 'pointer', font: 'inherit',
          mb: open ? 1.25 : 0,
          '&:focus-visible': { outline: `2px solid ${BRAND.accent}`, outlineOffset: 3 },
        }}
      >
        <Typography sx={{ ...SECTION_LABEL, mb: 0 }}>{title}</Typography>
        <ExpandMoreRoundedIcon
          sx={{ fontSize: 19, color: BRAND.textLight, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' }}
          aria-hidden
        />
      </Stack>
      <Collapse in={open} unmountOnExit>
        <Box>{children}</Box>
      </Collapse>
    </Box>
  );
}

/**
 * Change against the immediately preceding window of equal length.
 *
 * Renders NOTHING unless the backend says the prior window actually holds
 * records (`previous.has_data`). An empty baseline is an absence of history, not
 * a zero - "+100% vs previous" off nothing would be a fabricated trend, and the
 * endpoint returns that flag precisely so the UI cannot draw one.
 *
 * `improve` names which direction is good for THIS metric, since every figure on
 * this dock is one where fewer is better. Direction is carried by the arrow and
 * the sign as well as the colour.
 */
function TrendDelta({ current, previous, windowDays }) {
  const { resolvedMode } = useThemeMode();
  const trend = TREND[resolvedMode] || TREND.light;
  if (previous == null) return null;
  const delta = current - previous;
  if (delta === 0) {
    return (
      <Tooltip arrow title={`No change vs the previous ${windowDays} days`}>
        <Stack direction="row" spacing={0.2} sx={{ alignItems: 'center', color: trend.neutral }}>
          <RemoveRoundedIcon sx={{ fontSize: 14 }} aria-hidden />
          <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: 'inherit' }}>0%</Typography>
        </Stack>
      </Tooltip>
    );
  }
  // A percentage needs a non-zero baseline to mean anything; fall back to the
  // absolute change rather than printing a fake infinity.
  const pct = previous > 0 ? Math.round((delta / previous) * 100) : null;
  const rising = delta > 0;
  const colour = rising ? trend.bad : trend.good;   // fewer is better for all four
  const Icon = rising ? ArrowUpwardRoundedIcon : ArrowDownwardRoundedIcon;
  const shown = pct != null ? `${rising ? '+' : ''}${pct}%` : `${rising ? '+' : ''}${delta}`;
  return (
    <Tooltip arrow title={`${rising ? '+' : ''}${delta} vs the previous ${windowDays} days (${previous})`}>
      <Stack
        direction="row"
        spacing={0.2}
        aria-label={`${rising ? 'up' : 'down'} ${Math.abs(pct ?? delta)}${pct != null ? ' percent' : ''} versus the previous ${windowDays} days`}
        sx={{ alignItems: 'center', color: colour, cursor: 'help' }}
      >
        <Icon sx={{ fontSize: 14 }} aria-hidden />
        <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: 'inherit', fontVariantNumeric: 'tabular-nums' }}>{shown}</Typography>
      </Stack>
    </Tooltip>
  );
}

function StatCard({ value, label, accent, hint, loading, trend, alert = false, active = false, onToggle = null, dense = false }) {
  return (
    // Elevated card on the sheet surface, not a grey well sunk into it. The
    // BRAND.section fill made the four metrics read as one recessed strip; a
    // surface fill plus a hairline and a soft shadow lifts each into its own
    // object, which is what gives the strip its "command deck" weight.
    //
    // `dense` is the header-strip form: the figures moved off the page floor to
    // directly under the header, where they are read before the map rather than
    // after it. At 38px the four cards needed a 96px band of their own, which is
    // why they used to live in a collapse - at 24px with the label on the same
    // optical line they fit a single 58px row that never needs hiding.
    <Box
      component={onToggle ? 'button' : 'div'}
      type={onToggle ? 'button' : undefined}
      onClick={onToggle || undefined}
      aria-pressed={onToggle ? active : undefined}
      sx={{
        px: dense ? 1.75 : 2, py: dense ? 1.1 : 1.75,
        borderRadius: dense ? '8px' : '10px', minWidth: 0,
        width: '100%', textAlign: 'left', font: 'inherit',
        cursor: onToggle ? 'pointer' : 'default',
        // ACTIVE = inverted, so a filtered map can never look like an unfiltered
        // one. The card is the only place the filter state is shown.
        bgcolor: active ? ON_SURFACE.danger : BRAND.surface,
        border: `1px solid ${active ? ON_SURFACE.danger : BRAND.border}`,
        ...(alert && !active ? { borderLeft: `4px solid ${ON_SURFACE.danger}` } : null),
        boxShadow: dense
          ? '0 1px 2px rgba(16,24,40,.06)'
          : '0 4px 12px rgba(16,24,40,.10), 0 1px 3px rgba(16,24,40,.06)',
        transition: 'background-color .15s ease, border-color .15s ease',
        ...(onToggle ? { '&:hover': { borderColor: ON_SURFACE.danger } } : null),
        '&:focus-visible': { outline: `2px solid ${ON_SURFACE.danger}`, outlineOffset: 2 },
      }}
    >
      {loading ? (
        <>
          <Skeleton variant="text" width={54} height={dense ? 24 : 34} />
          <Skeleton variant="text" width="80%" height={14} />
        </>
      ) : (
        <>
          {/* label above, integer below, trend pinned top-right */}
          <Stack direction="row" sx={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
            <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: active ? 'rgba(255,255,255,.85)' : BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.9px', lineHeight: 1.35 }}>
              {label}
            </Typography>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexShrink: 0 }}>
              {hint}
              {trend}
            </Stack>
          </Stack>
          <Typography sx={{
            fontSize: dense ? { xs: 22, md: 25 } : { xs: 30, md: 38 },
            fontWeight: 900, lineHeight: 1.05, mt: dense ? 0.15 : 0.5,
            color: active ? '#fff' : (accent || BRAND.ink),
            fontVariantNumeric: 'tabular-nums', letterSpacing: dense ? '-0.9px' : '-1.5px',
          }}>
            {value}
          </Typography>
          {/* labels wrap rather than ellipsis: "High-risk locations" truncated to
              "HIGH-RISK LOCA…" at this column width, which is worse than two lines */}

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
function ScrubberHistogram({ days, counts, cutoffIdx, hoverIdx = null, onHover }) {
  const max = Math.max(1, ...counts);
  return (
    <Box
      sx={{ position: 'absolute', inset: '0 0 14px 0', display: 'flex', alignItems: 'flex-end', gap: '1px' }}
      onMouseLeave={() => onHover?.(null)}
    >
      {days.map((d, i) => {
        const inWindow = i <= cutoffIdx;
        const hot = hoverIdx === i;
        return (
          <Tooltip key={d} arrow placement="top" title={`${fmtDay(d)} · ${counts[i]} report${counts[i] === 1 ? '' : 's'}`}>
            <Box
              onMouseEnter={() => onHover?.(i)}
              sx={{
                flex: 1, minWidth: 0, cursor: 'default',
                height: `${Math.max(8, (counts[i] / max) * 100)}%`,
                borderRadius: '2px 2px 0 0',
                bgcolor: inWindow ? ON_SURFACE.danger : BRAND.border,
                // hover lifts one bar out of the field so a specific day is
                // readable without scrubbing to it
                opacity: hot ? 0.95 : inWindow ? 0.32 : 0.5,
                transition: 'opacity .12s ease',
              }}
            />
          </Tooltip>
        );
      })}
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
  const { user } = useUser();
  const [state, setState] = useState({
    loading: true, error: false, scaleMax: 0, points: [],
    totalAssessments: 0, mappedCount: 0, unmappedCount: 0,
    feeding: { total: 0, mappedCount: 0, unmappedCount: 0, points: [] }, coOccurrenceBlocks: [],
  });
  const [windowDays, setWindowDays] = useState(30);
  const [showRodent, setShowRodent] = useState(true);
  const [showFeeding, setShowFeeding] = useState(true);
  const [showCoOccur, setShowCoOccur] = useState(false);
  // Density is the landing view: for triage, binned concentration is the thing
  // worth seeing first, and a full pin layer over an estate is noise.
  // It deliberately does NOT also filter to high risk. Doing that would make the
  // map show a subset while the metric cards below still counted everything, and
  // an officer's first impression of the estate would under-report it. The
  // high-risk filter is one click away on the card, and says so when it is on.
  const [viewMode, setViewMode] = useState('density'); // pins | density
  // when true the map shows ONLY high/critical locations - driven by the metric
  // card, and always visibly reflected there
  const [highRiskOnly, setHighRiskOnly] = useState(false);
  // null = follow the app's colour scheme; a value = the officer picked one. Derived
  // rather than synced in an effect, so a scheme change is reflected immediately
  // without a cascading render, and an explicit choice still wins.
  const [basemapChoice, setBasemapChoice] = useState(null);
  const [toolbarOpen, setToolbarOpen] = useState(true);
  // Layers | Filters | Legend. The panel carried seven stacked sections, which
  // meant scrolling past basemap choices to reach the legend.
  // All three open by default: the drawer is tall enough to hold them, and the
  // point of the switch away from tabs was to stop hiding two thirds of it.
  const [openSections, setOpenSections] = useState({ action: true, layers: true, filters: true, legend: true });
  const toggleSection = k => setOpenSections(s => ({ ...s, [k]: !s[k] }));
  const [dockOpen, setDockOpen] = useState(true);
  const [fitSignal, setFitSignal] = useState(0);
  const [flySignal, setFlySignal] = useState(0);
  // markers register by "lat,lng" so the Action required list can open one
  const markerRefs = useRef(new Map());
  // { latlng, key, n } - n forces a re-fly when the same item is clicked twice
  const [focus, setFocus] = useState(null);
  // block whose venue detail drawer is open, or null
  const [venueBlock, setVenueBlock] = useState(null);
  const focusNonce = useRef(0);
  const [tileError, setTileError] = useState(false);
  const [woBlock, setWoBlock] = useState(null);
  // { ids, block } - the cluster an officer asked for a briefing on
  const [briefing, setBriefing] = useState(null);
  const [toast, setToast] = useState(null);
  const [reloadSignal, setReloadSignal] = useState(0);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  // temporal scrubber
  const [dayIdx, setDayIdx] = useState(null); // null = whole window
  const [playing, setPlaying] = useState(false);
  const [hoverDay, setHoverDay] = useState(null);   // histogram hover highlight
  // radius selection
  // LAYER B - simulated sensor surface. Off by default: the real reports are the
  // page's evidence, and a smooth field must be an opt-in the officer chose.
  const [showSensors, setShowSensors] = useState(false);
  const [councilFilter, setCouncilFilter] = useState([]);
  // Council names are the map's ONLY region labels now that the labelled basemap is
  // gone, so this defaults ON - a map with no place names at all is harder to read
  // than one named by the wrong scheme. The dashed region rings stay opt-in: they
  // are approximate circles and drawing them by default would imply surveyed
  // boundaries.
  const [showCouncilLabels, setShowCouncilLabels] = useState(true);
  const [showCouncilRegions, setShowCouncilRegions] = useState(false);
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

  // The basemap follows the colour scheme (or the officer's explicit choice).
  // Turning the sensor layer on used to force the dark basemap for the radar
  // look, which effectively made the layer dark-mode-only - the ramp is
  // near-opaque at the core, so it reads fine over the light basemap too.
  const basemap = basemapChoice ?? (resolvedMode === 'dark' ? 'dark' : 'muted');
  const sensorSurface = useSensorSurface({ enabled: showSensors, windowDays, councils: councilFilter });
  // same thresholds the contour bands are cut at, so the legend cannot drift
  const sensorBands = bandThresholds(sensorSurface.data?.scaleMax || 0, SENSOR_RAMP[resolvedMode].length);

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
  /**
   * Prior-window figures, or null.
   *
   * Null whenever `has_data` is false: the backend sets that when the preceding
   * window holds no records at all, and an absent baseline must produce NO trend
   * rather than a percentage measured against nothing. It is also null while the
   * scrubber is engaged - the cards then describe a sub-window of the fetched
   * range, and `previous` was computed for the full one, so comparing them would
   * be comparing two different spans.
   */
  const prev = (state.previous?.has_data && !cutoff) ? state.previous : null;

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
  // Counted from the UNFILTERED points, so the card keeps stating the true total
  // even while the map is filtered down to exactly those locations - otherwise
  // pressing the card would make its own number look like the whole estate.
  const highRiskPoints = useMemo(
    () => rodentPoints.filter(p => p.riskLevel === 'high' || p.riskLevel === 'critical'),
    [rodentPoints],
  );
  const highRiskLocations = highRiskPoints.length;
  // what the map actually draws
  const shownRodent = highRiskOnly ? highRiskPoints : rodentPoints;
  // worst first, by the server's own weighted score
  const actionList = useMemo(
    () => [...highRiskPoints].sort(
      (a, b) => (b.weightedScore || 0) - (a.weightedScore || 0)
        || b.count - a.count
        || String(a.block || '').localeCompare(String(b.block || ''), 'en', { numeric: true }),
    ),
    [highRiskPoints],
  );

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

  const openBriefing = (ids, block) => setBriefing({ ids, block });
  // Raising the order is the financial act and stays admin-only on the server;
  // hiding it for staff just avoids offering a button that would 403.
  const canRaiseWorkOrder = user?.role === 'admin';

  const flyToCoOccur = () => { setShowCoOccur(true); setFlySignal(n => n + 1); };

  /**
   * Jump to one high-risk location from the Action required list.
   *
   * Switches to PINS first: the popup belongs to a marker, and in density view
   * there are no markers to open - the officer would be flown somewhere with
   * nothing to read. Also clears the high-risk filter's effect on visibility by
   * leaving it alone, since every item in this list is high-risk anyway.
   */
  function focusLocation(p) {
    setViewMode('pins');
    setShowRodent(true);
    // an incrementing nonce, so clicking the SAME item twice re-flies
    focusNonce.current += 1;
    setFocus({ latlng: [p.lat, p.lng], key: `${p.lat},${p.lng}`, n: focusNonce.current });
  }
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
        // The ring tracks the pin's HEAD, not its bounding box.
        // It used to be `inset: -2px; border-radius: inherit`, which worked only
        // because the old marker's child was itself a circle. The teardrop's
        // wrapper has no radius, so `inherit` resolved to 0 and the pulse drew a
        // rectangle around the pin. Head diameter equals the box width, so a
        // square block at the top with a 50% radius sits exactly on it.
        // CO-OCCURRENCE IS A STATIC RING, ON ::before.
        //
        // Two bugs met here. This rule used ::after and animated it, and
        // `.rk-coocc > .rk-pin::after` (specificity 0,2,1) outranks
        // `.rk-pin-critical::after` (0,1,1) on the SAME pseudo-element - so a pin
        // that was both critical and co-occurring silently lost its critical
        // pulse. The most urgent state on the map was hidden by a less urgent one.
        //
        // Fixed by giving each meaning its own pseudo-element: co-occurrence takes
        // ::before, critical keeps ::after, and a pin that is both now shows both.
        // Co-occurrence also stops pulsing - an animated ring now means critical and
        // only critical, which is the invariant this file states further up, and a
        // static ring is what CoOccurSwatch has always drawn in the legend. The map
        // was contradicting its own key.
        '.rk-coocc > .rk-pin::before': {
          content: '""', position: 'absolute', left: '-3px', top: '-3px',
          width: 'calc(100% + 6px)', aspectRatio: '1', borderRadius: '50%',
          border: `2px solid ${CATEGORY_COLORS[resolvedMode].flora_health}`,
          boxSizing: 'border-box', pointerEvents: 'none', zIndex: 1,
        },
        '@keyframes rkpulse': { '0%': { boxShadow: `0 0 0 0 rgba(${pulseRgb},.5)` }, '70%': { boxShadow: `0 0 0 7px rgba(${pulseRgb},0)` }, '100%': { boxShadow: `0 0 0 0 rgba(${pulseRgb},0)` } },
        // Leaflet's stock chrome follows the scheme: popup panel/tip, the canvas
        // behind tiles, zoom control and attribution strip all ride the em- vars.
        '.leaflet-popup-content-wrapper, .leaflet-popup-tip': { background: BRAND.surface, color: BRAND.text },
        // Leaflet ships a hard 3px drop shadow; swap it for a diffused two-layer
        // elevation and the app's 8px radius so popups match the card system.
        '.leaflet-popup-content-wrapper': {
          borderRadius: '14px',
          border: `1px solid ${BRAND.border}`,
          boxShadow: '0 8px 24px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.08)',
        },
        '.leaflet-popup-content': { margin: '16px 18px' },
        // the popup's own tip inherits the wrapper colour but not its shadow
        '.leaflet-popup-tip': { boxShadow: 'none' },
        'a.leaflet-popup-close-button': { color: `${BRAND.textLight} !important` },
        '.leaflet-container': { background: BRAND.canvas },
        '.leaflet-bar a': { backgroundColor: BRAND.surface, color: BRAND.text, borderBottomColor: BRAND.border },
        '.leaflet-control-attribution': { backgroundColor: `color-mix(in srgb, ${BRAND.surface} 80%, transparent)`, color: BRAND.textLight },
        // react-leaflet freezes MapContainer's style prop at mount, so the armed
        // crosshair is toggled via a class on the map wrapper instead.
        '.rk-radius-armed .leaflet-container': { cursor: 'crosshair' },
        // Dark tooltip for the density cells. Leaflet's default is a pale box that
        // disappeared against the light basemap and the pale hexagon fills alike.
        '.leaflet-tooltip.rk-hex-tip': {
          background: 'rgba(17,24,39,.95)', color: '#F9FAFB', border: 'none',
          borderRadius: '8px', padding: '7px 10px', fontSize: '12px', lineHeight: 1.45,
          fontWeight: 500, boxShadow: '0 6px 20px rgba(0,0,0,.35)', whiteSpace: 'nowrap',
        },
        '.leaflet-tooltip.rk-hex-tip::before': { borderTopColor: 'rgba(17,24,39,.95)' },
        // Pre-attentive cue on the worst band only.
        // The ring is an ::after CIRCLE over the pin's head, not a box-shadow on
        // the wrapper: the wrapper is a plain teardrop-sized div with no radius,
        // so a box-shadow traced its square bounding box and drew a rectangle
        // around the pin. Head diameter == wrapper width, so a square block at
        // top:0 with a 50% radius lands exactly on it.
        '@keyframes rkPinPulse': {
          '0%,100%': { boxShadow: '0 0 0 0 rgba(185,28,28,.55)' },
          '70%': { boxShadow: '0 0 0 11px rgba(185,28,28,0)' },
        },
        '.rk-pin-critical::after': {
          content: '""', position: 'absolute', left: 0, top: 0,
          width: '100%', aspectRatio: '1', borderRadius: '50%',
          pointerEvents: 'none', animation: 'rkPinPulse 2s ease-out infinite',
        },
        '@keyframes rkHexIn': { from: { opacity: 0, transform: 'scale(.86)' }, to: { opacity: 1, transform: 'scale(1)' } },
        'path.rk-hex': { transformBox: 'fill-box', transformOrigin: 'center', animation: 'rkHexIn .28s ease-out both' },
        // Reduced motion, actually honoured. This listed `.rk-pin-critical`, but the
        // animation is declared on `.rk-pin-critical::after` - so the rule matched an
        // element carrying no animation and cancelled nothing. The pins kept pulsing
        // for every user who had asked the OS for less movement. Now targets the
        // pseudo-element where the animation really lives. (The header's pulsing dot
        // is styled inline, so its own guard sits in its sx - see the header below.)
        '@media (prefers-reduced-motion: reduce)': {
          'path.rk-hex': { animation: 'none' },
          '.rk-pin-critical::after': { animation: 'none' },
          '.rk-marker > div': { transition: 'none' },
        },
      }} />

      {/* ── Slim header. The long "reported positions only" disclaimer is now an
          info tooltip rather than a paragraph of body text under the title. ──── */}
      <Box
        component="header"
        sx={{
          px: { xs: 2, md: 3 }, py: 1.5, flexShrink: 0, zIndex: 5,
          bgcolor: BRAND.surface, borderBottom: `1px solid ${BRAND.border}`,
          // lifts the control layer off the map instead of sitting flat on it
          boxShadow: '0 1px 3px rgba(16,24,40,.08), 0 4px 12px rgba(16,24,40,.05)',
          display: 'flex', alignItems: 'center', gap: { xs: 1, md: 2 }, flexWrap: 'wrap',
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          {/* Breadcrumb replaces the floating (i). A bare glyph beside a title is
              an unlabelled affordance - it reads as decoration until hovered. The
              trail states where this page sits, and the provenance caveat it used
              to hold moves onto the title itself, which is a bigger hit area and
              is what a reader would hover anyway. */}
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mb: 0.15 }}>
            <Typography
              component={RouterLink}
              to="/dashboard"
              sx={{ fontSize: 11.5, fontWeight: 600, color: BRAND.textLight, textDecoration: 'none', '&:hover': { color: BRAND.accent, textDecoration: 'underline' } }}
            >
              Monitoring
            </Typography>
            <ChevronRightRoundedIcon sx={{ fontSize: 13, color: BRAND.textLight }} aria-hidden />
            <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: BRAND.text }}>Risk map</Typography>
            {syncedLabel && (
              <Typography aria-live="polite" sx={{ fontSize: 11.5, color: BRAND.textLight, whiteSpace: 'nowrap', ml: 0.5 }}>
                · {syncedLabel}
              </Typography>
            )}
          </Stack>
          <Tooltip
            arrow
            title="Reported positions only - nothing is inferred or guessed. Feeding near rodent risk is co-occurrence worth investigating, not proof of cause. Reports filed without a location are counted in the coverage figure but never placed on the map."
          >
            <Typography
              component="h1"
              sx={{
                fontSize: { xs: 18, md: 22 }, fontWeight: 900, color: BRAND.ink,
                letterSpacing: '-0.6px', whiteSpace: 'nowrap', lineHeight: 1.15,
                cursor: 'help', display: 'inline-block',
              }}
            >
              Rodent Risk &amp; Feeding Map
            </Typography>
          </Tooltip>
        </Box>
        <Box sx={{ flexGrow: 1 }} />
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexShrink: 0 }}>
          {coBlocks.length > 0 && (
            <Button onClick={flyToCoOccur} size="small" variant="outlined" disabled={coOccurLatLngs.length === 0}
              // ON_SURFACE.danger, not BRAND.accent: this is a DATA signal, so it
              // must be the same red as the "High-risk locations" figure in the
              // dock (#B3261E). BRAND.accent (#C1272D) is brand chrome for links
              // and icons - two near-identical reds for one meaning read as sloppy.
              /* The reduced-motion guard lives in the sx rather than the GlobalStyles
                 block: this animation is applied inline, so there is no stable class
                 for a global rule to target. */
              startIcon={<Box aria-hidden sx={{
                width: 8, height: 8, borderRadius: '50%', bgcolor: ON_SURFACE.danger,
                animation: 'rkpulse 1.8s infinite',
                '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
              }} />}
              sx={{ textTransform: 'none', fontWeight: 700, whiteSpace: 'nowrap', borderColor: BRAND.border, color: ON_SURFACE.danger, '&:hover': { borderColor: ON_SURFACE.danger } }}>
              {coBlocks.length} co-occurrence{coBlocks.length === 1 ? '' : 's'}
            </Button>
          )}
          {/* Separates a FINDING from the CONTROLS. The co-occurrence button is the
              only thing in this cluster that reports something about the data rather
              than changing what is shown, and sitting flush against the window
              toggle it read as a fourth control. */}
          {coBlocks.length > 0 && (
            <Box aria-hidden sx={{ width: '1px', alignSelf: 'stretch', my: 0.25, bgcolor: BRAND.border, flexShrink: 0 }} />
          )}
          <ToggleButtonGroup value={windowDays} exclusive onChange={changeWindow} size="small" aria-label="Time window"
            sx={{
              bgcolor: BRAND.section, borderRadius: '999px', p: '3px', gap: '2px',
              '& .MuiToggleButtonGroup-grouped': {
                border: 0, marginLeft: 0, minWidth: 42, px: 1.4, py: 0.35, borderRadius: '999px !important',
                textTransform: 'none', fontSize: 12.5, fontWeight: 600, color: BRAND.text,
                '&:hover': { bgcolor: 'rgba(120,130,145,0.12)' },
                // White "slider" on a grey trough rather than a dark filled pill.
                // The solid slate fill read as a third button colour next to the
                // blue CTA and the red co-occurrence chip; a raised white chip is
                // the standard segmented-control idiom and is instantly scannable.
                '&.Mui-selected': {
                  bgcolor: BRAND.surface, color: BRAND.heading, fontWeight: 800,
                  boxShadow: '0 1px 3px rgba(16,24,40,.20)',
                  '&:hover': { bgcolor: BRAND.surface },
                },
              },
            }}>
            {WINDOW_OPTIONS.map(d => <ToggleButton key={d} value={d}>{d}d</ToggleButton>)}
          </ToggleButtonGroup>
          <IconButton onClick={refresh} disabled={state.loading} size="small" aria-label="Refresh map data" sx={{ color: BRAND.textLight, '&:hover': { color: BRAND.accent } }}>
            <RefreshRoundedIcon sx={{ fontSize: 18 }} />
          </IconButton>
          {/* primary CTA: the one action this page exists to feed */}
          <Button component={RouterLink} to="/rodent" size="small" variant="contained" startIcon={<AddRoundedIcon />}
            sx={{
              textTransform: 'none', fontWeight: 800, whiteSpace: 'nowrap', borderRadius: '8px',
              px: 2.25, py: 0.85, bgcolor: BRAND.action, color: '#fff',
              boxShadow: '0 4px 12px rgba(29,78,216,.32)',
              transition: 'background-color .15s ease, box-shadow .15s ease, transform .15s ease',
              '&:hover': { bgcolor: BRAND.actionHover, boxShadow: '0 6px 18px rgba(29,78,216,.45)', transform: 'translateY(-1px)' },
            }}>
            Log assessment
          </Button>
        </Stack>
      </Box>

      {/* ── Dense metric strip, directly under the header ─────────────────────
          These four figures used to live in a collapsible dock at the page floor,
          below the map. That put the estate's headline numbers last in the reading
          order and behind a "Show metrics" click, on a page whose whole job is to
          answer "how bad is it and where". At the dense size they cost one 58px
          row, so nothing has to be hidden to make room.

          Not sticky and not inside the map's relative container: it is a sibling
          of the header in the page's flex column, so it never overlays the canvas
          or the floating controls panel. ──────────────────────────────────────── */}
      {!state.error && (
        <Box
          component="section"
          aria-label="Estate metrics for the selected window"
          sx={{
            flexShrink: 0, zIndex: 4, px: { xs: 2, md: 3 }, py: 1.25,
            bgcolor: BRAND.section, borderBottom: `1px solid ${BRAND.border}`,
            display: 'grid', gap: 1.25, alignItems: 'stretch',
            gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
          }}
        >
          <StatCard
            dense
            loading={state.loading}
            value={totalAssessments}
            label="Rodent reports"
            trend={prev && <TrendDelta current={totalAssessments} previous={prev.totalAssessments} windowDays={windowDays} />}
          />
          <StatCard
            dense
            loading={state.loading}
            value={highRiskLocations}
            label="High-risk locations"
            accent={highRiskLocations ? ON_SURFACE.danger : BRAND.ink}
            alert={highRiskLocations > 0}
            // pressing it filters the map to exactly these locations, and
            // inverts so the filtered state is never a silent one
            active={highRiskOnly}
            onToggle={highRiskLocations > 0 ? () => setHighRiskOnly(v => !v) : null}
            /* Gated on the prior window having MAPPED reports, not merely any
               reports. "High-risk locations" is derived from coordinates, so a
               window where nothing carried a location scores 0 - and comparing
               against that would read a coverage gap as a fall in risk. */
            trend={prev?.mappedCount > 0
              ? <TrendDelta current={highRiskLocations} previous={prev.highRiskLocations} windowDays={windowDays} />
              : null}
          />
          <StatCard
            dense
            loading={state.loading}
            value={feeding.total}
            label="Feeding sightings"
            trend={prev && <TrendDelta current={feeding.total} previous={prev.feedingTotal} windowDays={windowDays} />}
          />
          {/* The coverage caveat stays a first-class metric, not a footnote: at a
              glance it says how much of the estate the map is actually able to
              show. When it is poor the card carries the amber ink, the tooltip and
              a route to fix it - all three, never colour alone. */}
          <StatCard
            dense
            loading={state.loading}
            value={`${locatedPct}%`}
            label={`Located · ${totalMapped}/${totalReports}`}
            accent={poorCoverage ? COVERAGE_INK : BRAND.ink}
            hint={poorCoverage ? (
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                <Tooltip title={`Only ${locatedPct}% of reports in this window include a location, so the map may under-represent activity.`}>
                  <InfoOutlinedIcon sx={{ fontSize: 15, color: COVERAGE_INK, cursor: 'help' }} />
                </Tooltip>
                {/* The route to FIX the gap, not just a notice of it. Carries its
                    word at md+ where the column is wide enough; below that the
                    text drops but the icon keeps the aria-label and the tooltip,
                    so it is never an unlabelled affordance. */}
                <Tooltip title="Log positions for the reports that are missing them">
                  <Button
                    component={RouterLink}
                    to="/rodent"
                    size="small"
                    aria-label="Add locations to reports missing them"
                    startIcon={<AddLocationAltOutlinedIcon sx={{ fontSize: 15 }} />}
                    sx={{
                      minWidth: 0, px: 0.6, py: 0.1, textTransform: 'none',
                      fontSize: 11, fontWeight: 700, color: COVERAGE_INK, whiteSpace: 'nowrap',
                      '& .MuiButton-startIcon': { mr: { xs: 0, md: 0.4 }, ml: 0 },
                    }}
                  >
                    <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>Add</Box>
                  </Button>
                </Tooltip>
              </Stack>
            ) : null}
          />
        </Box>
      )}

      {/* PERSISTENT DISCLOSURE RIBBON.
          Moved off the map canvas (where it floated over the data) into a
          full-width ribbon under the header. Still unconditional whenever the
          simulated layer is visible, and now harder to miss rather than easier -
          it is not inside any collapsible panel. MUST survive any restyling. */}
      {showSensors && (
        <Box
          role="status"
          sx={{
            flexShrink: 0, zIndex: 4, px: { xs: 2, md: 3 }, py: 1,
            bgcolor: BRAND.navySoft, borderBottom: `1px solid ${BRAND.border}`,
            display: 'flex', alignItems: 'center', gap: 1.25,
          }}
        >
          <Box aria-hidden sx={{ display: 'flex', borderRadius: '3px', overflow: 'hidden', flexShrink: 0 }}>
            {SENSOR_RAMP[resolvedMode].map(c => (
              <Box key={c} sx={{ width: 6, height: 12, bgcolor: c }} />
            ))}
          </Box>
          <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: BRAND.heading, lineHeight: 1.4 }}>
            {SIMULATED_LABEL}
            <Box component="span" sx={{ fontWeight: 500, color: BRAND.text }}>
              {sensorSurface.data
                ? ` · ${sensorSurface.data.sensorCount} sensors, as of ${new Date(sensorSurface.data.asOf).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                : sensorSurface.loading ? ' · loading…' : ''}
            </Box>
          </Typography>
        </Box>
      )}

      {/* ── Map ecosystem: canvas + floating controls panel ──────────────────
          `position: relative` is load-bearing. The panel is absolutely positioned
          from lg up, so it needs a containing block that spans EXACTLY the map
          region - without it the panel resolved against a page-level ancestor and
          spilled over the header CTA above and the metric cards below. Anchoring
          it here also makes its `calc(100% - 32px)` height cap mean "the map area",
          which is the only height it should ever occupy. ───────────────────── */}
      <Box sx={{ position: 'relative', display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, flexGrow: 1, minHeight: 0 }}>
      <Box className={radiusArmed ? 'rk-radius-armed' : undefined} sx={{ position: 'relative', flexGrow: 1, minWidth: 0, minHeight: { xs: 400, lg: 0 } }}>
        {/* FIRST load only. This was plain `state.loading`, which swapped the whole
            MapContainer for a Skeleton on every refetch - unmounting Leaflet and
            destroying the officer's zoom, centre and any open popup. A window
            change or a Refresh now keeps the map mounted and veils it instead
            (see the overlay just inside the map branch). `updatedAt` is only set
            after a successful load, so the very first render still gets a
            skeleton rather than an empty grey canvas. */}
        {state.loading && !updatedAt ? (
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
              // 1.0, not 0.85: a soft edge let the canvas be dragged past Singapore
              // and rubber-band back, which still showed another country mid-drag.
              maxBoundsViscosity={1.0}
              // Starting floor only. LockToSingapore replaces it with a value derived
              // from the container, since the correct floor depends on viewport size.
              minZoom={SG_MIN_ZOOM}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer key={basemap} attribution={TILE_ATTR} url={BASEMAPS[basemap].url} subdomains="abcd" maxZoom={20}
                eventHandlers={{ tileerror: () => setTileError(true) }} />
              <ZoomControl position="bottomright" />
              <LockToSingapore bounds={SG_MAX_BOUNDS} />
              <FitToData latlngs={dataLatLngs} fitSignal={fitSignal} />
              <FlyTo latlngs={coOccurLatLngs} signal={flySignal} />
              <RadiusPicker armed={radiusArmed} onPick={c => { setRadiusCentre(c); setRadiusArmed(false); }} />
              <FocusPoint focus={focus} markerRefs={markerRefs} />
              <Polygon positions={ESTATE_BOUNDARY}
                pathOptions={{ color: boundaryInk, weight: 1, opacity: 0.35, dashArray: '3 7', fill: true, fillColor: boundaryInk, fillOpacity: 0.03 }} />

              {/* The map's only region naming. Non-interactive, so it never steals a
                  click from a pin or a hexagon beneath it. */}
              {showCouncilLabels && (
                <TownCouncilLabels mode={resolvedMode} showRegions={showCouncilRegions} />
              )}

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
                  {showRodent && <DensityLayer points={shownRodent} mode={resolvedMode} />}
                  {/* feeding bins onto the SAME hex grid, so a rodent cell and a
                      feeding cell are directly comparable rather than one being
                      discs and the other polygons */}
                  {showFeeding && <DensityLayer points={feedingPoints} monoColor={FEEDING_INK} mode={resolvedMode} />}
                </>
              ) : (
                <>
                  {showRodent && <PointClusterLayer points={shownRodent} kind="rodent" dimNonCoOccur={showCoOccur} onCreateWorkOrder={setWoBlock} onDraftBriefing={openBriefing} markerRefs={markerRefs} onOpenVenue={setVenueBlock} />}
                  {showFeeding && <PointClusterLayer points={feedingPoints} kind="feeding" dimNonCoOccur={showCoOccur} />}
                </>
              )}
            </MapContainer>

            {/* Refetch indicator for a map that stays mounted. The skeleton above
                only covers the first load, so this is what a window change or a
                Refresh looks like now: the officer keeps their view, the stale
                data is visibly marked as being replaced, and pointer events pass
                through so panning still works while it lands. */}
            {state.loading && (
              <>
                <Box
                  aria-hidden
                  sx={{
                    position: 'absolute', inset: 0, zIndex: 1001, pointerEvents: 'none',
                    bgcolor: resolvedMode === 'dark' ? 'rgba(17,24,39,.28)' : 'rgba(255,255,255,.38)',
                    transition: 'opacity .15s',
                  }}
                />
                <LinearProgress
                  sx={{
                    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1002, height: 2,
                    bgcolor: 'transparent',
                    '& .MuiLinearProgress-bar': { bgcolor: ON_SURFACE.info },
                  }}
                />
              </>
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
              // DOCKED, not floating. A panel hovering over the canvas covered the
              // pins underneath it - and on this map the top-right corner is water
              // and estate alike, so what it hid was unpredictable. Docked, the map
              // takes the remaining width and nothing is ever obscured.
              <Box
                component="aside"
                aria-label="Map controls"
                sx={{
                  bgcolor: BRAND.surface,
                  overflowY: 'auto',
                  width: { xs: '100%', lg: 320 },
                  flexShrink: 0,
                  maxHeight: { xs: 320, lg: 'none' },
                  borderTop: { xs: `1px solid ${BRAND.border}`, lg: 'none' },
                  borderLeft: { lg: `1px solid ${BRAND.border}` },
                }}
              >
                <Box sx={{ position: 'sticky', top: 0, bgcolor: BRAND.surface, zIndex: 1, borderBottom: `1px solid ${BRAND.border}` }}>
                  <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', px: 3, pt: 2, pb: 1 }}>
                    <Typography sx={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.7px', color: BRAND.textLight }}>Map controls</Typography>
                    <IconButton size="small" onClick={() => setToolbarOpen(false)} aria-label="Collapse map controls" sx={{ p: 0.25, color: BRAND.textLight }}>
                      <CloseRoundedIcon sx={{ fontSize: 17 }} />
                    </IconButton>
                  </Stack>
                </Box>

                {/* ACCORDIONS, not tabs. Tabs showed one section at a time and hid
                    the other two behind a click - an officer checking which layers
                    are on while reading the legend had to keep switching. Sections
                    open independently, and a 24px gutter keeps them aligned. */}
                <Box sx={{ p: 3, pt: 2 }}>
                {/* ── ACTION REQUIRED ───────────────────────────────────────
                    Spatial hunting is slow: finding the worst block means
                    clicking around a map of an island. This is the same data as
                    a worklist, ranked and one click from the popup.

                    RANKED BY THE BACKEND'S OWN SCORE. `weightedScore` comes from
                    computeRiskMap using its documented weights (low 1, medium 3,
                    high 6, critical 10). No severity ordering is invented here -
                    if the weights change server-side, this list re-orders with
                    them. Ties fall back to report count, then block name, so the
                    order is stable between renders rather than shuffling. */}
                <PanelSection title={`Action required${actionList.length ? ` · ${actionList.length}` : ''}`} open={openSections.action} onToggle={() => toggleSection('action')}>
                  {actionList.length === 0 ? (
                    <Typography sx={{ fontSize: 12.5, color: BRAND.textLight, py: 1 }}>
                      No high or critical locations in this window.
                    </Typography>
                  ) : (
                    <Stack spacing={0.5}>
                      {actionList.map(p => {
                        const sv = SEVERITY[bandOf(p)];
                        return (
                          <Stack
                            key={`${p.lat},${p.lng}`}
                            direction="row"
                            spacing={1}
                            sx={{
                              alignItems: 'center', px: 1, py: 0.85, borderRadius: '8px',
                              borderLeft: `3px solid ${sv.solid}`, bgcolor: BRAND.section,
                              '&:hover': { bgcolor: BRAND.navySoft },
                            }}
                          >
                            <Box
                              component="button"
                              type="button"
                              onClick={() => focusLocation(p)}
                              sx={{
                                flexGrow: 1, minWidth: 0, textAlign: 'left', font: 'inherit',
                                border: 0, background: 'none', cursor: 'pointer', p: 0,
                                '&:focus-visible': { outline: `2px solid ${BRAND.action}`, outlineOffset: 2 },
                              }}
                            >
                              <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.heading, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {p.block || 'Unlabelled block'}
                              </Typography>
                              {/* Recency, display only. Nothing on this map encoded
                                  time, so four critical reports from three months
                                  ago ranked and read exactly like four from
                                  yesterday. p.assessments is already sorted
                                  latest-first by the service, so [0] is the most
                                  recent - no client-side sorting needed.

                                  Deliberately NOT folded into the ordering: the
                                  comment above this list delegates ranking to the
                                  backend's weightedScore, and re-sorting here would
                                  invent a second, competing rule. */}
                              <Typography sx={{ fontSize: 11.5, color: BRAND.textLight }}>
                                {p.count} report{p.count === 1 ? '' : 's'} · score {p.weightedScore ?? '-'}
                                {p.assessments?.[0]?.createdAt
                                  ? ` · latest ${relTimeLabel(new Date(p.assessments[0].createdAt), nowMs)}`
                                  : ''}
                              </Typography>
                            </Box>
                            {/* the same high/critical gate the popup uses */}
                            {warrantsBriefing(p.assessments) && (
                              <Tooltip arrow title={`Draft a contractor briefing for ${p.block || 'this block'}`}>
                                <IconButton
                                  size="small"
                                  aria-label={`Draft vendor briefing for ${p.block || 'this block'}`}
                                  onClick={() => openBriefing(p.assessments.map(a => a.id), p.block)}
                                  sx={{ flexShrink: 0, color: ON_SURFACE.info, '&:hover': { bgcolor: BRAND.surface } }}
                                >
                                  <AutoAwesomeOutlinedIcon sx={{ fontSize: 17 }} />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Stack>
                        );
                      })}
                    </Stack>
                  )}
                </PanelSection>

                <PanelSection title="Layers" open={openSections.layers} onToggle={() => toggleSection('layers')}>
                  <Typography sx={SECTION_LABEL}>View</Typography>
                  <ToggleButtonGroup value={viewMode} exclusive size="small" fullWidth onChange={(_e, v) => v && setViewMode(v)} sx={{ mb: 1.5 }}>
                    <ToggleButton value="pins" sx={{ textTransform: 'none', fontSize: 12.5, py: 0.4 }}>Pins</ToggleButton>
                    <ToggleButton value="density" sx={{ textTransform: 'none', fontSize: 12.5, py: 0.4 }}>Density</ToggleButton>
                  </ToggleButtonGroup>

                  {/* Switch rows, not pills. A pill that is "off" and a pill that
                      is "disabled because there is no data" looked nearly the same;
                      a switch has an unambiguous on/off position, and the count sits
                      on its own so an empty layer reads as empty rather than broken. */}
                  <Typography sx={SECTION_LABEL}>Layers</Typography>
                  <Stack spacing={0.25} sx={{ mb: 1.5 }}>
                    <LayerSwitch checked={showRodent} disabled={rodentPoints.length === 0} onChange={() => setShowRodent(v => !v)} swatch={<RodentSwatch />} label="Rodent" count={rodentPoints.length} />
                    <LayerSwitch checked={showFeeding} disabled={feedingPoints.length === 0} onChange={() => setShowFeeding(v => !v)} swatch={<FeedingSwatch />} label="Feeding" count={feedingPoints.length} />
                    <LayerSwitch checked={showCoOccur} disabled={coBlocks.length === 0} onChange={() => setShowCoOccur(v => !v)} swatch={<CoOccurSwatch />} label="Co-occur" count={coBlocks.length} />
                  </Stack>

                  {/* WHICH blocks co-occur, not just how many. The API has always
                      sent the names (coOccurrenceBlocks) and only the count was
                      rendered, so the officer had to switch the layer on and hunt
                      the map to find out where feeding and rodent activity actually
                      overlap - which is the single most actionable thing this map
                      knows. Naming them here makes it readable without a click. */}
                  {coBlocks.length > 0 && (
                    <Typography sx={{ fontSize: 11.5, color: BRAND.textLight, lineHeight: 1.6, mb: 1.5, mt: -0.75 }}>
                      Feeding and rodent activity overlap at{' '}
                      <Box component="span" sx={{ color: BRAND.text, fontWeight: 600 }}>
                        {coBlocks.join(', ')}
                      </Box>
                      .
                    </Typography>
                  )}

                  {/* LAYER B toggle. The label states what the layer IS, not just
                      its name - a reader must not have to hunt for the caveat. */}
                  <Typography sx={SECTION_LABEL}>Sensor pilot</Typography>
                  <Tooltip arrow title={SIMULATED_LABEL}>
                    <span>
                      <LayerSwitch
                        checked={showSensors}
                        onChange={() => setShowSensors(v => !v)}
                        swatch={<Box aria-hidden sx={{ width: 12, height: 12, borderRadius: '3px', background: `linear-gradient(135deg, ${SENSOR_RAMP[resolvedMode][1]}, ${SENSOR_RAMP[resolvedMode][SENSOR_RAMP[resolvedMode].length - 1]})` }} />}
                        label="Simulated sensors"
                        count={sensorSurface.data ? sensorSurface.data.sensorCount : null}
                      />
                    </span>
                  </Tooltip>
                  <Typography sx={{ fontSize: 11, color: BRAND.textLight, lineHeight: 1.5, mt: 0.5 }}>
                    {SIMULATED_LABEL}
                  </Typography>

                  {/* Region naming. The basemap carries no place names, so these are
                      the map's only labels - hence naming what they ARE (councils,
                      approximate) rather than just switching a nameless layer. */}
                  <Typography sx={{ ...SECTION_LABEL, mt: 1.5 }}>Region labels</Typography>
                  <Stack spacing={0.25}>
                    <LayerSwitch
                      checked={showCouncilLabels}
                      onChange={() => setShowCouncilLabels(v => !v)}
                      swatch={<Box aria-hidden sx={{ width: 12, height: 12, borderRadius: '3px', border: `1px solid ${BRAND.border}`, bgcolor: BRAND.section }} />}
                      label="Town council names"
                    />
                    <LayerSwitch
                      checked={showCouncilRegions}
                      disabled={!showCouncilLabels}
                      onChange={() => setShowCouncilRegions(v => !v)}
                      swatch={<Box aria-hidden sx={{ width: 12, height: 12, borderRadius: '50%', border: `1px dashed ${BRAND.slate}` }} />}
                      label="Council regions"
                    />
                  </Stack>
                  <Typography sx={{ fontSize: 11, color: BRAND.textLight, lineHeight: 1.5, mt: 0.5 }}>
                    Council regions are approximate circles around town centres, not
                    official boundaries. Names appear from zoom 12 in.
                  </Typography>
                </PanelSection>

                <PanelSection title="Filters" open={openSections.filters} onToggle={() => toggleSection('filters')}>
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
                        <Box sx={{ pl: 1.25, borderLeft: `2px solid ${BRAND.action}` }}>
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
                </PanelSection>

                {/* Legend is its own section now, open alongside the others. */}
                <PanelSection title="Legend" open={openSections.legend} onToggle={() => toggleSection('legend')}>
                    <Box>
                      <Typography component="h2" sx={SECTION_LABEL}>Rodent severity (peak)</Typography>
                      <Stack spacing={0.5} sx={{ mb: 1 }}>
                        {BAND_ORDER.map(b => (
                          <Stack key={b} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                            <BandMark band={b} />
                            <Typography sx={{ fontSize: 12, color: BRAND.text }}>{BAND_LABEL[b]}</Typography>
                          </Stack>
                        ))}
                      </Stack>
                      {/* The sentence is scoped to Pins view, because in Density
                          view hexagon colour is volume, not severity - leaving it
                          unconditional would have told the officer to read the
                          shading as severity when it no longer encodes it. */}
                      <Typography sx={{ fontSize: 11.5, color: BRAND.text, lineHeight: 1.6 }}>
                        {viewMode === 'density'
                          ? 'Pin colour = severity · ! marks critical. Severity bands above apply to pins and popups.'
                          : 'Colour = severity · bigger pin = more reports · ! marks critical.'}
                      </Typography>

                      {/* THE SCORE KEY. "score 34" appears on every Action required
                          row and "Weighted score" in every rodent popup, but the
                          scale behind the number was never shown, so the figure was
                          unreadable - is 34 bad? The API has always returned these
                          weights for exactly this purpose (see the comment on
                          RISK_WEIGHTS in backend/src/services/rodentRiskMap.js) and
                          nothing rendered them. Read from the response, never
                          hardcoded, so the key cannot drift from the maths. */}
                      {state.weights && (
                        <Typography sx={{ fontSize: 11.5, color: BRAND.textLight, lineHeight: 1.6, mt: 0.75 }}>
                          Score = sum of report weights:{' '}
                          {BAND_ORDER.filter(b => state.weights[b] != null)
                            .map(b => `${BAND_LABEL[b].toLowerCase()} ${state.weights[b]}`)
                            .join(' · ')}
                        </Typography>
                      )}

                      {viewMode === 'density' && (
                        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: `1px solid ${BRAND.border}` }}>
                          <Typography component="h2" sx={{ ...SECTION_LABEL, mb: 0.75 }}>Cell density (reports)</Typography>
                          <Box aria-hidden sx={{ display: 'flex', borderRadius: '3px', overflow: 'hidden', height: 12 }}>
                            {DENSITY_RAMP[resolvedMode].map(c => (
                              <Box key={c} sx={{ flex: 1, bgcolor: c }} />
                            ))}
                          </Box>
                          {/* Every step labelled with its real count. Five steps fit
                              at this width, and an unlabelled ramp would make the
                              hue an opinion rather than a reading. */}
                          <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 0.25 }}>
                            {DENSITY_STEP_LABELS.map(l => (
                              <Typography key={l} sx={{ fontSize: 9.5, color: BRAND.textLight, fontVariantNumeric: 'tabular-nums' }}>{l}</Typography>
                            ))}
                          </Stack>
                          <Typography sx={{ fontSize: 11.5, color: BRAND.text, lineHeight: 1.6, mt: 0.5 }}>
                            Shading is report VOLUME per cell, not severity - steps are fixed
                            counts, so a cell only changes colour when its own count does.
                            {showFeeding && ' Feeding cells bin in one flat teal.'}
                          </Typography>
                        </Box>
                      )}
                      {showSensors && (
                        // No fill and no card border: nested grey-on-grey panels
                        // flattened the drawer. A rule plus the label carries the
                        // grouping and lets the colour ramp read against the
                        // surface instead of a mid-tone.
                        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: `1px solid ${BRAND.border}` }}>
                          <Typography component="h2" sx={{ ...SECTION_LABEL, mb: 0.75 }}>Sensor activity</Typography>
                          {/* Stops are labelled with their real values, taken from
                              the SAME threshold helper the contour bands use, so
                              the legend cannot drift from what is drawn. */}
                          {/* 12 bands, so the strip is continuous and only the
                              ends and middle carry a number - labelling all 12
                              would be unreadable at this width */}
                          <Box aria-hidden sx={{ display: 'flex', borderRadius: '3px', overflow: 'hidden', height: 12 }}>
                            {SENSOR_RAMP[resolvedMode].map(c => (
                              <Box key={c} sx={{ flex: 1, bgcolor: c }} />
                            ))}
                          </Box>
                          <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 0.25 }}>
                            {[0, Math.floor(sensorBands.length / 2), sensorBands.length - 1].map((i, k) => (
                              <Typography key={k} sx={{ fontSize: 9.5, color: BRAND.textLight, fontVariantNumeric: 'tabular-nums' }}>
                                {sensorBands[i] != null ? Math.round(sensorBands[i] * 10) / 10 : '-'}
                              </Typography>
                            ))}
                          </Stack>
                          <Typography sx={{ fontSize: 11, color: BRAND.text, mb: 0.5 }}>
                            activity index · peak {sensorSurface.data?.scaleMax ?? '-'}
                          </Typography>
                          {/* legend states it too - required, not optional */}
                          <Typography sx={{ fontSize: 11, color: BRAND.text, lineHeight: 1.5 }}>
                            {SIMULATED_LABEL}. Interpolated between sensors, and faded
                            by distance from one. Unshaded ground has no sensor and
                            therefore no data - not a zero reading. Reported cases
                            above are never interpolated.
                          </Typography>
                        </Box>
                      )}
                      {viewMode === 'density' && (
                        <Typography sx={{ fontSize: 11.5, color: BRAND.textLight, lineHeight: 1.6, mt: 0.5 }}>
                          Reports are binned into fixed hexagonal cells - this is a count per
                          cell, not a smoothed kernel estimate.
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
                </PanelSection>
                </Box>
              </Box>
            ) : (
              // collapsed rail, docked on the same edge the panel occupies
              <Box sx={{
                bgcolor: BRAND.surface, display: 'flex', justifyContent: 'center',
                alignItems: { xs: 'center', lg: 'flex-start' }, py: 1,
                width: { xs: '100%', lg: 44 }, flexShrink: 0,
                borderTop: { xs: `1px solid ${BRAND.border}`, lg: 'none' },
                borderLeft: { lg: `1px solid ${BRAND.border}` },
              }}>
                <Tooltip title="Map controls" placement="left">
                  <IconButton onClick={() => setToolbarOpen(true)} aria-label="Open map controls" sx={railBtn}>
                    <TuneRoundedIcon sx={{ fontSize: 19 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            ))}
      </Box>

      {/* ── Bottom dock: the temporal scrubber, one row tall ──────────────────
          The four metric figures used to share this dock. They now sit in the
          dense strip under the header, which leaves the dock doing exactly one
          job: playing the window back over time. A playback transport belongs on
          the same edge as a video scrubber, and it is the only thing down here
          that the officer drags rather than reads. ─────────────────────────── */}
      {/* Gated on there being more than one day to scrub. The dock's only content
          is the transport now, so with a single day it would be an empty sheet
          under a "Show timeline" button that reveals nothing. */}
      {!state.error && days.length > 1 && (
        // The sheet keeps the page field rather than a white fill, so the dock
        // reads as a distinct surface from the map canvas above it.
        <Box sx={{ flexShrink: 0, borderTop: `1px solid ${BRAND.border}`, bgcolor: BRAND.section }}>
          <Collapse in={dockOpen}>
            <Box sx={{ px: { xs: 2, md: 3 }, py: 1.5 }}>
                <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                  <Tooltip title={playing ? 'Pause playback' : 'Play activity over time'}>
                    <IconButton size="small" onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Pause' : 'Play'} sx={railBtn}>
                      {playing ? <PauseRoundedIcon sx={{ fontSize: 20 }} /> : <PlayArrowRoundedIcon sx={{ fontSize: 20 }} />}
                    </IconButton>
                  </Tooltip>
                  {/* the scrubber is a data surface, not just a control: the
                      histogram behind it shows where activity actually spiked */}
                  <Box sx={{ flexGrow: 1, minWidth: 140, position: 'relative', height: 46, display: 'flex', alignItems: 'flex-end' }}>
                    <ScrubberHistogram days={days} counts={dayCounts} cutoffIdx={dayIdx == null ? days.length - 1 : dayIdx} hoverIdx={hoverDay} onHover={setHoverDay} />
                    <Slider
                      size="small"
                      min={0}
                      max={days.length - 1}
                      value={dayIdx == null ? days.length - 1 : dayIdx}
                      onChange={(_e, v) => { setPlaying(false); setDayIdx(v); }}
                      aria-label="Activity up to day"
                      valueLabelDisplay="auto"
                      valueLabelFormat={i => `${fmtDay(days[i])} · ${dayCounts[i]} report${dayCounts[i] === 1 ? '' : 's'}`}
                      // Thin track, prominent thumb. The default MUI rail read as a
                      // second red bar competing with the histogram behind it.
                      sx={{
                        position: 'relative', zIndex: 1, py: 0, mb: '3px',
                        '& .MuiSlider-rail': { height: 3, opacity: 0.32, bgcolor: BRAND.textLight },
                        '& .MuiSlider-track': { height: 3, border: 'none', bgcolor: ON_SURFACE.danger },
                        '& .MuiSlider-thumb': {
                          width: 15, height: 15, bgcolor: BRAND.surface,
                          border: `3px solid ${ON_SURFACE.danger}`,
                          boxShadow: '0 1px 4px rgba(16,24,40,.35)',
                          '&:hover, &.Mui-focusVisible': { boxShadow: `0 0 0 6px ${'color-mix(in srgb, currentColor 18%, transparent)'}` },
                        },
                      }}
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
            </Box>
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
            <Typography sx={{ fontSize: 11, fontWeight: 700 }}>{dockOpen ? 'Hide timeline' : 'Show timeline'}</Typography>
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

      <VenueDetailDrawer
        key={venueBlock || 'none'}
        block={venueBlock}
        open={Boolean(venueBlock)}
        onClose={() => setVenueBlock(null)}
      />

      <VendorBriefingDialog
        open={Boolean(briefing)}
        assessmentIds={briefing?.ids || []}
        block={briefing?.block || null}
        canRaise={canRaiseWorkOrder}
        onClose={() => setBriefing(null)}
        onRaiseWorkOrder={(_ids, block) => { setBriefing(null); setWoBlock(block); }}
      />

      <CreateWorkOrderDialog key={woBlock || 'wo'} block={woBlock} open={Boolean(woBlock)} onClose={() => setWoBlock(null)} onResult={setToast} />
      <Snackbar open={Boolean(toast)} autoHideDuration={5000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast?.ok ? 'success' : 'error'} variant="filled" onClose={() => setToast(null)} sx={{ width: '100%' }}>
          {toast?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
