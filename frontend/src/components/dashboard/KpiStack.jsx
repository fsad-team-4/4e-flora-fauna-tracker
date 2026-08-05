import { Box, Card, CardContent, Stack, Typography, Tooltip, Skeleton } from '@mui/material';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded';
import { useTheme } from '@mui/material/styles';
import { BRAND, TREND, RADII, surfaceSx } from '../../theme';

/**
 * Compact sparkline as an AREA chart, restored.
 *
 * These were deleted on the "kill chart junk" pass and asked for again since, so they are
 * back - placed BELOW the figure rather than beside it. Sitting alongside, a 62px squiggle
 * competed with a 40px numeral for the same eye-line; underneath it reads as a footnote to
 * the number, which is what a trend line actually is here.
 *
 * FILLED, NOT A BARE STROKE. A 1.5px line 22px tall is a hairline - it reads as a scratch
 * on the card rather than as a quantity, and at this size the eye cannot resolve slope from
 * a line alone. Closing the path to the baseline and filling it with a fade of its own ink
 * gives the shape mass, so "rising" and "falling" are legible at a glance without anyone
 * reading a value off it. The gradient fades to zero at the bottom so the fill never
 * becomes a solid block competing with the figure above.
 *
 * THE INK IS SEMANTIC, set per metric by the caller (see buildKpis) - danger for critical
 * flora, warning for hotspots, info for alert volume. It used to be a positional walk
 * through the NEON palette (magenta, cyan, teal), which meant a tile's colour depended on
 * where it happened to sit in the row and carried no meaning at all.
 *
 * Scaled to its OWN min..max - these metrics sit on wildly different ranges (a flora count
 * of 0-4 beside an alert count in the hundreds) and a shared scale would flatten most of
 * them into dead rules. Each tile prints its own figure, which is what makes that safe.
 * aria-hidden: the exact movement is already stated as a signed delta pill, so this is
 * decoration for screen readers.
 */
