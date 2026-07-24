import { useEffect, useRef, useState } from 'react';
import { Box, Card, CardContent, Stack, Typography, Skeleton } from '@mui/material';
import { alpha, lighten, keyframes } from '@mui/material/styles';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import TrendingFlatRoundedIcon from '@mui/icons-material/TrendingFlatRounded';
import { BRAND, TREND } from '../../theme';

function useCountUp(target, duration = 600) {
  const [count, setCount] = useState(0);
  const frame = useRef(null);
  useEffect(() => {
    if (typeof target !== 'number') return;
    const start = performance.now();
    const from = 0;
    const animate = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setCount(Math.round(from + (target - from) * eased));
      if (t < 1) frame.current = requestAnimationFrame(animate);
    };
    frame.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame.current);
  }, [target, duration]);
  return count;
}

function TrendChip({ delta, improve, base, label }) {
  if (delta == null) return null;
  const Icon = delta > 0 ? TrendingUpRoundedIcon : delta < 0 ? TrendingDownRoundedIcon : TrendingFlatRoundedIcon;
  const good = improve && ((improve === 'down' && delta < 0) || (improve === 'up' && delta > 0));
  const bad = improve && delta !== 0 && !good;
  const color = good ? TREND.good : bad ? TREND.bad : TREND.neutral;
  const sign = delta > 0 ? '+' : '';
  const prev = base != null ? base - delta : null;
  const pct = prev && prev > 0 ? Math.round((delta / prev) * 100) : null;
  return (
    <Stack
      direction="row"
      spacing={0.25}
      component="span"
      aria-label={`${delta > 0 ? 'up' : delta < 0 ? 'down' : 'no change'} ${Math.abs(delta)}${pct != null ? `, ${Math.abs(pct)} percent` : ''} ${label}`}
      sx={{
        alignItems: 'center',
        color,
        fontSize: 13,
        fontWeight: 700,
        borderRadius: '100px',
        px: 1,
        py: 0.25,
        bgcolor: alpha(color, 0.1),
        display: 'inline-flex'
      }}
    >
      <Icon sx={{ fontSize: 16 }} aria-hidden />
      <span>{delta === 0 ? '0' : `${sign}${delta}`}</span>
      {pct != null && delta !== 0 && (
        <Box component="span" sx={{ fontWeight: 600, ml: 0.25 }}>
          ({sign}{pct}%)
        </Box>
      )}
    </Stack>
  );
}

const pulseKeyframes = keyframes`
  0% {
    box-shadow: 0 0 0 0px ${alpha(BRAND.primary, 0.2)};
  }
  70% {
    box-shadow: 0 0 0 4px ${alpha(BRAND.primary, 0.12)};
  }
  100% {
    box-shadow: 0 0 0 0px ${alpha(BRAND.primary, 0)};
  }
`;

export default function KpiCard({ label, value, icon, color, tint, trend, trendLabel = 'vs last week', loading = false }) {
  const isNumeric = typeof value === 'number';
  const animatedValue = useCountUp(isNumeric ? value : 0);
  const displayValue = isNumeric ? animatedValue : value;

  const isCritical = color === BRAND.primary && isNumeric && value > 0;

  let hoverBorderColor = color;
  try {
    hoverBorderColor = lighten(color, 0.15);
  } catch {
    // fallback if lighten fails
  }

  return (
    <Card
      sx={{
        height: '100%',
        borderLeft: `3px solid ${color}`,
        transition: 'transform .18s ease, box-shadow .18s ease, border-left-color .18s ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: '0 12px 32px rgba(16,24,40,.12)',
          borderLeftColor: hoverBorderColor,
        },
      }}
    >
      <CardContent sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          {loading ? (
            <>
              <Skeleton variant="rectangular" width={28} height={28} sx={{ borderRadius: '8px' }} />
              <Skeleton variant="text" width={80} height={20} />
            </>
          ) : (
            <>
              <Box
                aria-hidden
                sx={{
                  color,
                  bgcolor: tint,
                  width: 28,
                  height: 28,
                  borderRadius: '8px',
                  display: 'grid',
                  placeItems: 'center',
                  '& svg': { fontSize: 17 },
                  boxShadow: isCritical ? `0 0 0 4px ${alpha(BRAND.primary, 0.12)}` : 'none',
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
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'flex-end', mt: 'auto', pt: 1.25 }}>
            <Skeleton variant="rectangular" width={96} height={40} sx={{ borderRadius: '4px' }} />
          </Stack>
        ) : (
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'flex-end', mt: 'auto', pt: 1.25 }}>
            <Typography sx={{ color: BRAND.heading, fontSize: 34, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.5px' }}>
              {displayValue}
            </Typography>
            {trend && <Box sx={{ pb: 0.5 }}><TrendChip {...trend} label={trendLabel} /></Box>}
          </Stack>
        )}

        {loading ? (
          <Skeleton variant="text" width={120} height={16} sx={{ mt: 0.5 }} />
        ) : (
          <Typography sx={{ color: BRAND.textLight, fontSize: 12, mt: 0.5, minHeight: 16 }}>
            {trend?.delta != null ? trendLabel : ' '}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
