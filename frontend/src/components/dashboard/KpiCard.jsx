import { useEffect, useRef, useState } from 'react';
import { Box, Card, CardContent, Stack, Typography, Skeleton, Tooltip } from '@mui/material';
import { alpha, keyframes, useTheme } from '@mui/material/styles';
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
  const trend = TREND[useTheme().palette.mode] || TREND.light;
  if (delta == null) return null;
  // A zero delta rendered as "→ 0 (-0%) vs last week" was pure clutter repeated four
  // times across the strip. No change now reads as a single flat dash, tooltip only.
  if (delta === 0) {
    return (
      <Tooltip title={`No change ${label}`}>
        <RemoveRoundedIcon titleAccess={`No change ${label}`} sx={{ fontSize: 18, color: trend.neutral }} />
      </Tooltip>
    );
  }
  const Icon = delta > 0 ? ArrowUpwardRoundedIcon : delta < 0 ? ArrowDownwardRoundedIcon : RemoveRoundedIcon;
  const good = improve && ((improve === 'down' && delta < 0) || (improve === 'up' && delta > 0));
  const bad = improve && delta !== 0 && !good;
  const color = good ? trend.good : bad ? trend.bad : trend.neutral;
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
 * Inline trend accent, sitting to the RIGHT of the value on the same baseline.
 *
 * It used to be a full-bleed 56px-tall gradient area chart welded to the bottom edge
 * of the card. At that size it dominated a tile whose whole job is one number, and
 * the swooping Catmull-Rom fill implied a smooth continuous quantity from seven
 * daily snapshots. Stroke only, 30px tall, no fill: same shape information, a
 * fraction of the ink, and it lets the card be short.
 *
 * Each card scales to its OWN min..max: a shared axis would flatten a 0-4 metric
 * into a dead line next to a 0-400 one. A genuinely flat series draws a straight
 * mid-height rule rather than a fake zig-zag from a zero range.
 *
 * A terminal dot marks the latest reading, so the eye knows which end is now.
 */
function CardSparkline({ series, color }) {
  if (!series || series.length < 2) return null;
  const w = 72, h = 30;
  const min = Math.min(...series), max = Math.max(...series);
  const range = max - min;
  const pad = 4;
  const y = v => (range === 0 ? h / 2 : h - pad - ((v - min) / range) * (h - pad * 2));
  const pts = series.map((v, i) => [(i / (series.length - 1)) * (w - 3), y(v)]);
  const d = smoothPath(pts);
  const last = pts[pts.length - 1];

  return (
    <Box
      component="svg"
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden
      sx={{ display: 'block', width: w, height: h, flexShrink: 0, overflow: 'visible', pointerEvents: 'none' }}
    >
      <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
      <circle cx={last[0]} cy={last[1]} r={2.4} fill={color} />
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

export default function KpiCard({ label, value, icon, color, tint, trend, series, alarm = false, trendLabel = 'vs last week', loading = false }) {
  const isNumeric = typeof value === 'number';
  const animatedValue = useCountUp(isNumeric ? value : 0);
  const displayValue = isNumeric ? animatedValue : value;

  // Passed in by the caller. This used to compare `color` against BRAND.primary,
  // which broke silently once the KPI hues became scheme-aware.
  const isCritical = alarm && isNumeric && value > 0;

  return (
    // Hairline border plus a diffused shadow and a rounder 12px corner: the shadow
    // lifts the tile in light mode, and the scheme-aware border keeps an edge in
    // dark, where black-alpha shadows are invisible.
    // position/overflow so the full-bleed sparkline can sit on the card's own edges
    // without escaping the rounded corners
    <Card
      sx={{
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        border: `1px solid ${BRAND.border}`,
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        transition: 'transform .18s ease, box-shadow .18s ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: '0 8px 16px -4px rgba(16,24,40,.12)',
        },
      }}
    >
      {/* Condensed: 20px gutter instead of 24, a 32px icon well instead of 40, and
          the sparkline moved inline beside the value instead of adding 56px of its
          own height at the bottom. Roughly a third shorter overall. */}
      <CardContent sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch', '&:last-child': { pb: 2.5 } }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          {loading ? (
            <>
              <Skeleton variant="circular" width={32} height={32} />
              <Skeleton variant="text" width={90} height={18} />
            </>
          ) : (
            <>
              {/* circular tinted well anchors the card's top-left */}
              <Box
                aria-hidden
                sx={{
                  color,
                  bgcolor: tint,
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                  '& svg': { fontSize: 18 },
                  boxShadow: isCritical ? `0 0 0 4px ${alpha(BRAND.primary, 0.12)}` : 'none',
                  animation: isCritical ? `${pulseKeyframes} 2s infinite ease-in-out` : 'none',
                }}
              >
                {icon}
              </Box>
              <Typography component="h3" sx={{ color: BRAND.textLight, fontSize: 12.5, fontWeight: 600, m: 0 }}>
                {label}
              </Typography>
            </>
          )}
        </Stack>

        {loading ? (
          <Skeleton variant="text" width={120} height={44} sx={{ mt: 1.5 }} />
        ) : (
          <Box sx={{ mt: 1.25, minWidth: 0 }}>
            {/* Value and sparkline on one row, the number's baseline anchoring both.
                `justifyContent: space-between` pushes the trend line to the card's
                right edge, which is what makes the pairing read as data-dense rather
                than as a chart with a caption. */}
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <Typography
                sx={{
                  color: BRAND.heading, fontSize: 40, fontWeight: 800, lineHeight: 1,
                  letterSpacing: '-1.5px', fontVariantNumeric: 'tabular-nums',
                }}
              >
                {displayValue}
              </Typography>
              <CardSparkline series={series} color={color} />
            </Stack>
            {/* the caption is dropped entirely when nothing changed - the flat dash
                from DeltaBadge already says "no change" without a line of text */}
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mt: 0.75, flexWrap: 'wrap', rowGap: 0.5, minHeight: 20 }}>
              {trend && <DeltaBadge {...trend} label={trendLabel} />}
              {trend?.delta != null && trend.delta !== 0 && (
                <Typography sx={{ fontSize: 12, fontWeight: 500, color: BRAND.text }}>{trendLabel}</Typography>
              )}
            </Stack>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
