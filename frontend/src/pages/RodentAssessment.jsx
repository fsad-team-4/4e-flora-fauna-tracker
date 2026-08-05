import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Typography, TextField, Button, Card, CardContent, Breadcrumbs, Badge, Autocomplete,
  Alert, CircularProgress, Chip, Table, TableHead, InputAdornment,
  TableRow, TableCell, TableBody, Paper, Stack, Checkbox, Divider, Tooltip, MenuItem,
  Dialog, DialogContent, DialogTitle, IconButton, Skeleton,
} from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { BarChart, Bar, Cell, LabelList, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer } from 'recharts';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import MyLocationRoundedIcon from '@mui/icons-material/MyLocationRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import KeyboardArrowRightRoundedIcon from '@mui/icons-material/KeyboardArrowRightRounded';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import AttachFileRoundedIcon from '@mui/icons-material/AttachFileRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import CallSplitRoundedIcon from '@mui/icons-material/CallSplitRounded';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import { Link as RouterLink } from 'react-router-dom';
import { BRAND, INTENT, ON_SURFACE, CHART, SVG_ACCENT } from '../theme';
import SiteFooter from '../components/SiteFooter';
import http from '../http';
import AssessmentLifecyclePanel from '../components/AssessmentLifecyclePanel';
import RiskMapPreview from '../components/dashboard/RiskMapPreview';
// the same severity solids the map pins and the risk chips use - a band must not look
// different in a bar than it does on a pin
import { SEVERITY } from '../components/dashboard/rodentMapTokens';
import { causeLabel } from '../rodentLabels';

// 7 days ago as YYYY-MM-DD, for the "Last 7 days" quick filter (backend supports ?from=)
const sevenDaysAgo = () => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); };

// Risk levels on one scale, so an officer can see where their result sits.
// Critical gets a distinctly heavier treatment, not just a redder chip.
// Colours come from the shared INTENT tokens rather than inline hexes.
const RISK_SCALE = ['low', 'medium', 'high', 'critical'];
const RISK_META = {
  low: { label: 'Low Risk', bg: INTENT.success.bg, color: INTENT.success.ink, bar: INTENT.success.solid },
  medium: { label: 'Medium Risk', bg: INTENT.warning.bg, color: INTENT.warning.ink, bar: INTENT.warning.solid },
  high: { label: 'High Risk', bg: INTENT.danger.bg, color: INTENT.danger.ink, bar: '#D93F3F' },
  critical: { label: 'CRITICAL', bg: INTENT.danger.solid, color: '#FFFFFF', bar: '#7A1A15', solid: true },
};

// RISK = solid saturated pill (severity). LIFECYCLE = outline pill (process state).
// Two different questions, so they must not look like the same badge.
// Severity ordering, for worst-wins aggregation.
const BAND_RANK = { low: 0, medium: 1, high: 2, critical: 3 };

/**
 * Y-axis tick for the block chart: ONE LINE, TRUNCATED BY MEASUREMENT, full name on hover.
 *
 * TWO BUGS FIXED HERE, in order.
 *
 * First, recharts' default category tick WRAPS to fit the axis width, so "Chong Boon Market
 * & Food Centre" became five stacked lines that overran its row and collided with the bars
 * either side - worst for premises, which have the longest names.
 *
 * Then the fix for that had its own bug: a custom <text> with a 20-CHARACTER budget. A
 * character count is not a width. "Blk 290 Yishun St 22" fitted at 20 characters; "Blk 79
 * Toa Payoh Lo…" did not, because capitals and the ellipsis glyph are wider than average -
 * and with textAnchor="end" the overflow runs off the LEFT edge of the SVG and is clipped,
 * so the label lost its first letter ("3lk 79 Toa Payoh Lo…"). Any fixed character budget
 * has this failure mode for some string; the only question is which.
 *
 * SO IT IS MEASURED, BY THE BROWSER. <foreignObject> puts a real HTML box inside the SVG,
 * which means real `text-overflow: ellipsis` against a real `max-width` - the browser
 * truncates at the exact pixel the box ends, for any string, in any font, at any zoom. No
 * budget to tune and nothing to get wrong.
 *
 * `title` on the div gives the native tooltip, so truncation costs nothing: the full name is
 * one hover away. Native rather than a MUI Tooltip because this renders inside recharts'
 * SVG, where mounting a portal per tick is both awkward and pointless.
 */
// The axis reserves this much; the tick box is inset from it so the text never touches the
// bar it labels. Declared together so the two cannot drift apart.
const Y_AXIS_W = 148;
const TICK_GAP = 10;

function BlockTick({ x, y, payload, fill }) {
  const full = String(payload?.value ?? '');
  const w = Y_AXIS_W - TICK_GAP;
  return (
    // y is the row's centre, so the box is offset by half its height to sit on it
    <foreignObject x={x - w} y={y - 10} width={w} height={20}>
      <div
        title={full}
        style={{
          width: '100%', height: '100%', lineHeight: '20px', textAlign: 'right',
          fontSize: 12.5, fontWeight: 600, color: fill, fontFamily: 'inherit',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {full}
      </div>
    </foreignObject>
  );
}

function riskChipSx(level) {
  const m = RISK_META[level] || { bg: INTENT.neutral.bg, color: INTENT.neutral.ink };
  return { bgcolor: m.bg, color: m.color, fontWeight: 700, borderRadius: '999px', textTransform: 'capitalize', border: 'none' };
}

/**
 * Lifecycle state derived from the record, replacing a bare "Escalated: Yes".
 * Mirrors the states the lifecycle panel already distinguishes, so the table and the
 * drawer never disagree about where a report actually is.
 */
function lifecycleOf(h) {
  if (h.work_order_id) return { label: 'Work order raised', intent: 'success' };
  if (h.escalation_status === 'dismissed') return { label: 'Dismissed', intent: 'neutral' };
  if (h.escalate_to_contractor) return { label: 'Awaiting approval', intent: 'warning' };
  return { label: 'Assessed', intent: 'neutral' };
}
function LifecyclePill({ state }) {
  const t = INTENT[state.intent] || INTENT.neutral;
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-block', px: 1, py: '2px', borderRadius: '999px',
        border: `1px solid ${t.border}`, color: t.ink, bgcolor: 'transparent',
        fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap',
      }}
    >
      {state.label}
    </Box>
  );
}

const MIN_CHARS = 15;
function isValidObservation(text) {
  const t = (text || '').trim();
  if (t.length < MIN_CHARS) return false;
  const words = t.split(/\s+/).filter(w => w.length >= 2);
  if (words.length < 3) return false;
  const distinct = new Set(t.replace(/\s/g, '').toLowerCase()).size;
  if (distinct < 4) return false;
  return true;
}

function normalizeAction(a) {
  if (a && typeof a === 'object') return { title: a.title || '', detail: a.detail || a.text || '' };
  return { title: '', detail: String(a) };
}

// Common field findings, appended as sentence fragments. Saves typing on a phone in
// a stairwell; the officer can still write freely, and nothing is auto-submitted.
const QUICK_FINDINGS = [
  'Fresh droppings', 'Active burrow', 'Gnaw marks', 'Rub marks', 'Nesting material',
  'Exposed food waste', 'Overflowing bin', 'Live sighting',
];

// Downscale + re-encode the photo to JPEG client-side, so the base64 payload
// stays well under the server body limit and any camera format the browser can
// decode (incl. HEIC on Safari) is normalised to one the backend accepts.
const MAX_PHOTO_DIM = 1600;
function fileToJpegDataUrl(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, MAX_PHOTO_DIM / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('unreadable image'));
    };
    img.src = objectUrl;
  });
}

