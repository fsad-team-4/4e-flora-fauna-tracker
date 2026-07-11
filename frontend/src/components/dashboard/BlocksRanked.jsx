import { Card, CardContent, Box, Stack, Typography } from '@mui/material';
import { BRAND, CHART } from '../../theme';

function rampColor(count, max) {
  if (!count || !max) return CHART.ramp[0];
  const t = count / max;
  const idx = Math.min(CHART.ramp.length - 1, Math.floor(t * CHART.ramp.length));
  return CHART.ramp[idx];
}

/**
 * Blocks ranked by fauna sighting volume, as an inline horizontal bar chart:
 * the block label sits on the left, the bar grows immediately to its right, and
 * the count sits at the end of the bar - so each block and its metric form one
 * tight visual cluster (proximity) instead of being pushed to opposite edges.
 * Hotspots (3+ sightings) stay brand-red; others take a ramp step by intensity.
 */
export default function BlocksRanked({ sightingsByBlock = [], hotspotThreshold = 3 }) {
  const total = sightingsByBlock.reduce((s, b) => s + b.count, 0);
  const max = sightingsByBlock.reduce((m, b) => Math.max(m, b.count), 0);

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 3 }}>
        <Typography component="h2" variant="h6" fontWeight={700} sx={{ color: BRAND.heading }}>
          Activity by Block
        </Typography>
        <Typography variant="body2" sx={{ color: BRAND.textLight, mb: 2 }}>
          Fauna sightings by location — colour shows intensity
        </Typography>
        {total === 0 ? (
          <Typography variant="body2" sx={{ color: BRAND.textLight, py: 8, textAlign: 'center' }}>
            No sightings logged yet.
          </Typography>
        ) : (
          <Stack spacing={1.25}>
            {sightingsByBlock.map(b => {
              const pct = Math.round((b.count / total) * 100);
              const isHotspot = b.count >= hotspotThreshold;
              const barColor = isHotspot ? BRAND.primary : rampColor(b.count, max);
              const widthPct = max ? (b.count / max) * 100 : 0;
              return (
                <Stack key={b.block_number} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                  {/* label - fixed width so all bars start from the same x (aligned) */}
                  <Box sx={{ width: 96, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: BRAND.heading, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {b.block_number}
                    </Typography>
                  </Box>

                  {/* bar grows immediately to the right of the label; count sits at its end */}
                  <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                    <Box sx={{ flexGrow: 1, height: 20, borderRadius: '4px', bgcolor: BRAND.section, overflow: 'hidden', position: 'relative' }}>
                      <Box
                        sx={{
                          height: '100%',
                          width: `${widthPct}%`,
                          minWidth: 4,
                          bgcolor: barColor,
                          borderRadius: '4px',
                          transition: 'width .4s ease',
                        }}
                      />
                    </Box>
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'baseline', flexShrink: 0, width: 58, justifyContent: 'flex-end' }}>
                      <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: BRAND.heading }}>{b.count}</Typography>
                      <Typography sx={{ fontSize: 11.5, color: BRAND.textLight }}>·{pct}%</Typography>
                    </Stack>
                  </Box>

                  {isHotspot && (
                    <Box component="span" sx={{ fontSize: 10, fontWeight: 700, color: BRAND.primary, bgcolor: '#FDECEA', borderRadius: '4px', px: 0.5, py: 0.1, textTransform: 'uppercase', letterSpacing: '0.4px', flexShrink: 0 }}>
                      Hot
                    </Box>
                  )}
                </Stack>
              );
            })}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}