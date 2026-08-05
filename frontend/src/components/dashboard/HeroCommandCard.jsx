import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Card, CardContent, Stack, Typography, Skeleton, useMediaQuery,
  Tooltip as MuiTooltip, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded';
import { useTheme, alpha } from '@mui/material/styles';
import {
  ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { BRAND, HEALTH_META, TREND, SURFACE, SVG_ACCENT, RADII, surfaceSx } from '../../theme';
import { Spark } from './KpiStack';

// HEALTHY_MAX / WATCH_MAX went with RiskGauge - the band thresholds were only ever
// used to draw its three arcs. HEALTH_META still carries the band name and colour.
const RANGES = [7, 30, 90];

/**
 * Two cards live in this file: the risk index and the activity trend. They were one
 * merged hero card; they were split so the risk index can sit in a row of equal KPI
 * cards and the trend can have a row of its own.
 *
 * THE CHART SERIES ARE PRIMARY-PLUS-NEUTRAL, not NEON - see SERIES. The risk band uses the
 * SEMANTIC status inks, because which band the risk sits in is a status claim and this
 * codebase reserves red/amber/green for exactly that. Chrome stays crimson and navy.
 */

// Count-up from 0 on mount, then tweening from wherever it already is, so a 60s poll
// nudging 76 to 77 never flashes the figure back through zero. Collapses to one frame
// under reduced motion, which the global CSS rule cannot reach - this is rAF arithmetic.
function useCountUp(target, duration = 900) {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)', { noSsr: true });
  const numeric = typeof target === 'number' && Number.isFinite(target);
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);
  const frame = useRef(null);
  useEffect(() => {
    if (!numeric || shownRef.current === target) return undefined;
    const from = shownRef.current;
    const span = reduced ? 0 : duration;
    const start = performance.now();
    const step = (now) => {
      const t = span === 0 ? 1 : Math.min((now - start) / span, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = t === 1 ? target : Math.round(from + (target - from) * eased);
      shownRef.current = next;
      setShown(next);
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => { if (frame.current) cancelAnimationFrame(frame.current); };
  }, [target, duration, numeric, reduced]);
  return numeric ? shown : 0;
}

// Movement pill. TREND's colour is a MEASURED good/bad for this metric, so green here is
// status doing its job rather than decoration. Arrow carries direction, so hue is never
// the only cue. A measured zero is a dash; no comparison at all is an em-dash.
function DeltaPill({ delta, improve = 'down', label }) {
  const trend = TREND[useTheme().palette.mode] || TREND.light;
  if (delta == null) {
    return (
      <MuiTooltip title={`No week-old snapshot yet, so ${label} has nothing to compare against`}>
        <Typography component="span" sx={{ fontSize: 13, fontWeight: 700, color: trend.neutral, cursor: 'help' }}>—</Typography>
      </MuiTooltip>
    );
  }
  const flat = delta === 0;
  const good = improve === 'down' ? delta < 0 : delta > 0;
  const color = flat ? trend.neutral : good ? trend.good : trend.bad;
  const Icon = flat ? RemoveRoundedIcon : delta < 0 ? ArrowDownwardRoundedIcon : ArrowUpwardRoundedIcon;
  return (
    <MuiTooltip title={`${delta > 0 ? '+' : ''}${delta} vs the same day last week`}>
      <Stack direction="row" spacing={0.3}
        aria-label={`${label}: ${flat ? 'no change' : delta < 0 ? 'down' : 'up'} ${Math.abs(delta)} versus last week`}
        sx={{
          alignItems: 'center', cursor: 'help', flexShrink: 0,
          px: 1.1, py: 0.4, borderRadius: `${RADII.pill}px`,
          bgcolor: alpha(color, 0.16), color,
          fontSize: 12.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
        }}>
        <Icon sx={{ fontSize: 14 }} aria-hidden />
        <span>{flat ? 'no change' : Math.abs(delta)}</span>
      </Stack>
    </MuiTooltip>
  );
}

const dayOf = iso => String(iso).slice(8, 10).replace(/^0/, '');
const fmtDay = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
};

