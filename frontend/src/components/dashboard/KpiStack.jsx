import { Box, Card, CardContent, Stack, Typography, Tooltip, Skeleton } from '@mui/material';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded';
import { useTheme, alpha } from '@mui/material/styles';
import { BRAND, TREND, NEON, RADII, surfaceSx } from '../../theme';

/**
 * Compact sparkline. Stroke only, terminal dot, scaled to its OWN min..max - these
 * metrics sit on wildly different ranges (a flora count of 0-4 beside an alert count in
 * the hundreds), and a shared scale would flatten most of them into dead rules. Each
 * tile prints its own figure, which is what makes that safe.
 */
function Spark({ series, color, mode }) {
  if (!series || series.length < 2) return null;
  const w = 62, h = 22, pad = 2.5;
  const min = Math.min(...series), max = Math.max(...series);
  const range = max - min;
  const y = v => (range === 0 ? h / 2 : h - pad - ((v - min) / range) * (h - pad * 2));
  const pts = series.map((v, i) => [(i / (series.length - 1)) * (w - 3), y(v)]);
  let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  const t = 0.2;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += ` C ${(p1[0] + (p2[0] - p0[0]) * t).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) * t).toFixed(1)}`
      + ` ${(p2[0] - (p3[0] - p1[0]) * t).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) * t).toFixed(1)}`
      + ` ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  return (
    <Box component="svg" viewBox={`0 0 ${w} ${h}`} aria-hidden
      sx={{
        width: w, height: h, display: 'block', flexShrink: 0, overflow: 'visible',
        filter: mode === 'dark' ? `drop-shadow(0 0 4px ${alpha(color, 0.55)})` : 'none',
      }}>
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2.1} fill={color} />
    </Box>
  );
}

/**
 * Movement, as an arrow plus a percentage.
 *
 * `improve` says which direction is good FOR THIS METRIC, so falling critical flora
 * reads as good. Where neither direction is better - alerts sent tracks activity, not
 * performance - it stays neutral grey and only the arrow carries the movement.
 *
 * A measured zero is a flat dash. No comparison at all is an em-dash with its own
 * tooltip: "no week-old snapshot" and "no change" are different facts, and collapsing
 * them would report an absent reading as a flat one.
 */
function Delta({ delta, base, improve, label }) {
  const trend = TREND[useTheme().palette.mode] || TREND.light;
  if (delta == null) {
    return (
      <Tooltip title={`No week-old snapshot for ${label} yet, so there is nothing to compare against`}>
        <Typography component="span" sx={{ fontSize: 12.5, fontWeight: 700, color: trend.neutral, cursor: 'help' }}>—</Typography>
      </Tooltip>
    );
  }
  if (delta === 0) {
    return (
      <Tooltip title={`${label}: no change vs last week`}>
        <RemoveRoundedIcon titleAccess={`${label}: no change vs last week`} sx={{ fontSize: 15, color: trend.neutral }} />
      </Tooltip>
    );
  }
  const good = improve && ((improve === 'down' && delta < 0) || (improve === 'up' && delta > 0));
  const bad = improve && !good;
  const color = good ? trend.good : bad ? trend.bad : trend.neutral;
  const Icon = delta > 0 ? ArrowUpwardRoundedIcon : ArrowDownwardRoundedIcon;
  // a percentage needs a non-zero baseline to mean anything; else show the count
  const prev = base != null ? base - delta : null;
  const pct = prev && prev > 0 ? Math.round((delta / prev) * 100) : null;
  return (
    <Tooltip title={`${delta > 0 ? '+' : ''}${delta} ${label}${pct != null ? ` (${pct > 0 ? '+' : ''}${pct}%)` : ''} vs last week`}>
      <Stack component="span" direction="row" spacing={0.2}
        aria-label={`${label}: ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)}${pct != null ? `, ${Math.abs(pct)} percent` : ''} versus last week`}
        sx={{
          alignItems: 'center', px: 0.85, py: 0.3, borderRadius: `${RADII.pill}px`,
          bgcolor: alpha(color, 0.16), color, cursor: 'help',
          fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums', flexShrink: 0,
        }}>
        <Icon sx={{ fontSize: 13 }} aria-hidden />
        <span>{pct != null ? `${Math.abs(pct)}%` : Math.abs(delta)}</span>
      </Stack>
    </Tooltip>
  );
}

/**
 * The three supporting metrics as a VERTICAL STACK of compact tiles.
 *
 * They were three wide cards sitting side by side, each spending most of its width on
 * whitespace around one number. Stacked into a single column they occupy one grid cell
 * beside the other row-two cards, which is what lets the bento row hold three panels
 * instead of one row of tiles and then another row of panels.
 *
 * Neon inks, one per metric, are for the SPARKLINE AND THE FIGURE ONLY - the data layer.
 * The label stays muted grey, so the tile reads as one bright number with quiet
 * scaffolding rather than as a coloured block.
 */
export default function KpiStack({ items = [], loading = false }) {
  const mode = useTheme().palette.mode;
  const n = NEON[mode] || NEON.dark;
  // one non-semantic ink per slot, in stack order
  const inks = [n.magenta, n.cyan, n.teal];

  return (
    <Stack spacing={2} sx={{ height: '100%' }}>
      {items.map((item, i) => {
        const ink = inks[i % inks.length];
        return (
          <Card key={item.label} sx={{ ...surfaceSx(mode, 'card'), flexGrow: 1 }}>
            <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.25 }}>
                <Typography
                  component="h3"
                  sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: BRAND.textLight, m: 0, minWidth: 0 }}
                >
                  {item.label}
                </Typography>
                {!loading && item.trend && <Delta {...item.trend} label={item.label} />}
              </Stack>

              {loading ? (
                <Skeleton variant="text" width={90} height={44} />
              ) : (
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
                  <Typography
                    sx={{
                      fontSize: 34, fontWeight: 700, lineHeight: 1, letterSpacing: '-1.2px',
                      color: BRAND.heading, fontVariantNumeric: 'tabular-nums',
                      textShadow: mode === 'dark' ? `0 0 18px ${alpha(ink, 0.35)}` : 'none',
                    }}
                  >
                    {item.value}
                  </Typography>
                  <Spark series={item.series} color={ink} mode={mode} />
                </Stack>
              )}

              {/* What the movement is measured against - stated, not assumed. */}
              {!loading && item.trend?.delta != null && (
                <Typography sx={{ fontSize: 11, color: BRAND.textLight, mt: 0.75 }}>
                  {item.trendLabel || 'vs last week'}
                </Typography>
              )}
            </CardContent>
          </Card>
        );
      })}
    </Stack>
  );
}
