import { useMemo, useState } from 'react';
import { Card, CardContent, Box, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import BarChartOutlined from '@mui/icons-material/BarChartOutlined';
import {
  BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, LabelList,
} from 'recharts';
import { BRAND, CHART } from '../../theme';

// Colours from the theme's dedicated two-series tokens (single source of truth).
const SERIES = [
  { key: 'openCases', name: 'Open cases', color: CHART.series.primary },
  { key: 'sightings', name: 'Fauna sightings', color: CHART.series.secondary },
];

function fmtDay(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

// Clickable legend pill that doubles as a show/hide toggle for its series.
function LegendToggle({ color, label, active, onClick }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-pressed={active}
      sx={{
        border: 'none', cursor: 'pointer', font: 'inherit',
        borderRadius: '100px', px: 1.5, py: 0.4,
        display: 'inline-flex', alignItems: 'center', gap: 0.6,
        bgcolor: active ? alpha(color, 0.12) : 'transparent',
        opacity: active ? 1 : 0.45,
        transition: 'opacity .15s, background-color .15s',
        '&:focus-visible': { outline: `2px solid ${BRAND.primary}`, outlineOffset: 2 },
      }}
    >
      <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }} />
      <Typography component="span" sx={{ fontSize: 13, color, fontWeight: 600, textDecoration: active ? 'none' : 'line-through' }}>{label}</Typography>
    </Box>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <Box sx={{ bgcolor: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: '12px', boxShadow: '0 12px 32px rgba(16,24,40,.15)', px: 1.5, py: 1 }}>
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

export default function ActivityChart({ history = [] }) {
  const [hidden, setHidden] = useState({}); // series keys toggled off via the legend
  const shown = SERIES.filter(s => !hidden[s.key]);
  const data = useMemo(() => history.map(h => ({ ...h, label: h.date })), [history]);
  const summary = data.length
    ? `Estate activity over ${data.length} days. Open cases from ${data[0].openCases} to ${data[data.length - 1].openCases}; sightings from ${data[0].sightings} to ${data[data.length - 1].sightings}.`
    : 'No activity history yet.';

  const dateRangeText = data.length > 0
    ? ` (${fmtDay(data[0].date)} – ${fmtDay(data[data.length - 1].date)})`
    : '';

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, mb: 2.5 }}>
          <Box>
            <Typography component="h2" variant="h6" fontWeight={700} sx={{ color: BRAND.heading }}>
              Estate Activity
            </Typography>
            <Typography variant="body2" sx={{ color: BRAND.textLight }}>
              Open cases and fauna sightings, last {data.length} days{dateRangeText}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            {SERIES.map(s => (
              <LegendToggle key={s.key} color={s.color} label={s.name} active={!hidden[s.key]}
                onClick={() => setHidden(h => ({ ...h, [s.key]: !h[s.key] }))} />
            ))}
          </Stack>
        </Stack>

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
              <BarChart data={data} margin={{ top: 20, right: 8, left: 8, bottom: 4 }} barGap={4} barCategoryGap="24%">
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
                {shown.map(s => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.name}
                    fill={s.color}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={22}
                    animationBegin={0}
                    animationDuration={800}
                  >
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
