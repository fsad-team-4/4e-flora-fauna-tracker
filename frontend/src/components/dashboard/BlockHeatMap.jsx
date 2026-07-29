import { Box, Typography, Card, CardContent, Stack, Tooltip } from '@mui/material';
import { BRAND, CHART } from '../../theme';

// Manager's consolidated overview: fauna sighting intensity across ALL animal
// types, by block. (Renee's Leaflet map is the operational per-animal view.)
// Colour uses the shared sequential blue ramp so magnitude reads consistently
// with the rest of the dashboard's "amount" encodings.

// map a count to a ramp step + readable text colour
function cell(count, max) {
  if (!count) return { bg: BRAND.section, fg: BRAND.textLight };
  const t = max > 0 ? count / max : 0;
  const idx = Math.min(CHART.ramp.length - 1, Math.floor(t * CHART.ramp.length));
  const fg = idx >= 3 ? '#FFFFFF' : BRAND.heading;
  return { bg: CHART.ramp[idx], fg };
}

export default function BlockHeatMap({ sightingsByBlock = [], hotspotThreshold = 3 }) {
  const blocks = [...sightingsByBlock].sort((a, b) =>
    String(a.block_number).localeCompare(String(b.block_number), undefined, { numeric: true })
  );
  const max = blocks.reduce((m, b) => Math.max(m, b.count), 0);

  return (
    <Card
      elevation={0}
      sx={{ borderRadius: '12px', border: `1px solid ${BRAND.border}`, boxShadow: '0 4px 16px rgba(0,0,0,.05)', height: '100%' }}
    >
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h6" fontWeight={700} sx={{ color: BRAND.heading, mb: 0.5 }}>
          Sighting Heat Map
        </Typography>
        <Typography variant="body2" sx={{ color: BRAND.textLight, mb: 2.5 }}>
          Consolidated fauna activity by block — all animal types
        </Typography>

        {blocks.length === 0 ? (
          <Typography variant="body2" sx={{ color: BRAND.textLight, py: 5, textAlign: 'center' }}>
            No sightings logged yet.
          </Typography>
        ) : (
          <>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 1 }}>
              {blocks.map(b => {
                const { bg, fg } = cell(b.count, max);
                const isHotspot = b.count >= hotspotThreshold;
                return (
                  <Tooltip
                    key={b.block_number}
                    title={`${b.block_number}: ${b.count} sighting${b.count === 1 ? '' : 's'}${isHotspot ? ' · hotspot' : ''}`}
                    arrow
                  >
                    <Box
                      sx={{
                        bgcolor: bg,
                        color: fg,
                        borderRadius: '8px',
                        aspectRatio: '1 / 1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        outline: isHotspot ? `2px solid ${BRAND.accent}` : '1px solid transparent',
                        outlineOffset: '-2px',
                        transition: 'transform .12s',
                        cursor: 'default',
                        '&:hover': { transform: 'scale(1.06)' },
                      }}
                    >
                      <Typography sx={{ fontSize: 11.5, fontWeight: 700, textAlign: 'center', px: 0.5, lineHeight: 1.1 }}>
                        {b.block_number.replace(/^Block\s*/i, '')}
                      </Typography>
                    </Box>
                  </Tooltip>
                );
              })}
            </Box>

            {/* legend */}
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: 2.5, flexWrap: 'wrap', rowGap: 1 }}>
              <Typography variant="caption" sx={{ color: BRAND.textLight }}>Fewer</Typography>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {CHART.ramp.map(c => (
                  <Box key={c} sx={{ width: 20, height: 12, borderRadius: '3px', bgcolor: c }} />
                ))}
              </Box>
              <Typography variant="caption" sx={{ color: BRAND.textLight }}>More</Typography>
              <Box sx={{ flexGrow: 1 }} />
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <Box sx={{ width: 12, height: 12, borderRadius: '3px', outline: `2px solid ${BRAND.accent}`, outlineOffset: '-2px' }} />
                <Typography variant="caption" sx={{ color: BRAND.textLight }}>Hotspot</Typography>
              </Stack>
            </Stack>
          </>
        )}
      </CardContent>
    </Card>
  );
}