/**
 * ONE HIGH-CONTRAST PANEL AT THE CROSSHAIR, not two floating chips.
 *
 * The chips read as labels attached to the two lines, which was the intent, but they had a
 * defect that mattered more than the styling: the payload was FILTERED to numeric values,
 * so on a day where one series had no reading, that series silently vanished from the
 * readout. A tooltip whose job is "the exact numbers for both series on this day" cannot
 * quietly drop one of them - the reader has no way to tell "zero" from "not shown".
 *
 * Both series are now always listed, in a fixed order, with an em-dash where there is no
 * reading. Fixed order matters too: recharts hands over the payload in render order, so a
 * changing sequence would have moved the rows around under the pointer.
 *
 * STARK, because it sits on top of the chart's own gradients and gridlines. A translucent
 * or lightly-bordered panel over a filled area chart is unreadable at the crossing points,
 * which is exactly where a reader most wants a number - hence a solid surface, a full
 * border and a hard shadow rather than the soft chip treatment.
 */
function CrosshairChips({ active, payload, label, series = [] }) {
  if (!active || !payload?.length) return null;
  const valueOf = key => {
    const hit = payload.find(p => p.dataKey === key);
    return typeof hit?.value === 'number' ? hit.value : null;
  };
  return (
    <Box
      sx={{
        bgcolor: BRAND.surface,
        border: `1px solid ${BRAND.border}`,
        borderRadius: `${RADII.inset}px`,
        boxShadow: '0 10px 24px -8px rgba(16,24,40,.45), 0 2px 6px -2px rgba(16,24,40,.25)',
        px: 1.25, py: 1, minWidth: 156,
      }}
    >
      <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: BRAND.textLight, mb: 0.6, letterSpacing: '0.3px' }}>
        {fmtDay(label)}
      </Typography>
      <Stack spacing={0.4}>
        {series.map(sr => {
          const v = valueOf(sr.key);
          return (
            <Stack key={sr.key} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
              <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: sr.color, flexShrink: 0 }} />
              <Typography sx={{ fontSize: 12, color: BRAND.text, flexGrow: 1, whiteSpace: 'nowrap' }}>
                {sr.name}
              </Typography>
              <Typography
                sx={{
                  fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                  color: v == null ? BRAND.textLight : BRAND.heading,
                }}
              >
                {v == null ? '—' : v}
              </Typography>
            </Stack>
          );
        })}
      </Stack>
    </Box>
  );
}

/**
 * THE RISK INDEX, AS ITS OWN CARD.
 *
 * The gauge and the activity chart used to share one full-width card - "instrument
 * left, trend right". They are separated so the risk index can lead a row of equal
 * KPI cards (it is the most important single figure on the page, so it takes the
 * first slot, top-left, where the eye lands) and the chart can have the full width
 * to itself underneath.
 *
 * COMPACT AND TYPOGRAPHIC, so the hero row is four cards of equal height.
 *
 * It used to carry a 148px gauge AND the Prevention impact block, which made it tower
 * over the three plain KPI tiles beside it and left a band of dead space under them.
 * The gauge is gone entirely - a 270-degree arc to render one two-digit number - and
 * Prevention impact moved out to PreventionImpactCard. What is left is the score set
 * like the other tiles' figures, plus a dot and the band name. `scorecard` went with
 * the Prevention block; this card reads only estateHealth now.
 */
