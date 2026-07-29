import { useId, useMemo, useState } from 'react';
import { Card, CardContent, Box, Stack, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import BarChartOutlined from '@mui/icons-material/BarChartOutlined';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { BRAND } from '../../theme';

// Bar + line combo. The stacked area rendered as two near-flat bands, which said
// almost nothing: rounded bars give fauna sightings a countable shape, and a bold
// line over the top makes the open-case trend legible against them.
//
// LITERAL colours only. These are data, not CSS: they go to alpha() for the legend
// tints and into recharts' SVG stroke/fill attributes. A var(--...) token makes
// alpha() throw and never resolves in an SVG attribute, so BRAND.accent is banned
// here - use BRAND.primary.
const SERIES = [
  { key: 'sightings', name: 'Fauna sightings', color: '#8CA3BD', mark: 'bar' },
  { key: 'openCases', name: 'Open cases', color: BRAND.primary, mark: 'line' },
];

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

// No combined total here: the two series now sit on separate axes, so adding them
// would produce a number that means nothing.
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <Box sx={{ bgcolor: BRAND.surface, border: `1px solid ${BRAND.border}`, borderRadius: '8px', boxShadow: '0 12px 32px rgba(16,24,40,.15)', px: 1.5, py: 1 }}>
      <Typography sx={{ fontSize: 12, color: BRAND.textLight, mb: 0.5, fontWeight: 600 }}>{fmtDay(label)}</Typography>
      {payload.map(p => {
        const meta = SERIES.find(s => s.key === p.dataKey);
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
  const lineShadowId = useId();
  // Recharts writes these into SVG attributes, so they must be real colours - the
  // BRAND.* CSS variables would not resolve there.
  const theme = useTheme();
  const gridInk = theme.palette.divider;
  const axisInk = theme.palette.text.secondary;

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
          <Typography variant="body2" sx={{ color: BRAND.textLight }}>
            Fauna sightings (left axis) vs open cases (right axis){dateRangeText && ` · ${dateRangeText}`}
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
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 4 }} barCategoryGap="35%">
                <defs>
                  <filter id={lineShadowId} x="-20%" y="-40%" width="140%" height="200%">
                    <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor={SERIES[1].color} floodOpacity="0.32" />
                  </filter>
                </defs>
                {/* horizontal rules only, faint and dashed */}
                <CartesianGrid stroke={gridInk} strokeDasharray="3 4" strokeOpacity={0.7} vertical={false} />
                <XAxis
                  dataKey="label"
                  tickFormatter={fmtDay}
                  tick={{ fontSize: 12, fill: axisInk }}
                  axisLine={{ stroke: gridInk }}
                  tickLine={false}
                  interval={tickInterval}
                  minTickGap={8}
                />
                {/* Dual axis: sightings and open cases live on very different scales,
                    so sharing one axis flattened the smaller series into the floor.
                    Each axis is tinted to its series so it is obvious which is which. */}
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 12, fill: SERIES[0].color }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  width={44}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 12, fill: SERIES[1].color }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  width={40}
                />
                <Tooltip
                  cursor={{ stroke: axisInk, strokeWidth: 1, strokeDasharray: '3 3' }}
                  content={<ChartTooltip />}
                />
                {!hidden.sightings && (
                  <Bar
                    yAxisId="left"
                    dataKey="sightings"
                    name="Fauna sightings"
                    fill={SERIES[0].color}
                    // soft-edged: fully rounded caps read gentler than square columns
                    radius={[6, 6, 0, 0]}
                    maxBarSize={20}
                    animationBegin={0}
                    animationDuration={800}
                  />
                )}
                {!hidden.openCases && (
                  // Thick smooth spline with a soft drop shadow and visible data point
                  // markers, so each reading is locatable on the curve.
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="openCases"
                    name="Open cases"
                    stroke={SERIES[1].color}
                    strokeWidth={3}
                    strokeLinecap="round"
                    dot={{ r: 3.5, fill: '#fff', stroke: SERIES[1].color, strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: SERIES[1].color, stroke: '#fff', strokeWidth: 2 }}
                    filter={`url(#${lineShadowId})`}
                    animationBegin={0}
                    animationDuration={800}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
