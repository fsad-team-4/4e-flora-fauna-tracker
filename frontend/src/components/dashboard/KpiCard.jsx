import { useEffect, useId, useRef, useState } from 'react';
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
  const w = 240, h = 64;
  const min = Math.min(...series), max = Math.max(...series);
  const range = max - min;
  // leave a little headroom at the top; the fill runs to the very bottom edge
  const y = v => (range === 0 ? h * 0.55 : h - ((v - min) / range) * (h - 14) - 6);
  const pts = series.map((v, i) => [(i / (series.length - 1)) * w, y(v)]);
  const d = smoothPath(pts);

  // In flow at the bottom of the card's flex column, with negative margins cancelling
  // CardContent's padding: full-bleed to the bottom and side edges, but occupying its
  // own reserved height so it cannot overlap the value or the delta row.
  return (
    <Box
      component="svg"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden
      sx={{ display: 'block', width: 'auto', height: 56, mt: 'auto', mx: -3, mb: -3, pointerEvents: 'none' }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2={h} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={color} stopOpacity={0.26} />
          <stop offset="100%" stopColor={color} stopOpacity={0.03} />
        </linearGradient>
      </defs>
      <path d={`${d} L ${w},${h} L 0,${h} Z`} fill={`url(#${gradId})`} stroke="none" />
      <path d={d} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
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
      <CardContent sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch', '&:last-child': { pb: 3 } }}>
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
          <Box sx={{ mt: 1.5, minWidth: 0 }}>
            <Typography
              sx={{
                color: BRAND.heading, fontSize: 52, fontWeight: 800, lineHeight: 1,
                letterSpacing: '-2px', fontVariantNumeric: 'tabular-nums',
              }}
            >
              {displayValue}
            </Typography>
            {/* the caption is dropped entirely when nothing changed - the flat dash
                from DeltaBadge already says "no change" without a line of text */}
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mt: 1, flexWrap: 'wrap', rowGap: 0.5, minHeight: 20 }}>
              {trend && <DeltaBadge {...trend} label={trendLabel} />}
              {trend?.delta != null && trend.delta !== 0 && (
                <Typography sx={{ fontSize: 12, fontWeight: 500, color: BRAND.text }}>{trendLabel}</Typography>
              )}
            </Stack>
          </Box>
        )}

        {!loading && <CardSparkline series={series} color={color} />}
      </CardContent>
    </Card>
  );
}
