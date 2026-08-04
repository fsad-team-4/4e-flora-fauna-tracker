import { useMemo } from 'react';
import { Card, CardContent, Box, Stack, Typography } from '@mui/material';
import BarChartOutlined from '@mui/icons-material/BarChartOutlined';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useTheme, alpha } from '@mui/material/styles';
import { BRAND, SURFACE, NEON, surfaceSx } from '../../theme';
import { CATEGORY_LABELS } from '../../constants';

// Recharts writes `stroke` into an SVG attribute, where a var(--em-surface) token
// never resolves, so the arc separator needs the literal surface colour per scheme.


function DonutTooltip({ active, payload, total }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <Box sx={{ bgcolor: BRAND.surface, border: `1px solid ${BRAND.border}`, borderRadius: '8px', boxShadow: '0 12px 32px rgba(16,24,40,.15)', px: 1.5, py: 1 }}>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
        <Box aria-hidden sx={{ width: 9, height: 9, borderRadius: '2px', bgcolor: d.color, flexShrink: 0 }} />
        <Typography sx={{ fontSize: 13, color: BRAND.heading, fontWeight: 600 }}>
          {d.label}: {d.count} of {total} ({d.pct}%)
        </Typography>
      </Stack>
    </Box>
  );
}

/**
 * NEON segment inks, one per category.
 *
 * These replace a monochromatic corporate-blue scale, which was chosen so that shades
 * mapped to categories by IDENTITY rather than rank. That property is kept: each key
 * below owns a fixed hue, so a category never changes colour as the counts move.
 *
 * NO YELLOW, and `pest` is no longer red. The old set gave `pest` a semantic crimson on
 * the grounds that it is the escalating category - but that put a status hue on a
 * CATEGORY swatch, so a legend dot and a danger pill were the same colour meaning
 * different things. Every slot here is off the semantic hues; escalation is carried by
 * the case's own status pill, which is where status belongs.
 */
const SEG_COLORS = {
  light: {
    community_cat: NEON.light.cyan,
    pigeon: NEON.light.purple,
    flora_health: NEON.light.teal,
    pest: NEON.light.magenta,
    other: NEON.light.slate,
  },
  dark: {
    community_cat: NEON.dark.cyan,
    pigeon: NEON.dark.purple,
    flora_health: NEON.dark.teal,
    pest: NEON.dark.magenta,
    other: NEON.dark.slate,
  },
};
const SEG_FALLBACK = { light: NEON.light.slate, dark: NEON.dark.slate };

function roundTo100(rows, total) {
  if (!total) return rows.map(r => ({ ...r, pct: 0 }));
  const exact = rows.map(r => ({ ...r, raw: (r.count / total) * 100 }));
  const floored = exact.map(r => ({ ...r, pct: Math.floor(r.raw), rem: r.raw - Math.floor(r.raw) }));
  const remaining = 100 - floored.reduce((s, r) => s + r.pct, 0);
  const order = [...floored].sort((a, b) => b.rem - a.rem);
  const bump = new Set();
  for (let i = 0; i < remaining; i++) bump.add(order[i].key);
  return floored.map(r => ({ ...r, pct: r.pct + (bump.has(r.key) ? 1 : 0) }));
}

/**
 * A thin donut with the legend as a right-hand table.
 *
 * The 36px stacked bar carried the same numbers but read as one heavy slab, and it
 * forced the percentage INSIDE each segment, so any category under 12% silently
 * lost its label. A thin ring reads as part-to-whole immediately, and moving the
 * figures into an aligned legend means every category is labelled at any size.
 *
 * Arc angles are hard to compare precisely, so the legend - not the ring - carries
 * the exact percentage and count. The ring is the shape; the table is the data.
 */
