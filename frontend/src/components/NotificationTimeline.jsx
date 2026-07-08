import { useMemo, useState } from 'react';
import { Box, Card, CardContent, Stack, Typography } from '@mui/material';
import { BRAND } from '../theme';

const SENT = '#2a78d6';   // dispatched OK (validated categorical blue)
const FAILED = '#d03b3b'; // status: critical
const VOLUME = '#8f97a3'; // neutral wave
const BUCKETS = 80;       // rolling curve resolution
const W = 1000;           // svg coord space (stretched to fill via preserveAspectRatio=none)
const H = 150;
const HALF = H / 2;
const AMP = 0.9;          // fraction of half-height a full peak reaches

function fmtTick(t) {
  return new Date(t).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Cubic-bezier segments through points via a Catmull-Rom spline (no leading M),
// so the volume reads as rolling waves rather than a jagged line.
function curveSegments(pts) {
  let d = '';
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}
const smoothLine = pts => (pts.length < 2 ? '' : `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}${curveSegments(pts)}`);

/**
 * Dispatch timeline: Sent / Failed swimlanes over a shared time axis, with a
 * mirrored volume waveform beneath (grey = all dispatches, red = failures) that
 * reads like an audio/radio wave. The table below is the accessible data source;
 * this is a role="img" overview with a hover crosshair + tooltip.
 */
export default function NotificationTimeline({ logs = [] }) {
  const model = useMemo(() => {
    const times = logs.map(l => new Date(l.createdAt).getTime()).filter(n => !Number.isNaN(n));
    if (!times.length) return null;
    let min = Math.min(...times);
    let max = Math.max(...times);
    if (min === max) { min -= 3600000; max += 3600000; }
    const span = max - min;
    const buckets = Array.from({ length: BUCKETS }, () => ({ sent: 0, failed: 0 }));
    logs.forEach(l => {
      const t = new Date(l.createdAt).getTime();
      if (Number.isNaN(t)) return;
      let i = Math.floor(((t - min) / span) * BUCKETS);
      if (i >= BUCKETS) i = BUCKETS - 1;
      if (i < 0) i = 0;
      if (l.status === 'failed') buckets[i].failed += 1; else buckets[i].sent += 1;
    });
    const maxTotal = Math.max(1, ...buckets.map(b => b.sent + b.failed));
    const scale = maxTotal * 1.05;
    const x = i => (i / (BUCKETS - 1)) * W;
    const amp = v => Math.min(1, v / scale) * HALF * AMP;
    // closed mirrored shape: top curve L->R, then bottom curve R->L, then close
    const mirror = pick => {
      const top = buckets.map((b, i) => [x(i), HALF - amp(pick(b))]);
      const botRev = buckets.map((b, i) => [x(i), HALF + amp(pick(b))]).reverse();
      return `${smoothLine(top)} L ${botRev[0][0].toFixed(1)},${botRev[0][1].toFixed(1)}${curveSegments(botRev)} Z`;
    };
    const total = b => b.sent + b.failed;
    const failed = logs.filter(l => l.status === 'failed').length;
    return {
      min, max, buckets, maxTotal, sent: logs.length - failed, failed,
      totalArea: mirror(total),
      topLine: smoothLine(buckets.map((b, i) => [x(i), HALF - amp(total(b))])),
      botLine: smoothLine(buckets.map((b, i) => [x(i), HALF + amp(total(b))])),
      // failures as crisp marker spikes on the centre line, not a red fill
      failMarks: buckets.map((b, i) => (b.failed > 0 ? { x: x(i), h: Math.max(8, amp(b.failed)), n: b.failed } : null)).filter(Boolean),
    };
  }, [logs]);

  const [hover, setHover] = useState(null);
  if (!model) return null;
  const { buckets, min, max, sent, failed, totalArea, topLine, botLine, failMarks } = model;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => min + f * (max - min));
  const bucketMs = (max - min) / BUCKETS;
  const summary = `${logs.length} dispatches from ${fmtTick(min)} to ${fmtTick(max)}: ${sent} sent, ${failed} failed.`;
  const hv = hover != null ? buckets[hover] : null;

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

        <Box role="img" aria-label={summary}>
          <Stack spacing={0.75}>
            <Lane buckets={buckets} pick={b => b.sent} color={SENT} maxTotal={model.maxTotal} />
            <Lane buckets={buckets} pick={b => b.failed} color={FAILED} maxTotal={model.maxTotal} />
          </Stack>

          {/* mirrored volume waveform */}
          <Box sx={{ position: 'relative', height: H, mt: 1.5 }} onMouseLeave={() => setHover(null)}>
            <Box component="svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" sx={{ display: 'block', width: '100%', height: H }}>
              <defs>
                <linearGradient id="waveGrey" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={VOLUME} stopOpacity="0.18" />
                  <stop offset="50%" stopColor={VOLUME} stopOpacity="0.7" />
                  <stop offset="100%" stopColor={VOLUME} stopOpacity="0.18" />
                </linearGradient>
              </defs>
              <line x1="0" y1={HALF} x2={W} y2={HALF} stroke={BRAND.border} strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <path d={totalArea} fill="url(#waveGrey)" />
              <path d={topLine} fill="none" stroke={VOLUME} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
              <path d={botLine} fill="none" stroke={VOLUME} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
              {failMarks.map((m, i) => (
                <line key={i} x1={m.x} x2={m.x} y1={HALF - m.h} y2={HALF + m.h} stroke={FAILED} strokeWidth={2.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              ))}
            </Box>

            {hover != null && (
              <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: `${((hover + 0.5) / BUCKETS) * 100}%`, width: '1px', bgcolor: 'rgba(16,24,40,.25)', pointerEvents: 'none' }} />
            )}

            <Box sx={{ position: 'absolute', inset: 0, display: 'flex' }}>
              {buckets.map((b, i) => <Box key={i} onMouseEnter={() => setHover(i)} sx={{ flex: 1, height: '100%' }} />)}
            </Box>

            {hv && (
              <Box sx={{ position: 'absolute', bottom: '100%', mb: 1, left: `${((hover + 0.5) / BUCKETS) * 100}%`, transform: 'translateX(-50%)', bgcolor: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: '8px', boxShadow: '0 8px 24px rgba(16,24,40,.12)', px: 1.25, py: 0.75, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 2 }}>
                <Typography sx={{ fontSize: 11, color: BRAND.textLight, mb: 0.25 }}>{fmtTick(min + hover * bucketMs)}</Typography>
                <Typography sx={{ fontSize: 12.5, color: BRAND.heading, fontWeight: 600 }}>
                  {hv.sent} sent{hv.failed > 0 && <Box component="span" sx={{ color: FAILED }}>, {hv.failed} failed</Box>}
                </Typography>
              </Box>
            )}
          </Box>

          <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 1 }}>
            {ticks.map((t, i) => (
              <Typography key={i} sx={{ fontSize: 11, color: BRAND.textLight }}>{fmtTick(t)}</Typography>
            ))}
          </Stack>
        </Box>
      </CardContent>
    </Card>
  );
}

// One swimlane: a bucket is coloured when it holds events, opacity scaled by count.
function Lane({ buckets, pick, color, maxTotal }) {
  return (
    <Box sx={{ display: 'flex', height: 12, borderRadius: '3px', overflow: 'hidden', bgcolor: BRAND.section }}>
      {buckets.map((b, i) => {
        const n = pick(b);
        return <Box key={i} sx={{ flex: 1, height: '100%', bgcolor: n > 0 ? color : 'transparent', opacity: n > 0 ? 0.35 + 0.65 * Math.min(1, n / maxTotal) : 0 }} />;
      })}
    </Box>
  );
}
