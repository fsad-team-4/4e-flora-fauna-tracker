import { Box, Card, CardContent, Stack, Typography, Skeleton } from '@mui/material';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import TrendingFlatRoundedIcon from '@mui/icons-material/TrendingFlatRounded';
import { BRAND, TREND } from '../../theme';

/**
 * Trend chip: an arrow (direction) + delta, coloured by whether the movement is
 * good or bad for THIS metric. When a `base` is supplied, a % change is shown
 * alongside the absolute delta so a small move on a small number and a small move
 * on a large number don't look identically dramatic.
 */
function TrendChip({ delta, improve, base, label }) {
  if (delta == null) return null;
  const Icon = delta > 0 ? TrendingUpRoundedIcon : delta < 0 ? TrendingDownRoundedIcon : TrendingFlatRoundedIcon;
  const good = improve && ((improve === 'down' && delta < 0) || (improve === 'up' && delta > 0));
  const bad = improve && delta !== 0 && !good;
  const color = good ? TREND.good : bad ? TREND.bad : TREND.neutral;
  const sign = delta > 0 ? '+' : '';
  // % context, computed against the previous value (base - delta) so it reads as
  // "change relative to where we were". Only shown when we have a sensible base.
  const prev = base != null ? base - delta : null;
  const pct = prev && prev > 0 ? Math.round((delta / prev) * 100) : null;
  return (
    <Stack
      direction="row"
      spacing={0.25}
      component="span"
      aria-label={`${delta > 0 ? 'up' : delta < 0 ? 'down' : 'no change'} ${Math.abs(delta)}${pct != null ? `, ${Math.abs(pct)} percent` : ''} ${label}`}
      sx={{ alignItems: 'center', color, fontSize: 13, fontWeight: 700 }}
    >
      <Icon sx={{ fontSize: 16 }} aria-hidden />
      <span>{delta === 0 ? '0' : `${sign}${delta}`}</span>
      {pct != null && delta !== 0 && (
        <Box component="span" sx={{ fontWeight: 600, opacity: 0.8, ml: 0.25 }}>
          ({sign}{pct}%)
        </Box>
      )}
    </Stack>
  );
}

/**
 * KPI tile: muted label with a small icon, a large value, and an inline trend
 * chip with a caption. `trendLabel` is standardised by the caller so every card
 * uses the same wording.
 */
export default function KpiCard({ label, value, icon, color, tint, trend, trendLabel = 'vs last week', loading = false }) {
  return (
    <Card
      sx={{
        height: '100%',
        transition: 'transform .18s ease, box-shadow .18s ease',
        '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 10px 24px rgba(16,24,40,.08)' },
      }}
    >
      <CardContent sx={{ p: 2.5 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Box aria-hidden sx={{ color, bgcolor: tint, width: 28, height: 28, borderRadius: '8px', display: 'grid', placeItems: 'center', '& svg': { fontSize: 17 } }}>
            {icon}
          </Box>
          <Typography component="h3" sx={{ color: BRAND.textLight, fontSize: 13, fontWeight: 600, m: 0 }}>
            {label}
          </Typography>
        </Stack>
        {loading ? (
          <Skeleton variant="text" width={96} height={48} sx={{ mt: 1.25 }} />
        ) : (
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'flex-end', mt: 1.25 }}>
            <Typography sx={{ color: BRAND.heading, fontSize: 34, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.5px' }}>
              {value}
            </Typography>
            {trend && <Box sx={{ pb: 0.5 }}><TrendChip {...trend} label={trendLabel} /></Box>}
          </Stack>
        )}
        {loading ? (
          <Skeleton variant="text" width={80} sx={{ mt: 0.5 }} />
        ) : (
          <Typography sx={{ color: BRAND.textLight, fontSize: 12, mt: 0.5, minHeight: 16 }}>
            {trend?.delta != null ? trendLabel : ' '}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}