export function RiskIndexCard({ estateHealth, scoreSeries = null, loading = false }) {
  const mode = useTheme().palette.mode;
  const meta = HEALTH_META[estateHealth?.status] || HEALTH_META.watch;
  const hasScore = estateHealth != null && typeof estateHealth.score === 'number';
  const score = hasScore ? estateHealth.score : 0;
  const animated = useCountUp(score);

  return (
    <Card sx={{ ...surfaceSx(mode, 'card'), height: '100%' }}>
      <CardContent sx={{ p: { xs: 2.25, md: 2.75 }, '&:last-child': { pb: { xs: 2.25, md: 2.75 } } }}>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 1.5 }}>
              {/* Same label treatment as the three KPI tiles beside it - 11px, 700,
                  uppercase, tracked, muted. It was 15px/600 in heading ink, which read as
                  a card TITLE while the others read as field labels, so the first cell
                  looked like a different kind of component. */}
              <Typography
                component="h2"
                sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: BRAND.textLight }}
              >
                Estate Risk Index
              </Typography>
              <MuiTooltip
                arrow
                title="A weighted 0-100 index of three shares: flora health (45%), the share of cases still open (35%) and hotspot pressure (20%). Because it reads shares rather than raw counts, a larger estate with the same number of problems scores lower. Higher means more needs attention. Bands: Healthy under 25, Monitor 25-59, Needs Attention 60 and above."
              >
                <InfoOutlinedIcon sx={{ fontSize: 15, color: BRAND.textLight, cursor: 'help', flexShrink: 0 }} />
              </MuiTooltip>
            </Stack>

            {/* TYPOGRAPHY, NOT A GAUGE.
                The 270-degree arc is gone. It spent a whole card's height drawing one
                two-digit number, which is what made this cell tower over the three KPI
                tiles beside it and left a band of dead space under them. It also read
                muddy: three translucent band arcs under a progress arc is a lot of ink
                for "48".
                The band is now a coloured dot beside the label, and the score is set
                like the other tiles' figures - same size, same weight, same tabular
                numerals - so the row reads as four of a kind. The dot is never the only
                cue: the band name is written next to it. */}
            {loading && !hasScore ? (
              <Skeleton variant="text" width={120} height={52} />
            ) : hasScore ? (
              <Box>
                <Stack direction="row" spacing={0.4} sx={{ alignItems: 'baseline' }}>
                  <Typography
                    sx={{
                      fontSize: 40, fontWeight: 700, lineHeight: 1, letterSpacing: '-1.4px',
                      color: BRAND.heading, fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {animated}
                  </Typography>
                  <Typography sx={{ fontSize: 14, fontWeight: 600, color: BRAND.textLight }}>/100</Typography>
                </Stack>
                <Stack direction="row" spacing={0.7} sx={{ alignItems: 'center', mt: 1 }}>
                  <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: meta.display, flexShrink: 0 }} />
                  <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: BRAND.text }}>{meta.label}</Typography>
                </Stack>
                {/* The score's own history, in the band's colour. Parity with the three
                    tiles beside it: without this the risk card was the one cell with a
                    sparse lower half, and stretching the row to equal heights made that
                    empty space bigger rather than smaller. */}
                <Spark series={scoreSeries} color={meta.display} />
              </Box>
            ) : (
              <Box sx={{ py: 4, textAlign: 'center' }}>
                <Typography sx={{ fontSize: 30, fontWeight: 700, color: BRAND.textLight, lineHeight: 1.15 }}>No data</Typography>
                <Typography sx={{ fontSize: 12.5, color: BRAND.textLight, mt: 0.75 }}>
                  No scored data yet - this is not a healthy reading, it is an absent one.
                </Typography>
              </Box>
            )}

          </Box>
      </CardContent>
    </Card>
  );
}

/**
 * PREVENTION IMPACT, as its own card.
 *
 * These figures were an inset block inside the risk card, which is what made that card
 * tower over the three KPI tiles beside it. They are not a risk reading - they answer
 * "what has the programme bought you" - so they earn their own cell rather than being
 * stapled under a gauge. Kept at 20px: the risk score says how bad things are, but
 * "90% fewer repeats" and "S$640 saved" are what the service is judged on.
 */
