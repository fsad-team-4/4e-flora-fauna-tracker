import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polygon, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Card, CardContent, Box, Stack, Typography, Skeleton, Button, IconButton, Divider, Collapse, ToggleButton, ToggleButtonGroup, Paper, Tooltip, GlobalStyles, Dialog, DialogTitle, DialogContent, DialogActions, TextField, FormControlLabel, Checkbox, CircularProgress, Alert, Snackbar } from '@mui/material';
import CenterFocusStrongOutlinedIcon from '@mui/icons-material/CenterFocusStrongOutlined';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import 'leaflet/dist/leaflet.css';
import { BRAND, CHART, CATEGORY_COLORS } from '../../theme';
import http from '../../http';

const RAMP = CHART.ramp;                          // sequential blue = rodent severity (NOT semantic status colour)
const FEEDING_INK = CATEGORY_COLORS.flora_health; // teal - a hue nowhere on the ramp
const RODENT_STROKE = '#37474F';
const BAND_ORDER = ['low', 'medium', 'high', 'critical'];
const BAND_LABEL = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };
// Peak band -> ramp colour. Deliberately the blue ramp, never red/amber/green:
// those are reserved for status in this codebase, so severity must not borrow them.
const BAND_COLOR = { low: RAMP[1], medium: RAMP[2], high: RAMP[3], critical: RAMP[4] };
const SPECIES_LABEL = { cat: 'Cat', pigeon: 'Pigeon', crow: 'Crow', mynah: 'Mynah', other: 'Other' };
const SG_CENTER = [1.3690, 103.8456];
const CLUSTER_PX = 44;
const WINDOW_OPTIONS = [7, 30, 90]; // segmented control; "custom" range is a deferred date-picker

const ESTATE_BOUNDARY = [
  [1.37080, 103.84470], [1.37080, 103.84720], [1.36960, 103.84760],
  [1.36740, 103.84700], [1.36730, 103.84500], [1.36840, 103.84440],
];

// VOCABULARY (enforced): "locations" = distinct plotted points; "reports" =
// individual assessments/sightings; "blocks" = estate blocks.
const srOnly = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };
const SECTION_LABEL = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: BRAND.textLight, mb: 0.75, display: 'block' };

const rodentDiameter = count => 22 + Math.min(20, (count - 1) * 5); // size = report count
const clusterSize = k => 30 + Math.min(16, (k - 1) * 3);
const bandOf = p => (BAND_ORDER.includes(p.riskLevel) ? p.riskLevel : 'high');

function fmtDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
}
function speciesSummary(species) {
  return Object.entries(species || {}).map(([k, v]) => `${v} ${SPECIES_LABEL[k] || k}`).join(' · ');
}

