import { useState } from 'react';
import { Card, CardContent, Box, Stack, Typography, Collapse, Chip, Divider } from '@mui/material';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import SearchOffOutlined from '@mui/icons-material/SearchOffOutlined';
import { BRAND, CHART } from '../../theme';

const NEUTRAL_BAR = '#2E67B5';

function fmtWhen(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// `embedded` = true when rendered inside a tab panel — strips the outer Card
export default function BlocksRanked({ sightingsByBlock = [], hotspots = [], hotspotThreshold = 3, embedded = false }) {
  const [openBlock, setOpenBlock] = useState(null);
  const total = sightingsByBlock.reduce((s, b) => s + b.count, 0);
  const hotspotByBlock = Object.fromEntries(hotspots.map(h => [h.block_number, h]));

  const inner = (
    <Box sx={{ p: embedded ? 2 : 0 }}>
      {/* header — hidden when embedded; tab label does the job */}
      {!embedded && (
        <>
          <Typography component="h2" variant="h6" fontWeight={700} sx={{ color: BRAND.heading }}>
            Activity by Block
          </Typography>
          <Typography variant="body2" sx={{ color: BRAND.textLight, mb: 2 }}>
            Fauna sightings by location — click a block for detail
          </Typography>
        </>
      )}

      {/* small subtitle when embedded */}
      {embedded && (
        <Typography variant="body2" sx={{ color: BRAND.textLight, mb: 1.5, fontSize: 12 }}>
          Click any block to see detail
        </Typography>
      )}

      {total === 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 6 }}>
          <SearchOffOutlined sx={{ fontSize: 38, color: BRAND.textLight, mb: 1.25 }} />
          <Typography variant="body2" sx={{ color: BRAND.textLight }}>No sightings logged yet.</Typography>
        </Box>
      ) : (
        <Stack spacing={0.5}>
          {sightingsByBlock.map((b, index) => {
            const isHotspot = b.count >= hotspotThreshold;
            const widthPct = total ? (b.count / total) * 100 : 0;
            // magnitude stays on the blue ramp (never semantic red); the text "HOT"
            // badge below carries the attention signal instead
            const barColor = isHotspot ? CHART.ramp[4] : NEUTRAL_BAR;
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
                    width: '100%',
                    minHeight: 44,
                    textAlign: 'left',
                    font: 'inherit',
                    color: 'inherit',
                    border: 'none',
                    background: 'transparent',
                    alignItems: 'center',
                    py: 0.75,
                    px: 0.5,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'background .12s',
                    '&:hover': { bgcolor: BRAND.section },
                    '&:focus-visible': { outline: `2px solid ${BRAND.primary}`, outlineOffset: 2 },
                  }}
                >
                  {/* block label + hotspot badge */}
                  <Box sx={{ width: embedded ? 120 : 140, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <ExpandMoreRoundedIcon sx={{ fontSize: 17, color: BRAND.textLight, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: isHotspot ? BRAND.primary : BRAND.heading, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {b.block_number}
                    </Typography>
                    {isHotspot && (
                      <Box sx={{ bgcolor: '#FDECEA', color: BRAND.primary, fontSize: 9, fontWeight: 700, px: 0.6, py: 0.1, borderRadius: '5px', flexShrink: 0, lineHeight: 1.6 }}>
                        HOT
                      </Box>
                    )}
                  </Box>

                  {/* bar + count badge */}
                  <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                    <Box sx={{ flexGrow: 1, height: 16, borderRadius: '4px', bgcolor: BRAND.section, overflow: 'hidden' }}>
                      <Box
                        sx={{
                          height: '100%',
                          width: `${widthPct}%`,
                          minWidth: 4,
                          bgcolor: barColor,
                          borderRadius: '4px',
                          transition: 'width .4s ease',
                          transitionDelay: `${index * 40}ms`,
                        }}
                      />
                    </Box>
                    <Box sx={{ minWidth: 30, height: 20, px: 0.75, borderRadius: '100px', bgcolor: isHotspot ? '#FDECEA' : BRAND.section, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: isHotspot ? BRAND.primary : BRAND.heading }}>{b.count}</Typography>
                    </Box>
                  </Box>
                </Stack>

                <Collapse in={isOpen} unmountOnExit>
                  <Box sx={{ ml: embedded ? '120px' : '140px', mr: 1, mb: 1, bgcolor: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: '10px', p: 1.5 }}>
                    {detail ? (
                      <Stack
                        direction="row"
                        spacing={2}
                        divider={<Divider orientation="vertical" flexItem sx={{ borderColor: BRAND.border }} />}
                        sx={{ flexWrap: 'wrap', rowGap: 1.5 }}
                      >
                        <Box>
                          <Typography sx={{ fontSize: 10, color: BRAND.textLight, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', mb: 0.4 }}>
                            Sightings
                          </Typography>
                          <Typography sx={{ fontSize: 13.5, color: BRAND.heading, fontWeight: 600 }}>{b.count}</Typography>
                        </Box>
                        {detail.animals?.length > 0 && (
                          <Box>
                            <Typography sx={{ fontSize: 10, color: BRAND.textLight, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', mb: 0.4 }}>
                              Animals seen
                            </Typography>
                            <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.4 }}>
                              {detail.animals.map(a => (
                                <Chip key={a} label={a} size="small" sx={{ height: 18, fontSize: 10, textTransform: 'capitalize', bgcolor: '#fff', border: `1px solid ${BRAND.border}` }} />
                              ))}
                            </Stack>
                          </Box>
                        )}
                        {when && (
                          <Box>
                            <Typography sx={{ fontSize: 10, color: BRAND.textLight, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', mb: 0.4 }}>
                              Last seen
                            </Typography>
                            <Typography sx={{ fontSize: 13.5, color: BRAND.heading }}>{when}</Typography>
                          </Box>
                        )}
                      </Stack>
                    ) : (
                      <Typography sx={{ fontSize: 12, color: BRAND.textLight }}>
                        Below hotspot threshold — no detail yet.
                      </Typography>
                    )}
                  </Box>
                </Collapse>
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