export default function CategoryBar({ casesByCategory = [], embedded = false }) {
  const mode = useTheme().palette.mode;
  const s = SURFACE[mode] || SURFACE.dark;
  const surface = s.card;
  const { data, total } = useMemo(() => {
    const segColors = SEG_COLORS[mode] || SEG_COLORS.light;
    const fallback = SEG_FALLBACK[mode] || SEG_FALLBACK.light;
    const sum = casesByCategory.reduce((s, c) => s + c.count, 0);
    let rows = casesByCategory.map(c => ({
      key: c.category,
      label: CATEGORY_LABELS[c.category] || c.category,
      count: c.count,
      color: segColors[c.category] || fallback,
    }));
    rows = roundTo100(rows, sum).sort((a, b) => b.count - a.count);
    return { data: rows, total: sum };
  }, [casesByCategory, mode]);

  // segments are the rounded percentages themselves, so the arc angles and the
  // printed figures can never disagree
  const segments = data;
  // The ring is aria-hidden by nature, so the whole distribution is restated here
  // for screen readers rather than left as an unlabelled graphic.
  const ariaSummary = total
    ? `Case distribution across ${total} cases: ${segments.map(d => `${d.label} ${d.pct} percent, ${d.count} case${d.count === 1 ? '' : 's'}`).join('; ')}.`
    : 'No cases to display yet.';

  const inner = (
    <Box sx={{ p: embedded ? 2 : 0 }}>
      {!embedded && (
        <>
          <Typography component="h2" variant="h6" fontWeight={700} sx={{ color: BRAND.heading }}>
            Cases by Category
          </Typography>
          <Typography variant="body2" sx={{ color: BRAND.textLight, mb: 2.5 }}>
            Distribution of {total} case{total === 1 ? '' : 's'} across the estate
          </Typography>
        </>
      )}

      {total === 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 6 }}>
          <BarChartOutlined sx={{ fontSize: 38, color: BRAND.textLight, mb: 1.25 }} />
          <Typography variant="body2" sx={{ color: BRAND.textLight }}>No cases to display yet.</Typography>
        </Box>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '150px minmax(0, 1fr)' },
            gap: { xs: 2, sm: 3 }, alignItems: 'center',
          }}
        >
          {/* Ring. 2px of surface between arcs (paddingAngle + a surface stroke)
              rather than letting neighbouring fills touch, so adjacent categories
              stay separable without relying on hue contrast alone. */}
          <Box
            role="img"
            aria-label={ariaSummary}
            sx={{
              width: '100%', height: 150, mx: 'auto', maxWidth: 150,
              // the arcs bloom on dark; on light a glow renders as a smudge, so none
              filter: mode === 'dark' ? 'drop-shadow(0 0 8px rgba(34,211,238,.28))' : 'none',
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <Pie
                  data={segments}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  // THIN RING. 66%->82% inner made the band about a third of the radius,
                  // which reads as a heavy doughnut; a narrow ring reads as a scale and
                  // leaves a real hole for the total.
                  innerRadius="82%"
                  outerRadius="98%"
                  paddingAngle={1.5}
                  stroke={surface}
                  strokeWidth={2}
                  isAnimationActive
                  animationDuration={600}
                  labelLine={false}
                  label={false}
                >
                  {segments.map(d => <Cell key={d.key} fill={d.color} />)}
                </Pie>
                <Tooltip content={<DonutTooltip total={total} />} />
              </PieChart>
            </ResponsiveContainer>
            {/* Total in the hole: the one figure the ring itself cannot state. */}
            {/* The total in the hollow centre, with a soft bloom on dark. The ring
                itself cannot state this figure, which is why it sits in the hole. */}
            <Box sx={{ mt: '-95px', textAlign: 'center', pointerEvents: 'none' }}>
              <Typography
                sx={{
                  fontSize: 28, fontWeight: 700, lineHeight: 1, color: BRAND.heading,
                  fontVariantNumeric: 'tabular-nums', letterSpacing: '-1px',
                  textShadow: mode === 'dark' ? `0 0 20px ${alpha(NEON.dark.cyan, 0.4)}` : 'none',
                }}
              >
                {total}
              </Typography>
              <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.7px', textTransform: 'uppercase', color: BRAND.textLight, mt: 0.25 }}>
                cases
              </Typography>
            </Box>
          </Box>

          {/* Legend as an aligned table: swatch, label, then percentage and count on
              their own right-aligned rails so the figures stack vertically. */}
          <Stack spacing={0.85} sx={{ minWidth: 0 }}>
            {segments.map(d => (
              <Box
                key={d.key}
                sx={{ display: 'grid', gridTemplateColumns: '8px minmax(0, 1fr) 42px 34px', gap: 1, alignItems: 'center' }}
              >
                <Box aria-hidden sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: d.color, flexShrink: 0 }} />
                <Typography sx={{ fontSize: 13, color: BRAND.heading, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {d.label}
                </Typography>
                <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: BRAND.heading, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                  {d.pct}%
                </Typography>
                <Typography sx={{ fontSize: 12, color: BRAND.text, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                  ({d.count})
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      )}
    </Box>
  );

  if (embedded) return inner;

  return (
    <Card sx={{ ...surfaceSx(mode, 'card'), height: '100%' }}>
      <CardContent sx={{ p: { xs: 2.25, md: 2.75 }, '&:last-child': { pb: { xs: 2.25, md: 2.75 } } }}>{inner}</CardContent>
    </Card>
  );
}
