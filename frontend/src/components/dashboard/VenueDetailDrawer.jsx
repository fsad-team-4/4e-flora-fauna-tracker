import { useEffect, useState } from 'react';
import {
  Drawer, Box, Stack, Typography, IconButton, Chip, Skeleton, Divider, Tooltip,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import PhotoOutlinedIcon from '@mui/icons-material/PhotoOutlined';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import { BRAND, INTENT, ON_SURFACE } from '../../theme';
import { SEVERITY } from './rodentMapTokens';
import http from '../../http';

/**
 * Everything recorded about ONE block, without leaving the map.
 *
 * Replaces a link that navigated to /rodent?block=X - which answered the
 * question but cost the officer the map they were reading.
 *
 * ==================== WHAT THIS DELIBERATELY DOES NOT DO ===================
 * There is no live view, and no photograph. The upload path exists on
 * RodentAssessment (`image_url`) but NOTHING has ever used it: 0 of 55
 * assessments carry an image. So this states that a report has no photo rather
 * than showing a placeholder that could be mistaken for site evidence.
 *
 * It also does not infer the "spot" from the observation text. Officers write
 * things like "the refuse chute" or "behind the coffee shop", and parsing those
 * into a structured location would be guessing at a field nobody filled in.
 * The observation is shown verbatim; `floor_level` is the only structured
 * placement the data actually holds, and it is present on fewer than half the
 * records - which the coverage line says outright.
 * ===========================================================================
 */

const fmtDate = iso => new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });

function Field({ label, children }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.7px', mb: 0.25 }}>
        {label}
      </Typography>
      <Typography component="div" sx={{ fontSize: 13.5, color: BRAND.heading, fontWeight: 600, lineHeight: 1.45, wordBreak: 'break-word' }}>
        {children}
      </Typography>
    </Box>
  );
}

const NOT_RECORDED = (
  <Box component="span" sx={{ color: BRAND.textLight, fontStyle: 'italic', fontWeight: 500 }}>not recorded</Box>
);

