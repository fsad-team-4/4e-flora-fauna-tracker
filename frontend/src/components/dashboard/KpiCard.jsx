import { useEffect, useId, useRef, useState } from 'react';
import { Box, Card, CardContent, Stack, Typography, Skeleton, Tooltip } from '@mui/material';
import { alpha, keyframes } from '@mui/material/styles';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded';
import { BRAND, TREND } from '../../theme';

function useCountUp(target, duration = 600) {
  const [count, setCount] = useState(0);
  const frame = useRef(null);
  useEffect(() => {
    if (typeof target !== 'number') return;
    const start = performance.now();
    const animate = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setCount(Math.round(target * eased));
      if (t < 1) frame.current = requestAnimationFrame(animate);
    };
    frame.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame.current);
  }, [target, duration]);
  return count;
}

/**
 * Direction arrow + percentage. Colour marks whether the movement is GOOD for this
 * specific metric (falling open cases is good, so it goes green), and the arrow and
 * sign carry direction so colour is never the only cue.
 *
 * Percentage needs a non-zero baseline to mean anything - when the previous value
 * was 0 it falls back to the absolute delta rather than printing a fake infinity.
 */
function DeltaBadge({ delta, improve, base, label }) {
  if (delta == null) return null;
  const Icon = delta > 0 ? ArrowUpwardRoundedIcon : delta < 0 ? ArrowDownwardRoundedIcon : RemoveRoundedIcon;
  const good = improve && ((improve === 'down' && delta < 0) || (improve === 'up' && delta > 0));
  const bad = improve && delta !== 0 && !good;
  const color = good ? TREND.good : bad ? TREND.bad : TREND.neutral;
  const prev = base != null ? base - delta : null;
  const pct = prev && prev > 0 ? Math.round((delta / prev) * 100) : null;
  const sign = delta > 0 ? '+' : '';
  const shown = pct != null ? `${sign}${pct}%` : `${sign}${delta}`;

  return (
    <Tooltip title={`${sign}${delta} ${label}${pct != null ? ` (${sign}${pct}%)` : ''}`}>
      <Stack
        direction="row"
        spacing={0.2}
        component="span"
        aria-label={`${delta > 0 ? 'up' : delta < 0 ? 'down' : 'no change'} ${Math.abs(delta)}${pct != null ? `, ${Math.abs(pct)} percent` : ''} ${label}`}
        sx={{
          alignItems: 'center', color, fontWeight: 800, fontSize: 14,
          borderRadius: '6px', px: 0.6, py: 0.15,
          bgcolor: alpha(color, 0.1), display: 'inline-flex', flexShrink: 0,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <Icon sx={{ fontSize: 16 }} aria-hidden />
        <span>{shown}</span>
      </Stack>
    </Tooltip>
  );
}

// Catmull-Rom smoothing, shared shape language with the hero trend line.
function smoothPath(pts) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  const t = 0.2;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    d += ` C ${(p1[0] + (p2[0] - p0[0]) * t).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) * t).toFixed(1)}`
      + ` ${(p2[0] - (p3[0] - p1[0]) * t).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) * t).toFixed(1)}`
      + ` ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/**
 * Right-aligned trend accent. Deliberately quiet - it gives the shape of the recent
 * trend at a glance while the number and the delta badge stay the headline.
 *
 * Each card scales to its OWN min..max: a shared axis would flatten a 0-4 metric
 * into a dead line next to a 0-400 one. A genuinely flat series draws a straight
 * mid-height rule rather than a fake zig-zag from a zero range.
 */
function CardSparkline({ series, color }) {
  const gradId = useId();
  if (!series || series.length < 2) return null;
  const w = 120, h = 48;
  const min = Math.min(...series), max = Math.max(...series);
  const range = max - min;
  const y = v => (range === 0 ? h / 2 : h - ((v - min) / range) * (h - 10) - 5);
  const pts = series.map((v, i) => [(i / (series.length - 1)) * w, y(v)]);
  const d = smoothPath(pts);
  const end = pts[pts.length - 1];

  return (
    <Box
      component="svg"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden
      sx={{ display: 'block', width: 112, height: 48, flexShrink: 0 }}
    >
      <defs>
        {/* soft gradient fading to nothing at the card's lower edge */}
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2={h} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={color} stopOpacity={0.32} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path d={`${d} L ${w},${h} L 0,${h} Z`} fill={`url(#${gradId})`} stroke="none" />
      <path d={d} fill="none" stroke={color} strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={end[0]} cy={end[1]} r={2.5} fill={color} stroke="#fff" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
    </Box>
  );
}

const pulseKeyframes = keyframes`
  0% {
    box-shadow: 0 0 0 0px ${alpha(BRAND.primary, 0.2)};
  }
  70% {
    box-shadow: 0 0 0 5px ${alpha(BRAND.primary, 0.12)};
  }
  100% {
    box-shadow: 0 0 0 0px ${alpha(BRAND.primary, 0)};
  }
`;

export default function KpiCard({ label, value, icon, color, tint, trend, series, trendLabel = 'vs last week', loading = false }) {
  const isNumeric = typeof value === 'number';
  const animatedValue = useCountUp(isNumeric ? value : 0);
  const displayValue = isNumeric ? animatedValue : value;

  const isCritical = color === BRAND.primary && isNumeric && value > 0;

  return (
    // Borderless with a diffused shadow and a rounder 12px corner, so the tiles lift
    // off the pale page field rather than sitting flat inside a hairline box.
    <Card
      sx={{
        height: '100%',
        border: 'none',
        borderRadius: '12px',
        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
        transition: 'transform .18s ease, box-shadow .18s ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: '0 10px 18px -4px rgba(16,24,40,.12)',
        },
      }}
    >
      <CardContent sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
          {loading ? (
            <>
              <Skeleton variant="circular" width={40} height={40} />
              <Skeleton variant="text" width={90} height={20} />
            </>
          ) : (
            <>
              {/* circular tinted well anchors the card's top-left */}
              <Box
                aria-hidden
                sx={{
                  color,
                  bgcolor: tint,
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                  '& svg': { fontSize: 21 },
                  boxShadow: isCritical ? `0 0 0 5px ${alpha(BRAND.primary, 0.12)}` : 'none',
                  animation: isCritical ? `${pulseKeyframes} 2s infinite ease-in-out` : 'none',
                }}
              >
                {icon}
              </Box>
              <Typography component="h3" sx={{ color: BRAND.textLight, fontSize: 13, fontWeight: 600, m: 0 }}>
                {label}
              </Typography>
            </>
          )}
        </Stack>

        {loading ? (
          <Skeleton variant="text" width={120} height={56} sx={{ mt: 2 }} />
        ) : (
          // value + delta on the left, trend shape right-aligned on the same row
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-end', justifyContent: 'space-between', mt: 2 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                sx={{
                  color: BRAND.heading, fontSize: 52, fontWeight: 800, lineHeight: 1,
                  letterSpacing: '-2px', fontVariantNumeric: 'tabular-nums',
                }}
              >
                {displayValue}
              </Typography>
              {/* comparison caption uses BRAND.text (~9.7:1), not textLight - at 12px
                  the lighter grey was the faintest text on the card */}
              <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mt: 1.25, flexWrap: 'wrap', rowGap: 0.5 }}>
                {trend && <DeltaBadge {...trend} label={trendLabel} />}
                <Typography sx={{ fontSize: 12, fontWeight: 500, color: BRAND.text }}>
                  {trend?.delta != null ? trendLabel : ''}
                </Typography>
              </Stack>
            </Box>
            <CardSparkline series={series} color={color} />
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
