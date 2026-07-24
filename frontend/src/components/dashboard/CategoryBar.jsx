import { useMemo } from 'react';
import { Card, CardContent, Box, Stack, Typography } from '@mui/material';
import BarChartOutlined from '@mui/icons-material/BarChartOutlined';
import { BRAND, CATEGORY_COLORS } from '../../theme';
import { CATEGORY_LABELS } from '../../constants';

function roundTo100(rows, total) {
  if (!total) return rows.map(r => ({ ...r, pct: 0 }));
  const exact = rows.map(r => ({ ...r, raw: (r.count / total) * 100 }));
  const floored = exact.map(r => ({ ...r, pct: Math.floor(r.raw), rem: r.raw - Math.floor(r.raw) }));
  let remaining = 100 - floored.reduce((s, r) => s + r.pct, 0);
  const order = [...floored].sort((a, b) => b.rem - a.rem);
  const bump = new Set();
  for (let i = 0; i < remaining; i++) bump.add(order[i].key);
  return floored.map(r => ({ ...r, pct: r.pct + (bump.has(r.key) ? 1 : 0) }));
}

// `embedded` = true when rendered inside a tab panel — skips the Card wrapper
// so the parent card's border/radius isn't doubled up.
export default function CategoryBar({ casesByCategory = [], embedded = false }) {
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

  const inner = (
    <Box sx={{ p: embedded ? 2 : 0 }}>
      {/* header row — only shown when not embedded (embedded has its own tab label) */}
      {!embedded && (
        <>
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
            <Typography component="h2" variant="h6" fontWeight={700} sx={{ color: BRAND.heading }}>
              Cases by Category
            </Typography>
            <Box sx={{ display: 'inline-flex', px: 1.5, py: 0.25, bgcolor: BRAND.section, borderRadius: '100px', border: `1px solid ${BRAND.border}`, alignItems: 'center' }}>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: BRAND.heading }}>{total} total</Typography>
            </Box>
          </Stack>
          <Typography variant="body2" sx={{ color: BRAND.textLight, mb: 2.5 }}>
            Distribution of active cases across the estate
          </Typography>
        </>
      )}

      {/* when embedded, show a compact total line instead */}
      {embedded && (
        <Stack direction="row" sx={{ justifyContent: 'flex-end', mb: 1.5 }}>
          <Box sx={{ display: 'inline-flex', px: 1.25, py: 0.2, bgcolor: BRAND.section, borderRadius: '100px', border: `1px solid ${BRAND.border}` }}>
            <Typography sx={{ fontSize: 11, fontWeight: 700, color: BRAND.heading }}>{total} total</Typography>
          </Box>
        </Stack>
      )}

      {total === 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 6 }}>
          <BarChartOutlined sx={{ fontSize: 38, color: BRAND.textLight, mb: 1.25 }} />
          <Typography variant="body2" sx={{ color: BRAND.textLight }}>No cases to display yet.</Typography>
        </Box>
      ) : (
        <Stack spacing={0.5}>
          {data.map((d, index) => {
            const widthPct = maxCount ? (d.count / maxCount) * 100 : 0;
            return (
              <Box
                key={d.key}
                sx={{
                  borderRadius: '8px',
                  px: 1,
                  mx: -1,
                  py: 0.75,
                  transition: 'background-color .15s ease',
                  '&:hover': { bgcolor: BRAND.section },
                }}
              >
                <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
                    <Box aria-hidden sx={{ width: 9, height: 9, borderRadius: '3px', bgcolor: d.color, flexShrink: 0 }} />
                    <Typography sx={{ fontSize: 13.5, color: BRAND.heading, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {d.label}
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: 'baseline', flexShrink: 0 }}>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: BRAND.heading }}>{d.count}</Typography>
                    <Typography sx={{ fontSize: 11, color: BRAND.textLight }}>({d.pct}%)</Typography>
                  </Stack>
                </Stack>
                <Box sx={{ height: 7, borderRadius: '4px', bgcolor: 'rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                  <Box
                    sx={{
                      height: '100%',
                      width: `${widthPct}%`,
                      bgcolor: d.color,
                      borderRadius: '4px',
                      transition: 'width .4s ease',
                      transitionDelay: `${index * 60}ms`,
                    }}
                  />
                </Box>
              </Box>
            );
          })}
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
