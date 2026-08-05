import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Stack, Alert, Collapse,
  IconButton, Tooltip, Table, TableHead, TableRow, TableCell, TableBody, Paper, Button,
  TextField, InputAdornment, Menu, MenuItem, Chip, Skeleton,
} from '@mui/material';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine, Tooltip as RTooltip, ResponsiveContainer,
} from 'recharts';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import CalendarTodayRoundedIcon from '@mui/icons-material/CalendarTodayRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import { useTheme } from '@mui/material/styles';
import { BRAND, TREND, INTENT, SVG_ACCENT } from '../theme';
import SiteFooter from '../components/SiteFooter';
import http from '../http';

const pct = n => (n == null ? '—' : `${Math.round(n * 100)}%`);
const money = n => `S$${(n || 0).toLocaleString('en-SG')}`;
const shortDate = iso => new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });

const TREND_WEEKS = [4, 8, 12];

/**
 * Outcome intent. STRICT semantics, matching the rest of the app: green = prevented,
 * red = recurred, amber = still monitoring, neutral = unmeasurable. Outcome keeps the
 * coloured pill; lifecycle status is demoted to muted text plus a dot, so the two
 * stop competing as identical-looking badges in adjacent columns.
 */
const OUTCOME_META = {
  prevented: { label: 'Prevented', intent: 'success' },
  recurred: { label: 'Recurred', intent: 'danger' },
  monitoring: { label: 'Monitoring', intent: 'warning' },
  unmeasurable: { label: 'No block', intent: 'neutral' },
};
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'prevented', label: 'Prevented' },
  { key: 'recurred', label: 'Recurred' },
  { key: 'monitoring', label: 'Monitoring' },
];

