import { useMemo } from 'react';
import { Box, Card, CardContent, Stack, Typography } from '@mui/material';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { BRAND, CHART } from '../theme';

const SENT = CHART.series.primary;   // dispatched OK (categorical blue)
const FAILED = '#d03b3b';            // status: critical

function fmtTick(t) {
  return new Date(t).toLocaleString([], { day: 'numeric', month: 'short' });
}
function fmtFull(t) {
  return new Date(t).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Bucket the raw dispatch logs into evenly-spaced time bins, each carrying a
// sent and failed count. This is the same modelling the old timeline used; only
// the visual (now a clean stacked area chart) has changed.
function useBuckets(logs, bucketCount = 40) {
  return useMemo(() => {
    const times = logs.map(l => new Date(l.createdAt).getTime()).filter(n => !Number.isNaN(n));
    if (!times.length) return null;
    let min = Math.min(...times);
    let max = Math.max(...times);
    if (min === max) { min -= 3600000; max += 3600000; }
    const span = max - min;
    const step = span / bucketCount;
    const bins = Array.from({ length: bucketCount }, (_, i) => ({
      t: min + i * step + step / 2, // bin centre
      sent: 0,
      failed: 0,
    }));
    logs.forEach(l => {
      const t = new Date(l.createdAt).getTime();
      if (Number.isNaN(t)) return;
      let i = Math.floor(((t - min) / span) * bucketCount);
      if (i >= bucketCount) i = bucketCount - 1;
      if (i < 0) i = 0;
      if (l.status === 'failed') bins[i].failed += 1;
      else bins[i].sent += 1;
    });
    const failed = logs.filter(l => l.status === 'failed').length;
    return { bins, min, max, sent: logs.length - failed, failed };
  }, [logs, bucketCount]);
}

function DispatchTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <Box sx={{ bgcolor: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: '8px', boxShadow: '0 8px 24px rgba(16,24,40,.12)', px: 1.5, py: 1 }}>
      <Typography sx={{ fontSize: 11, color: BRAND.textLight, mb: 0.5 }}>{fmtFull(row.t)}</Typography>
      <Typography sx={{ fontSize: 12.5, color: SENT, fontWeight: 600 }}>{row.sent} sent</Typography>
      {row.failed > 0 && (
        <Typography sx={{ fontSize: 12.5, color: FAILED, fontWeight: 600 }}>{row.failed} failed</Typography>
      )}
    </Box>
  );
}

export default function NotificationTimeline({ logs = [] }) {
  const model = useBuckets(logs);
  if (!model) return null;
  const { bins, sent, failed } = model;

  return (
    <Card sx={{ mb: 2.5 }}>
      <CardContent sx={{ p: 3 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, mb: 2.5 }}
        >
          <Box>
            <Typography component="h2" variant="h6" fontWeight={700} sx={{ color: BRAND.heading }}>
              Dispatch Timeline
            </Typography>
            <Typography variant="body2" sx={{ color: BRAND.textLight }}>
              {logs.length} dispatches · {sent} sent · {failed} failed
            </Typography>
          </Box>
          <Stack direction="row" spacing={2.5}>
            {[['Sent', SENT], ['Failed', FAILED]].map(([label, c]) => (
              <Stack key={label} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: c }} />
                <Typography sx={{ fontSize: 13, color: BRAND.text }}>{label}</Typography>
              </Stack>
            ))}
          </Stack>
        </Stack>

        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={bins} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
            <defs>
              <linearGradient id="sentFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SENT} stopOpacity={0.32} />
                <stop offset="100%" stopColor={SENT} stopOpacity={0.04} />
              </linearGradient>
              <linearGradient id="failedFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={FAILED} stopOpacity={0.32} />
                <stop offset="100%" stopColor={FAILED} stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={fmtTick}
              tick={{ fontSize: 11, fill: CHART.axis }}
              minTickGap={40}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: CHART.axis }} width={32} />
            <Tooltip content={<DispatchTooltip />} cursor={{ stroke: BRAND.textLight, strokeWidth: 1, strokeDasharray: '4 4' }} />
            {/* stacked: sent forms the base band, failed sits on top so spikes in
                failures are visible against the overall volume */}
            {/* NOT stacked: each area plots its own value from zero, so "failed"
                shows the true failure count (never the cumulative total) */}
            <Area type="monotone" dataKey="sent" stroke={SENT} strokeWidth={2} fill="url(#sentFill)" />
            <Area type="monotone" dataKey="failed" stroke={FAILED} strokeWidth={2.5} fill="url(#failedFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}