function makeIcon(html, size, coOccurs = false) {
  // rk-coocc adds the pulse ring (CSS) to markers at co-occurrence blocks.
  return L.divIcon({ className: `rk-marker${coOccurs ? ' rk-coocc' : ''}`, html, iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2] });
}
// Peak band drives BOTH colour and fill-pattern, so severity is legible without
// relying on hue alone (outline = low, half = medium, solid = high, solid+dot =
// critical). Size still encodes report count.
function rodentPattern(band, color) {
  if (band === 'low') return { background: '#fff', inner: '' };
  if (band === 'medium') return { background: `linear-gradient(to top, ${color} 0 50%, #fff 50% 100%)`, inner: '' };
  if (band === 'critical') return { background: color, inner: '<div style="width:34%;height:34%;border-radius:50%;background:#fff;"></div>' };
  return { background: color, inner: '' }; // high
}
function rodentIcon(p) {
  const s = rodentDiameter(p.count);
  const band = bandOf(p);
  const color = BAND_COLOR[band];
  const pat = rodentPattern(band, color);
  const html = `<div style="width:${s}px;height:${s}px;display:grid;place-items:center;border-radius:50%;box-sizing:border-box;background:${pat.background};border:2.5px solid ${color};box-shadow:0 0 0 1.5px #fff,0 1px 3px rgba(16,24,40,.35);">${pat.inner}</div>`;
  return makeIcon(html, s, p.coOccurs);
}
function feedingIcon(coOccurs = false) {
  const s = 24;
  const html = `<div style="width:${s}px;height:${s}px;border-radius:50%;box-sizing:border-box;background:rgba(14,138,138,0.14);border:3px solid ${FEEDING_INK};box-shadow:0 0 0 1.5px #fff;"></div>`;
  return makeIcon(html, s, coOccurs);
}
function clusterIcon(kind, k, coOccurs = false) {
  const feeding = kind === 'feeding';
  const s = clusterSize(k);
  const col = feeding ? FEEDING_INK : RAMP[4];
  const bg = feeding ? 'rgba(14,138,138,0.16)' : 'rgba(37,106,191,0.16)';
  const fs = Math.round(Math.max(12, Math.min(15, s * 0.42)));
  const html = `<div style="width:${s}px;height:${s}px;display:grid;place-items:center;border-radius:30%;box-sizing:border-box;font:700 ${fs}px/1 Inter,Helvetica,Arial,sans-serif;background:${bg};border:2px solid ${col};color:${col};box-shadow:0 1px 4px rgba(16,24,40,.20);">${k}</div>`;
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

// A severity chip keyed to the band ramp (never red/amber/green). Top two steps
// carry light text; lower steps carry dark text - both clear WCAG AA here.
function SeverityChip({ band }) {
  const color = BAND_COLOR[band] || RAMP[3];
  const onDark = band === 'high' || band === 'critical';
  return (
    <Box component="span" sx={{ fontSize: 11, fontWeight: 600, px: 0.8, py: '2px', borderRadius: '6px', bgcolor: color, color: onDark ? '#fff' : BRAND.heading, whiteSpace: 'nowrap' }}>
      {BAND_LABEL[band] || band}
    </Box>
  );
}

function RodentPointBody({ p, onCreateWorkOrder }) {
  return (
    <Box sx={{ minWidth: 210 }}>
      <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: BRAND.heading, lineHeight: 1.5 }}>
        {p.block || 'Unlabelled block'} · {p.count} report{p.count === 1 ? '' : 's'}
      </Typography>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 1 }}>
        <SeverityChip band={bandOf(p)} />
        <Typography sx={{ fontSize: 12, color: BRAND.textLight, lineHeight: 1.6 }}>peak severity · weighted {p.weightedScore}</Typography>
      </Stack>
      <Stack spacing={1}>
        {p.assessments.map(a => (
          <Box key={a.id} sx={{ borderTop: `1px solid ${BRAND.border}`, pt: 0.6 }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 0.25 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{fmtDate(a.createdAt)}</Typography>
              <SeverityChip band={bandOf({ riskLevel: a.risk_level })} />
              {a.floor_level && <Typography sx={{ fontSize: 11.5, color: BRAND.textLight }}>{a.floor_level}</Typography>}
            </Stack>
            <Typography sx={{ fontSize: 12, color: BRAND.text, lineHeight: 1.6 }}>{a.observations}</Typography>
          </Box>
        ))}
      </Stack>
      {onCreateWorkOrder && p.block && (
        <Button size="small" variant="outlined" fullWidth onClick={() => onCreateWorkOrder(p.block)}
          sx={{ mt: 1.25, textTransform: 'none', borderColor: BRAND.border, color: BRAND.slate, '&:hover': { borderColor: BRAND.slate } }}>
          Create work order
        </Button>
      )}
    </Box>
  );
}

