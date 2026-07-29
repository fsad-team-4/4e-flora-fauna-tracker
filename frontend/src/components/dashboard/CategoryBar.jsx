import { useMemo } from 'react';
import { Card, CardContent, Box, Stack, Typography, Tooltip } from '@mui/material';
import BarChartOutlined from '@mui/icons-material/BarChartOutlined';
import { BRAND } from '../../theme';
import { CATEGORY_LABELS } from '../../constants';

// Monochromatic corporate blue scale. Shades map to categories by IDENTITY, not by
// rank, so a category keeps its shade as the counts move - a rank-based ramp would
// silently recolour every segment whenever the ordering changed.
//
// `pest` is the one exception: it is the escalating, contractor-dispatch category,
// so it keeps a semantic red.
const SEG_COLORS = {
  community_cat: '#1E3A5F',
  pigeon: '#2C5687',
  flora_health: '#4A7CB0',
  other: '#9FB3C8',
  pest: '#B3261E',
};
const SEG_FALLBACK = '#6E88A6';

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
 * Donut + legend. Replaces a stack of horizontal progress bars, which cost a lot of
 * vertical grid space to say "these are parts of a whole" - the shape a donut states
 * for free, leaving room for the count and percentage to be read cleanly beside it.
 *
 * Drawn as SVG arcs via stroke-dasharray on one circle per segment, so there is no
 * chart dependency and the ring stays crisp at any size.
 */
export default function CategoryBar({ casesByCategory = [], embedded = false }) {
  const { data, total } = useMemo(() => {
    const sum = casesByCategory.reduce((s, c) => s + c.count, 0);
    let rows = casesByCategory.map(c => ({
      key: c.category,
      label: CATEGORY_LABELS[c.category] || c.category,
      count: c.count,
      color: SEG_COLORS[c.category] || SEG_FALLBACK,
    }));
    rows = roundTo100(rows, sum).sort((a, b) => b.count - a.count);
    return { data: rows, total: sum };
  }, [casesByCategory]);

  // Ring geometry. Arc lengths and their cumulative offsets are computed up front:
  // accumulating inside the render map would mutate a closure variable mid-render.
  const size = 132, stroke = 18, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const segments = useMemo(
    () => data.reduce((acc, d) => {
      const prev = acc[acc.length - 1];
      acc.push({ ...d, len: (d.pct / 100) * c, offset: prev ? prev.offset + prev.len : 0 });
      return acc;
    }, []),
    [data, c]
  );

  const inner = (
    <Box sx={{ p: embedded ? 2 : 0 }}>
      {!embedded && (
        <>
          <Typography component="h2" variant="h6" fontWeight={700} sx={{ color: BRAND.heading }}>
            Cases by Category
          </Typography>
          <Typography variant="body2" sx={{ color: BRAND.textLight, mb: 2.5 }}>
            Distribution of active cases across the estate
          </Typography>
        </>
      )}

      {total === 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 6 }}>
          <BarChartOutlined sx={{ fontSize: 38, color: BRAND.textLight, mb: 1.25 }} />
          <Typography variant="body2" sx={{ color: BRAND.textLight }}>No cases to display yet.</Typography>
        </Box>
      ) : (
        <Stack direction="row" spacing={2.5} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 2 }}>
          {/* donut on the left, total in the hole */}
          <Box sx={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
            <Box component="svg" viewBox={`0 0 ${size} ${size}`} sx={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }} aria-hidden>
              <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={BRAND.section} strokeWidth={stroke} />
              {segments.map(d => (
                <circle
                  key={d.key}
                  cx={size / 2} cy={size / 2} r={r}
                  fill="none" stroke={d.color} strokeWidth={stroke}
                  strokeDasharray={`${d.len} ${c - d.len}`}
                  strokeDashoffset={-d.offset}
                />
              ))}
            </Box>
            <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography sx={{ fontSize: 26, fontWeight: 800, color: BRAND.heading, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {total}
                </Typography>
                <Typography sx={{ fontSize: 11, color: BRAND.textLight }}>cases</Typography>
              </Box>
            </Box>
          </Box>

          {/* colour-coded legend with percentage and count */}
          <Stack spacing={0.75} sx={{ flexGrow: 1, minWidth: 160 }}>
            {data.map(d => (
              <Tooltip key={d.key} title={`${d.label}: ${d.count} of ${total} cases`} placement="left">
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Box aria-hidden sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: d.color, flexShrink: 0 }} />
                  <Typography sx={{ fontSize: 13.5, color: BRAND.heading, fontWeight: 500, flexGrow: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {d.label}
                  </Typography>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: BRAND.heading, fontVariantNumeric: 'tabular-nums' }}>
                    {d.pct}%
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: BRAND.textLight, fontVariantNumeric: 'tabular-nums', minWidth: 28, textAlign: 'right' }}>
                    ({d.count})
                  </Typography>
                </Stack>
              </Tooltip>
            ))}
          </Stack>
        </Stack>
      )}
    </Box>
  );

  if (embedded) return inner;

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 3 }}>{inner}</CardContent>
    </Card>
  );
}