export function Spark({ series, color, id }) {
  if (!series || series.length < 2) return null;
  const w = 100, h = 22, pad = 2.5;
  const min = Math.min(...series), max = Math.max(...series);
  const range = max - min;
  const y = v => (range === 0 ? h / 2 : h - pad - ((v - min) / range) * (h - pad * 2));
  const pts = series.map((v, i) => [(i / (series.length - 1)) * (w - 3), y(v)]);
  const line = pts.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt[0].toFixed(1)},${pt[1].toFixed(1)}`).join(' ');
  // The same path, closed down to the baseline - that is what turns a stroke into an area.
  const area = `${line} L ${pts[pts.length - 1][0].toFixed(1)},${h} L ${pts[0][0].toFixed(1)},${h} Z`;
  const last = pts[pts.length - 1];
  // Gradient ids are document-global, so two tiles sharing one id would both render
  // whichever definition mounted last. Keyed off the caller's metric.
  const gid = `spark-${id}`;
  return (
    <Box component="svg" viewBox={`0 0 ${w} ${h}`} aria-hidden preserveAspectRatio="none"
      sx={{ width: '100%', height: h, display: 'block', overflow: 'visible', mt: 1 }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} stroke="none" />
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2} fill={color} />
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
/**
 * Tint pairs for the delta pill. Semantic tokens rather than the TREND inks alpha'd onto
 * themselves - see the note on the pill's sx below for why that mattered.
 *
 * `good`/`bad` are direction-relative, NOT up/down: falling critical flora is good, so the
 * mapping is decided by the metric's own `improve` field before it reaches here.
 */
const DELTA_TONE = {
  good: { bg: 'var(--em-ok-bg)', ink: 'var(--em-ok-ink)', border: 'var(--em-ok-border)' },
  bad: { bg: 'var(--em-danger-bg)', ink: 'var(--em-danger-ink)', border: 'var(--em-danger-border)' },
  neutral: { bg: 'var(--em-neutral-bg)', ink: 'var(--em-neutral-ink)', border: 'var(--em-neutral-border)' },
};

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
  const tone = good ? DELTA_TONE.good : bad ? DELTA_TONE.bad : DELTA_TONE.neutral;
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
          /* A REAL TINT PAIR, not a 16% wash of the ink on itself.
           * alpha(color, .16) derives the background FROM the foreground, so the two are
           * the same hue at two opacities - which is the definition of low contrast. The
           * red pill measured a washed-out ~3.4:1. The --em-*-bg / --em-*-ink pairs are
           * designed against each other and are scheme-aware, so the digits are crisp in
           * both themes; the 1px border in the same family gives the pill an edge on a
           * white card, where a pure tint has none. */
          bgcolor: tone.bg, color: tone.ink, border: `1px solid ${tone.border}`,
          cursor: 'help',
          fontSize: 12, fontWeight: 800, fontVariantNumeric: 'tabular-nums', flexShrink: 0,
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
/**
 * ONE KPI, one card. Extracted from the stack below so the dashboard can lay these
 * out as a row of equal cards beside the risk index, rather than only as a vertical
 * stack in a single grid cell. `ink` is passed in so whoever composes the row owns
 * the colour order.
 */
// `ink` is back with the sparkline it colours - the figure stays heading-coloured in
// both schemes, so the accent is spent only on the trend line.
export function KpiTile({ item, ink, loading = false }) {
  const mode = useTheme().palette.mode;
  return (
    <Card sx={{ ...surfaceSx(mode, 'card'), height: '100%' }}>
      <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
        {/* THE LABEL ROW IS JUST THE LABEL NOW.
            The delta pill used to sit up here, hard right of the label - which put the
            movement about 50px above and 200px across from the number it describes, so
            reading "critical flora is down 60%" meant two separate fixations and a
            left-to-right jump over empty card. It now sits on the figure's own baseline.
            The label keeps the row to itself, which also stops a long label like
            "Alerts Sent (30d)" being squeezed by the pill beside it. */}
        <Typography
          component="h3"
          sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: BRAND.textLight, m: 0, mb: 1.25, minWidth: 0 }}
        >
          {item.label}
        </Typography>

        {loading ? (
          <Skeleton variant="text" width={90} height={44} />
        ) : (
          /* NUMBER ONLY - the sparkline is gone.
             A 40px squiggle next to a 34px figure is a chart nobody can read a value
             off: too small to show a shape, too loud to ignore. The movement it was
             gesturing at is already stated exactly, as a signed delta pill in the header
             row above. So the tile now spends its ink on the one thing it is for, and
             the figure grows to fill the space the graph was using. */
          <>
            {/* Figure and movement on ONE baseline: "8" and "60% down" are a single fact
                and now read as one. `alignItems: baseline` rather than center - a 40px
                numeral and a 20px pill centred on each other leaves the pill floating
                mid-digit; on the baseline it sits where a footnote marker would. */}
            <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', flexWrap: 'wrap', rowGap: 0.5 }}>
              <Typography
                sx={{
                  fontSize: 40, fontWeight: 800, lineHeight: 1, letterSpacing: '-1.4px',
                  color: BRAND.heading, fontVariantNumeric: 'tabular-nums',
                }}
              >
                {item.value}
              </Typography>
              {item.trend && <Delta {...item.trend} label={item.label} />}
            </Stack>
            {ink && <Spark series={item.series} color={ink} id={item.key || item.label} />}
          </>
        )}

        {/* What the movement is measured against - stated, not assumed.
            12px / 600, not 11px / 400. This is the sentence that makes the delta pill above
            it mean anything - "60%" is unreadable without "vs last week" - and it was set
            below the 12px floor where small text stops being reliably legible, in the
            lightest grey on the card. It is now at the floor, with enough weight to hold at
            that size, in BRAND.text rather than textLight. */}
        {!loading && item.trend?.delta != null && (
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: BRAND.text, mt: 0.75 }}>
            {item.trendLabel || 'vs last week'}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

// The KpiStack wrapper that used to live here - a vertical Stack of tiles for one
// grid cell - is gone: the dashboard lays the tiles out as a row of equal cards
// itself, and assigns the inks, so nothing imported the stack any more. Only KpiTile
// above is used now, which makes this filename a mild misnomer; renaming it is churn
// across the import and the git history, so it is left as a judgement call.
