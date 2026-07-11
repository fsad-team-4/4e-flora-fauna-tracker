import { useMemo } from 'react';
import { Card, CardContent, Box, Stack, Typography } from '@mui/material';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { BRAND, CATEGORY_COLORS } from '../../theme';
import { CATEGORY_LABELS } from '../../constants';


/**
 * Cases split by category as a donut with an icon legend. For the low case
 * volumes this estate runs, the legend leads with the ABSOLUTE count (what a team
 * acts on - "2 cases") and shows the percentage as secondary context, rather than
 * making the operator infer counts from a percentage.
 */
export default function CategoryDonut({ casesByCategory = [] }) {
  const { data, total } = useMemo(() => {
    const sum = casesByCategory.reduce((s, c) => s + c.count, 0);
    const rows = casesByCategory
      .map(c => ({
        key: c.category,
        label: CATEGORY_LABELS[c.category] || c.category,
        count: c.count,
        pct: sum ? Math.round((c.count / sum) * 100) : 0,
        color: CATEGORY_COLORS[c.category] || '#98A2B3',
      }))
      .sort((a, b) => b.count - a.count);
    return { data: rows, total: sum };
  }, [casesByCategory]);

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 3 }}>
        <Typography component="h2" variant="h6" fontWeight={700} sx={{ color: BRAND.heading }}>
          Cases by Category
        </Typography>
        <Typography variant="body2" sx={{ color: BRAND.textLight, mb: 1 }}>
          Distribution of active cases across the estate
        </Typography>
        {total === 0 ? (
          <Typography variant="body2" sx={{ color: BRAND.textLight, py: 8, textAlign: 'center' }}>
            No cases to display yet.
          </Typography>
        ) : (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} sx={{ alignItems: 'center' }}>
            <Box sx={{ position: 'relative', width: 200, height: 200, flexShrink: 0 }} role="img" aria-label={`Cases by category: ${data.map(d => `${d.label} ${d.count} case${d.count === 1 ? '' : 's'}`).join(', ')}`}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data} dataKey="count" nameKey="label" cx="50%" cy="50%" innerRadius={62} outerRadius={92} paddingAngle={2} stroke="#fff" strokeWidth={2}>
                    {data.map(d => <Cell key={d.key} fill={d.color} />)}
                  </Pie>
                  <Tooltip
                    formatter={(v, n) => [`${v} case${v === 1 ? '' : 's'}`, n]}
                    contentStyle={{ borderRadius: 10, border: `1px solid ${BRAND.border}`, fontSize: 13, boxShadow: '0 8px 24px rgba(16,24,40,.10)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography sx={{ fontSize: 30, fontWeight: 800, color: BRAND.heading, lineHeight: 1 }}>{total}</Typography>
                  <Typography sx={{ fontSize: 12, color: BRAND.textLight }}>cases</Typography>
                </Box>
              </Box>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1, width: '100%' }}>
              {data.map(d => (
                <Stack key={d.key} direction="row" spacing={1} sx={{ alignItems: 'center', border: `1px solid ${BRAND.border}`, borderRadius: '8px', px: 1, py: 0.75 }}>
                  {/* bold colour swatch mirrors the donut slice - colour is the primary identifier */}
                  <Box aria-hidden sx={{ width: 12, height: 12, borderRadius: '3px', bgcolor: d.color, flexShrink: 0 }} />
                  <Typography sx={{ fontSize: 13, color: BRAND.text, fontWeight: 500, flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.label}
                  </Typography>
                  {/* absolute count leads; percentage is secondary context */}
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: 'baseline', flexShrink: 0 }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 700, color: BRAND.heading }}>{d.count}</Typography>
                    <Typography sx={{ fontSize: 11.5, color: BRAND.textLight }}>({d.pct}%)</Typography>
                  </Stack>
                </Stack>
              ))}
            </Box>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}