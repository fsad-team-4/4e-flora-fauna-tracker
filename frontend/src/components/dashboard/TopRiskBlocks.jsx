import { Box, Card, CardContent, Stack, Typography, Tooltip } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { BRAND, SURFACE, NEON, RADII, surfaceSx, glow, ON_SURFACE } from '../../theme';

// The estate's own hotspot rule (backend computeHotspots uses minCount = 3, see
// backend/src/services/estateStats.js:10, and both production call sites take the
// default), so the banding here is the same threshold the rest of the app already
// acts on rather than an arbitrary cut.
//
// It is duplicated rather than imported because the backend declares it as a JS
// default parameter, not an exported constant. If that default ever changes this
// copy drifts silently - worth exporting properly if the value is ever tuned.
const HOTSPOT_MIN = 3;
const DEFAULT_LIMIT = 5;

function bandLabel(count) {
  if (!count) return 'No recorded activity';
  if (count < HOTSPOT_MIN) return `Below the hotspot threshold (${HOTSPOT_MIN})`;
  if (count < HOTSPOT_MIN * 2) return `At or above the hotspot threshold (${HOTSPOT_MIN})`;
  return `${HOTSPOT_MIN * 2}+ sightings - double the threshold`;
}

/**
 * Layered progress bars, in the references' "Community Projects" idiom.
 *
 * This replaces a recharts horizontal BarChart. A bar chart drew each block's count
 * against an axis, which is correct but spends a whole plot area, an axis and a set of
 * tick labels on five values - and it still needed a reference line drawn across it to
 * say where the threshold was.
 *
 * A track per row does the same job in a third of the space AND makes the threshold
 * structural rather than annotated: the track is the scale, a notch marks the hotspot
 * cutoff, and the fill either reaches past it or does not.
 *
 * COLOUR MEANS ONE THING. The fill is the breach ink when a block is at or over the
 * threshold and the neutral data ink when it is not. The previous version ran a
 * five-step heat ramp by RANK and handed red to whoever was first, so a block changed
 * colour when another block overtook it, without crossing any boundary itself.
 */