export function PreventionImpactCard({ scorecard = null }) {
  const mode = useTheme().palette.mode;
  const trend = TREND[mode] || TREND.light;
  const sum = scorecard?.summary;
  const repeat = sum?.repeat_risk_reduction;

  return (
    <Card sx={{ ...surfaceSx(mode, 'card'), height: '100%' }}>
      <CardContent sx={{ p: { xs: 2.25, md: 2.75 }, '&:last-child': { pb: { xs: 2.25, md: 2.75 } } }}>
        <Typography
          component="h2"
          sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: BRAND.textLight, mb: 1.5 }}
        >
          Prevention impact
        </Typography>
        {repeat != null ? (
          <Stack spacing={1.5}>
            {[
              {
                v: `${Math.round(Math.abs(repeat) * 100)}%`,
                l: repeat > 0 ? 'fewer repeat cases' : 'change in repeats',
                ink: repeat > 0 ? trend.good : BRAND.heading,
              },
              { v: `S$${(sum.est_savings || 0).toLocaleString('en-SG')}`, l: 'estimated savings', ink: BRAND.heading },
              { v: sum.call_outs_avoided, l: 'call-outs avoided', ink: BRAND.heading },
            ].map(c => (
              <Stack key={c.l} direction="row" spacing={1} sx={{ alignItems: 'baseline', justifyContent: 'space-between' }}>
                <Typography sx={{ fontSize: 12.5, color: BRAND.text, minWidth: 0 }}>{c.l}</Typography>
                <Typography
                  sx={{
                    fontSize: 20, fontWeight: 700, lineHeight: 1.1, color: c.ink,
                    fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.4px', flexShrink: 0,
                  }}
                >
                  {c.v}
                </Typography>
              </Stack>
            ))}
          </Stack>
        ) : !scorecard ? (
          <Stack spacing={1.5}>
            {[0, 1, 2].map(i => <Skeleton key={i} variant="text" height={28} />)}
          </Stack>
        ) : (
          <Typography sx={{ fontSize: 12, color: BRAND.textLight, lineHeight: 1.5 }}>
            Prevention impact not measurable yet - close out work orders to start tracking it.
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * ESTATE ACTIVITY, FULL WIDTH.
 *
 * Was the right-hand column of the old merged hero, sharing the row with the gauge.
 * On its own row it gets the whole measure, which is what a time series wants - more
 * horizontal room per day means the daily readings stop crowding each other.
 */
export default function ActivityCard({
  trends = null, history = [], sightingsByDay = [], openCases = 0,
  windowDays = 7, onWindowChange,
}) {
  const mode = useTheme().palette.mode;
  const s = SURFACE[mode] || SURFACE.dark;
  const svg = SVG_ACCENT[mode] || SVG_ACCENT.dark;
  const trendInk = TREND[mode] || TREND.light;

  /**
   * PRIMARY BLUE + NEUTRAL SLATE, not cyan + purple.
   *
   * Two volume series on one plot genuinely need two separable inks, and only one of them
   * can be "the" blue - which is the honest reason a second data hue existed here at all.
   * But cyan and purple were two hues appearing nowhere else in the product, and they are
   * most of why this page read as having no palette.
   *
   * So it is primary-plus-neutral: open cases takes the action blue, because it is the
   * series the card's headline figure states and the one the queue CTA acts on, and
   * sightings take a slate. Distinguishable without spending a colour on a series that
   * carries no status.
   */
  const SERIES = [
    { key: 'openCases', name: 'Open cases', color: svg.info },
    { key: 'sightingsDaily', name: 'Sightings logged', color: trendInk.neutral },
  ];

  const data = useMemo(() => {
    const byDate = new Map((sightingsByDay || []).map(d => [d.date, d.count]));
    return history.map(h => ({
      ...h, label: h.date,
      sightingsDaily: byDate.has(h.date) ? byDate.get(h.date) : undefined,
    }));
  }, [history, sightingsByDay]);

  /**
   * Y-AXIS CEILING, COMPUTED FROM THE DATA.
   *
   * `domain={[0,'auto']}` with tickCount 5 let recharts round up to its own "nice"
   * number: with a peak of 5 it chose 8, so roughly 37% of the plot was permanently
   * empty sky above the highest reading. That is where a large part of this card's
   * white space was coming from - not the padding.
   *
   * One step of headroom so the peak is not flush against the top edge, then rounded up
   * to an even number so the ticks stay whole (no 3.5 sightings). Still zero-based: the
   * fill encodes magnitude by area, so a cropped baseline would exaggerate differences.
   */
  const yMax = useMemo(() => {
    const vals = data.flatMap(d => [d.openCases, d.sightingsDaily])
      .filter(v => typeof v === 'number' && Number.isFinite(v));
    const peak = vals.length ? Math.max(...vals) : 0;
    return Math.max(4, Math.ceil((peak + 1) / 2) * 2);
  }, [data]);

  const gridInk = mode === 'dark' ? 'rgba(255,255,255,0.08)' : '#E0E0E0';
  const axisInk = BRAND.textLight;
  const tickInterval = data.length > 16 ? Math.ceil(data.length / 10) : 0;

  return (
    <Card sx={{ ...surfaceSx(mode, 'card'), height: '100%' }}>
      <CardContent sx={{ p: { xs: 2.25, md: 3 }, '&:last-child': { pb: { xs: 2.25, md: 3 } } }}>
          <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
                <Typography component="h2" sx={{ fontSize: 15, fontWeight: 600, color: BRAND.heading }}>
                  Estate Activity
                </Typography>
                <MuiTooltip
                  arrow
                  title="The filled blue line is open cases still outstanding at the end of each day - a backlog that carries over. The grey line is sightings logged on that day - a count of events. Both are plain counts on ONE shared axis, so their heights are directly comparable. Only the backlog is filled, because only a level has a meaningful area beneath it."
                >
                  <InfoOutlinedIcon sx={{ fontSize: 15, color: BRAND.textLight, cursor: 'help', flexShrink: 0 }} />
                </MuiTooltip>
              </Stack>

              {onWindowChange && (
                <ToggleButtonGroup
                  value={windowDays}
                  exclusive
                  onChange={(_e, v) => v && onWindowChange(v)}
                  size="small"
                  aria-label="Time range"
                  /* TIGHTER SEGMENTED PILL.
                     The selected segment used to be `s.raised` on an `s.inset` track -
                     two near-identical greys, so which range was active was genuinely
                     hard to see. It now lifts to the CARD colour with a soft shadow, the
                     way a segmented control reads on both reference dashboards: the
                     active pill looks like it sits above the track rather than being a
                     slightly different shade of it.
                     Track padding drops 3px -> 2px and the segments tighten, so the group
                     reads as one control instead of three small buttons. Deliberately
                     built from scheme tokens, so the same lift works in light and dark. */
                  sx={{
                    bgcolor: s.inset, borderRadius: `${RADII.pill}px`, p: '2px', gap: '2px',
                    '& .MuiToggleButtonGroup-grouped': {
                      border: 0, marginLeft: 0, px: 1.5, py: 0.35, minWidth: 40,
                      borderRadius: `${RADII.pill}px !important`,
                      textTransform: 'none', fontSize: 12, fontWeight: 600, color: BRAND.textLight,
                      transition: 'background-color .15s ease, color .15s ease, box-shadow .15s ease',
                      '&:hover': { bgcolor: 'transparent', color: BRAND.heading },
                      '&.Mui-selected': {
                        bgcolor: s.card, color: BRAND.heading, fontWeight: 700,
                        boxShadow: mode === 'dark'
                          ? '0 1px 2px rgba(0,0,0,.45)'
                          : '0 1px 2px rgba(16,24,40,.10)',
                        '&:hover': { bgcolor: s.card },
                      },
                      '&:focus-visible': { outline: `2px solid ${BRAND.accent}`, outlineOffset: 1 },
                    },
                  }}
                >
                  {[...new Set([...RANGES, windowDays])].sort((a, b) => a - b).map(d => (
                    <ToggleButton key={d} value={d} aria-label={`Last ${d} days`}>{d}d</ToggleButton>
                  ))}
                </ToggleButtonGroup>
              )}
            </Stack>

            {/* HEADLINE FIGURE, SCALED UP.
                32/38px next to a 40px KPI tile made the page's most important running
                number smaller than its supporting ones. At 44/56 it is unambiguously the
                largest thing on the card, and the unit drops to a quiet caption beneath
                rather than sitting on the baseline competing with it - the treatment the
                reference dashboards use for their headline currency figure.
                Movement stays in the pill beside it, so the number itself carries no
                colour and reads at a glance in either scheme. */}
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-end', flexWrap: 'wrap', rowGap: 0.75, mb: 2 }}>
              <Box>
                <Typography
                  sx={{
                    fontSize: { xs: 44, md: 56 }, fontWeight: 700, lineHeight: 0.95,
                    letterSpacing: '-2px', color: BRAND.heading, fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {openCases}
                </Typography>
                <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: BRAND.textLight, mt: 0.25 }}>
                  open cases
                </Typography>
              </Box>
              <Box sx={{ pb: 0.5 }}>
                <DeltaPill delta={trends?.open_cases?.sinceLastWeek ?? null} improve="down" label="Open cases" />
              </Box>
            </Stack>

            {/* The inset well the chart lives in. */}
            {/* pt was 2 on top of the card's own padding and the headline's mb - three
                stacked gaps above a 232px plot. One is enough. */}
            <Box sx={{ ...surfaceSx(mode, 'inset'), p: { xs: 0.75, md: 1.25 }, pt: 1, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
              {data.length === 0 ? (
                <Typography sx={{ fontSize: 13, color: BRAND.textLight, py: 8, textAlign: 'center' }}>
                  No activity history yet.
                </Typography>
              ) : (
                <ResponsiveContainer width="100%" height={232}>
                  <ComposedChart data={data} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
                    {/* One gradient per series, fading to near-transparent at the
                        baseline so the fill reads as depth under the line rather than a
                        block competing with it. Restored on request after being removed;
                        kept low (28% -> 2%) so two overlapping washes stay legible where
                        the series cross. */}
                    <defs>
                      {SERIES.map(sr => (
                        <linearGradient key={sr.key} id={`act-${sr.key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={sr.color} stopOpacity={0.28} />
                          <stop offset="100%" stopColor={sr.color} stopOpacity={0.02} />
                        </linearGradient>
                      ))}
                    </defs>
                    {/* Dashed, and deliberately fainter than the old solid rule.
                        The previous note here argued a dashed rule at this weight competes
                        with the data - true at full strength, so the opacity drops to
                        compensate: the grid is now a hint you can read a value off rather
                        than a set of lines you notice. */}
                    <CartesianGrid stroke={gridInk} strokeDasharray="3 5" strokeOpacity={0.7} vertical={false} />
                    {/* 12px, not 11. These are the only labels that say what the plot is
                        measuring, and below 12px they stop being reliably legible - the
                        same floor the "vs last week" caption was raised to. */}
                    <XAxis dataKey="label" tickFormatter={dayOf} tick={{ fontSize: 12, fill: axisInk }}
                      axisLine={false} tickLine={false} interval={tickInterval} minTickGap={6} dy={6} />
                    <YAxis tick={{ fontSize: 12, fill: axisInk }} axisLine={false} tickLine={false}
                      allowDecimals={false} width={38}
                      ticks={Array.from({ length: yMax / 2 + 1 }, (_, i) => i * 2)}
                      // zero-based: the filled series encodes magnitude by area, so a
                      // cropped baseline would exaggerate every difference
                      domain={[0, yMax]} />
                    <Tooltip
                      // 1.5px at full opacity, dashed. At 1px/0.5 the crosshair was
                      // fainter than the gridlines it crossed, so on hover there was no
                      // clear indication of WHICH day the panel was reporting.
                      cursor={{ stroke: BRAND.textLight, strokeWidth: 1.5, strokeDasharray: '4 4' }}
                      content={<CrosshairChips series={SERIES} />}
                      animationDuration={140}
                    />
                    {/* AREA FILL + SMOOTHING, both restored on request.
                        One caveat recorded rather than argued again: `monotone` bends the
                        path between daily samples, so part of the drawn curve sits at
                        values that were never measured. On a 7-point series that is a
                        meaningful share of the ink. The dots are kept ON for exactly that
                        reason - they mark where a real reading exists, so the curve is
                        decoration between them rather than a claim. */}
                    {SERIES.map(sr => (
                      <Area
                        key={sr.key}
                        type="monotone"
                        dataKey={sr.key}
                        name={sr.name}
                        stroke={sr.color}
                        strokeWidth={2.25}
                        fill={`url(#act-${sr.key})`}
                        fillOpacity={1}
                        dot={{ r: 2.5, fill: sr.color, strokeWidth: 0 }}
                        activeDot={{ r: 5, fill: sr.color, stroke: s.inset, strokeWidth: 2.5 }}
                        isAnimationActive={false}
                      />
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>
              )}

              {/* Dot legend, bottom right. */}
              <Stack direction="row" spacing={2} sx={{ mt: 0.5, justifyContent: 'flex-end', flexWrap: 'wrap', rowGap: 0.5, px: 1, pb: 0.5 }}>
                {SERIES.map(sr => (
                  <Stack key={sr.key} direction="row" spacing={0.6} sx={{ alignItems: 'center' }}>
                    {/* Plain dot. The glow() halo went with the gradient fill - it was
                        the same decoration at smaller scale, and a legend swatch only
                        needs to identify a colour. */}
                    <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: sr.color, flexShrink: 0 }} />
                    <Typography sx={{ fontSize: 11.5, color: BRAND.textLight }}>{sr.name}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          </Box>
      </CardContent>
    </Card>
  );
}