function OutcomePill({ outcome }) {
  const m = OUTCOME_META[outcome] || OUTCOME_META.monitoring;
  const t = INTENT[m.intent];
  return (
    <Box component="span" sx={{ display: 'inline-block', px: 1, py: '2px', borderRadius: '999px', bgcolor: t.bg, color: t.ink, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {m.label}
    </Box>
  );
}

// Status as muted text + dot, not a second pill.
function StatusText({ status }) {
  const closed = status === 'closed';
  const ok = SVG_ACCENT[useTheme().palette.mode].ok;
  return (
    <Stack direction="row" spacing={0.6} sx={{ alignItems: 'center' }}>
      <Box aria-hidden sx={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, bgcolor: closed ? ok : INTENT.neutral.solid }} />
      <Typography sx={{ fontSize: 12.5, color: BRAND.text, whiteSpace: 'nowrap' }}>{closed ? 'Closed' : 'Open'}</Typography>
    </Stack>
  );
}

/**
 * Reports before -> after, as a signed delta pill. "2 → 0" made the reader do the
 * subtraction; "-2 reports" states the result. Green only when reports actually fell,
 * red when they rose, neutral when flat or not yet judgeable.
 */
function DeltaPill({ before, after, outcome }) {
  if (outcome === 'monitoring' || after == null) {
    return <Typography sx={{ fontSize: 12.5, color: BRAND.textLight, fontStyle: 'italic' }}>too recent</Typography>;
  }
  const delta = after - before;
  const t = delta < 0 ? INTENT.success : delta > 0 ? INTENT.danger : INTENT.neutral;
  const word = Math.abs(delta) === 1 ? 'report' : 'reports';
  return (
    <Tooltip title={`${before} report${before === 1 ? '' : 's'} before, ${after} after`}>
      <Box component="span" sx={{ display: 'inline-block', px: 1, py: '2px', borderRadius: '999px', bgcolor: t.bg, color: t.ink, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', cursor: 'help' }}>
        {delta === 0 ? `No change (${before})` : `${delta > 0 ? '+' : '−'}${Math.abs(delta)} ${word}`}
      </Box>
    </Tooltip>
  );
}

/**
 * Impact completion as a semicircular gauge.
 *
 * The old full donut drew progress in BRAND red - red reads as failure or danger, not
 * as "60% of work is done". Progress is emerald now, and the three work-order states
 * are broken out underneath instead of being crammed into one grey sentence.
 */
function CompletionGauge({ value, closed, monitoring, open, total }) {
  const theme = useTheme();
  const ok = SVG_ACCENT[theme.palette.mode].ok;
  const cx = 100, cy = 100, r = 76, stroke = 18;
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const len = Math.PI * r;
  const frac = value == null ? 0 : Math.max(0, Math.min(1, value));

  const legend = [
    { n: closed, label: 'Closed', color: ok },
    { n: monitoring, label: 'Monitoring', color: INTENT.warning.solid },
    { n: open, label: 'Open', color: INTENT.neutral.solid },
  ];

  return (
    <Box>
      <Box sx={{ position: 'relative', maxWidth: 240, mx: 'auto' }}>
        <Box component="svg" viewBox="0 0 200 112" sx={{ display: 'block', width: '100%' }}
          role="img" aria-label={`${pct(value)} of work orders closed`}>
          <path d={arc} fill="none" stroke={theme.palette.background.default} strokeWidth={stroke} strokeLinecap="round" />
          <path
            d={arc} fill="none" stroke={ok} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${len} ${len}`} strokeDashoffset={len * (1 - frac)}
            style={{ transition: 'stroke-dashoffset .9s cubic-bezier(.34,1.2,.64,1)' }}
          />
        </Box>
        <Box sx={{ position: 'absolute', left: 0, right: 0, bottom: 4, textAlign: 'center', pointerEvents: 'none' }}>
          <Typography sx={{ fontSize: 40, fontWeight: 800, lineHeight: 1, color: BRAND.heading, letterSpacing: '-1.5px', fontVariantNumeric: 'tabular-nums' }}>
            {pct(value)}
          </Typography>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: BRAND.text }}>Closed</Typography>
        </Box>
      </Box>

      <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'center', flexWrap: 'wrap', rowGap: 1, mt: 1.5 }}>
        {legend.map(l => (
          <Stack key={l.label} direction="row" spacing={0.6} sx={{ alignItems: 'center' }}>
            <Box aria-hidden sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: l.color, flexShrink: 0 }} />
            <Typography sx={{ fontSize: 12.5, color: BRAND.text }}>
              <Box component="span" sx={{ fontWeight: 800, color: BRAND.heading, fontVariantNumeric: 'tabular-nums' }}>{l.n ?? 0}</Box> {l.label}
            </Typography>
          </Stack>
        ))}
      </Stack>
      <Typography sx={{ fontSize: 11.5, color: BRAND.textLight, textAlign: 'center', mt: 0.75 }}>
        {total} work order{total === 1 ? '' : 's'} total
      </Typography>
    </Box>
  );
}

// The hero metric: how much repeat rodent activity fell after interventions.
function HeroReduction({ value, prevented, measured }) {
  const known = value != null;
  const improved = known && value > 0; // reports fell -> good
  const trend = TREND[useTheme().palette.mode];
  const color = !known ? BRAND.textLight : improved ? trend.good : value < 0 ? trend.bad : BRAND.textLight;
  const Icon = improved ? TrendingDownRoundedIcon : TrendingUpRoundedIcon;
  return (
    <Card sx={{ height: '100%', bgcolor: BRAND.navySoft }}>
      <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.7px', textTransform: 'uppercase', color: BRAND.text }}>
            Repeat-risk reduction
          </Typography>
          <Tooltip arrow title="Rodent reports at each block in the follow-up window after an approved work order, compared with the equivalent window before it. Higher means recurrence fell.">
            <HelpOutlineRoundedIcon sx={{ fontSize: 14, color: BRAND.textLight, cursor: 'help' }} />
          </Tooltip>
        </Stack>

        {known ? (
          <>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', mt: 1 }}>
              {value !== 0 && <Icon sx={{ color, fontSize: 34, alignSelf: 'center' }} />}
              <Typography sx={{ fontSize: { xs: 56, md: 68 }, fontWeight: 800, lineHeight: 1, color, letterSpacing: '-3px', fontVariantNumeric: 'tabular-nums' }}>
                {pct(Math.abs(value))}
              </Typography>
            </Stack>
            <Typography sx={{ color: BRAND.text, fontSize: 15, fontWeight: 600, mt: 0.5 }}>
              {improved ? 'fewer repeat reports after action' : value < 0 ? 'more reports after action' : 'no measurable change'}
            </Typography>
            {/* Composition, not a period-over-period delta: the API exposes no prior
                figure, so a "vs previous period" badge would be invented. */}
            {measured > 0 && (
              <Box component="span" sx={{ alignSelf: 'flex-start', mt: 1.5, px: 1, py: '3px', borderRadius: '999px', bgcolor: INTENT.success.bg, color: INTENT.success.ink, fontSize: 12, fontWeight: 700 }}>
                {prevented} of {measured} interventions held with zero repeats
              </Box>
            )}
          </>
        ) : (
          <Box sx={{ mt: 1 }}>
            <Typography sx={{ fontSize: 26, fontWeight: 800, color: BRAND.textLight }}>Not enough data yet</Typography>
            <Typography sx={{ fontSize: 13, color: BRAND.text, mt: 0.5 }}>
              Interventions need a full follow-up window before recurrence can be judged.
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

// Secondary metric: label above, value below, one standard size.
function StatTile({ label, value, sub, tip }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 2.5 }}>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: BRAND.text, textTransform: 'uppercase', letterSpacing: '0.6px' }}>{label}</Typography>
          {tip && (
            <Tooltip arrow title={tip}>
              <HelpOutlineRoundedIcon sx={{ fontSize: 13, color: BRAND.textLight, cursor: 'help' }} />
            </Tooltip>
          )}
        </Stack>
        <Typography sx={{ fontSize: 28, fontWeight: 800, color: BRAND.heading, lineHeight: 1.15, mt: 0.75, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
        {sub && <Typography sx={{ fontSize: 12, color: BRAND.text, mt: 0.25 }}>{sub}</Typography>}
      </CardContent>
    </Card>
  );
}

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <Box sx={{ bgcolor: BRAND.surface, border: `1px solid ${BRAND.border}`, borderRadius: '8px', boxShadow: '0 12px 32px rgba(16,24,40,.15)', px: 1.5, py: 1 }}>
      <Typography sx={{ fontSize: 12, fontWeight: 700, color: BRAND.textLight, mb: 0.25 }}>Week of {label}</Typography>
      <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: BRAND.heading }}>
        {p.reports} report{p.reports === 1 ? '' : 's'}
      </Typography>
      {p.interventions > 0 && (
        <Typography sx={{ fontSize: 12, color: INTENT.success.ink, fontWeight: 600, mt: 0.25 }}>
          {p.interventions} intervention{p.interventions === 1 ? '' : 's'} approved this week
        </Typography>
      )}
    </Box>
  );
}

/**
 * Rodent reports per week, as a gradient area chart with an intervention layer.
 *
 * The annotations are the point of this chart: a dashed marker on every week where a
 * work order was approved turns "reports fell" into "reports fell after we acted".
 * Weeks are matched by bucketing each intervention date into the trend's own week
 * boundaries, so the markers cannot drift from the series.
 */
function TrendChart({ trend, interventions, weeks }) {
  const gradId = useId();
  const theme = useTheme();
  // #2E67B5 is only 2.84:1 on the dark card - under the 3:1 needed for a graphic.
  const LINE = SVG_ACCENT[theme.palette.mode]?.line || SVG_ACCENT.light.line;
  const OK = SVG_ACCENT[theme.palette.mode].ok;
  const data = useMemo(() => {
    const rows = (trend || []).map(w => ({
      label: shortDate(w.weekStart),
      start: new Date(w.weekStart).getTime(),
      reports: w.reports,
      interventions: 0,
    }));
    // bucket each intervention into the last week whose start is <= its date
    (interventions || []).forEach(i => {
      const t = new Date(i.date).getTime();
      let idx = -1;
      rows.forEach((r, k) => { if (t >= r.start) idx = k; });
      if (idx >= 0) rows[idx].interventions += 1;
    });
    return rows;
  }, [trend, interventions]);

  const total = data.reduce((s, d) => s + d.reports, 0);
  const marked = data.filter(d => d.interventions > 0);

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 3 }}>
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', rowGap: 0.5 }}>
          <Box>
            <Typography component="h2" variant="h6" fontWeight={700} sx={{ color: BRAND.heading }}>Rodent reports per week</Typography>
            <Typography variant="body2" sx={{ color: BRAND.textLight }}>
              Estate-wide volume over {weeks} weeks
            </Typography>
          </Box>
          {marked.length > 0 && (
            <Stack direction="row" spacing={0.6} sx={{ alignItems: 'center' }}>
              <Box aria-hidden sx={{ width: 0, height: 14, borderLeft: `2px dashed ${OK}` }} />
              <Typography sx={{ fontSize: 12, color: BRAND.text }}>
                Intervention approved ({marked.reduce((s, d) => s + d.interventions, 0)})
              </Typography>
            </Stack>
          )}
        </Stack>

        {total === 0 ? (
          <Typography variant="body2" sx={{ color: BRAND.textLight, py: 6, textAlign: 'center' }}>No rodent reports in this period.</Typography>
        ) : (
          <Box sx={{ mt: 2 }}>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data} margin={{ top: 16, right: 12, left: -18, bottom: 4 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={LINE} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={LINE} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                {/* dotted horizontal anchors + a real Y axis, so a peak has a value */}
                <CartesianGrid stroke={theme.palette.divider} strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: theme.palette.text.secondary }} axisLine={{ stroke: theme.palette.divider }} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
                <YAxis tick={{ fontSize: 12, fill: theme.palette.text.secondary }} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
                <RTooltip content={<ChartTip />} cursor={{ stroke: theme.palette.text.secondary, strokeDasharray: '3 3' }} />
                {marked.map(d => (
                  <ReferenceLine
                    key={d.label}
                    x={d.label}
                    stroke={OK}
                    strokeDasharray="4 4"
                    strokeWidth={2}
                    label={{ value: '▲', position: 'top', fill: OK, fontSize: 11 }}
                  />
                ))}
                <Area type="monotone" dataKey="reports" stroke={LINE} strokeWidth={2.5} fill={`url(#${gradId})`}
                  dot={{ r: 2.5, fill: theme.palette.background.paper, stroke: LINE, strokeWidth: 2 }} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

// Expandable row: the supporting numbers already in the payload, revealed on demand
// rather than adding columns or linking to a detail page that does not exist.
function InterventionRow({ i, index }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TableRow
        hover
        onClick={() => setOpen(o => !o)}
        sx={{
          cursor: 'pointer',
          bgcolor: index % 2 ? BRAND.section : 'inherit',
          '&:hover': { bgcolor: BRAND.navySoft },
          '& > td': { borderBottom: open ? 'none' : `1px solid ${BRAND.border}` },
        }}
      >
        <TableCell sx={{ color: BRAND.heading, fontWeight: 700, whiteSpace: 'nowrap' }}>{i.block || '(No block)'}</TableCell>
        <TableCell sx={{ color: BRAND.text, whiteSpace: 'nowrap' }}>{shortDate(i.date)}</TableCell>
        <TableCell align="right"><DeltaPill before={i.before} after={i.after} outcome={i.outcome} /></TableCell>
        <TableCell><OutcomePill outcome={i.outcome} /></TableCell>
        <TableCell><StatusText status={i.status} /></TableCell>
        <TableCell align="right" sx={{ width: 44 }}>
          <IconButton
            size="small"
            aria-label={open ? `Hide detail for ${i.block || 'this intervention'}` : `Show detail for ${i.block || 'this intervention'}`}
            aria-expanded={open}
            onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
            sx={{ p: 0.5, color: BRAND.text, bgcolor: open ? BRAND.navySoft : 'transparent', '&:hover': { bgcolor: BRAND.navySoft } }}
          >
            <ExpandMoreRoundedIcon sx={{ fontSize: 19, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
          </IconButton>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={6} sx={{ py: 0, borderBottom: `1px solid ${BRAND.border}` }}>
          <Collapse in={open} unmountOnExit>
            <Stack direction="row" spacing={3} sx={{ py: 1.5, px: 1, flexWrap: 'wrap', rowGap: 1 }}>
              <Box>
                <Typography sx={{ fontSize: 11, color: BRAND.textLight }}>Reports before → after</Typography>
                <Typography sx={{ fontSize: 13.5, color: BRAND.heading, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {i.before} → {i.outcome === 'monitoring' ? 'pending' : i.after}
                </Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: 11, color: BRAND.textLight }}>Consolidated reports</Typography>
                <Typography sx={{ fontSize: 13.5, color: BRAND.heading, fontWeight: 600 }}>
                  {i.consolidated_count > 1 ? `${i.consolidated_count} merged into one call-out` : 'Raised on its own'}
                </Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: 11, color: BRAND.textLight }}>Time to close</Typography>
                <Typography sx={{ fontSize: 13.5, color: BRAND.heading, fontWeight: 600 }}>
                  {i.close_days == null ? 'Not closed yet' : `${i.close_days} day${i.close_days === 1 ? '' : 's'}`}
                </Typography>
              </Box>
            </Stack>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

export default function PreventionScorecard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [weeks, setWeeks] = useState(8);
  const [weeksAnchor, setWeeksAnchor] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await http.get('/api/scorecard', { params: { trendWeeks: weeks } });
      setData(res.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load the prevention scorecard');
    } finally {
      setLoading(false);
    }
  }, [weeks]);

  useEffect(() => {
    // Fetching on mount/param change is the sanctioned use of an effect; the state
    // updates happen after the await, so the rule's warning is a false positive.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const s = data?.summary;
  const all = useMemo(() => data?.interventions || [], [data]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter(i => {
      if (filter !== 'all' && i.outcome !== filter) return false;
      if (q && !String(i.block || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [all, search, filter]);

  // CSV, not PDF: a PDF export needs a rendering dependency this build does not
  // carry. This is the same intervention table an exec summary would tabulate.
  function exportCsv() {
    const head = ['block', 'approved', 'reports_before', 'reports_after', 'outcome', 'status', 'close_days', 'consolidated_count'];
    const body = rows.map(i => [i.block || '', i.date, i.before, i.outcome === 'monitoring' ? '' : i.after, i.outcome, i.status, i.close_days ?? '', i.consolidated_count]);
    const csv = [head, ...body].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `prevention-scorecard-${weeks}w.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    /* FULL-HEIGHT SHELL, matching Notification Log and Alert Rules.
       This page was ordinary document flow, so on a tall screen its content stopped
       partway down and the rest of the viewport was empty app background - the page
       looked unfinished rather than complete. The shell owns the viewport: a header
       band that does not scroll, then one internal scroll region that carries the
       content and the footer. Registered in FULL_HEIGHT_PATHS in App.jsx, which is
       what supplies the 100dvh this height:100% resolves against. */
    <Box
      component="section"
      sx={{
        width: '100%', height: '100%', minHeight: 0,
        display: 'flex', flexDirection: 'column', bgcolor: BRAND.canvas,
      }}
    >
      {/* ── Header: one-line subtitle, methodology behind an info tooltip ────── */}
      <Stack
        direction="row"
        spacing={2}
        sx={{
          flexShrink: 0, justifyContent: 'space-between', alignItems: 'flex-start',
          flexWrap: 'wrap', rowGap: 1.5,
          px: { xs: 2, md: 3 }, pt: 2.5, pb: 2,
          bgcolor: BRAND.surface, borderBottom: `1px solid ${BRAND.border}`,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h1" sx={{ fontSize: 24, fontWeight: 700, color: BRAND.heading, letterSpacing: '-0.4px' }}>
            Prevention Scorecard
          </Typography>
          <Stack direction="row" spacing={0.6} sx={{ alignItems: 'center', mt: 0.25 }}>
            <Typography sx={{ fontSize: 13.5, color: BRAND.text }}>
              Did our interventions actually work?
            </Typography>
            <Tooltip
              arrow
              title={`Each approved work order is measured on whether rodent reports at that block fell in the ${data?.params?.windowDays ?? 14} days after action, versus the equivalent window before it. Outcomes, not activity volume. Interventions too recent to judge are held as "monitoring" rather than counted as successes.`}
            >
              <InfoOutlinedIcon sx={{ fontSize: 15, color: BRAND.textLight, cursor: 'help' }} />
            </Tooltip>
          </Stack>
        </Box>

        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexShrink: 0 }}>
          <Button
            onClick={e => setWeeksAnchor(e.currentTarget)}
            startIcon={<CalendarTodayRoundedIcon sx={{ fontSize: 17 }} />}
            endIcon={<ExpandMoreRoundedIcon />}
            aria-haspopup="listbox"
            sx={{ textTransform: 'none', fontWeight: 600, color: BRAND.heading, whiteSpace: 'nowrap', '&:hover': { bgcolor: BRAND.section } }}
          >
            Last {weeks} weeks
          </Button>
          <Menu anchorEl={weeksAnchor} open={Boolean(weeksAnchor)} onClose={() => setWeeksAnchor(null)}>
            {TREND_WEEKS.map(w => (
              <MenuItem key={w} selected={w === weeks} onClick={() => { setWeeks(w); setWeeksAnchor(null); }} sx={{ fontSize: 14 }}>
                Last {w} weeks
              </MenuItem>
            ))}
          </Menu>

          <IconButton onClick={load} disabled={loading} aria-label="Refresh" sx={{ color: BRAND.textLight, '&:hover': { color: BRAND.accent } }}>
            <RefreshRoundedIcon sx={{ fontSize: 19 }} />
          </IconButton>

          <Button
            onClick={exportCsv}
            disabled={loading || rows.length === 0}
            variant="outlined"
            startIcon={<FileDownloadOutlinedIcon />}
            sx={{ textTransform: 'none', fontWeight: 600, whiteSpace: 'nowrap', borderColor: BRAND.border, color: BRAND.text, '&:hover': { borderColor: BRAND.textLight } }}
          >
            Export summary
          </Button>

          {/* Interventions originate from approving escalations, so the action hook
              points there. There is deliberately no "log intervention" form here -
              that would bypass the human approval gate the queue exists to enforce. */}
          <Button
            component={RouterLink}
            to="/action-queue"
            variant="contained"
            endIcon={<ArrowForwardRoundedIcon />}
            sx={{ fontWeight: 700, whiteSpace: 'nowrap', bgcolor: BRAND.action, '&:hover': { bgcolor: BRAND.actionHover } }}
          >
            Review Action Queue
          </Button>
        </Stack>
      </Stack>

      {/* The one scroll region. `minHeight: 0` is load-bearing: without it a flex child
          refuses to shrink below its content and the whole shell grows instead of the
          inner box scrolling.

          NO MEASURE CAP. The old page root boxed this at 1440px centred, which left
          two empty gutters on a wide screen while the header band above ran edge to
          edge - the content read as floating inside the page rather than filling it.
          Padding only now, the same as Notification Log and Alert Rules, so the tables
          and card grids use the whole width. */}
      <Box sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto' }}>
      <Box sx={{ px: { xs: 2, md: 3 }, py: 3 }}>

      {error && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={load}>Retry</Button>}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.5fr 1fr 1fr 1fr' }, gap: 2.5 }}>
          {[0, 1, 2, 3].map(i => <Skeleton key={i} variant="rounded" height={i === 0 ? 210 : 120} />)}
        </Box>
      ) : !s ? null : (
        <>
          {/* ── Hero KPI: the dominant metric, then three standardised tiles ──── */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: '1.5fr 1fr 1fr 1fr' }, gap: 2.5, mb: 2.5, alignItems: 'stretch' }}>
            <HeroReduction value={s.repeat_risk_reduction} prevented={s.prevented} measured={s.measured} />
            <StatTile label="Prevention rate" value={pct(s.prevention_rate)} sub={`${s.prevented}/${s.measured} held, no repeat`} tip="Share of measured interventions with zero repeat reports in the follow-up window." />
            <StatTile label="Avg time to close" value={s.avg_time_to_close_days == null ? '—' : `${s.avg_time_to_close_days}d`} sub={`${s.closed_work_orders} closed`} />
            <StatTile label="Saved by consolidating" value={money(s.est_savings)} sub={`${s.call_outs_avoided} call-out${s.call_outs_avoided === 1 ? '' : 's'} avoided`} tip="Cumulative saving from merging multiple complaints into single call-outs in the Action Queue." />
          </Box>

          {/* ── Completion gauge + annotated trend ─────────────────────────────── */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 2fr' }, gap: 2.5, mb: 3, alignItems: 'stretch' }}>
            <Card sx={{ height: '100%' }}>
              <CardContent sx={{ p: 3 }}>
                <Typography component="h2" variant="h6" fontWeight={700} sx={{ color: BRAND.heading, mb: 0.25 }}>Impact completion</Typography>
                <Typography variant="body2" sx={{ color: BRAND.textLight, mb: 2 }}>Work orders closed off</Typography>
                <CompletionGauge
                  value={s.impact_completion}
                  closed={s.closed_work_orders}
                  monitoring={s.monitoring}
                  open={s.open_work_orders}
                  total={s.total_work_orders}
                />
              </CardContent>
            </Card>
            <TrendChart trend={data.trend} interventions={all} weeks={weeks} />
          </Box>

          {/* ── Interventions: toolbar, then the table ─────────────────────────── */}
          <Card sx={{ mb: 2 }}>
            <CardContent sx={{ p: 2 }}>
              <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'baseline', mb: 1.5, flexWrap: 'wrap', rowGap: 0.5 }}>
                <Typography component="h2" sx={{ fontSize: 16, fontWeight: 700, color: BRAND.heading }}>Interventions</Typography>
                <Typography sx={{ fontSize: 13, color: BRAND.text }}>
                  {rows.length} of {all.length} shown
                </Typography>
              </Stack>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ alignItems: { md: 'center' }, flexWrap: 'wrap', rowGap: 1.5 }}>
                <TextField
                  size="small" placeholder="Search block…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ fontSize: 18, color: BRAND.textLight }} /></InputAdornment> } }}
                  sx={{ flexGrow: 1, minWidth: 200 }}
                />
                <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
                  {FILTERS.map(f => {
                    const active = filter === f.key;
                    return (
                      <Chip
                        key={f.key} label={f.label} size="small" clickable aria-pressed={active}
                        onClick={() => setFilter(f.key)}
                        sx={{
                          borderRadius: '999px', fontWeight: 600,
                          bgcolor: active ? BRAND.slate : 'transparent', color: active ? '#fff' : BRAND.text,
                          border: `1px solid ${active ? BRAND.slate : BRAND.border}`,
                          '&:hover': { bgcolor: active ? BRAND.slateHover : BRAND.section },
                        }}
                      />
                    );
                  })}
                </Stack>
              </Stack>
            </CardContent>
          </Card>

          {all.length === 0 ? (
            <Card sx={{ border: `1px dashed ${BRAND.border}`, bgcolor: BRAND.section }}>
              <CardContent sx={{ py: 5, textAlign: 'center' }}>
                <Typography sx={{ color: BRAND.text }}>
                  No work orders raised yet. Approve escalations in the Action Queue and their prevention outcomes will appear here.
                </Typography>
                <Button component={RouterLink} to="/action-queue" variant="outlined" size="small" sx={{ mt: 2, textTransform: 'none' }}>
                  Open Action Queue
                </Button>
              </CardContent>
            </Card>
          ) : rows.length === 0 ? (
            <Typography sx={{ color: BRAND.text, py: 3, textAlign: 'center' }}>
              No interventions match this search or filter.
            </Typography>
          ) : (
            <Paper variant="outlined" sx={{ border: `1px solid ${BRAND.border}`, overflow: 'hidden' }}>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: 700 }}>
                  <TableHead>
                    <TableRow sx={{ bgcolor: BRAND.section }}>
                      {[
                        { l: 'Block', a: 'left', w: '22%' },
                        { l: 'Approved', a: 'left', w: '14%' },
                        { l: 'Change in reports', a: 'right', w: '22%' },
                        { l: 'Outcome', a: 'left', w: '18%' },
                        { l: 'Status', a: 'left', w: '16%' },
                        { l: '', a: 'right', w: '8%' },
                      ].map(h => (
                        <TableCell key={h.l || 'x'} align={h.a} width={h.w}
                          sx={{ fontWeight: 800, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.7px', color: BRAND.text, borderBottom: `2px solid ${BRAND.border}` }}>
                          {h.l}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((i, idx) => <InterventionRow key={i.id} i={i} index={idx} />)}
                  </TableBody>
                </Table>
              </Box>
            </Paper>
          )}

          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'flex-start', mt: 2 }}>
            <PlaceOutlinedIcon sx={{ fontSize: 16, color: BRAND.textLight, mt: '2px', flexShrink: 0 }} />
            <Typography sx={{ fontSize: 12, color: BRAND.textLight, lineHeight: 1.6 }}>
              Interventions without a recorded block cannot be measured for recurrence and are shown as “No block”.
              Rows marked “too recent” have not completed the follow-up window and are deliberately not counted as successes.
            </Typography>
          </Stack>
        </>
      )}
      </Box>
      {/* Inside the scroll region, like Notification Log and Alert Rules: the shell
          hides the page-level overflow, so a footer outside this box would be
          unreachable. */}
      <SiteFooter />
      </Box>
    </Box>
  );
}