export default function TopRiskBlocks({ sightingsByBlock = [], topBlock = null, limit = DEFAULT_LIMIT, embedded = false }) {
  const mode = useTheme().palette.mode;
  const s = SURFACE[mode] || SURFACE.dark;
  const n = NEON[mode] || NEON.dark;
  // ON_SURFACE.danger is var(--em-danger-strong), which already resolves to #B3261E
  // in light and #FF8A80 in dark - exactly the two literals this line used to branch
  // between by hand. Using the token means a change to the danger ink reaches here
  // too, instead of leaving this copy behind.
  const breach = ON_SURFACE.danger;

  const ranked = [...sightingsByBlock]
    .filter(b => b.count > 0)
    .sort((a, b) => b.count - a.count || String(a.block_number).localeCompare(String(b.block_number), undefined, { numeric: true }));
  const shown = ranked.slice(0, limit);
  const hidden = ranked.length - shown.length;
  const max = shown.length ? shown[0].count : 0;
  // enough headroom that the threshold notch is never flush against either end
  const axisMax = Math.max(HOTSPOT_MIN * 2, max);
  const summary = shown.length
    ? `Top ${shown.length} blocks by fauna sightings: ${shown.map(b => `${b.block_number} ${b.count}`).join(', ')}. Hotspot threshold is ${HOTSPOT_MIN}.`
    : 'No sightings logged in this period.';

  const inner = (
    <>
      {!embedded && (
        <>
          <Typography component="h2" sx={{ fontSize: 15, fontWeight: 600, color: BRAND.heading }}>
            Risk by Block
          </Typography>
          <Typography sx={{ fontSize: 12.5, color: BRAND.textLight, mb: 2 }}>
            Top {limit} blocks by sighting volume, highest first
          </Typography>
        </>
      )}

      {shown.length === 0 ? (
        <Typography sx={{ fontSize: 13, color: BRAND.textLight, py: 4, textAlign: 'center' }}>
          No sightings logged in this period.
        </Typography>
      ) : (
        <>
          {/* THE THRESHOLD AS ONE LINE ACROSS THE WHOLE CHART.
              It used to be a 2px notch inside each row's track - technically correct and
              visually almost invisible, because it was interrupted by every gap between
              rows. One dashed rule spanning the full stack means "which blocks cross the
              line" is answerable in a single glance without inspecting any row.

              The tracks all share one 0..axisMax scale, so a single absolute line at the
              threshold's percentage lands in the right place on every row. */}
          <Box sx={{ position: 'relative' }}>
            <Box
              aria-hidden
              sx={{
                position: 'absolute', top: 0, bottom: 0,
                // the label column is a fixed grid rail, so the line offsets into the
                // track area rather than across the labels
                left: `calc(${(HOTSPOT_MIN / axisMax) * 100}% )`,
                width: 0,
                borderLeft: `1px dashed ${BRAND.textLight}`,
                opacity: 0.55, zIndex: 1, pointerEvents: 'none',
              }}
            />
          <Stack spacing={1.75} role="table" aria-label={summary}>
            {shown.map(b => {
              const over = b.count >= HOTSPOT_MIN;
              const pct = axisMax ? (b.count / axisMax) * 100 : 0;
              const ink = over ? breach : n.cyan;
              return (
                <Box key={b.block_number} role="row">
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', justifyContent: 'space-between', mb: 0.6 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: BRAND.heading, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {b.block_number}
                    </Typography>
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline', flexShrink: 0 }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 700, color: BRAND.heading, fontVariantNumeric: 'tabular-nums' }}>
                        {b.count}
                      </Typography>
                      {/* The word, not just the colour - so "over threshold" survives
                          for anyone who cannot separate the two inks. */}
                      <Typography sx={{ fontSize: 11, color: over ? breach : BRAND.textLight, fontWeight: over ? 700 : 500 }}>
                        {over ? 'over' : 'under'}
                      </Typography>
                    </Stack>
                  </Stack>

                  <Tooltip title={`${b.block_number}: ${b.count} sighting${b.count === 1 ? '' : 's'} - ${bandLabel(b.count)}`}>
                    <Box sx={{ position: 'relative', height: 18, borderRadius: `${RADII.chip}px`, bgcolor: s.raised, cursor: 'help' }}>
                      <Box
                        sx={{
                          position: 'absolute', inset: 0, width: `${pct}%`, minWidth: 4,
                          borderRadius: `${RADII.chip}px`, bgcolor: ink,
                          boxShadow: glow(mode, ink, 0.5),
                          transition: 'width .4s ease',
                        }}
                      />
                    </Box>
                  </Tooltip>
                </Box>
              );
            })}
          </Stack>
          </Box>

          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5, mt: 2 }}>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
              <Box aria-hidden sx={{ width: 0, height: 12, borderLeft: `1px dashed ${BRAND.textLight}`, opacity: 0.55 }} />
              <Typography sx={{ fontSize: 11.5, color: BRAND.textLight }}>hotspot threshold ({HOTSPOT_MIN})</Typography>
            </Stack>
            {topBlock != null && shown.some(b => b.block_number === topBlock && b.count >= HOTSPOT_MIN) && (
              <Typography sx={{ fontSize: 11.5, color: BRAND.textLight }}>
                Highest: {topBlock}
              </Typography>
            )}
            {hidden > 0 && (
              <Typography sx={{ fontSize: 11.5, color: BRAND.textLight }}>
                {hidden} further block{hidden === 1 ? '' : 's'} not shown
              </Typography>
            )}
          </Stack>
        </>
      )}
    </>
  );

  if (embedded) return inner;

  return (
    <Card sx={{ ...surfaceSx(mode, 'card'), height: '100%' }}>
      <CardContent sx={{ p: { xs: 2.25, md: 2.75 }, '&:last-child': { pb: { xs: 2.25, md: 2.75 } } }}>{inner}</CardContent>
    </Card>
  );
}
