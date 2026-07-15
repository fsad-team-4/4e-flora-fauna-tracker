import { useState } from 'react';
import { Card, CardContent, Box, Stack, Typography, Collapse, Chip } from '@mui/material';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { BRAND } from '../../theme';

const NEUTRAL_BAR = '#9ec5f4'; // calm blue, distinct from semantic red/amber/green

function fmtWhen(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Activity by Block: two signals (bar length + count), red for genuine hotspots.
 * Rows are clickable - clicking expands an inline detail panel for that block
 * (animals seen, last sighting) built from data already in the metrics payload.
 * Gives a "drill in" console feel without a new page, route, or backend call.
 */
export default function BlocksRanked({ sightingsByBlock = [], hotspots = [], hotspotThreshold = 3 }) {
  const [openBlock, setOpenBlock] = useState(null);
  const total = sightingsByBlock.reduce((s, b) => s + b.count, 0);
  const hotspotByBlock = Object.fromEntries(hotspots.map(h => [h.block_number, h]));

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 3 }}>
        <Typography component="h2" variant="h6" fontWeight={700} sx={{ color: BRAND.heading }}>
          Activity by Block
        </Typography>
        <Typography variant="body2" sx={{ color: BRAND.textLight, mb: 2 }}>
          Fauna sightings by location — click a block for detail
        </Typography>
        {total === 0 ? (
          <Typography variant="body2" sx={{ color: BRAND.textLight, py: 8, textAlign: 'center' }}>
            No sightings logged yet.
          </Typography>
        ) : (
          <Stack spacing={0.5}>
            {sightingsByBlock.map(b => {
              const isHotspot = b.count >= hotspotThreshold;
              const widthPct = total ? (b.count / total) * 100 : 0;
              const barColor = isHotspot ? BRAND.primary : NEUTRAL_BAR;
              const isOpen = openBlock === b.block_number;
              const detail = hotspotByBlock[b.block_number];
              const when = fmtWhen(detail?.lastSeen);
              return (
                <Box key={b.block_number}>
                  <Stack
                    component="button"
                    type="button"
                    aria-expanded={isOpen}
                    aria-label={`${b.block_number}, ${b.count} sightings. ${isOpen ? 'Collapse' : 'Expand'} detail`}
                    direction="row"
                    spacing={1.5}
                    onClick={() => setOpenBlock(isOpen ? null : b.block_number)}
                    sx={{
                      // a real button: full-row hit target, keyboard focusable,
                      // visible focus ring, min 44px touch height
                      width: '100%',
                      minHeight: 44,
                      textAlign: 'left',
                      font: 'inherit',
                      color: 'inherit',
                      border: 'none',
                      background: 'transparent',
                      alignItems: 'center',
                      py: 1,
                      px: 0.5,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'background .12s',
                      '&:hover': { bgcolor: BRAND.section },
                      '&:focus-visible': { outline: `2px solid ${BRAND.primary}`, outlineOffset: 2 },
                    }}
                  >
                    <Box sx={{ width: 88, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.25 }}>
                      <ExpandMoreRoundedIcon sx={{ fontSize: 18, color: BRAND.textLight, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                      <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: isHotspot ? BRAND.primary : BRAND.heading, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {b.block_number}
                      </Typography>
                    </Box>
                    <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                      <Box sx={{ flexGrow: 1, height: 18, borderRadius: '4px', bgcolor: BRAND.section, overflow: 'hidden' }}>
                        <Box sx={{ height: '100%', width: `${widthPct}%`, minWidth: 4, bgcolor: barColor, borderRadius: '4px', transition: 'width .4s ease' }} />
                      </Box>
                      <Typography sx={{ fontSize: 14, fontWeight: 700, color: BRAND.heading, flexShrink: 0, width: 24, textAlign: 'right' }}>
                        {b.count}
                      </Typography>
                    </Box>
                  </Stack>

                  <Collapse in={isOpen} unmountOnExit>
                    <Box sx={{ ml: '88px', mr: 1, mb: 1, p: 1.5, bgcolor: BRAND.section, borderRadius: '8px' }}>
                      <Stack direction="row" spacing={3} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                        <Box>
                          <Typography sx={{ fontSize: 11, color: BRAND.textLight, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', mb: 0.5 }}>
                            Sightings
                          </Typography>
                          <Typography sx={{ fontSize: 14, color: BRAND.heading, fontWeight: 600 }}>
                            {b.count}{isHotspot && <Box component="span" sx={{ ml: 0.75, fontSize: 11, color: BRAND.primary, fontWeight: 700 }}>HOTSPOT</Box>}
                          </Typography>
                        </Box>
                        {detail?.animals?.length > 0 && (
                          <Box>
                            <Typography sx={{ fontSize: 11, color: BRAND.textLight, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', mb: 0.5 }}>
                              Animals seen
                            </Typography>
                            <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                              {detail.animals.map(a => (
                                <Chip key={a} label={a} size="small" sx={{ height: 20, fontSize: 11, textTransform: 'capitalize', bgcolor: '#fff', border: `1px solid ${BRAND.border}` }} />
                              ))}
                            </Stack>
                          </Box>
                        )}
                        {when && (
                          <Box>
                            <Typography sx={{ fontSize: 11, color: BRAND.textLight, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', mb: 0.5 }}>
                              Last seen
                            </Typography>
                            <Typography sx={{ fontSize: 14, color: BRAND.heading }}>{when}</Typography>
                          </Box>
                        )}
                      </Stack>
                      {!detail && (
                        <Typography sx={{ fontSize: 12.5, color: BRAND.textLight, mt: 0.5 }}>
                          Below the hotspot threshold — no consolidated detail yet.
                        </Typography>
                      )}
                    </Box>
                  </Collapse>
                </Box>
              );
            })}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}