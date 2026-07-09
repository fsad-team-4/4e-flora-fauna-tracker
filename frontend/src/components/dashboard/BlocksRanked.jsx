import { Card, CardContent, Box, Stack, Typography } from '@mui/material';
import { BRAND, CHART } from '../../theme';

/**
 * Blocks ranked by fauna sighting volume - the "where are the problems" view.
 * Each row shows the block, a magnitude bar (sequential single hue) and its share
 * of total sightings. A hotspot (3+ sightings) is flagged so the worst stand out.
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
          Fauna sightings by location
        </Typography>

        {total === 0 ? (
          <Typography variant="body2" sx={{ color: BRAND.textLight, py: 8, textAlign: 'center' }}>
            No sightings logged yet.
          </Typography>
        ) : (
          <Stack spacing={1.75}>
            {sightingsByBlock.map(b => {
              const pct = Math.round((b.count / total) * 100);
              const isHotspot = b.count >= hotspotThreshold;
              return (
                <Box key={b.block_number}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
                      <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: isHotspot ? BRAND.primary : CHART.series.primary, flexShrink: 0 }} />
                      <Typography sx={{ fontSize: 14, fontWeight: 600, color: BRAND.heading, whiteSpace: 'nowrap' }}>
                        {b.block_number}
                      </Typography>
                      {isHotspot && (
                        <Box component="span" sx={{ fontSize: 10, fontWeight: 700, color: BRAND.primary, bgcolor: '#FDECEA', borderRadius: '4px', px: 0.5, py: 0.1, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                          Hotspot
                        </Box>
                      )}
                    </Stack>
                    <Typography sx={{ fontSize: 13, color: BRAND.textLight, flexShrink: 0 }}>
                      <Box component="span" sx={{ fontWeight: 700, color: BRAND.heading }}>{b.count}</Box> · {pct}%
                    </Typography>
                  </Stack>
                  <Box sx={{ height: 6, borderRadius: '3px', bgcolor: BRAND.section, overflow: 'hidden' }}>
                    <Box sx={{ height: '100%', width: `${max ? (b.count / max) * 100 : 0}%`, bgcolor: isHotspot ? BRAND.primary : CHART.series.primary, borderRadius: '3px', transition: 'width .4s ease' }} />
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
