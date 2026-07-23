import { useMemo } from 'react';
import { Card, CardContent, Box, Stack, Typography } from '@mui/material';
import {
  BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, LabelList,
} from 'recharts';
import { BRAND, CHART } from '../../theme';

// Dashboard-scoped slate-navy series (kept local so the shared CHART tokens used
// by the Prevention / Notification pages stay unchanged). navy + orange is a
// high-separation, colourblind-safe pair - validated with the dataviz checker.
const SERIES = [
  { key: 'openCases', name: 'Open cases', color: '#2E67B5' },
  { key: 'sightings', name: 'Fauna sightings', color: '#E5683A' },
];

function fmtDay(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function LegendDot({ color, label }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
      <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
      <Typography sx={{ fontSize: 13, color: BRAND.text, fontWeight: 500 }}>{label}</Typography>
    </Stack>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <Box sx={{ bgcolor: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: '10px', boxShadow: '0 8px 24px rgba(16,24,40,.12)', px: 1.5, py: 1 }}>
      <Typography sx={{ fontSize: 12, color: BRAND.textLight, mb: 0.5 }}>{fmtDay(label)}</Typography>
      {payload.map(p => (
        <Stack key={p.dataKey} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: p.color }} />
          <Typography sx={{ fontSize: 13, color: BRAND.heading, fontWeight: 600 }}>
            {p.name}: {p.value}
          </Typography>
        </Stack>
      ))}
    </Box>
  );
}

/**
 * Estate activity over time: open cases and fauna sightings per day. Direct data
 * labels sit above each bar (data-ink ratio), so the Y-axis and gridlines are
 * removed - the reader gets absolute values without tracing back to an axis.
 */
export default function ActivityChart({ history = [] }) {
  const data = useMemo(() => history.map(h => ({ ...h, label: h.date })), [history]);
  const summary = data.length
    ? `Estate activity over ${data.length} days. Open cases from ${data[0].openCases} to ${data[data.length - 1].openCases}; sightings from ${data[0].sightings} to ${data[data.length - 1].sightings}.`
    : 'No activity history yet.';

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, mb: 2.5 }}>
          <Box>
            <Typography component="h2" variant="h6" fontWeight={700} sx={{ color: BRAND.heading }}>
              Estate Activity
            </Typography>
            <Typography variant="body2" sx={{ color: BRAND.textLight }}>
              Open cases and fauna sightings, last {data.length} days
            </Typography>
          </Box>
          <Stack direction="row" spacing={2.5}>
            {SERIES.map(s => <LegendDot key={s.key} color={s.color} label={s.name} />)}
          </Stack>
        </Stack>

        {data.length === 0 ? (
          <Typography variant="body2" sx={{ color: BRAND.textLight, py: 8, textAlign: 'center' }}>
            No activity history yet.
          </Typography>
        ) : (
          <Box role="img" aria-label={summary}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data} margin={{ top: 20, right: 8, left: 8, bottom: 4 }} barGap={4} barCategoryGap="24%">
                {/* no CartesianGrid, no YAxis - direct labels carry the values */}
                <XAxis
                  dataKey="label"
                  tickFormatter={fmtDay}
                  tick={{ fontSize: 12, fill: CHART.axis }}
                  axisLine={{ stroke: BRAND.border }}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={12}
                />
                <Tooltip cursor={{ fill: 'rgba(46,103,181,.06)' }} content={<ChartTooltip />} />
                {SERIES.map(s => (
                  <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={22}>
                    <LabelList
                      dataKey={s.key}
                      position="top"
                      style={{ fontSize: 10, fontWeight: 700, fill: s.color }}
                      formatter={v => (v > 0 ? v : '')}
                    />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}