// The verdict band: the one thing the eye should hit first. Large, colour-filled,
// with the confidence and the position on the full scale, so the reader knows both
// what the AI concluded and how much to trust it.
function VerdictBand({ result }) {
  const level = result.risk_level;
  const meta = RISK_META[level] || RISK_META.low;
  const idx = RISK_SCALE.indexOf(level);
  return (
    <Box sx={{ bgcolor: meta.bg, px: 3, py: 2.5, borderBottom: `1px solid ${BRAND.border}` }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
        <Box>
          <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: meta.solid ? 'rgba(255,255,255,.8)' : BRAND.text }}>
            AI Risk Assessment
          </Typography>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'baseline', mt: 0.25 }}>
            <Typography sx={{ fontSize: 32, fontWeight: 800, lineHeight: 1.1, color: meta.color, letterSpacing: '-0.5px' }}>
              {meta.label}
            </Typography>
            {result.confidence && (
              <Tooltip title="How confident the AI is, given the detail provided. This is an inference, not a measurement." arrow>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: meta.solid ? 'rgba(255,255,255,.9)' : BRAND.text, cursor: 'default' }}>
                  · {result.confidence} confidence
                </Typography>
              </Tooltip>
            )}
          </Stack>
        </Box>

        {/* position on the full scale */}
        <Box sx={{ minWidth: 180 }}>
          <Stack direction="row" spacing={0.5}>
            {RISK_SCALE.map((lv, i) => (
              <Box key={lv} sx={{ flex: 1, height: 5, borderRadius: '3px', bgcolor: i <= idx ? RISK_META[lv].bar : (meta.solid ? 'rgba(255,255,255,.3)' : BRAND.border) }} />
            ))}
          </Stack>
          <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 0.5 }}>
            <Typography sx={{ fontSize: 9.5, color: meta.solid ? 'rgba(255,255,255,.8)' : BRAND.text }}>LOW</Typography>
            <Typography sx={{ fontSize: 9.5, color: meta.solid ? 'rgba(255,255,255,.8)' : BRAND.text }}>CRITICAL</Typography>
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}

/**
 * KPI card for the hero strip.
 *
 * Card surface + hairline + one soft shadow, rather than a large pastel block: the
 * figure carries the weight and colour is spent only on the semantic icon and a
 * genuine trend. `sparkline` and `trend` are optional because the data behind them
 * does not exist for every metric - a card without them simply omits them instead
 * of rendering a decorative fake.
 */
function KpiCard({ icon: Icon, iconInk, label, value, hint, loading, sparkline, trend, alert = false }) {
  /* A LITERAL, NOT ON_SURFACE.danger, and this is a crash not a preference.
   *
   * The pulse below builds rgba stops inside @keyframes, and ON_SURFACE.danger is
   * `var(--em-danger-strong)`. MUI's alpha() parses the string it is given - it cannot
   * resolve a custom property - so alpha(ON_SURFACE.danger, .55) throws
   * "Unsupported var(--em-danger-strong) color" during render and takes the whole page down
   * with it. SVG_ACCENT exists precisely for these places (see its note in theme.js): SVG
   * attributes and keyframe colour stops, where a var() never reaches. */
  const pulseInk = SVG_ACCENT[useTheme().palette.mode]?.danger || SVG_ACCENT.light.danger;
  return (
    <Card
      sx={{
        position: 'relative', overflow: 'hidden', height: '100%',
        /* HERO TREATMENT FOR THE ALERT CARD, and only for it.
         * Every card looked identical, so "6 critical" carried the same weight as a total
         * count - the operator had to read all four to find the one that needed them. A 3px
         * top rule plus a tinted fill makes it findable peripherally, before any digit is
         * parsed. Kept to a tint rather than a saturated fill because the figure, the icon
         * and the trend pill all still have to be legible on top of it. */
        ...(alert ? {
          bgcolor: 'var(--em-danger-bg)',
          borderTop: `3px solid ${ON_SURFACE.danger}`,
        } : null),
        transition: 'transform .15s ease, box-shadow .15s ease',
        // the whole grid responds to the pointer, so the row reads as live rather than as
        // four printed panels
        '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 10px 20px -8px rgba(16,24,40,.22)' },
      }}
    >
      <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 }, position: 'relative', zIndex: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
          {Icon && <Icon sx={{ fontSize: 17, color: alert ? ON_SURFACE.danger : (iconInk || BRAND.textLight) }} />}
          {/* SENTENCE CASE, NOT UPPERCASE. All-caps at 12px is measurably slower to read -
              it removes the word-shape cues the eye uses - and these are four labels read
              on every page load. Weight and colour carry the hierarchy instead. */}
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: BRAND.text, letterSpacing: '0.1px' }}>
            {label}
          </Typography>
          {/* A PULSE, ONLY WHEN THERE IS SOMETHING TO PULSE ABOUT. Gated on `alert` AND a
              non-zero value by the caller, so a clear estate shows a calm card - an
              always-animating dot is noise nobody sees after a day. Off under
              prefers-reduced-motion, where the tint and the rule still mark the card. */}
          {alert && (
            <Box
              aria-hidden
              sx={{
                ml: 'auto', width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                bgcolor: ON_SURFACE.danger,
                '@keyframes kpiPulse': {
                  '0%': { boxShadow: `0 0 0 0 ${alpha(pulseInk, 0.55)}` },
                  '70%': { boxShadow: `0 0 0 7px ${alpha(pulseInk, 0)}` },
                  '100%': { boxShadow: `0 0 0 0 ${alpha(pulseInk, 0)}` },
                },
                animation: 'kpiPulse 2s ease-out infinite',
                '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
              }}
            />
          )}
        </Stack>
        {loading ? (
          <Skeleton variant="text" width={64} height={44} />
        ) : (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
            {/* 32px: the figure is the reason the card exists and has to out-rank its own
                label by more than the 30-vs-11.5 it had. */}
            <Typography sx={{ fontSize: 32, fontWeight: 800, lineHeight: 1.05, color: alert ? ON_SURFACE.danger : BRAND.ink, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.6px' }}>
              {value}
            </Typography>
            {trend}
          </Stack>
        )}
        {hint && <Typography sx={{ fontSize: 12, color: BRAND.textLight, mt: 0.4 }}>{hint}</Typography>}
      </CardContent>
      {/* sparkline is a background watermark, never a chart the reader must decode */}
      {sparkline}
    </Card>
  );
}

/**
 * Watermark sparkline as a FILLED AREA. Deliberately unlabelled and unaxised - it shows
 * shape only, and the card's own caption states what the series actually is.
 *
 * It was a 2px polyline at 0.16 opacity, which is a hairline at 16% - readable as a smudge
 * along the bottom of the card rather than as a trend. At this size the eye cannot resolve
 * slope from a line alone, so the path is closed to the baseline and filled with a fade of
 * its own ink: the shape gains mass and "rising" versus "falling" is legible at a glance.
 * The stroke stays on top at a higher opacity so the leading edge is still crisp.
 *
 * `ink` so the watermark can carry the card's own semantic colour - the alert card's trend
 * should not be drawn in navy while everything else on it is red.
 */
function Sparkline({ values, ink = BRAND.navy, id = 'kpi' }) {
  if (!values || values.length < 2) return null;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 100, 28 - (v / max) * 24]);
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L 100,30 L 0,30 Z`;
  // gradient ids are document-global, so each card needs its own
  const gid = `kpi-spark-${id}`;
  return (
    <Box aria-hidden sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 40, pointerEvents: 'none' }}>
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ink} stopOpacity={0.26} />
            <stop offset="100%" stopColor={ink} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gid})`} stroke="none" />
        <path d={line} fill="none" stroke={ink} strokeWidth="2" strokeOpacity={0.42} vectorEffect="non-scaling-stroke" />
      </svg>
    </Box>
  );
}

