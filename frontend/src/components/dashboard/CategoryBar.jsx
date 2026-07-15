import { useMemo } from 'react';
import { Card, CardContent, Box, Stack, Typography } from '@mui/material';
import { BRAND, CATEGORY_COLORS } from '../../theme';
import { CATEGORY_LABELS } from '../../constants';

// Largest-remainder rounding so the displayed percentages sum to exactly 100
// (naive per-item rounding can total 99 or 101, which quietly breaks trust).
function roundTo100(rows, total) {
  if (!total) return rows.map(r => ({ ...r, pct: 0 }));
  const exact = rows.map(r => ({ ...r, raw: (r.count / total) * 100 }));
  const floored = exact.map(r => ({ ...r, pct: Math.floor(r.raw), rem: r.raw - Math.floor(r.raw) }));
  let remaining = 100 - floored.reduce((s, r) => s + r.pct, 0);
  // hand the leftover points to the rows with the largest fractional remainders
  const order = [...floored].sort((a, b) => b.rem - a.rem);
  const bump = new Set();
  for (let i = 0; i < remaining; i++) bump.add(order[i].key);
  return floored.map(r => ({ ...r, pct: r.pct + (bump.has(r.key) ? 1 : 0) }));
}

/**
 * Cases by category as a SORTED horizontal bar chart. A donut reads worst when
 * slices are near-equal (2/2/2/1); a ranked bar shows the order instantly. Bar
 * length is share of total, and it matches the percentage shown (same
 * denominator), so the visual can't contradict the number. Count leads, percent
 * is secondary context. Percentages are rounded to sum to exactly 100.
 */
export default function CategoryBar({ casesByCategory = [] }) {
  const { data, total } = useMemo(() => {
    const sum = casesByCategory.reduce((s, c) => s + c.count, 0);
    let rows = casesByCategory.map(c => ({
      key: c.category,
      label: CATEGORY_LABELS[c.category] || c.category,
      count: c.count,
      color: CATEGORY_COLORS[c.category] || '#546e7a',
    }));
    rows = roundTo100(rows, sum).sort((a, b) => b.count - a.count);
    return { data: rows, total: sum };
  }, [casesByCategory]);

  const maxCount = data.reduce((m, d) => Math.max(m, d.count), 0);

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 3 }}>
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5 }}>
          <Typography component="h2" variant="h6" fontWeight={700} sx={{ color: BRAND.heading }}>
            Cases by Category
          </Typography>
          <Typography sx={{ fontSize: 13, color: BRAND.textLight }}>
            <Box component="span" sx={{ fontWeight: 700, color: BRAND.heading }}>{total}</Box> total
          </Typography>
        </Stack>
        <Typography variant="body2" sx={{ color: BRAND.textLight, mb: 2.5 }}>
          Distribution of active cases across the estate
        </Typography>

        {total === 0 ? (
          <Typography variant="body2" sx={{ color: BRAND.textLight, py: 8, textAlign: 'center' }}>
            No cases to display yet.
          </Typography>
        ) : (
          <Stack spacing={1.75}>
            {data.map(d => {
              // bar length = share of total (same denominator as the % shown),
              // scaled so the largest category fills the track. length faithfully
              // tracks the number; it can't say one thing while the % says another.
              const widthPct = maxCount ? (d.count / maxCount) * 100 : 0;
              return (
                <Box key={d.key}>
                  <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
                      <Box aria-hidden sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: d.color, flexShrink: 0 }} />
                      <Typography sx={{ fontSize: 14, color: BRAND.heading, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {d.label}
                      </Typography>
                    </Stack>
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'baseline', flexShrink: 0 }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 700, color: BRAND.heading }}>{d.count}</Typography>
                      <Typography sx={{ fontSize: 11.5, color: BRAND.textLight }}>({d.pct}%)</Typography>
                    </Stack>
                  </Stack>
                  <Box sx={{ height: 8, borderRadius: '4px', bgcolor: BRAND.section, overflow: 'hidden' }}>
                    <Box sx={{ height: '100%', width: `${widthPct}%`, bgcolor: d.color, borderRadius: '4px', transition: 'width .4s ease' }} />
                  </Box>
                </Box>
              );
            })}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}