// Raise a work order for a block, straight from the map. Reuses the Action Queue's
// endpoints: it loads the block's PENDING escalations, shows them for the officer
// to confirm, and only raises on approval - the human gate the brief requires is
// preserved, nothing is auto-dispatched.
function CreateWorkOrderDialog({ block, open, onClose, onResult }) {
  const [state, setState] = useState({ loading: true, error: false, cluster: null });
  const [notes, setNotes] = useState('');
  const [agency, setAgency] = useState('Pest Control Contractor');
  const [dispatch, setDispatch] = useState(true);
  const [busy, setBusy] = useState(false);

  // The parent remounts this dialog per block (via key), so state starts fresh and
  // the effect only fetches - no synchronous setState in the effect body.
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
              {cluster.call_outs_avoided > 0 && <> — avoiding <b>{cluster.call_outs_avoided}</b> extra visit{cluster.call_outs_avoided === 1 ? '' : 's'} (S${(cluster.est_savings || 0).toLocaleString('en-SG')}).</>}
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
  return (
    <Box sx={{ minWidth: 210 }}>
      <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: BRAND.heading, lineHeight: 1.5 }}>
        {p.block || 'Unlabelled block'} · {p.count} feeding sighting{p.count === 1 ? '' : 's'}
      </Typography>
      <Typography sx={{ fontSize: 12, color: BRAND.textLight, mb: 1, lineHeight: 1.6 }}>{speciesSummary(p.species)}</Typography>
      <Stack spacing={1}>
        {p.sightings.map(sg => (
          <Box key={sg.id} sx={{ borderTop: `1px solid ${BRAND.border}`, pt: 0.6 }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 0.25 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{fmtDate(sg.createdAt)}</Typography>
              {sg.species && <Box component="span" sx={{ fontSize: 11, fontWeight: 600, px: 0.8, py: '2px', borderRadius: '6px', bgcolor: 'rgba(14,138,138,0.14)', color: FEEDING_INK }}>{SPECIES_LABEL[sg.species] || sg.species}</Box>}
              {sg.floor_level && <Typography sx={{ fontSize: 11.5, color: BRAND.textLight }}>{sg.floor_level}</Typography>}
            </Stack>
            {sg.notes && <Typography sx={{ fontSize: 12, color: BRAND.text, lineHeight: 1.6 }}>{sg.notes}</Typography>}
          </Box>
        ))}
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
          <Popup maxHeight={300} minWidth={210}><Body p={p} onCreateWorkOrder={onCreateWorkOrder} /></Popup>
        </Marker>
      );
    }
    const members = g.map(m => m.p);
    const cLat = members.reduce((s, p) => s + p.lat, 0) / members.length;
    const cLng = members.reduce((s, p) => s + p.lng, 0) / members.length;
    const reports = members.reduce((s, p) => s + p.count, 0);
    const clusterCoOccurs = members.some(p => p.coOccurs);
    const bounds = L.latLngBounds(members.map(p => [p.lat, p.lng]));
    return (
      <Marker key={`${kind}-cluster-${gi}-${cLat},${cLng}`} position={[cLat, cLng]} icon={clusterIcon(kind, members.length, clusterCoOccurs)}
        opacity={dimNonCoOccur && !clusterCoOccurs ? 0.3 : 1}
        keyboard title={`${members.length} ${kind} locations, ${reports} report${reports === 1 ? '' : 's'} - activate to zoom in`}>
        <Popup maxHeight={300} minWidth={220}>
          <Box sx={{ minWidth: 210 }}>
            <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: BRAND.heading, lineHeight: 1.5 }}>
              {members.length} {kind} locations · {reports} report{reports === 1 ? '' : 's'}
            </Typography>
            <Button size="small" variant="contained" startIcon={<CenterFocusStrongOutlinedIcon />} onClick={() => map.fitBounds(bounds, { padding: [60, 60], maxZoom: 18 })}
              sx={{ my: 0.75, textTransform: 'none', bgcolor: kind === 'feeding' ? FEEDING_INK : RAMP[4], '&:hover': { bgcolor: kind === 'feeding' ? '#0b6e6e' : RAMP[4] } }}>
              Zoom in to separate
            </Button>
            <Stack spacing={0.6}>
              {members.map(p => (
                <Stack key={`${p.lat},${p.lng}`} direction="row" spacing={0.75} sx={{ alignItems: 'center', borderTop: `1px solid ${BRAND.border}`, pt: 0.6 }}>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: BRAND.heading, flexGrow: 1 }}>{p.block || 'Unlabelled'}</Typography>
                  {kind === 'feeding'
                    ? <Typography sx={{ fontSize: 11.5, color: BRAND.textLight }}>{p.count} sighting{p.count === 1 ? '' : 's'}</Typography>
                    : <><Typography sx={{ fontSize: 11.5, color: BRAND.textLight }}>{p.count} report{p.count === 1 ? '' : 's'}</Typography><SeverityChip band={bandOf(p)} /></>}
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
function FlyTo({ latlngs, signal }) {
  const map = useMap();
  useEffect(() => {
    if (!signal || !latlngs.length) return;
    if (latlngs.length === 1) map.setView(latlngs[0], 18);
    else map.fitBounds(latlngs, { padding: [50, 50], maxZoom: 18 });
  }, [signal, latlngs, map]);
  return null;
}

// Quick-legend toggle chip (doubles as the layer control on the collapsed bar).
function ToggleChip({ active, disabled, onClick, swatch, label }) {
  return (
    <Box component="button" type="button" onClick={onClick} disabled={disabled} aria-pressed={active}
      sx={{
        display: 'inline-flex', alignItems: 'center', gap: 0.6, px: 1, py: 0.5, borderRadius: '999px',
        font: 'inherit', fontSize: 12, fontWeight: 600, minHeight: 34,
        border: `1px solid ${active && !disabled ? BRAND.slate : BRAND.border}`,
        bgcolor: active && !disabled ? BRAND.section : '#fff',
        color: disabled ? BRAND.textLight : BRAND.text, opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        '&:focus-visible': { outline: `2px solid ${BRAND.primary}`, outlineOffset: 2 },
      }}>
      {swatch}<span>{label}</span>
    </Box>
  );
}

const RodentSwatch = () => <Box aria-hidden sx={{ width: 13, height: 13, borderRadius: '50%', bgcolor: RAMP[3], border: `2px solid ${RODENT_STROKE}`, boxSizing: 'border-box', flexShrink: 0 }} />;
const FeedingSwatch = () => <Box aria-hidden sx={{ width: 13, height: 13, borderRadius: '50%', border: `3px solid ${FEEDING_INK}`, bgcolor: 'rgba(14,138,138,0.14)', boxSizing: 'border-box', flexShrink: 0 }} />;
const CoOccurSwatch = () => <Box aria-hidden sx={{ width: 13, height: 13, borderRadius: '50%', bgcolor: RAMP[3], border: `2px solid ${FEEDING_INK}`, boxSizing: 'border-box', flexShrink: 0 }} />;

// Severity key mark for the detailed legend: mirrors the on-map pattern per band.
function BandMark({ band }) {
  const color = BAND_COLOR[band];
  const pat = rodentPattern(band, color);
  return (
    <Box aria-hidden sx={{ width: 16, height: 16, borderRadius: '50%', border: `2.5px solid ${color}`, boxSizing: 'border-box', display: 'grid', placeItems: 'center', background: pat.background, flexShrink: 0 }}>
      {band === 'critical' && <Box sx={{ width: '34%', height: '34%', borderRadius: '50%', bgcolor: '#fff' }} />}
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

const CARD_HOVER = { transition: 'transform .15s, box-shadow .15s', '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 6px 20px rgba(16,24,40,.08)' } };

function KpiTile({ value, label, accent }) {
  return (
    <Card sx={{ p: 2, ...CARD_HOVER }}>
      <Typography sx={{ fontSize: 26, fontWeight: 700, lineHeight: 1, color: accent || BRAND.heading, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
      <Typography sx={{ fontSize: 12.5, color: BRAND.textLight, mt: 0.5 }}>{label}</Typography>
    </Card>
  );
}

// Coverage as a progress ring (the honest % made visual). Stroke is slate, or the
// coverage-amber when partial - never semantic green/red, which mean status here.
function CoverageTile({ pct, located, total, poor }) {
  const r = 16, circ = 2 * Math.PI * r, off = circ * (1 - Math.min(100, Math.max(0, pct)) / 100);
  const color = poor ? '#8A5200' : BRAND.slate;
  return (
    <Card sx={{ p: 2, ...CARD_HOVER }}>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
        <Box component="svg" width={40} height={40} viewBox="0 0 40 40" sx={{ flexShrink: 0 }} aria-hidden>
          <circle cx="20" cy="20" r={r} fill="none" stroke={BRAND.border} strokeWidth="4" />
          <circle cx="20" cy="20" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={off} transform="rotate(-90 20 20)" />
        </Box>
        <Box>
          <Typography sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color, fontVariantNumeric: 'tabular-nums' }}>{pct}%</Typography>
          <Typography sx={{ fontSize: 12, color: BRAND.textLight, mt: 0.25 }}>Located · {located}/{total}</Typography>
        </Box>
      </Stack>
    </Card>
  );
}

/**
 * Rodent Risk & Feeding Map. Reported coordinates only. Rodent discs encode peak
 * severity by BOTH colour and fill-pattern (WCAG-safe) and report count by size;
 * feeding is a teal ring. A KPI strip gives the at-a-glance read (including the
 * always-visible coverage %), co-occurrence is surfaced as a finding, and the
 * legend stays collapsed to quick chips until expanded. Positions never move;
 * unmapped reports are counted, never placed.
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
  const [showLegendDetail, setShowLegendDetail] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(true);
  const [fitSignal, setFitSignal] = useState(0);
  const [flySignal, setFlySignal] = useState(0);
  const [tileError, setTileError] = useState(false);
  const [woBlock, setWoBlock] = useState(null); // block a "Create work order" dialog is open for
  const [toast, setToast] = useState(null);
  const [reloadSignal, setReloadSignal] = useState(0);
  const [updatedAt, setUpdatedAt] = useState(null); // time of the last successful fetch

  useEffect(() => {
    let alive = true;
    http.get('/api/rodent-riskmap', { params: { windowDays } })
      .then(r => { if (alive) { setState({ loading: false, error: false, ...r.data }); setUpdatedAt(new Date()); } })
      .catch(() => { if (alive) setState(s => ({ ...s, loading: false, error: true })); });
    return () => { alive = false; };
  }, [windowDays, reloadSignal]);

  const changeWindow = (_e, v) => { if (v) { setState(s => ({ ...s, loading: true })); setWindowDays(v); } };
  const refresh = () => { setState(s => ({ ...s, loading: true })); setReloadSignal(n => n + 1); };

  const { mappedCount, totalAssessments, unmappedCount } = state;
  const rodentPoints = state.points || [];
  const feeding = state.feeding || { total: 0, mappedCount: 0, unmappedCount: 0, points: [] };
  const feedingPoints = feeding.points || [];
  const hasGeometry = rodentPoints.length > 0 || feedingPoints.length > 0;
  const coBlocks = state.coOccurrenceBlocks || [];
  const highRiskLocations = rodentPoints.filter(p => p.riskLevel === 'high' || p.riskLevel === 'critical').length;

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

  const totalReports = totalAssessments + feeding.total;
  const totalUnmapped = unmappedCount + feeding.unmappedCount;
  const totalMapped = mappedCount + feeding.mappedCount;
  const locatedPct = totalReports ? Math.round((totalMapped / totalReports) * 100) : 100;
  const poorCoverage = !state.error && totalReports > 0 && locatedPct < 60;

  const flyToCoOccur = () => { setShowCoOccur(true); setFlySignal(n => n + 1); };

  return (
    <Card>
      <GlobalStyles styles={{
        '.rk-marker': { cursor: 'pointer', background: 'transparent', border: 'none' },
        '.rk-marker:focus-visible': { outline: `3px solid ${BRAND.primary}`, outlineOffset: '2px', borderRadius: '30%' },
        // hover lift on the glyph (child), never the Leaflet-positioned root, so it
        // doesn't fight the marker's translate transform
        '.rk-marker > div': { transition: 'transform .12s ease' },
        '.rk-marker:hover > div': { transform: 'scale(1.12)' },
        // co-occurrence markers pulse a ring via ::after, leaving the glyph's own
        // halo/shadow intact. Respects prefers-reduced-motion (global theme rule).
        '.rk-coocc > div': { position: 'relative' },
        '.rk-coocc > div::after': { content: '""', position: 'absolute', inset: '-2px', borderRadius: 'inherit', pointerEvents: 'none', animation: 'rkMarkerPulse 1.8s ease-out infinite' },
        '@keyframes rkpulse': { '0%': { boxShadow: `0 0 0 0 rgba(193,39,45,.5)` }, '70%': { boxShadow: '0 0 0 7px rgba(193,39,45,0)' }, '100%': { boxShadow: '0 0 0 0 rgba(193,39,45,0)' } },
        '@keyframes rkMarkerPulse': { '0%': { boxShadow: '0 0 0 0 rgba(193,39,45,.45)' }, '70%': { boxShadow: '0 0 0 9px rgba(193,39,45,0)' }, '100%': { boxShadow: '0 0 0 0 rgba(193,39,45,0)' } },
      }} />
      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
        {/* Header: bold title -> muted subtitle -> segmented time control (F-pattern) */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ justifyContent: 'space-between', alignItems: { sm: 'flex-start' }, mb: 2 }}>
          <Box>
            <Typography component="h2" sx={{ fontSize: 20, fontWeight: 700, color: BRAND.heading, letterSpacing: '-0.3px' }}>
              Rodent Risk & Feeding Map
            </Typography>
            <Typography sx={{ fontSize: 13.5, color: BRAND.textLight, mt: 0.25, lineHeight: 1.5, maxWidth: 560 }}>
              Reported positions only. Feeding near rodent risk is co-occurrence worth investigating - not proof of cause.
            </Typography>
          </Box>
          <Stack spacing={0.75} sx={{ flexShrink: 0, alignItems: { sm: 'flex-end' } }}>
            <ToggleButtonGroup value={windowDays} exclusive onChange={changeWindow} size="small" aria-label="Time window"
              sx={{ '& .MuiToggleButton-root': { textTransform: 'none', fontSize: 13, fontWeight: 600, px: 1.75, py: 0.5, color: BRAND.textLight, borderColor: BRAND.border, '&.Mui-selected': { bgcolor: BRAND.slate, color: '#fff', '&:hover': { bgcolor: BRAND.slateHover } } } }}>
              {WINDOW_OPTIONS.map(d => <ToggleButton key={d} value={d}>{d}d</ToggleButton>)}
            </ToggleButtonGroup>
            <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center' }}>
              {updatedAt && (
                <Typography sx={{ fontSize: 11.5, color: BRAND.textLight }} aria-live="polite">
                  Updated {updatedAt.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })}
                </Typography>
              )}
              <IconButton onClick={refresh} disabled={state.loading} size="small" aria-label="Refresh map data" sx={{ color: BRAND.textLight, '&:hover': { color: BRAND.primary } }}>
                <RefreshRoundedIcon sx={{ fontSize: 17 }} />
              </IconButton>
            </Stack>
          </Stack>
        </Stack>

        {state.loading ? (
          <Stack spacing={2}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2 }}>
              {[0, 1, 2, 3].map(i => <Skeleton key={i} variant="rounded" height={78} />)}
            </Box>
            <Skeleton variant="rounded" height={520} />
          </Stack>
        ) : state.error ? (
          <Typography variant="body2" sx={{ color: BRAND.textLight, py: 6, textAlign: 'center' }}>
            Map unavailable right now.
          </Typography>
        ) : (
          <>
            {/* KPI strip - the at-a-glance read; carries the always-visible coverage % */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2, mb: 2 }}>
              <KpiTile value={totalAssessments} label="Rodent Reports" />
              <KpiTile value={highRiskLocations} label="High-risk Locations" accent={highRiskLocations ? RAMP[4] : BRAND.heading} />
              <KpiTile value={feeding.total} label="Feeding Sightings" />
              <CoverageTile pct={locatedPct} located={totalMapped} total={totalReports} poor={poorCoverage} />
            </Box>

            {/* Co-occurrence: the headline insight, elevated */}
            {coBlocks.length > 0 && (
              <Card sx={{ p: 2, mb: 2, border: `1px solid ${BRAND.border}`, bgcolor: BRAND.section, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
                <Box aria-hidden sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: BRAND.primary, flexShrink: 0, animation: 'rkpulse 1.8s infinite' }} />
                <Box sx={{ flexGrow: 1, minWidth: 200 }}>
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 0.25 }}>
                    <Typography sx={{ fontSize: 15, fontWeight: 700, color: BRAND.heading }}>Co-occurrence detected</Typography>
                    <Box component="span" sx={{ fontSize: 12, fontWeight: 700, px: 0.9, py: '1px', borderRadius: '999px', bgcolor: BRAND.primary, color: '#fff' }}>{coBlocks.length}</Box>
                    <Tooltip title="A block where feeding sightings and rodent reports both appear in this window. It flags where to look - it is association, not proof that feeding caused the rodents.">
                      <InfoOutlinedIcon sx={{ fontSize: 15, color: BRAND.textLight, cursor: 'help' }} />
                    </Tooltip>
                  </Stack>
                  <Typography sx={{ fontSize: 13, color: BRAND.text, lineHeight: 1.5 }}>
                    {coBlocks.length} block{coBlocks.length === 1 ? '' : 's'} show feeding and rodent risk together - worth investigating.
                  </Typography>
                </Box>
                <Button onClick={flyToCoOccur} variant="contained" endIcon={<ArrowForwardRoundedIcon />} disabled={coOccurLatLngs.length === 0}
                  sx={{ textTransform: 'none', whiteSpace: 'nowrap', bgcolor: BRAND.slate, '&:hover': { bgcolor: BRAND.slateHover } }}>
                  Investigate {coBlocks.length} block{coBlocks.length === 1 ? '' : 's'}
                </Button>
              </Card>
            )}

            {/* Calm, dismissible coverage callout - the % also lives in the KPI strip,
                so dismissing this never hides the blind spot. */}
            {poorCoverage && (
              <Collapse in={bannerOpen}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', p: 1.5, mb: 2, borderRadius: '8px', bgcolor: '#FFF8EC', border: '1px solid #F0E2C4', flexWrap: 'wrap', rowGap: 1 }}>
                  <InfoOutlinedIcon sx={{ fontSize: 18, color: '#8A5200', flexShrink: 0 }} />
                  <Typography sx={{ fontSize: 13, color: '#6B4200', flexGrow: 1, minWidth: 200, lineHeight: 1.5 }}>
                    Data coverage is partial - only {locatedPct}% of reports have a location. Adding locations improves the map's accuracy.
                  </Typography>
                  <Button component={RouterLink} to="/rodent" size="small" variant="outlined"
                    sx={{ textTransform: 'none', color: '#6B4200', borderColor: '#E0C08A', '&:hover': { borderColor: '#8A5200', bgcolor: 'transparent' } }}>
                    Add locations
                  </Button>
                  <IconButton size="small" onClick={() => setBannerOpen(false)} aria-label="Dismiss coverage notice" sx={{ color: '#8A5200' }}>
                    <CloseRoundedIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Stack>
              </Collapse>
            )}

            {!hasGeometry ? (
              <Box sx={{ py: 6, px: 3, textAlign: 'center', bgcolor: BRAND.section, borderRadius: '10px', border: `1px dashed ${BRAND.border}` }}>
                <Typography sx={{ fontSize: 15, fontWeight: 700, color: BRAND.heading, mb: 0.5 }}>No located reports in this period</Typography>
                <Typography sx={{ fontSize: 13.5, color: BRAND.textLight, lineHeight: 1.6, maxWidth: 460, mx: 'auto' }}>
                  {totalReports > 0
                    ? `${totalUnmapped} report${totalUnmapped === 1 ? '' : 's'} exist in the last ${windowDays} days but ${totalUnmapped === 1 ? 'was' : 'were'} filed without a position. Try widening the time window.`
                    : `No rodent assessments or feeding sightings in the last ${windowDays} days. Try widening the time window.`}
                </Typography>
                {windowDays !== 90 && (
                  <Button onClick={() => changeWindow(null, 90)} size="small" variant="outlined" color="secondary" sx={{ mt: 2, textTransform: 'none' }}>
                    Widen to 90 days
                  </Button>
                )}
              </Box>
            ) : (
              <>
                {tileError && (
                  <Typography sx={{ fontSize: 12, color: BRAND.textLight, mb: 0.75 }}>
                    Basemap tiles could not load - positions and the reports behind them are still shown.
                  </Typography>
                )}
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
                        pathOptions={{ color: BRAND.slate, weight: 1, opacity: 0.35, dashArray: '3 7', fill: true, fillColor: BRAND.slate, fillOpacity: 0.03 }} />
                      {showRodent && <PointClusterLayer points={rodentPoints} kind="rodent" dimNonCoOccur={showCoOccur} onCreateWorkOrder={setWoBlock} />}
                      {showFeeding && <PointClusterLayer points={feedingPoints} kind="feeding" dimNonCoOccur={showCoOccur} />}
                    </MapContainer>
                  </Box>

                  {/* Legend: quick chips by default; full key expands on demand. */}
                  <Paper elevation={3} sx={{
                    position: { xs: 'static', md: 'absolute' }, left: { md: 12 }, bottom: { md: 12 }, zIndex: 1000,
                    width: { xs: '100%', md: 268 }, mt: { xs: 1.5, md: 0 },
                    borderRadius: '10px', border: `1px solid ${BRAND.border}`, overflow: 'hidden',
                  }}>
                    <Box sx={{ p: 1.25 }}>
                      <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
                        <ToggleChip active={showRodent} disabled={rodentPoints.length === 0} onClick={() => setShowRodent(v => !v)} swatch={<RodentSwatch />} label={`Rodent (${rodentPoints.length})`} />
                        <ToggleChip active={showFeeding} disabled={feedingPoints.length === 0} onClick={() => setShowFeeding(v => !v)} swatch={<FeedingSwatch />} label={`Feeding (${feedingPoints.length})`} />
                        <ToggleChip active={showCoOccur} disabled={coBlocks.length === 0} onClick={() => setShowCoOccur(v => !v)} swatch={<CoOccurSwatch />} label={`Co-occur (${coBlocks.length})`} />
                      </Stack>
                      <Box component="button" type="button" onClick={() => setShowLegendDetail(v => !v)} aria-expanded={showLegendDetail}
                        sx={{ mt: 0.75, display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: 'transparent', border: 'none', cursor: 'pointer', p: 0, color: BRAND.textLight, font: 'inherit',
                          '&:focus-visible': { outline: `2px solid ${BRAND.primary}`, outlineOffset: 2 } }}>
                        <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{showLegendDetail ? 'Hide legend' : 'Legend & scales'}</Typography>
                        <ExpandMoreRoundedIcon sx={{ fontSize: 18, transform: showLegendDetail ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                      </Box>
                    </Box>
                    <Collapse in={showLegendDetail}>
                      <Divider />
                      <Box sx={{ p: 1.5, maxHeight: { md: 320 }, overflowY: 'auto' }}>
                        <Typography component="h3" sx={SECTION_LABEL}>Rodent severity (peak)</Typography>
                        <Stack spacing={0.5} sx={{ mb: 1 }}>
                          {BAND_ORDER.map(b => (
                            <Stack key={b} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                              <BandMark band={b} />
                              <Typography sx={{ fontSize: 12, color: BRAND.textLight, lineHeight: 1.6 }}>{BAND_LABEL[b]}</Typography>
                            </Stack>
                          ))}
                        </Stack>
                        <Typography sx={{ fontSize: 12, color: BRAND.textLight, lineHeight: 1.6 }}>Colour + fill pattern = peak severity · bigger disc = more reports.</Typography>
                        <Divider sx={{ my: 1.25 }} />
                        <Typography component="h3" sx={SECTION_LABEL}>Also on the map</Typography>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.75 }}>
                          <FeedingSwatch />
                          <Typography sx={{ fontSize: 12, color: BRAND.textLight, lineHeight: 1.6 }}>Feeding sighting (teal ring)</Typography>
                        </Stack>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.75 }}>
                          <Box aria-hidden sx={{ width: 18, height: 18, borderRadius: '30%', bgcolor: 'rgba(37,106,191,0.16)', color: RAMP[4], display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700, border: `2px solid ${RAMP[4]}`, flexShrink: 0 }}>3</Box>
                          <Typography sx={{ fontSize: 12, color: BRAND.textLight, lineHeight: 1.6 }}>Cluster (tinted to its layer) - number = locations</Typography>
                        </Stack>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                          <Box aria-hidden sx={{ width: 16, borderTop: `2px dashed ${BRAND.slate}`, opacity: 0.6, flexShrink: 0 }} />
                          <Typography sx={{ fontSize: 12, color: BRAND.textLight }}>Estate boundary (demo extent)</Typography>
                        </Stack>
                        <Divider sx={{ my: 1.25 }} />
                        <Typography sx={{ fontSize: 12, color: BRAND.text, lineHeight: 1.6 }}>{rodentCov}</Typography>
                        <Typography sx={{ fontSize: 12, color: BRAND.text, lineHeight: 1.6 }}>{feedingCov}</Typography>
                        <Button type="button" onClick={() => setFitSignal(n => n + 1)} startIcon={<CenterFocusStrongOutlinedIcon />} fullWidth
                          sx={{ mt: 1.25, minHeight: 40, borderRadius: '8px', color: BRAND.slate, border: `1px solid ${BRAND.border}`, textTransform: 'none', fontSize: 13, '&:hover': { borderColor: BRAND.slate } }}>
                          Reset view
                        </Button>
                      </Box>
                    </Collapse>
                  </Paper>
                </Box>
              </>
            )}
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
                  {p.block || 'Unlabelled block'}: {p.count} report{p.count === 1 ? '' : 's'}, peak {BAND_LABEL[bandOf(p)]} risk.
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

        <CreateWorkOrderDialog key={woBlock || 'wo'} block={woBlock} open={Boolean(woBlock)} onClose={() => setWoBlock(null)} onResult={setToast} />
        <Snackbar open={Boolean(toast)} autoHideDuration={5000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
          <Alert severity={toast?.ok ? 'success' : 'error'} variant="filled" onClose={() => setToast(null)} sx={{ width: '100%' }}>
            {toast?.msg}
          </Alert>
        </Snackbar>
      </CardContent>
    </Card>
  );
}
