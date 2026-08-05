import { useMemo } from 'react';
import { Card, CardContent, Box, Stack, Typography } from '@mui/material';
import BarChartOutlined from '@mui/icons-material/BarChartOutlined';
import { useTheme } from '@mui/material/styles';
import { BRAND, RADII, surfaceSx } from '../../theme';
import { CATEGORY_ICONS, swatchFor } from './categoryMeta';
import { CATEGORY_LABELS } from '../../constants';

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
 * Case mix as a 6px proportion bar over a ranked list.
 *
 * One shape replacing another, twice: a 36px stacked slab, then a thin donut with the
 * figures in a legend beside it, now a hairline bar with the figures AS the content.
 * Each step moved ink from the shape to the numbers, and this is the end of that line -
 * for four categories totalling seven cases, the list is the chart.
 *
 * Percentages are pre-rounded to sum to exactly 100 (roundTo100), so the bar widths and
 * the printed figures can never disagree.
 */
export default function CategoryBar({ casesByCategory = [], embedded = false }) {
  const mode = useTheme().palette.mode;
  const { data, total } = useMemo(() => {
    const sum = casesByCategory.reduce((s, c) => s + c.count, 0);
    let rows = casesByCategory.map(c => ({
      key: c.category,
      label: CATEGORY_LABELS[c.category] || c.category,
      count: c.count,
      // shared with Recent Activity, and keyed by category rather than by rank - see
      // categoryMeta.js
      color: swatchFor(c.category, mode),
      Icon: CATEGORY_ICONS[c.category] || CATEGORY_ICONS.other,
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
        <Box>
          {/* ONE THIN STACKED BAR, THEN A RANKED LIST. The donut is gone.
              It was a four-colour ring drawing 2 / 2 / 2 / 1 out of seven cases - a
              chart for a dataset you can read faster as words, and it needed a legend
              underneath restating every figure the ring had just gestured at. So the
              legend became the content.
              The bar is kept because proportion is the one thing a list does not show
              at a glance. Thickened 6px -> 12px on request: at 6 it read as a hairline
              rule rather than a proportion, and the four segments were hard to tell apart.
              Still one line rather than a 150px ring, and
              it carries no labels of its own - the list below is the labelling. */}
          <Box
            role="img"
            aria-label={ariaSummary}
            sx={{ display: 'flex', height: 12, borderRadius: `${RADII.pill}px`, overflow: 'hidden', mb: 2 }}
          >
            {segments.map(d => (
              <Box key={d.key} sx={{ width: `${d.pct}%`, bgcolor: d.color, minWidth: d.count > 0 ? 3 : 0 }} />
            ))}
          </Box>

          {/* Ranked, highest first, on the same rails as the block table: label left,
              figures right-aligned on their own columns so the numbers stack and can be
              compared down the column rather than hunted for in prose. */}
          <Stack spacing={0}>
            {segments.map((d, i) => (
              <Stack
                key={d.key}
                direction="row"
                spacing={1.25}
                sx={{
                  alignItems: 'center', py: 1,
                  borderTop: i === 0 ? 'none' : `1px solid ${mode === 'dark' ? 'rgba(255,255,255,0.07)' : BRAND.border}`,
                }}
              >
                {/* THE GLYPH REPLACES THE COLOUR SQUARE.
                    An 8px square can only say "this row matches that bar segment", which
                    still requires matching two colours across a gap. The icon names the
                    category outright, and it is what lets the segment inks collapse to one
                    hue (see categoryMeta.js) - identity no longer rests on colour alone,
                    which is also the accessibility win.
                    Tinted well behind it so a pale ramp step still has an edge on white. */}
                <Box
                  aria-hidden
                  sx={{
                    width: 26, height: 26, borderRadius: `${RADII.chip}px`, flexShrink: 0,
                    display: 'grid', placeItems: 'center',
                    bgcolor: mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(16,24,40,0.04)',
                    color: d.color,
                  }}
                >
                  <d.Icon sx={{ fontSize: 15 }} />
                </Box>
                <Typography sx={{ fontSize: 13.5, color: BRAND.heading, fontWeight: 500, flexGrow: 1, minWidth: 0 }}>
                  {d.label}
                </Typography>
                <Typography
                  sx={{ fontSize: 14, fontWeight: 700, color: BRAND.heading, fontVariantNumeric: 'tabular-nums', width: 44, textAlign: 'right' }}
                >
                  {d.pct}%
                </Typography>
                <Typography
                  sx={{ fontSize: 12.5, color: BRAND.textLight, fontVariantNumeric: 'tabular-nums', width: 30, textAlign: 'right' }}
                >
                  {d.count}
                </Typography>
              </Stack>
            ))}
          </Stack>

          <Typography sx={{ fontSize: 11.5, color: BRAND.textLight, mt: 1.5 }}>
            {total} case{total === 1 ? '' : 's'} in total
          </Typography>
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