// Trend pill. `good` says whether the movement is desirable for THIS metric, so
// direction and sentiment are never conflated (fewer reports is good; slower
// closes is not). Colour is never the only cue - an arrow glyph carries it too.
function TrendPill({ pct, good, title }) {
  if (pct == null) return null;
  const up = pct > 0;
  const ink = pct === 0 ? BRAND.textLight : good ? ON_SURFACE.ok : ON_SURFACE.danger;
  return (
    <Tooltip title={title}>
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, fontSize: 12.5, fontWeight: 700, color: ink, cursor: 'default' }}>
        {pct === 0 ? '±' : up ? '↑' : '↓'}{Math.abs(pct)}%
      </Box>
    </Tooltip>
  );
}

export default function RodentAssessment() {
  const [block, setBlock] = useState('');
  const [floorLevel, setFloorLevel] = useState('');
  const [observations, setObservations] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [total, setTotal] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [doneActions, setDoneActions] = useState({});
  const [photo, setPhoto] = useState(null); // { dataUrl, name }
  const [photoError, setPhotoError] = useState(null);
  // { lat, lng, accuracy } from a device fix, or { lat, lng, source:'address' }
  // from a looked-up block. Both are positions the officer reported; only the
  // device fix is precise to where they stood, which the UI states.
  const [location, setLocation] = useState(null);
  const [addrOptions, setAddrOptions] = useState([]);
  const [addrLoading, setAddrLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState(null);
  // ?block=123 pre-filters the list, so "view block reports" links (e.g. from the
  // risk map popups) land on the block they promised instead of the whole list.
  const [filters, setFilters] = useState(() => ({
    search: '', block: new URLSearchParams(window.location.search).get('block') || '',
    risk: 'all', escalated: 'all', dateFrom: '',
  }));
  const [selectedId, setSelectedId] = useState(null); // row whose lifecycle panel is open
  const [counts, setCounts] = useState(null); // { total, critical, escalated }
  const [paletteOpen, setPaletteOpen] = useState(false);
  // intake now lives in a dialog: the form used to occupy the left 60% of the
  // viewport permanently, pushing the analytics it feeds below the fold
  const [formOpen, setFormOpen] = useState(false);
  // scorecard supplies the only real assessment time series (WEEKLY buckets) and
  // the only real duration metric (work-order time to close). null = unavailable.
  const [trend, setTrend] = useState(null);
  const fileInputRef = useRef(null);
  const observationRef = useRef(null);

  // Filtering is server-side (the list paginates, so filtering only the loaded
  // rows would show a subset and call it the whole answer). Text inputs are
  // debounced so a query isn't fired on every keystroke.
  useEffect(() => {
    const t = setTimeout(loadHistory, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  /**
   * Unfiltered totals for the operational panel and the risk-map badge.
   *
   * Deliberately three separate limit=1 requests reading the x-total-count header:
   * the counts must describe the WHOLE dataset, so they cannot be derived from the
   * paginated, filtered rows the table happens to be showing.
   */
  const loadCounts = useCallback(async () => {
    try {
      const q = extra => http.get(`/api/rodent-assessments?limit=1${extra}`);
      const [all, crit, esc] = await Promise.all([q(''), q('&risk_level=critical'), q('&escalated=true')]);
      const n = r => Number(r.headers['x-total-count']) || 0;
      setCounts({ total: n(all), critical: n(crit), escalated: n(esc) });
    } catch {
      setCounts(null); // panel shows dashes rather than inventing figures
    }
  }, []);

  useEffect(() => {
    // Fetching on mount is the sanctioned use of an effect; state updates happen
    // after the await, not synchronously, so the rule's warning is a false positive
    // here (same pattern and reasoning as useDashboardMetrics).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCounts();
  }, [loadCounts]);

  // Cmd/Ctrl + K opens the search palette, so an operator can jump straight to
  // finding a prior report without reaching for the mouse.
  useEffect(() => {
    const onKey = e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        // never stack the palette on top of the open intake dialog
        if (formOpen) return;
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [formOpen]);

  const filtersActive =
    filters.search.trim() || filters.block.trim() || filters.risk !== 'all' || filters.escalated !== 'all' || filters.dateFrom;

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (filters.search.trim()) params.append('search', filters.search.trim());
      if (filters.block.trim()) params.append('block', filters.block.trim());
      if (filters.risk !== 'all') params.append('risk_level', filters.risk);
      if (filters.escalated !== 'all') params.append('escalated', filters.escalated);
      if (filters.dateFrom) params.append('from', filters.dateFrom);
      const res = await http.get(`/api/rodent-assessments?${params.toString()}`);
      setHistory(res.data);
      setTotal(Number(res.headers['x-total-count']) || res.data.length);
    } catch (e) {
      console.error('failed to load history', e);
    } finally {
      setLoadingHistory(false);
    }
  }

  // Most-reported blocks among the rows currently loaded. Scoped honestly in the
  // caption - it is not an estate-wide ranking.
  const topBlocks = useMemo(() => {
    const by = {};
    history.forEach(h => {
      const b = (h.block_number || '').trim();
      if (!b) return;
      const e = by[b] || (by[b] = { count: 0, worst: 'low' });
      e.count += 1;
      // Worst-wins, not most-common: one critical report at a block is the fact that
      // decides what happens there, and averaging it away would be the wrong summary.
      if (BAND_RANK[h.risk_level] > BAND_RANK[e.worst]) e.worst = h.risk_level;
    });
    return Object.entries(by).sort((a, b) => b[1].count - a[1].count).slice(0, 4);
  }, [history]);
  const topBlockMax = topBlocks.length ? topBlocks[0][1].count : 0;

  // ---- chart + KPI derivations ---------------------------------------------
  // recharts writes these into SVG attributes, where var() cannot resolve, so
  // they are the palette's literal per-scheme values indexed by mode
  const muiTheme = useTheme();
  const mode = muiTheme.palette.mode;
  const chartInk = muiTheme.palette.text.secondary;
  const chartBorder = muiTheme.palette.divider;
  const chartSurface = muiTheme.palette.background.paper;
  const chartBar = CHART[mode].categorical[0];
  const chartCursor = mode === 'dark' ? 'rgba(255,255,255,.05)' : 'rgba(15,23,42,.04)';
  // no reverse: recharts renders a category axis in array order top-down, and
  // topBlocks is already sorted descending, so the busiest block reads first
  const blockChartData = useMemo(
    () => topBlocks.map(([block, v]) => ({ block, count: v.count, worst: v.worst })),
    [topBlocks],
  );

  // Week-over-week volume from the scorecard's weekly buckets. The last bucket is
  // the CURRENT part-week, so comparing it would understate; compare the two most
  // recent COMPLETE weeks instead.
  const volumePct = useMemo(() => {
    const s2 = trend?.series;
    if (!s2 || s2.length < 3) return null;
    const prev = s2[s2.length - 3];
    const last = s2[s2.length - 2];
    if (!prev) return null;
    return Math.round(((last - prev) / prev) * 100);
  }, [trend]);
  const weeklyHint = trend?.series?.length
    ? `${trend.series.reduce((a, b) => a + b, 0)} over ${trend.series.length} weeks`
    : 'all time';

  // Weekly report volume + average work-order time-to-close. Both come from the
  // scorecard because no per-assessment daily series or resolution timestamp
  // exists; failure is silent and the affected cards degrade rather than lie.
  useEffect(() => {
    let alive = true;
    http.get('/api/scorecard', { params: { trendWeeks: 8 } })
      .then(r => {
        if (!alive) return;
        const series = (r.data?.trend || []).map(t => t.reports ?? t.count ?? 0);
        setTrend({ series, avgClose: r.data?.summary?.avg_time_to_close_days ?? null });
      })
      .catch(() => { if (alive) setTrend({ series: [], avgClose: null }); });
    return () => { alive = false; };
  }, []);

  function openForm() {
    setFormOpen(true);
  }

  function addFinding(f) {
    setObservations(prev => {
      const t = prev.trim();
      if (!t) return `${f}. `;
      return /[.!?]$/.test(t) ? `${t} ${f}. ` : `${t}. ${f}. `;
    });
    observationRef.current?.focus();
  }

  async function handlePhotoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoError(null);
    try {
      const dataUrl = await fileToJpegDataUrl(file);
      setPhoto({ dataUrl, name: file.name });
    } catch {
      setPhotoError('Could not read that image - please choose a photo file (JPEG or PNG).');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleRemovePhoto() {
    setPhoto(null);
    setPhotoError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // Capture the officer's actual position from the device. Optional by design: a
  // failure (no signal in a stairwell, permission denied) must never block filing,
  // so it only sets an explanatory message - it never disables submit.
  /**
   * Address lookup for the Block field.
   *
   * Debounced at 300ms so a typed block does not fire a request per keystroke,
   * and every response is guarded by a live flag - a slow reply for "12" must
   * not overwrite the suggestions for "128 Lorong".
   * A failed lookup sets no error banner: the officer can still type freely, so
   * a dead network here is not something they need to act on.
   */
  useEffect(() => {
    const q = block.trim();
    let live = true;
    // Both setState calls live INSIDE the debounce timer, never in the effect
    // body - a synchronous set here cascades a render on every keystroke.
    const t = setTimeout(() => {
      if (q.length < 3) { setAddrOptions([]); return; }
      setAddrLoading(true);
      http.get('/api/geocode/search', { params: { q } })
        .then(r => { if (live) setAddrOptions(r.data?.results || []); })
        .catch(() => { if (live) setAddrOptions([]); })
        .finally(() => { if (live) setAddrLoading(false); });
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [block]);

  function handleCaptureLocation() {
    setLocationError(null);
    if (!('geolocation' in navigator)) {
      setLocationError('This device has no location support - you can still file without it.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setLocating(false);
      },
      err => {
        setLocationError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied - you can still file without it.'
            : 'Could not get a location fix (no signal?) - you can still file without it.'
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  function handleClearLocation() {
    setLocation(null);
    setLocationError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isValidObservation(observations)) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    setDoneActions({});
    try {
      const { data } = await http.post('/api/rodent-assessments', {
        block_number: block.trim() || null,
        floor_level: floorLevel.trim() || null,
        observations: observations.trim(),
        image: photo ? photo.dataUrl : undefined,
        gps_lat: location ? location.lat : null,
        gps_lng: location ? location.lng : null,
      });
      // keep the local preview so the result can show the photo even when
      // storage is not configured and no image_url came back
      setResult({ ...data, local_photo: photo ? photo.dataUrl : null });
      setFormOpen(false); // hand off to the verdict card on the page
      loadHistory();
      loadCounts();
    } catch (e) {
      setError(e.response?.data?.error || 'assessment failed');
    } finally {
      setSubmitting(false);
    }
  }

  const actions = (result?.immediate_actions || []).map(normalizeAction);
  const labelSx = { fontSize: 11, fontWeight: 700, color: BRAND.text, textTransform: 'uppercase', letterSpacing: '0.6px', mb: 1 };
  const chipBtnSx = {
    textTransform: 'none', borderRadius: '999px', color: BRAND.text,
    borderColor: BRAND.border, '&:hover': { borderColor: BRAND.textLight, bgcolor: BRAND.section },
  };

  return (
    /* FULL-HEIGHT SHELL, matching Notification Log, Alert Rules and the scorecard.
       The page was ordinary document flow, so its content stopped partway down a tall
       screen and left the rest as empty app background. The shell owns the viewport:
       a header band that stays put, then one internal scroll region carrying the
       content and the footer. Registered in FULL_HEIGHT_PATHS in App.jsx, which is
       what supplies the 100dvh this height:100% resolves against. */
    <Box
      component="section"
      sx={{
        width: '100%', height: '100%', minHeight: 0,
        display: 'flex', flexDirection: 'column', bgcolor: BRAND.canvas,
      }}
    >
      <Box
        sx={{
          flexShrink: 0, px: { xs: 2, md: 3 }, pt: 2, pb: 1.75,
          bgcolor: BRAND.surface, borderBottom: `1px solid ${BRAND.border}`,
        }}
      >
      {/* ── Slim header: breadcrumb trail, then the two operator actions ────── */}
      <Breadcrumbs sx={{ mb: 0.75, fontSize: 12.5 }} aria-label="Breadcrumb">
        <Box component={RouterLink} to="/dashboard" sx={{ color: BRAND.textLight, textDecoration: 'none', '&:hover': { color: BRAND.accent } }}>
          Estate
        </Box>
        <Box component={RouterLink} to="/rodent" sx={{ color: BRAND.textLight, textDecoration: 'none', '&:hover': { color: BRAND.accent } }}>
          Rodent
        </Box>
        <Typography sx={{ fontSize: 12.5, color: BRAND.heading, fontWeight: 600 }}>Risk Assessment</Typography>
      </Breadcrumbs>

      <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', rowGap: 1.5 }}>
        <Typography component="h1" sx={{ fontSize: { xs: 20, md: 23 }, fontWeight: 800, color: BRAND.heading, letterSpacing: '-0.4px' }}>
          Rodent Risk Assessment
        </Typography>

        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexShrink: 0 }}>
          <Tooltip title="Search past assessments (⌘/Ctrl + K)">
            <IconButton onClick={() => setPaletteOpen(true)} aria-label="Search assessments" sx={{ color: BRAND.text }}>
              <SearchRoundedIcon />
            </IconButton>
          </Tooltip>

          {/* badge = escalations recommended across the whole dataset, not this page */}
          <Tooltip title={counts ? `${counts.escalated} report${counts.escalated === 1 ? '' : 's'} recommended for a contractor call-out` : 'View the rodent risk map'}>
            <IconButton component={RouterLink} to="/rodent-heatmap" aria-label={`View risk map${counts ? `, ${counts.escalated} escalated` : ''}`} sx={{ color: BRAND.text }}>
              <Badge
                badgeContent={counts?.escalated || 0}
                max={99}
                invisible={!counts?.escalated}
                sx={{ '& .MuiBadge-badge': { bgcolor: INTENT.danger.solid, color: '#fff', fontSize: 10, fontWeight: 700, minWidth: 17, height: 17 } }}
              >
                <MapOutlinedIcon />
              </Badge>
            </IconButton>
          </Tooltip>

          <Button
            onClick={openForm}
            variant="contained"
            startIcon={<AddRoundedIcon />}
            sx={{
              whiteSpace: 'nowrap', fontWeight: 700, borderRadius: '8px', px: 2.25, py: 1,
              bgcolor: BRAND.action, boxShadow: '0 4px 14px rgba(29,78,216,.32)',
              '&:hover': { bgcolor: BRAND.actionHover },
            }}
          >
            Log Field Observation
          </Button>
        </Stack>
      </Stack>
      </Box>

      {/* The one scroll region. `minHeight: 0` is load-bearing: without it a flex child
          will not shrink below its content, so the shell would grow instead of this box
          scrolling.

          NO MEASURE CAP. The old page root boxed this at 1440px centred, leaving empty
          gutters either side while the header band ran edge to edge. Padding only now,
          matching Notification Log and Alert Rules, so the intake form, KPI strip and
          assessment table use the full width. */}
      <Box sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto' }}>
      <Box sx={{ px: { xs: 2, md: 3 }, py: 3 }}>

      {/* ── Hero: intake form (left) | live operational summary (right) ─────── */}
      {/* ── KPI strip. Replaces the pastel summary blocks AND the always-open
          intake form, which used to eat the left 60% of the viewport. ──────── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 2, mb: 3 }}>
        {/* CRITICAL RISK LEADS THE ROW.
            It used to sit second, behind a total count - so the first card an operator's eye
            landed on was the least urgent number on the page. First position plus the alert
            treatment (tinted fill, 3px danger rule, pulse dot) means the one metric that can
            demand action is the one found first.
            `alert` is gated on the count being non-zero, not merely on this being the
            critical card: an estate with nothing critical must read as calm, or the styling
            stops meaning anything. */}
        <KpiCard
          icon={ReportProblemOutlinedIcon}
          iconInk={ON_SURFACE.danger}
          label="Critical risk"
          value={counts ? counts.critical : '-'}
          loading={counts === null}
          hint="highest AI risk band"
          alert={Boolean(counts?.critical)}
        />
        <KpiCard
          icon={AssignmentOutlinedIcon}
          label="Total assessments"
          value={counts ? counts.total : '-'}
          loading={counts === null}
          hint={weeklyHint}
          sparkline={<Sparkline values={trend?.series} ink={BRAND.navy} id="total" />}
          trend={<TrendPill pct={volumePct} good={volumePct != null && volumePct <= 0} title="Reports in the latest full week vs the week before. Fewer reports is the desirable direction." />}
        />
        <KpiCard
          icon={CallSplitRoundedIcon}
          iconInk={ON_SURFACE.warn}
          label="Escalated"
          value={counts ? counts.escalated : '-'}
          loading={counts === null}
          hint="recommended for call-out"
        />
        {/* Work-order time-to-close is the only genuine duration the data supports:
            assessments carry no resolved state, and AI confidence is never
            persisted, so neither could be shown without inventing it. */}
        <KpiCard
          icon={TimerOutlinedIcon}
          iconInk={ON_SURFACE.info}
          label="Avg. time to close"
          value={trend?.avgClose != null ? `${trend.avgClose}d` : '-'}
          loading={trend === null}
          hint={trend?.avgClose != null ? 'raised to closed, work orders' : 'no work order closed yet'}
        />
      </Box>

      {/* ── 60/40: categorical ranking beside the spatial view ──────────────── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.5fr 1fr' }, gap: 3, mb: 3, alignItems: 'stretch' }}>
        <Card>
          <CardContent sx={{ p: 2.5 }}>
            <Typography component="h2" sx={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: BRAND.text }}>
              Most-reported blocks
            </Typography>
            {/* scope disclaimer stays: this counts the loaded rows, and no
                estate-wide per-block aggregate endpoint exists */}
            <Typography sx={{ fontSize: 11.5, color: BRAND.textLight, mt: 0.25, mb: 1.5 }}>
              Within the {history.length} report{history.length === 1 ? '' : 's'} loaded below - not an estate-wide ranking.
            </Typography>
            {topBlocks.length === 0 ? (
              <Typography sx={{ fontSize: 12.5, color: BRAND.textLight, py: 4, textAlign: 'center' }}>No blocks recorded yet.</Typography>
            ) : (
              <Box sx={{ height: Math.max(160, topBlocks.length * 44) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={blockChartData} layout="vertical" margin={{ top: 0, right: 34, bottom: 4, left: 8 }} barCategoryGap={12}>
                    {/* THE SCALE IS SHOWN NOW. It was `hide`, so a bar's length was
                        uncalibrated - the reader could compare two bars but could not read a
                        value off either. With the count printed at each bar end the axis is
                        arguably redundant, but it is what makes the LENGTHS mean something
                        rather than being a decorative ranking. */}
                    <XAxis
                      type="number"
                      domain={[0, topBlockMax || 1]}
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11.5, fill: chartInk }}
                      height={18}
                    />
                    <YAxis
                      type="category"
                      dataKey="block"
                      // shared with the tick so the reserved axis and the box the text is
                      // measured against are the same number - see BlockTick
                      width={Y_AXIS_W}
                      axisLine={false}
                      tickLine={false}
                      tick={<BlockTick fill={chartInk} />}
                    />
                    <RTooltip
                      cursor={{ fill: chartCursor }}
                      contentStyle={{ background: chartSurface, border: `1px solid ${chartBorder}`, borderRadius: 8, fontSize: 12.5 }}
                      labelStyle={{ color: chartInk, fontWeight: 700 }}
                      formatter={(v, _n, item) => [
                        `${v} report${v === 1 ? '' : 's'} · worst ${item?.payload?.worst || 'low'}`,
                        'Loaded',
                      ]}
                    />
                    {/* COLOUR IS SEVERITY, LENGTH IS VOLUME - two facts the operator needs,
                        and neither competes with the other because the RANKING is carried by
                        length alone. (Contrast the rodent map's density hexagons, where hue
                        for severity and opacity for volume did compete: there the loudest
                        cell was not the busiest one, so hue had to go. Here the bars are
                        already ordered by count, so the reading order cannot be confused by
                        the fill.)
                        Deliberately NOT a frequency ramp: a red bar would then mean "many
                        reports" while red means "critical" everywhere else in this product,
                        including the chip in the table directly below this chart. Mapping to
                        real severity keeps one meaning for the colour. */}
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={18}>
                      {blockChartData.map(d => (
                        <Cell key={d.block} fill={SEVERITY[d.worst]?.solid || chartBar} />
                      ))}
                      {/* the value at the end of each bar, so nobody has to estimate it
                          against the axis */}
                      <LabelList
                        dataKey="count"
                        position="right"
                        offset={8}
                        style={{ fontSize: 12, fontWeight: 800, fill: chartInk }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <RiskMapPreview />
          </CardContent>
        </Card>
      </Box>

      {/* ── Intake dialog. Trigger is the header CTA; the AI verdict it produces
          renders on the page below, because the POST response carries fields
          (confidence, prior_count) that no later fetch can rehydrate. ─────── */}
      <Dialog
        open={formOpen}
        onClose={() => !submitting && setFormOpen(false)}
        fullWidth
        maxWidth="md"
        slotProps={{ paper: { sx: { borderRadius: '14px' } } }}
      >
        <DialogTitle sx={{ fontWeight: 700, color: BRAND.heading, display: 'flex', alignItems: 'center', gap: 1 }}>
          New Field Observation
          <Box sx={{ flexGrow: 1 }} />
          <IconButton onClick={() => setFormOpen(false)} disabled={submitting} aria-label="Close" sx={{ color: BRAND.textLight }}>
            <CloseRoundedIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
            <Box
              component="form"
              onSubmit={handleSubmit}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && isValidObservation(observations) && !submitting) handleSubmit(e); }}
              sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
            >
              {/* Block + Floor share one grid row. Helper prose moved into tooltips so
                  the form does not carry paragraphs of explanation on the canvas. */}
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                {/* freeSolo is NOT optional here. An officer in a stairwell with
                    no signal, or reporting somewhere OneMap does not index, must
                    still be able to type a block and file. The lookup is an
                    accelerator, never a gate. */}
                <Autocomplete
                  freeSolo
                  options={addrOptions}
                  filterOptions={x => x}
                  getOptionLabel={o => (typeof o === 'string' ? o : o.label)}
                  inputValue={block}
                  onInputChange={(_e, v, reason) => { if (reason !== 'reset') setBlock(v); }}
                  onChange={(_e, v) => {
                    if (!v || typeof v === 'string') return;
                    // The officer picked a real, named address - so this is a
                    // reported position, not an inferred one. It is still only
                    // block-level, which the helper text below says outright.
                    setBlock(`${v.block ? `Block ${v.block}` : ''} ${v.road || ''}`.trim() || v.label);
                    setLocation({ lat: v.lat, lng: v.lng, source: 'address', label: v.label });
                    setLocationError(null);
                  }}
                  loading={addrLoading}
                  disabled={submitting}
                  renderInput={params => (
                    <TextField
                      {...params}
                      label="Block"
                      size="small"
                      fullWidth
                      placeholder="e.g. 128 Lorong 1 Toa Payoh"
                      helperText="Start typing a street to look it up, or just type a block name"
                      /* MUI v9 hands renderInput `params.slotProps.input`, NOT
                         `params.InputProps` - reading the old name gave undefined
                         and threw on .endAdornment, which took the whole dialog
                         down. Autocomplete's own adornment (clear/popup icons)
                         has to be preserved or the dropdown arrow disappears. */
                      slotProps={{
                        ...params.slotProps,
                        input: {
                          ...params.slotProps?.input,
                          endAdornment: (
                            <>
                              {addrLoading ? <CircularProgress size={15} sx={{ mr: 1 }} /> : null}
                              <Tooltip title="Picking a looked-up address also fills the location, accurate to the block. Adding a block lets the AI check for repeat reports at the same location.">
                                <HelpOutlineRoundedIcon sx={{ fontSize: 16, color: BRAND.textLight, cursor: 'help' }} />
                              </Tooltip>
                              {params.slotProps?.input?.endAdornment}
                            </>
                          ),
                        },
                      }}
                    />
                  )}
                  renderOption={(props, o) => {
                    const { key, ...rest } = props;
                    return (
                      <Box component="li" key={key} {...rest} sx={{ display: 'block !important' }}>
                        <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: BRAND.heading }}>
                          {o.block ? `Block ${o.block}` : ''} {o.road}
                        </Typography>
                        <Typography sx={{ fontSize: 11.5, color: BRAND.textLight }}>
                          {o.postal ? `Singapore ${o.postal}` : o.label}
                        </Typography>
                      </Box>
                    );
                  }}
                />
                <TextField
                  label="Floor / area"
                  value={floorLevel}
                  onChange={e => setFloorLevel(e.target.value)}
                  size="small"
                  fullWidth
                  placeholder="e.g. L1, Community garden"
                  disabled={submitting}
                />
              </Box>

              <TextField
                inputRef={observationRef}
                label="What did you observe?"
                value={observations}
                onChange={e => setObservations(e.target.value)}
                multiline
                rows={5}
                required
                fullWidth
                disabled={submitting}
                placeholder="e.g. Found droppings near the compost area. A few small holes in the soil along the fenceline."
                helperText={observations.trim().length > 0 && !isValidObservation(observations)
                  ? 'Add a bit more detail (a full sentence or two) so the assessment is meaningful.'
                  : observations.length
                    ? `${observations.length} characters`
                    : 'Note what you saw, where, and any nearby food or harbourage.'}
                slotProps={{ formHelperText: { sx: { color: BRAND.text } } }}
              />

              {/* quick-add findings: tap to append, still fully editable after */}
              <Box>
                <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: BRAND.text, mb: 0.75 }}>
                  Common findings - tap to add
                </Typography>
                <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
                  {QUICK_FINDINGS.map(f => (
                    <Chip
                      key={f}
                      label={f}
                      size="small"
                      icon={<AddRoundedIcon sx={{ fontSize: 15 }} />}
                      onClick={() => addFinding(f)}
                      disabled={submitting}
                      sx={{
                        borderRadius: '999px', fontWeight: 600, fontSize: 12,
                        bgcolor: BRAND.section, color: BRAND.text, border: `1px solid ${BRAND.border}`,
                        '&:hover': { bgcolor: BRAND.navySoft, borderColor: BRAND.textLight },
                      }}
                    />
                  ))}
                </Stack>
              </Box>

              {/* compact attachment chips replace the two full-width upload panels */}
              <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handlePhotoChange} />
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1, alignItems: 'center' }}>
                {!photo ? (
                  <Tooltip title="A photo of droppings, gnaw marks or burrows lets the AI assess what is visible, not just the note.">
                    <Button variant="outlined" size="small" startIcon={<PhotoCameraOutlinedIcon />}
                      onClick={() => fileInputRef.current?.click()} disabled={submitting} sx={chipBtnSx}>
                      Attach photo
                    </Button>
                  </Tooltip>
                ) : (
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 1, py: 0.5, borderRadius: '999px', bgcolor: INTENT.success.bg, border: `1px solid ${INTENT.success.border}` }}>
                    <Box component="img" src={photo.dataUrl} alt="" sx={{ width: 24, height: 24, objectFit: 'cover', borderRadius: '50%' }} />
                    <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: INTENT.success.ink, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {photo.name}
                    </Typography>
                    <IconButton size="small" onClick={handleRemovePhoto} disabled={submitting} aria-label="Remove photo" sx={{ p: 0.25, color: INTENT.success.ink }}>
                      <CloseRoundedIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Stack>
                )}

                {!location ? (
                  <Tooltip title="Records where you are standing so this report can be mapped. Optional - you can file without it.">
                    <Button variant="outlined" size="small" startIcon={<MyLocationRoundedIcon />}
                      onClick={handleCaptureLocation} disabled={submitting || locating} sx={chipBtnSx}>
                      {locating ? 'Locating…' : 'Pin location'}
                    </Button>
                  </Tooltip>
                ) : (
                  // The two sources are NOT interchangeable and the chip says
                  // which one this is. A device fix is where the officer stood;
                  // a looked-up address is the centre of the block. Both are
                  // reported positions, but only one is precise to the spot.
                  <Tooltip title={location.source === 'address'
                    ? `${location.label || 'Looked-up address'} · ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)} · accurate to the block, not the exact spot`
                    : `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}${location.accuracy ? ` · ±${Math.round(location.accuracy)}m` : ''}`}>
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', px: 1.25, py: 0.5, borderRadius: '999px', bgcolor: INTENT.success.bg, border: `1px solid ${INTENT.success.border}` }}>
                      <CheckCircleRoundedIcon sx={{ fontSize: 16, color: INTENT.success.ink }} />
                      <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: INTENT.success.ink }}>
                        {location.source === 'address' ? 'Block location set' : 'Location pinned'}{block.trim() ? `: ${block.trim()}` : ''}
                      </Typography>
                      <IconButton size="small" onClick={handleClearLocation} disabled={submitting} aria-label="Remove location" sx={{ p: 0.25, color: INTENT.success.ink }}>
                        <CloseRoundedIcon sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Stack>
                  </Tooltip>
                )}
              </Stack>
              {(photoError || locationError) && (
                <Typography sx={{ fontSize: 12, color: INTENT.danger.ink }}>{photoError || locationError}</Typography>
              )}

              {error && <Alert severity="error">{error}</Alert>}

              {/* Clear is a ghost text button on the LEFT; the run action carries the
                  weight on the right. */}
              <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Button
                  onClick={() => { setBlock(''); setFloorLevel(''); setObservations(''); setResult(null); setError(null); handleRemovePhoto(); handleClearLocation(); }}
                  disabled={submitting}
                  sx={{ color: BRAND.textLight, '&:hover': { bgcolor: BRAND.section } }}
                >
                  Clear form
                </Button>
                {/* a disabled control must say WHY, not just refuse */}
                <Tooltip
                  title={
                    submitting
                      ? 'Running the assessment…'
                      : !isValidObservation(observations)
                        ? `Describe what you saw first - at least ${MIN_CHARS} characters - then the AI can assess it.`
                        : 'AI reviews your note (and photo, if attached) and suggests a risk level and next actions. ⌘/Ctrl + Enter runs it.'
                  }
                >
                  <span>
                    <Button
                      type="submit"
                      variant="contained"
                      disabled={submitting || !isValidObservation(observations)}
                      sx={{
                        px: 3, py: 1.15, fontWeight: 700, bgcolor: BRAND.action,
                        boxShadow: '0 4px 12px rgba(29,78,216,.28)',
                        '&:hover': { bgcolor: BRAND.actionHover },
                      }}
                    >
                      {submitting ? <><CircularProgress size={16} sx={{ mr: 1, color: 'white' }} />Assessing…</> : 'Run AI Risk Assessment'}
                    </Button>
                  </span>
                </Tooltip>
              </Stack>
            </Box>
        </DialogContent>
      </Dialog>


      {/* loading skeleton so the AI wait doesn't read as broken */}
      {submitting && (
        <Card sx={{ mb: 3 }}>
          <CardContent sx={{ py: 5, textAlign: 'center' }}>
            <CircularProgress size={28} sx={{ color: BRAND.accent, mb: 1.5 }} />
            <Typography sx={{ color: BRAND.text, fontSize: 14 }}>
              Assessing the observation{photo ? ' and photo' : ''}{block ? ` and checking prior reports at ${block}` : ''}…
            </Typography>
          </CardContent>
        </Card>
      )}

      {result && !submitting && (
        <Card sx={{ mb: 3, overflow: 'hidden' }}>
          {/* HERO: the verdict dominates */}
          <VerdictBand result={result} />

          <CardContent sx={{ p: 3 }}>
            {/* recurrence context - the judgement a single note can't give */}
            {result.recurrence_note && (
              <Box sx={{ display: 'flex', gap: 1.25, p: 1.5, mb: 2.5, bgcolor: INTENT.warning.bg, border: `1px solid ${INTENT.warning.border}`, borderRadius: '8px' }}>
                <HistoryRoundedIcon sx={{ color: INTENT.warning.ink, fontSize: 20, flexShrink: 0, mt: 0.1 }} />
                <Box>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: INTENT.warning.ink }}>
                    Recurring location{result.prior_count ? ` · ${result.prior_count} prior report${result.prior_count === 1 ? '' : 's'} in 7 days` : ''}
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: INTENT.warning.ink }}>{result.recurrence_note}</Typography>
                </Box>
              </Box>
            )}

            {result.escalate_to_contractor && (
              <Alert severity="error" icon={<ReportProblemOutlinedIcon />} sx={{ mb: 2.5, alignItems: 'flex-start' }}>
                <Typography sx={{ fontWeight: 700, mb: 0.25 }}>Escalate to pest contractor</Typography>
                {result.escalation_reason}
              </Alert>
            )}

            {result.stubbed && (
              <Alert severity="info" sx={{ mb: 2.5 }}>
                Offline assessment — the AI service was unavailable, so this used the built-in fallback.
              </Alert>
            )}

            {/* two zones: reasoning (light) | actions (the tasks) */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1px 1.1fr' }, gap: { xs: 2.5, md: 3 } }}>
              {/* zone 1: reasoning */}
              <Box>
                <Typography sx={labelSx}>Likely cause</Typography>
                <Typography variant="body2" sx={{ color: BRAND.text, mb: 2.5, lineHeight: 1.6 }}>{causeLabel(result.likely_cause)}</Typography>

                {result.signs_identified?.length > 0 && (
                  <>
                    <Typography sx={labelSx}>Signs identified</Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {result.signs_identified.map((s, i) => (
                        <Chip key={i} label={s} size="small" sx={{ bgcolor: BRAND.section, color: BRAND.text, borderRadius: '6px', fontWeight: 500 }} />
                      ))}
                    </Box>
                  </>
                )}

                {result.estimated_timeline && (
                  <Box sx={{ mt: 2.5 }}>
                    <Typography sx={labelSx}>Timeline</Typography>
                    <Typography variant="body2" sx={{ color: BRAND.text }}>{result.estimated_timeline}</Typography>
                  </Box>
                )}

                {/* the evidence the AI actually looked at */}
                {result.assessed_from_image && (result.image_url || result.local_photo) && (
                  <Box sx={{ mt: 2.5 }}>
                    <Typography sx={labelSx}>Field photo (analysed by AI)</Typography>
                    <Box
                      component="img"
                      src={result.image_url || result.local_photo}
                      alt="field photo"
                      sx={{ maxWidth: '100%', maxHeight: 240, borderRadius: '8px', border: `1px solid ${BRAND.border}`, display: 'block' }}
                    />
                    {result.image_stored === false && (
                      <Typography sx={{ fontSize: 12, color: BRAND.text, mt: 0.5 }}>
                        The AI assessed this photo, but it was not saved (image storage is not configured).
                      </Typography>
                    )}
                  </Box>
                )}
              </Box>

              <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', md: 'block' } }} />

              {/* zone 2: actions as a checklist - these are tasks, not prose */}
              <Box>
                <Typography sx={labelSx}>Immediate actions</Typography>
                <Typography sx={{ fontSize: 11, color: BRAND.textLight, fontStyle: 'italic', mb: 1 }}>
                  Working checklist — ticks aren&apos;t saved yet
                </Typography>
                <Stack spacing={0}>
                  {actions.map((a, i) => {
                    const done = Boolean(doneActions[i]);
                    return (
                      <Box
                        key={i}
                        sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', py: 1, borderTop: i === 0 ? 'none' : `1px solid ${BRAND.section}` }}
                      >
                        <Checkbox
                          size="small"
                          checked={done}
                          onChange={() => setDoneActions(p => ({ ...p, [i]: !p[i] }))}
                          sx={{ p: 0.25, mt: 0.1, color: BRAND.textLight, '&.Mui-checked': { color: BRAND.accent } }}
                        />
                        <Typography variant="body2" sx={{ color: done ? BRAND.textLight : BRAND.text, lineHeight: 1.6, textDecoration: done ? 'line-through' : 'none' }}>
                          <Box component="span" sx={{ fontWeight: 700, color: done ? BRAND.textLight : BRAND.heading }}>
                            {a.title ? `${a.title}: ` : ''}
                          </Box>
                          {a.detail}
                        </Typography>
                      </Box>
                    );
                  })}
                </Stack>
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* ── One consolidated toolbar: presets + search + field filters ───────── */}
      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'baseline', mb: 1.5, flexWrap: 'wrap', rowGap: 0.5 }}>
            <Typography component="h2" sx={{ fontSize: 16, fontWeight: 700, color: BRAND.heading }}>Recent Assessments</Typography>
            {!loadingHistory && (
              <Typography sx={{ fontSize: 13, color: BRAND.text }}>
                {total} result{total === 1 ? '' : 's'}{filtersActive ? ' · filtered' : ''}
              </Typography>
            )}
          </Stack>

          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1.5}
            sx={{
              alignItems: { md: 'center' }, flexWrap: 'wrap', rowGap: 1.5,
              p: 1.5, borderRadius: '10px', bgcolor: BRAND.section, border: `1px solid ${BRAND.border}`,
              '& .MuiOutlinedInput-root': { bgcolor: BRAND.surface },
            }}
          >
            <TextField
              size="small" placeholder="Search observations or cause"
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ fontSize: 18, color: BRAND.textLight }} /></InputAdornment> } }}
              sx={{ flexGrow: 1, minWidth: 200 }}
            />
            <TextField size="small" label="Block" value={filters.block}
              onChange={e => setFilters(f => ({ ...f, block: e.target.value }))}
              sx={{ width: { xs: '100%', md: 130 } }} />
            <TextField size="small" select label="Risk" value={filters.risk}
              onChange={e => setFilters(f => ({ ...f, risk: e.target.value }))}
              sx={{ width: { xs: '100%', md: 130 } }}>
              <MenuItem value="all">All risks</MenuItem>
              <MenuItem value="low">Low</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="high">High</MenuItem>
              <MenuItem value="critical">Critical</MenuItem>
            </TextField>
            <TextField size="small" select label="Escalated" value={filters.escalated}
              onChange={e => setFilters(f => ({ ...f, escalated: e.target.value }))}
              sx={{ width: { xs: '100%', md: 150 } }}>
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="true">Escalated only</MenuItem>
              <MenuItem value="false">Not escalated</MenuItem>
            </TextField>

            {/* presets are shortcuts over the same server-side filters, so they live in
                the same toolbar rather than a separate row above it */}
            <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', md: 'block' } }} />
            <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
              {[
                { key: 'critical', label: 'Critical', active: filters.risk === 'critical', toggle: () => setFilters(f => ({ ...f, risk: f.risk === 'critical' ? 'all' : 'critical' })) },
                { key: 'week', label: '7 days', active: Boolean(filters.dateFrom), toggle: () => setFilters(f => ({ ...f, dateFrom: f.dateFrom ? '' : sevenDaysAgo() })) },
                { key: 'escalated', label: 'Escalated', active: filters.escalated === 'true', toggle: () => setFilters(f => ({ ...f, escalated: f.escalated === 'true' ? 'all' : 'true' })) },
              ].map(p => (
                <Chip key={p.key} label={p.label} clickable onClick={p.toggle} aria-pressed={p.active} size="small"
                  sx={{
                    borderRadius: '999px', fontWeight: 600,
                    bgcolor: p.active ? BRAND.slate : 'transparent', color: p.active ? '#fff' : BRAND.text,
                    border: `1px solid ${p.active ? BRAND.slate : BRAND.border}`,
                    '&:hover': { bgcolor: p.active ? BRAND.slateHover : BRAND.section },
                  }} />
              ))}
            </Stack>
            {filtersActive && (
              <Button onClick={() => setFilters({ search: '', block: '', risk: 'all', escalated: 'all', dateFrom: '' })}
                sx={{ color: BRAND.textLight, flexShrink: 0 }}>
                Clear
              </Button>
            )}
          </Stack>
        </CardContent>
      </Card>

      {loadingHistory ? (
        <CircularProgress size={24} sx={{ color: BRAND.accent }} />
      ) : history.length === 0 ? (
        <Typography sx={{ color: BRAND.text }}>
          {filtersActive ? 'No assessments match these filters.' : 'No assessments logged yet.'}
        </Typography>
      ) : (
        <Paper variant="outlined" sx={{ border: `1px solid ${BRAND.border}`, borderRadius: '8px', overflow: 'hidden' }}>
          <Box tabIndex={0} role="region" aria-label="Recent assessments (scrollable)" sx={{ overflowX: 'auto', '&:focus-visible': { outline: `2px solid ${BRAND.accent}`, outlineOffset: '-2px' } }}>
          <Table size="small" sx={{ minWidth: 720 }}>
            <TableHead>
              <TableRow sx={{ bgcolor: BRAND.section }}>
                <TableCell sx={{ fontWeight: 700, color: BRAND.text, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 700, color: BRAND.text, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Location</TableCell>
                <TableCell sx={{ fontWeight: 700, color: BRAND.text, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Observation</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700, color: BRAND.text, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Risk</TableCell>
                <TableCell sx={{ fontWeight: 700, color: BRAND.text, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px' }}>State</TableCell>
                <TableCell sx={{ width: 44 }} aria-hidden />
              </TableRow>
            </TableHead>
            <TableBody>
              {history.map((h, i) => {
                const isOpen = selectedId === h.id;
                const loc = [h.block_number, h.floor_level].filter(Boolean).join(', ') || 'no location';
                const open = () => setSelectedId(h.id);
                const state = lifecycleOf(h);
                return (
                  // A <tr> can't be a <button>, so the row is an accessible button-role
                  // row: keyboard-activatable, aria-expanded, focus ring, 44px+ tall.
                  // Opens the lifecycle side panel (which traps focus / Escape-closes).
                  <TableRow
                    key={h.id}
                    hover
                    role="button"
                    tabIndex={0}
                    aria-expanded={isOpen}
                    aria-label={`Report at ${loc} on ${new Date(h.createdAt).toLocaleDateString('en-SG')}, ${h.risk_level} risk, ${state.label}. Open lifecycle`}
                    onClick={open}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
                    sx={{
                      cursor: 'pointer',
                      bgcolor: isOpen ? BRAND.navySoft : (i % 2 ? BRAND.section : 'inherit'),
                      // 48px minimum touch target: py 1.75 (14px) + line box
                      '& > td': { py: 1.75 },
                      '&:hover': { bgcolor: BRAND.navySoft },
                      '&:focus-visible': { outline: `2px solid ${BRAND.accent}`, outlineOffset: '-2px' },
                    }}
                  >
                    <TableCell sx={{ color: BRAND.text, whiteSpace: 'nowrap' }}>{new Date(h.createdAt).toLocaleDateString('en-SG')}</TableCell>

                    {/* Location merged into primary + secondary text in ONE cell, so
                        block and sub-location stop occupying separate columns. */}
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {h.block_number || h.floor_level ? (
                        <>
                          <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: BRAND.heading, lineHeight: 1.3 }}>
                            {h.block_number || 'Unlabelled'}
                          </Typography>
                          {h.floor_level && (
                            <Typography sx={{ fontSize: 11.5, color: BRAND.textLight, lineHeight: 1.3 }}>{h.floor_level}</Typography>
                          )}
                        </>
                      ) : (
                        <Box component="span" sx={{ color: BRAND.textLight }}>—</Box>
                      )}
                    </TableCell>

                    {/* snippet + attachment badge, so "Photo" no longer needs a column */}
                    <TableCell sx={{ maxWidth: 300 }}>
                      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                        <Tooltip title={h.observations || ''} arrow>
                          <Typography sx={{ fontSize: 13, color: BRAND.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'inherit' }}>
                            {h.observations}
                          </Typography>
                        </Tooltip>
                        {h.image_url && (
                          <Tooltip title="1 photo attached">
                            <Stack direction="row" spacing={0.2} sx={{ alignItems: 'center', flexShrink: 0, px: 0.6, py: '1px', borderRadius: '999px', bgcolor: BRAND.section, border: `1px solid ${BRAND.border}` }}>
                              <AttachFileRoundedIcon sx={{ fontSize: 12, color: BRAND.textLight }} />
                              <Typography sx={{ fontSize: 11, fontWeight: 700, color: BRAND.text }}>1</Typography>
                            </Stack>
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>

                    <TableCell align="center">
                      <Chip label={h.risk_level} size="small" sx={riskChipSx(h.risk_level)} />
                    </TableCell>
                    <TableCell><LifecyclePill state={state} /></TableCell>
                    <TableCell align="center" sx={{ width: 44 }}>
                      <KeyboardArrowRightRoundedIcon aria-hidden sx={{ fontSize: 20, color: isOpen ? BRAND.accent : BRAND.textLight }} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </Box>
        </Paper>
      )}

      {/* ⌘K quick search: focuses the same server-side search the toolbar drives, so
          there is one filter state, not two. */}
      <Dialog
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        fullWidth
        maxWidth="sm"
        slotProps={{ paper: { sx: { borderRadius: '12px', mt: -20 } } }}
      >
        <DialogContent sx={{ p: 2 }}>
          <TextField
            autoFocus
            fullWidth
            placeholder="Search assessment text…"
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') setPaletteOpen(false); }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ color: BRAND.textLight }} /></InputAdornment> } }}
          />
          <Typography sx={{ fontSize: 12, color: BRAND.textLight, mt: 1.25 }}>
            {loadingHistory ? 'Searching…' : `${total} match${total === 1 ? '' : 'es'}`} · Enter to close, Esc to cancel
          </Typography>
        </DialogContent>
      </Dialog>

      <AssessmentLifecyclePanel assessmentId={selectedId} open={Boolean(selectedId)} onClose={() => setSelectedId(null)} />
      </Box>
      {/* Inside the scroll region: the shell hides page-level overflow, so a footer
          outside this box could never be reached. */}
      <SiteFooter />
      </Box>
    </Box>
  );
}
