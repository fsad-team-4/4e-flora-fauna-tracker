import { useMemo, useState } from 'react';
import { Box, Card, CardContent, Stack, Typography } from '@mui/material';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea,
} from 'recharts';
import { BRAND, CHART } from '../theme';

const SENT = '#2E67B5';   // dispatched OK - slate-navy, matching the dashboard data palette
const FAILED = '#d03b3b'; // status: critical

const dayKey = t => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
function fmtTick(t) {
  return new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short' });
}
function fmtDayFull(t) {
  return new Date(t).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

// One bin PER DAY (not sub-daily) so each day appears once on the axis - fixes the
// duplicate "2 Jul, 2 Jul" labels caused by multiple sub-daily bins sharing a
// day-only label. A day with 15 failures still spikes on that day's bin.
function useDailyBuckets(logs) {
  return useMemo(() => {
    const valid = logs.filter(l => !Number.isNaN(new Date(l.createdAt).getTime()));
    if (!valid.length) return null;
    const byDay = {};
    valid.forEach(l => {
      const k = dayKey(l.createdAt);
      const b = (byDay[k] ||= { t: k, sent: 0, failed: 0 });
      if (l.status === 'failed') b.failed += 1; else b.sent += 1;
    });
    // fill missing days so the line is continuous, not gappy
    const keys = Object.keys(byDay).map(Number).sort((a, b) => a - b);
    const min = keys[0];
    const max = keys[keys.length - 1];
    const DAY = 86400000;
    const bins = [];
    for (let t = min; t <= max; t += DAY) {
      bins.push(byDay[t] || { t, sent: 0, failed: 0 });
    }
    const failed = valid.filter(l => l.status === 'failed').length;
    return { bins, sent: valid.length - failed, failed };
  }, [logs]);
}

function DispatchTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <Box sx={{ bgcolor: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: '8px', boxShadow: '0 8px 24px rgba(16,24,40,.12)', px: 1.5, py: 1 }}>
      <Typography sx={{ fontSize: 11, color: BRAND.textLight, mb: 0.5 }}>{fmtDayFull(row.t)}</Typography>
      <Typography sx={{ fontSize: 12.5, color: SENT, fontWeight: 600 }}>{row.sent} sent</Typography>
      {row.failed > 0 && (
        <Typography sx={{ fontSize: 12.5, color: FAILED, fontWeight: 600 }}>{row.failed} failed</Typography>
      )}
      <Typography sx={{ fontSize: 10.5, color: BRAND.textLight, mt: 0.5 }}>click a day · drag to select a range</Typography>
    </Box>
  );
}

const DAY = 86400000;

// onSelect(fromMs, toMs) lets the parent filter the table to a day or a dragged
// range. selectedRange { from, to } (YYYY-MM-DD) renders as a shaded band.
export default function NotificationTimeline({ logs = [], onSelect, selectedRange = null }) {
  const [refLeft, setRefLeft] = useState(null);
  const [refRight, setRefRight] = useState(null);
  const [dragging, setDragging] = useState(false);
  const model = useDailyBuckets(logs);
  if (!model) return null;
  const { bins, sent, failed } = model;

  // pad half a day each side so a single-day selection reads as a band, not a line
  const HALF = 0.45 * DAY;
  const selFrom = selectedRange ? new Date(`${selectedRange.from}T00:00:00`).getTime() : null;
  const selTo = selectedRange ? new Date(`${selectedRange.to}T00:00:00`).getTime() : null;

  function finishDrag() {
    if (refLeft != null && refRight != null && onSelect) {
      onSelect(Math.min(refLeft, refRight), Math.max(refLeft, refRight));
    }
    setRefLeft(null);
    setRefRight(null);
    setDragging(false);
  }

  // clean y-axis ticks: round the max up to a nice step (multiples of 12) so the
  // axis reads 0/12/24/36 instead of an awkward step of 9.
  const peak = Math.max(1, ...bins.map(b => Math.max(b.sent, b.failed)));
  const step = Math.ceil(peak / 3 / 6) * 6 || 6; // ~3 ticks, snapped to 6s
  const niceMax = step * 3;
  const yTicks = [0, step, step * 2, niceMax];

  return (
    <Card sx={{ mb: 2.5 }}>
      <CardContent sx={{ p: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, mb: 2.5 }}>
          <Box>
            <Typography component="h2" variant="h6" fontWeight={700} sx={{ color: BRAND.heading }}>
              Dispatch Timeline
            </Typography>
            <Typography variant="body2" sx={{ color: BRAND.textLight }}>
              {logs.length} dispatches · {sent} sent · {failed} failed
              <Box component="span" sx={{ ml: 0.5, fontStyle: 'italic' }}>(all time)</Box>
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
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart
            data={bins}
            margin={{ top: 8, right: 12, left: -12, bottom: 4 }}
            onMouseDown={e => {
              if (!onSelect) return;
              const t = e?.activePayload?.[0]?.payload?.t ?? e?.activeLabel;
              if (t != null) { setRefLeft(t); setRefRight(t); setDragging(true); }
            }}
            onMouseMove={e => {
              if (!dragging) return;
              const t = e?.activePayload?.[0]?.payload?.t ?? e?.activeLabel;
              if (t != null) setRefRight(t);
            }}
            onMouseUp={finishDrag}
            onMouseLeave={() => { if (dragging) finishDrag(); }}
            style={{ cursor: onSelect ? 'crosshair' : 'default', userSelect: 'none' }}
          >
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
              minTickGap={30}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: CHART.axis }} width={32} domain={[0, niceMax]} ticks={yTicks} />
            <Tooltip content={<DispatchTooltip />} cursor={{ stroke: BRAND.textLight, strokeWidth: 1, strokeDasharray: '4 4' }} />
            {/* committed selection - a soft brand band, not a hard line */}
            {selFrom != null && (
              <ReferenceArea x1={selFrom - HALF} x2={selTo + HALF} fill={BRAND.primary} fillOpacity={0.1} stroke={BRAND.primary} strokeOpacity={0.4} ifOverflow="extendDomain" />
            )}
            {/* live drag preview */}
            {dragging && refLeft != null && refRight != null && refLeft !== refRight && (
              <ReferenceArea x1={Math.min(refLeft, refRight)} x2={Math.max(refLeft, refRight)} fill={SENT} fillOpacity={0.12} stroke={SENT} strokeOpacity={0.45} />
            )}
            <Area type="monotone" dataKey="sent" stroke={SENT} strokeWidth={2} fill="url(#sentFill)" />
            <Area type="monotone" dataKey="failed" stroke={FAILED} strokeWidth={2.5} fill="url(#failedFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}