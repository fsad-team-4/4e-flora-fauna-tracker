import { useMemo, useState } from 'react';
import { Card, CardContent, Box, Stack, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import BarChartOutlined from '@mui/icons-material/BarChartOutlined';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { BRAND, SVG_ACCENT } from '../../theme';

// Two lines on ONE shared axis.
//
// ============== WHY THE SECOND Y-AXIS IS GONE ==============================
// This was a bar series on a left axis and a line on a right axis, justified by a
// comment claiming the two "live on very different scales". They do not. Measured
// against the live endpoint, a 7-day window returns sightings 7..10 and open cases
// 4..5 - the same order of magnitude, and both are plain counts.
//
// A dual axis is the single most misleading chart construction there is: the two
// scales are chosen independently, so the crossings and the relative heights are
// artefacts of the axis maxima rather than facts about the estate. Here it was
// actively lying - the right axis topped out at 8 while the left ran to 12, which
// drew 4 open cases as visually LEVEL WITH 7 sightings.
//
// One axis, both series in counts, no normalisation and no indexing: the reader can
// compare the two directly because they are genuinely comparable. What the axis
// cannot say is that sightings are events logged that DAY while open cases are the
// backlog standing that day, so the subtitle says it in words.
// ===========================================================================
//
// LITERAL colours only. These are data, not CSS: they go to alpha() for the legend
// tints and into recharts' SVG stroke/fill attributes. A var(--...) token makes
// alpha() throw and never resolves in an SVG attribute, so BRAND.accent is banned
// here - the scheme is carried by the SVG_ACCENT literals, indexed by palette mode.
function buildSeries(mode) {
  return [
    { key: 'sightings', name: 'Fauna sightings logged', color: '#5B8FD6', mark: 'line' },
    { key: 'openCases', name: 'Open cases outstanding', color: SVG_ACCENT[mode].danger, mark: 'line' },
  ];
}

function fmtDay(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function LegendToggle({ color, label, mark, active, onClick }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-pressed={active}
      sx={{
        border: `1px solid ${active ? alpha(color, 0.35) : BRAND.border}`,
        cursor: 'pointer', font: 'inherit',
        borderRadius: '8px', px: 1.25, py: 0.4,
        display: 'inline-flex', alignItems: 'center', gap: 0.75,
        bgcolor: active ? alpha(color, 0.08) : 'transparent',
        opacity: active ? 1 : 0.5,
        transition: 'opacity .15s, background-color .15s, border-color .15s',
        '&:hover': { bgcolor: alpha(color, 0.12) },
        '&:focus-visible': { outline: `2px solid ${BRAND.accent}`, outlineOffset: 2 },
      }}
    >
      {/* mark matches how the series is drawn: square for bars, round for the line */}
      <Box aria-hidden sx={{ width: 10, height: 10, flexShrink: 0, bgcolor: color, borderRadius: mark === 'line' ? '50%' : '2px' }} />
      <Typography component="span" sx={{ fontSize: 12.5, color: BRAND.heading, fontWeight: 600, textDecoration: active ? 'none' : 'line-through' }}>
        {label}
      </Typography>
    </Box>
  );
}

// No combined total: one is a daily count of events and the other is a standing
// backlog, so adding them would produce a number that means nothing even though
// they now share an axis.
function ChartTooltip({ active, payload, label, series = [] }) {
  if (!active || !payload?.length) return null;
  return (
    <Box sx={{ bgcolor: BRAND.surface, border: `1px solid ${BRAND.border}`, borderRadius: '8px', boxShadow: '0 12px 32px rgba(16,24,40,.15)', px: 1.5, py: 1 }}>
      <Typography sx={{ fontSize: 12, color: BRAND.textLight, mb: 0.5, fontWeight: 600 }}>{fmtDay(label)}</Typography>
      {payload.map(p => {
        const meta = series.find(s => s.key === p.dataKey);
        return (
          <Stack key={p.dataKey} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
            <Box aria-hidden sx={{ width: 9, height: 9, bgcolor: p.color, borderRadius: meta?.mark === 'line' ? '50%' : '2px' }} />
            <Typography sx={{ fontSize: 13, color: BRAND.heading, fontWeight: 600 }}>
              {p.name}: {p.value}
            </Typography>
          </Stack>
        );
      })}
      
    </Box>
  );
}

export default function ActivityChart({ history = [] }) {
  const [hidden, setHidden] = useState({}); // series keys toggled off via the legend
  // Recharts writes these into SVG attributes, so they must be real colours - the
  // BRAND.* CSS variables would not resolve there.
  const theme = useTheme();
  const gridInk = theme.palette.divider;
  const axisInk = theme.palette.text.secondary;
  const SERIES = buildSeries(theme.palette.mode);

  const data = useMemo(() => history.map(h => ({ ...h, label: h.date })), [history]);
  const summary = data.length
    ? `Estate activity over ${data.length} days. Open cases from ${data[0].openCases} to ${data[data.length - 1].openCases}; sightings from ${data[0].sightings} to ${data[data.length - 1].sightings}.`
    : 'No activity history yet.';

  const dateRangeText = data.length > 0
    ? `${fmtDay(data[0].date)} - ${fmtDay(data[data.length - 1].date)}`
    : '';

  // Thin the x-axis labels once the series gets long, so ticks never collide.
  const tickInterval = data.length > 16 ? Math.ceil(data.length / 8) : data.length > 8 ? 1 : 0;

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ mb: 2.5 }}>
          <Typography component="h2" variant="h6" fontWeight={700} sx={{ color: BRAND.heading }}>
            Estate Activity
          </Typography>
          {/* States the stock/flow difference in words, because one shared count
              axis cannot: sightings are events logged that day, open cases are the
              backlog standing that day. */}
          <Typography variant="body2" sx={{ color: BRAND.textLight }}>
            Sightings logged per day vs open cases outstanding that day - both counts, one axis{dateRangeText && ` · ${dateRangeText}`}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1, mt: 1.5 }}>
            {SERIES.map(s => (
              <LegendToggle
                key={s.key}
                color={s.color}
                label={s.name}
                mark={s.mark}
                active={!hidden[s.key]}
                onClick={() => setHidden(h => ({ ...h, [s.key]: !h[s.key] }))}
              />
            ))}
          </Stack>
        </Box>

        {data.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8 }}>
            <BarChartOutlined sx={{ fontSize: 48, color: BRAND.textLight, mb: 1.5 }} />
            <Typography variant="body2" sx={{ color: BRAND.textLight, textAlign: 'center' }}>
              No activity history yet.
            </Typography>
          </Box>
        ) : (
          <Box role="img" aria-label={summary}>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={data} margin={{ top: 8, right: 26, left: -20, bottom: 4 }}>
                {/* Faint horizontal rules ONLY - no verticals, no axis line on the
                    value axis. The grid is a reading aid, not part of the data. */}
                <CartesianGrid stroke={gridInk} strokeDasharray="3 4" strokeOpacity={0.55} vertical={false} />
                <XAxis
                  dataKey="label"
                  tickFormatter={fmtDay}
                  tick={{ fontSize: 12, fill: axisInk }}
                  axisLine={{ stroke: gridInk }}
                  tickLine={false}
                  interval={tickInterval}
                  minTickGap={8}
                />
                {/* ONE axis, in counts, shared by both series. Neutral ink rather
                    than a series tint - tinting an axis only made sense while there
                    were two of them to tell apart. */}
                <YAxis
                  tick={{ fontSize: 12, fill: axisInk }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  width={46}
                />
                <Tooltip
                  cursor={{ stroke: axisInk, strokeWidth: 1, strokeDasharray: '3 3' }}
                  content={<ChartTooltip series={SERIES} />}
                />
                {SERIES.filter(s => !hidden[s.key]).map(s => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.name}
                    stroke={s.color}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    // 2px surface ring on each marker so the two lines stay readable
                    // where they cross instead of merging into one blob
                    dot={{ r: 3.5, fill: theme.palette.background.paper, stroke: s.color, strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: s.color, stroke: theme.palette.background.paper, strokeWidth: 2 }}
                    animationBegin={0}
                    animationDuration={800}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
