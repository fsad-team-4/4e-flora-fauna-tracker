import { useMemo } from 'react';
import { Card, CardContent, Box, Stack, Typography, Tooltip } from '@mui/material';
import BarChartOutlined from '@mui/icons-material/BarChartOutlined';
import { useTheme } from '@mui/material/styles';
import { BRAND } from '../../theme';
import { CATEGORY_LABELS } from '../../constants';

// Monochromatic corporate blue scale. Shades map to categories by IDENTITY, not by
// rank, so a category keeps its shade as the counts move - a rank-based ramp would
// silently recolour every segment whenever the ordering changed.
//
// `pest` is the one exception: it is the escalating, contractor-dispatch category,
// so it keeps a semantic red.
//
// Per scheme: the light set is deep-on-pale; the dark set lifts every slot so the
// segments and legend dots clear the 3:1 graphics floor on the dark card.
const SEG_COLORS = {
  light: {
    community_cat: '#1E3A5F',
    pigeon: '#2C5687',
    flora_health: '#4A7CB0',
    other: '#9FB3C8',
    pest: '#B3261E',
  },
  dark: {
    community_cat: '#5B8FD6',
    pigeon: '#7FA8D0',
    flora_health: '#7CC7D8',
    other: '#B7C4D4',
    pest: '#F08A8F',
  },
};
const SEG_FALLBACK = { light: '#6E88A6', dark: '#9DB0C6' };

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
 * One thick horizontal stacked bar with an inline legend.
 *
 * A donut plus its legend spent a large square of grid on four data points; a single
 * bar states the same part-to-whole relationship in roughly a quarter of the space,
 * with the percentage printed inside each segment wide enough to hold it.
 */
export default function CategoryBar({ casesByCategory = [], embedded = false }) {
  const mode = useTheme().palette.mode;
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

  // segments are the rounded percentages themselves, so the bar widths and the
  // printed figures can never disagree
  const segments = data;

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
        <>
          <Box sx={{ display: 'flex', height: 36, borderRadius: '8px', overflow: 'hidden', bgcolor: BRAND.section }}>
            {segments.map((d, i) => (
              <Tooltip key={d.key} title={`${d.label}: ${d.count} of ${total} (${d.pct}%)`}>
                <Box
                  sx={{
                    width: `${d.pct}%`, bgcolor: d.color, display: 'grid', placeItems: 'center',
                    transition: 'width .5s ease, filter .15s ease', transitionDelay: `${i * 50}ms`,
                    '&:hover': { filter: 'brightness(1.14)' },
                  }}
                >
                  {d.pct >= 12 && (
                    // dark scheme lifts the fills to mid-tones, so the in-segment
                    // label flips to a dark ink there to stay readable
                    <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: mode === 'dark' ? '#0F172A' : '#fff', fontVariantNumeric: 'tabular-nums' }}>
                      {d.pct}%
                    </Typography>
                  )}
                </Box>
              </Tooltip>
            ))}
          </Box>
          <Stack direction="row" spacing={2} sx={{ mt: 1.75, flexWrap: 'wrap', rowGap: 1 }}>
            {segments.map(d => (
              <Stack key={d.key} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                <Box aria-hidden sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: d.color, flexShrink: 0 }} />
                <Typography sx={{ fontSize: 13, color: BRAND.heading, fontWeight: 500 }}>{d.label}</Typography>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.heading, fontVariantNumeric: 'tabular-nums' }}>{d.pct}%</Typography>
                <Typography sx={{ fontSize: 12, color: BRAND.text, fontVariantNumeric: 'tabular-nums' }}>({d.count})</Typography>
              </Stack>
            ))}
          </Stack>
        </>
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