export default function VenueDetailDrawer({ block, open, onClose }) {
  const [state, setState] = useState({ loading: true, error: false, rows: [] });

  useEffect(() => {
    if (!open || !block) return undefined;
    let alive = true;
    // No synchronous reset here - the caller remounts this drawer with a `key`
    // per block, so the initial state is already correct for a new venue and a
    // cascading render is avoided.
    http.get('/api/rodent-assessments', { params: { block, limit: 100 } })
      .then(r => { if (alive) setState({ loading: false, error: false, rows: r.data || [] }); })
      .catch(() => { if (alive) setState({ loading: false, error: true, rows: [] }); });
    return () => { alive = false; };
  }, [open, block]);

  const { rows } = state;
  // Coverage, stated rather than implied: the map can only ever draw the located
  // ones, so a venue with 6 reports and 2 coordinates must say so.
  //
  // The null check is explicit on purpose. `Number.isFinite(Number(null))` is
  // TRUE - Number(null) coerces to 0 - so the obvious version counted every
  // unlocated report as located and the coverage line read 12 of 12 when the
  // real figure was 6. Same trap the map's popup hit with 0.00000, 0.00000.
  const hasCoord = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  const located = rows.filter(r => hasCoord(r.gps_lat) && hasCoord(r.gps_lng)).length;
  const withFloor = rows.filter(r => r.floor_level && String(r.floor_level).trim()).length;
  const floors = [...new Set(rows.map(r => r.floor_level).filter(Boolean))].sort();
  const worst = ['critical', 'high', 'medium', 'low'].find(b => rows.some(r => r.risk_level === b));

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: { sx: { width: { xs: '100%', sm: 460, lg: 520 }, bgcolor: BRAND.surface, display: 'flex', flexDirection: 'column' } },
        backdrop: { sx: { backdropFilter: 'blur(3px)', bgcolor: 'rgba(16,24,40,.35)' } },
      }}
    >
      <Box sx={{ px: 3, pt: 2.5, pb: 2, borderBottom: `1px solid ${BRAND.border}`, flexShrink: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
          <Box sx={{ minWidth: 0, flexGrow: 1 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.7px' }}>
              Venue
            </Typography>
            <Typography component="h2" sx={{ fontSize: 20, fontWeight: 800, color: BRAND.heading, lineHeight: 1.2 }}>
              {block}
            </Typography>
            {worst && !state.loading && (
              <Chip
                label={`Peak severity: ${worst}`}
                size="small"
                sx={{ mt: 0.75, height: 22, fontSize: 12, fontWeight: 700, bgcolor: SEVERITY[worst].fill, color: SEVERITY[worst].ink }}
              />
            )}
          </Box>
          <IconButton onClick={onClose} aria-label="Close venue detail" size="small" sx={{ color: BRAND.textLight }}>
            <CloseRoundedIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Stack>
      </Box>

      <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 3, py: 2.5 }}>
        {state.loading ? (
          <Stack spacing={1.5}>{[0, 1, 2].map(i => <Skeleton key={i} variant="rounded" height={72} />)}</Stack>
        ) : state.error ? (
          <Typography sx={{ fontSize: 13.5, color: BRAND.textLight }}>
            Could not load the reports for this block.
          </Typography>
        ) : rows.length === 0 ? (
          <Typography sx={{ fontSize: 13.5, color: BRAND.textLight }}>
            No rodent reports recorded at this block.
          </Typography>
        ) : (
          <>
            {/* what this venue's record actually covers */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', columnGap: 2.5, rowGap: 2, mb: 2 }}>
              <Field label="Reports">{rows.length}</Field>
              <Field label="Floors seen">
                {floors.length ? floors.join(', ') : NOT_RECORDED}
              </Field>
            </Box>

            {/* Coverage caveats, stated plainly. Both are common in this data and
                both change how the venue should be read. */}
            {(located < rows.length || withFloor < rows.length) && (
              <Stack spacing={0.5} sx={{ mb: 2.5, p: 1.5, borderRadius: '8px', bgcolor: INTENT.warning.bg, border: `1px solid ${INTENT.warning.border}` }}>
                {located < rows.length && (
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: 'flex-start' }}>
                    <PlaceOutlinedIcon sx={{ fontSize: 15, color: INTENT.warning.ink, mt: '2px', flexShrink: 0 }} />
                    <Typography sx={{ fontSize: 12.5, color: INTENT.warning.ink, lineHeight: 1.5 }}>
                      {located} of {rows.length} report{rows.length === 1 ? '' : 's'} carry a location, so the map
                      shows {located === 0 ? 'none' : 'only those'}.
                    </Typography>
                  </Stack>
                )}
                {withFloor < rows.length && (
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: 'flex-start' }}>
                    <LayersOutlinedIcon sx={{ fontSize: 15, color: INTENT.warning.ink, mt: '2px', flexShrink: 0 }} />
                    <Typography sx={{ fontSize: 12.5, color: INTENT.warning.ink, lineHeight: 1.5 }}>
                      {withFloor} of {rows.length} record a floor or area.
                    </Typography>
                  </Stack>
                )}
              </Stack>
            )}

            <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.7px', mb: 1 }}>
              Reports, newest first
            </Typography>

            <Stack spacing={0}>
              {rows.map((r, i) => {
                const sv = SEVERITY[r.risk_level] || SEVERITY.low;
                const signs = Array.isArray(r.signs_identified) ? r.signs_identified : [];
                const actions = Array.isArray(r.immediate_actions) ? r.immediate_actions : [];
                return (
                  <Box key={r.id} sx={{ py: 2, borderTop: i === 0 ? 'none' : `1px solid ${BRAND.border}` }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5, mb: 0.75 }}>
                      <Chip label={r.risk_level || 'unrated'} size="small" sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: sv.fill, color: sv.ink }} />
                      <Typography sx={{ fontSize: 12, color: BRAND.textLight }}>{fmtDate(r.createdAt)}</Typography>
                      <Typography sx={{ fontSize: 12, color: BRAND.textLight }}>
                        · {r.floor_level ? r.floor_level : 'floor not recorded'}
                      </Typography>
                      {r.escalate_to_contractor && (
                        <Chip label="Escalated" size="small" sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: INTENT.danger.bg, color: INTENT.danger.ink }} />
                      )}
                    </Stack>

                    {/* verbatim - never parsed into a "spot" the officer did not enter */}
                    <Typography sx={{ fontSize: 13.5, color: BRAND.text, lineHeight: 1.6 }}>
                      {r.observations}
                    </Typography>

                    {r.likely_cause && (
                      <Typography sx={{ fontSize: 12.5, color: BRAND.textLight, mt: 0.75, lineHeight: 1.55 }}>
                        <Box component="span" sx={{ fontWeight: 700 }}>Assessed cause: </Box>{r.likely_cause}
                      </Typography>
                    )}

                    {signs.length > 0 && (
                      <Stack direction="row" spacing={0.5} sx={{ mt: 0.85, flexWrap: 'wrap', rowGap: 0.5 }}>
                        {signs.map((sg, si) => {
                          const label = typeof sg === 'string' ? sg : (sg?.title || sg?.label);
                          return label ? (
                            <Chip key={label} label={label} size="small" sx={{ height: 20, fontSize: 11, bgcolor: BRAND.section, color: BRAND.text }} />
                          ) : <span key={si} />;
                        })}
                      </Stack>
                    )}

                    {actions.length > 0 && (
                      <Box sx={{ mt: 0.85 }}>
                        <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.6px', mb: 0.25 }}>
                          Recommended actions
                        </Typography>
                        {/* immediate_actions are {title, detail} objects, NOT
                            strings - signs_identified is the plain-string one.
                            Rendering the object directly crashed the page. Both
                            shapes are tolerated here so a change on either side
                            degrades to text instead of blanking the drawer. */}
                        {actions.map((a, ai) => {
                          const title = typeof a === 'string' ? a : a?.title;
                          const detail = typeof a === 'string' ? null : a?.detail;
                          if (!title && !detail) return null;
                          return (
                            <Box key={title || ai} sx={{ mb: 0.5 }}>
                              <Typography sx={{ fontSize: 12.5, color: BRAND.text, lineHeight: 1.5, fontWeight: 600 }}>
                                · {title}
                              </Typography>
                              {detail && (
                                <Typography sx={{ fontSize: 12, color: BRAND.textLight, lineHeight: 1.5, pl: 1.25 }}>
                                  {detail}
                                </Typography>
                              )}
                            </Box>
                          );
                        })}
                      </Box>
                    )}

                    {/* No photo has ever been attached in this dataset. Saying so
                        beats an empty frame that reads like a failed image. */}
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mt: 1 }}>
                      <PhotoOutlinedIcon sx={{ fontSize: 14, color: BRAND.textLight }} />
                      {r.image_url ? (
                        <Tooltip arrow title="Opens the uploaded photo">
                          <Box component="a" href={r.image_url} target="_blank" rel="noopener noreferrer" sx={{ fontSize: 12, color: ON_SURFACE.info }}>
                            View site photo
                          </Box>
                        </Tooltip>
                      ) : (
                        <Typography sx={{ fontSize: 12, color: BRAND.textLight }}>No photo attached</Typography>
                      )}
                    </Stack>
                  </Box>
                );
              })}
            </Stack>

            <Divider sx={{ my: 2 }} />
            <Typography sx={{ fontSize: 11.5, color: BRAND.textLight, lineHeight: 1.55 }}>
              Every field here is as recorded by the reporting officer or the AI assessment.
              Nothing about the site is inferred from the observation text.
            </Typography>
          </>
        )}
      </Box>
    </Drawer>
  );
}
