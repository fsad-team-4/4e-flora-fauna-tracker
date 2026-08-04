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
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { BRAND, HEALTH_META, GAUGE_ZONES, TREND, SURFACE, NEON, RADII, surfaceSx, glow } from '../../theme';

const HEALTHY_MAX = 25;
const WATCH_MAX = 60;
const RANGES = [7, 30, 90];

/**
 * ONE HERO CARD, replacing two.
 *
 * The risk index and the activity chart were separate full-width cards, each spending a
 * lot of vertical space on one idea. Merged, the card answers "how bad is it" and "what
 * has it been doing" in a single glance, and the page gets a screen back.
 *
 * NEON IS SCOPED TO THE DATA LAYER. The two series are cyan and purple with a glow; the
 * gauge stays on the SEMANTIC status inks, because which band the risk sits in is a
 * status claim and this codebase reserves red/amber/green for exactly that. Chrome -
 * buttons, nav, the CTA - stays EM Services crimson and navy elsewhere.
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

/**
 * 270-degree gauge. Two layers: the three REAL threshold bands as a quiet track, and a
 * bright progress arc up to the score. So it answers both "how full" and "which band" -
 * a plain ring answers only the first, coloured segments only the second.
 */
function RiskGauge({ score, animated, meta, size = 148 }) {
  const mode = useTheme().palette.mode;
  const s = SURFACE[mode] || SURFACE.dark;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const START = 135, SWEEP = 270;
  const point = (pct) => {
    const rad = ((START + (SWEEP * Math.max(0, Math.min(100, pct))) / 100) * Math.PI) / 180;
    return [c + r * Math.cos(rad), c + r * Math.sin(rad)];
  };
  const arc = (from, to) => {
    const [x1, y1] = point(from);
    const [x2, y2] = point(to);
    const large = ((to - from) / 100) * SWEEP > 180 ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };
  const bands = [
    { key: 'healthy', from: 0, to: HEALTHY_MAX, ...GAUGE_ZONES.healthy },
    { key: 'watch', from: HEALTHY_MAX, to: WATCH_MAX, ...GAUGE_ZONES.watch },
    { key: 'critical', from: WATCH_MAX, to: 100, ...GAUGE_ZONES.critical },
  ];

  return (
    <Box sx={{ position: 'relative', width: size, height: size, flexShrink: 0, mx: 'auto' }}>
      <Box
        component="svg"
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Estate risk index ${score} of 100, in the ${meta.label} band. Bands: ${bands.map(b => `${b.label} ${b.from} to ${b.to === 100 ? 100 : b.to - 1}`).join(', ')}.`}
        sx={{
          width: size, height: size, display: 'block',
          // the glow sits on the ARC, not on a box behind the card
          filter: mode === 'dark' ? `drop-shadow(0 0 10px ${alpha(meta.ink, 0.45)})` : 'none',
        }}
      >
        <path d={arc(0, 100)} fill="none" stroke={s.raised} strokeWidth={stroke} strokeLinecap="round" />
        {bands.map(b => (
          <path key={b.key} d={arc(b.from, b.to)} fill="none" stroke={b.fill}
            strokeOpacity={mode === 'dark' ? 0.2 : 0.16} strokeWidth={stroke} strokeLinecap="butt" />
        ))}
        <path d={arc(0, Math.max(animated, 0.6))} fill="none" stroke={meta.display}
          strokeWidth={stroke} strokeLinecap="round" />
      </Box>
      <Stack sx={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <Stack direction="row" spacing={0.3} sx={{ alignItems: 'baseline' }}>
          <Typography sx={{ fontSize: 40, fontWeight: 700, lineHeight: 1, letterSpacing: '-1.6px', color: BRAND.heading, fontVariantNumeric: 'tabular-nums' }}>
            {animated}
          </Typography>
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: BRAND.textLight }}>/100</Typography>
        </Stack>
        <Typography sx={{ mt: 0.3, fontSize: 11, fontWeight: 700, color: meta.display, textAlign: 'center' }}>
          {meta.label}
        </Typography>
      </Stack>
    </Box>
  );
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

// Floating value chips at the crosshair, the reference's treatment - they read as labels
// attached to the two lines rather than as a panel appearing over the chart.
function CrosshairChips({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <Box>
      <Stack direction="row" spacing={0.75} sx={{ mb: 0.5 }}>
        {payload.filter(p => typeof p.value === 'number').map(p => (
          <Stack key={p.dataKey} direction="row" spacing={0.6}
            sx={{
              alignItems: 'center', bgcolor: BRAND.surface, borderRadius: `${RADII.pill}px`,
              px: 1.1, py: 0.5, boxShadow: '0 6px 18px -6px rgba(0,0,0,.5)',
            }}>
            <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: p.color, flexShrink: 0 }} />
            <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: BRAND.heading, fontVariantNumeric: 'tabular-nums' }}>
              {p.value}
            </Typography>
            <Typography sx={{ fontSize: 11, color: BRAND.textLight, whiteSpace: 'nowrap' }}>
              {p.dataKey === 'openCases' ? 'open' : 'sightings'}
            </Typography>
          </Stack>
        ))}
      </Stack>
      <Typography sx={{ fontSize: 11, color: BRAND.textLight, textAlign: 'center' }}>{fmtDay(label)}</Typography>
    </Box>
  );
}

export default function HeroCommandCard({
  estateHealth, scorecard = null, trends = null,
  history = [], sightingsByDay = [], openCases = 0,
  windowDays = 7, onWindowChange, loading = false,
}) {
  const mode = useTheme().palette.mode;
  const s = SURFACE[mode] || SURFACE.dark;
  const n = NEON[mode] || NEON.dark;
  const trend = TREND[mode] || TREND.light;
  const meta = HEALTH_META[estateHealth?.status] || HEALTH_META.watch;
  const hasScore = estateHealth != null && typeof estateHealth.score === 'number';
  const score = hasScore ? estateHealth.score : 0;
  const animated = useCountUp(score);

  // Cyan for the backlog, purple for the daily events. Both non-semantic, so neither
  // can be misread as a status.
  const SERIES = [
    { key: 'openCases', name: 'Open cases', color: n.cyan },
    { key: 'sightingsDaily', name: 'Sightings logged', color: n.purple },
  ];

  const data = useMemo(() => {
    const byDate = new Map((sightingsByDay || []).map(d => [d.date, d.count]));
    return history.map(h => ({
      ...h, label: h.date,
      sightingsDaily: byDate.has(h.date) ? byDate.get(h.date) : undefined,
    }));
  }, [history, sightingsByDay]);

  const sum = scorecard?.summary;
  const repeat = sum?.repeat_risk_reduction;
  const gridInk = mode === 'dark' ? 'rgba(255,255,255,0.08)' : '#E0E0E0';
  const axisInk = BRAND.textLight;
  const tickInterval = data.length > 16 ? Math.ceil(data.length / 10) : 0;

  return (
    <Card sx={{ ...surfaceSx(mode, 'card'), height: '100%' }}>
      <CardContent sx={{ p: { xs: 2.25, md: 3 }, '&:last-child': { pb: { xs: 2.25, md: 3 } } }}>
        <Box
          sx={{
            display: 'grid',
            // gauge column is fixed; the chart takes everything left over
            gridTemplateColumns: { xs: '1fr', md: 'minmax(190px, 220px) minmax(0, 1fr)' },
            columnGap: 3.5, rowGap: 3, alignItems: 'stretch',
          }}
        >
          {/* ── LEFT: the instrument ─────────────────────────────── */}
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 1.5 }}>
              <Typography component="h2" sx={{ fontSize: 15, fontWeight: 600, color: BRAND.heading }}>
                Estate Risk Index
              </Typography>
              <MuiTooltip
                arrow
                title="A weighted 0-100 heuristic: critical flora (x15), active hotspots (x10), open cases (x5) and at-risk flora (x3), capped at 100. Higher means more needs attention. Bands: Healthy under 25, Monitor 25-59, Needs Attention 60 and above."
              >
                <InfoOutlinedIcon sx={{ fontSize: 15, color: BRAND.textLight, cursor: 'help', flexShrink: 0 }} />
              </MuiTooltip>
            </Stack>

            {loading && !hasScore ? (
              <Skeleton variant="circular" width={148} height={148} sx={{ mx: 'auto' }} />
            ) : hasScore ? (
              <RiskGauge score={score} animated={animated} meta={meta} />
            ) : (
              <Box sx={{ py: 4, textAlign: 'center' }}>
                <Typography sx={{ fontSize: 30, fontWeight: 700, color: BRAND.textLight, lineHeight: 1.15 }}>No data</Typography>
                <Typography sx={{ fontSize: 12.5, color: BRAND.textLight, mt: 0.75 }}>
                  No scored data yet - this is not a healthy reading, it is an absent one.
                </Typography>
              </Box>
            )}

            {/* PREVENTION IMPACT, PROMOTED.
                These were 11px captions under the gauge - the smallest type on the card -
                which is backwards for an operations tool: the risk score says how bad
                things are, but "90% fewer repeats" and "S$640 saved" are what the service
                is judged on. They now sit at 20px in their own bordered block directly
                under the score, so the card reads as "here is the risk, and here is what
                the programme has bought you". */}
            <Box sx={{ ...surfaceSx(mode, 'inset'), p: 1.75, mt: 2 }}>
              <Typography
                sx={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.7px', textTransform: 'uppercase', color: BRAND.textLight, mb: 1.25 }}
              >
                Prevention impact
              </Typography>
              {repeat != null ? (
                <Stack spacing={1.25}>
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
                <Stack spacing={1.25}>
                  {[0, 1, 2].map(i => <Skeleton key={i} variant="text" height={28} />)}
                </Stack>
              ) : (
                <Typography sx={{ fontSize: 12, color: BRAND.textLight, lineHeight: 1.5 }}>
                  Prevention impact not measurable yet - close out work orders to start tracking it.
                </Typography>
              )}
            </Box>
          </Box>

          {/* ── RIGHT: the trend ─────────────────────────────────── */}
          <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
                <Typography component="h2" sx={{ fontSize: 15, fontWeight: 600, color: BRAND.heading }}>
                  Estate Activity
                </Typography>
                <MuiTooltip
                  arrow
                  title="The filled cyan line is open cases still outstanding at the end of each day - a backlog that carries over. The purple line is sightings logged on that day - a count of events. Both are plain counts on ONE shared axis, so their heights are directly comparable. Only the backlog is filled, because only a level has a meaningful area beneath it."
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
                  sx={{
                    bgcolor: s.inset, borderRadius: `${RADII.pill}px`, p: '3px', gap: '3px',
                    '& .MuiToggleButtonGroup-grouped': {
                      border: 0, marginLeft: 0, px: 1.4, py: 0.3, borderRadius: `${RADII.pill}px !important`,
                      textTransform: 'none', fontSize: 12, fontWeight: 600, color: BRAND.textLight,
                      '&:hover': { bgcolor: s.raised },
                      '&.Mui-selected': { bgcolor: s.raised, color: BRAND.heading, '&:hover': { bgcolor: s.raised } },
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

            {/* Headline figure + movement, the reference's `$103,489 ↑1.8%` row. */}
            <Stack direction="row" spacing={1.25} sx={{ alignItems: 'baseline', flexWrap: 'wrap', rowGap: 0.75, mb: 1.5 }}>
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'baseline' }}>
                <Typography sx={{ fontSize: { xs: 32, md: 38 }, fontWeight: 700, lineHeight: 1, letterSpacing: '-1.4px', color: BRAND.heading, fontVariantNumeric: 'tabular-nums' }}>
                  {openCases}
                </Typography>
                <Typography sx={{ fontSize: 13.5, fontWeight: 500, color: BRAND.textLight }}>open cases</Typography>
              </Stack>
              <DeltaPill delta={trends?.open_cases?.sinceLastWeek ?? null} improve="down" label="Open cases" />
            </Stack>

            {/* The inset well the chart lives in. */}
            <Box sx={{ ...surfaceSx(mode, 'inset'), p: { xs: 0.75, md: 1.25 }, pt: 2, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
              {data.length === 0 ? (
                <Typography sx={{ fontSize: 13, color: BRAND.textLight, py: 8, textAlign: 'center' }}>
                  No activity history yet.
                </Typography>
              ) : (
                <ResponsiveContainer width="100%" height={232}>
                  <ComposedChart data={data} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
                    {/* SOLID 1px gridlines, not dashed. A dashed rule at this weight
                        competes with the data for attention; a solid faint one recedes
                        and still lets a value be read off the axis. */}
                    <CartesianGrid stroke={gridInk} vertical={false} />
                    <XAxis dataKey="label" tickFormatter={dayOf} tick={{ fontSize: 11, fill: axisInk }}
                      axisLine={false} tickLine={false} interval={tickInterval} minTickGap={6} dy={6} />
                    <YAxis tick={{ fontSize: 11, fill: axisInk }} axisLine={false} tickLine={false}
                      allowDecimals={false} tickCount={5} width={42}
                      // zero-based: the filled series encodes magnitude by area, so a
                      // cropped baseline would exaggerate every difference
                      domain={[0, 'auto']} />
                    <Tooltip
                      cursor={{ stroke: BRAND.textLight, strokeWidth: 1, strokeOpacity: 0.5 }}
                      content={<CrosshairChips />}
                      animationDuration={140}
                    />
                    {/* STRAIGHT SEGMENTS AND NO AREA FILL.
                        `type="linear"`, not monotone: a spline through daily readings
                        invents curvature between samples - it draws values that were
                        never measured, and at this scale that is most of the ink. Straight
                        segments join the points that actually exist.

                        The gradient fill is gone with it. It was the loudest thing on the
                        card and it encoded nothing the line did not already say. Dots are
                        back ON, because with no fill the individual daily readings are the
                        data and should be visible without hovering. */}
                    {SERIES.map(sr => (
                      <Line
                        key={sr.key}
                        type="linear"
                        dataKey={sr.key}
                        name={sr.name}
                        stroke={sr.color}
                        strokeWidth={2}
                        dot={{ r: 2.5, fill: sr.color, strokeWidth: 0 }}
                        activeDot={{ r: 5, fill: sr.color, stroke: s.inset, strokeWidth: 3 }}
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
                    <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: sr.color, flexShrink: 0, boxShadow: glow(mode, sr.color, 0.5) }} />
                    <Typography sx={{ fontSize: 11.5, color: BRAND.textLight }}>{sr.name}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
