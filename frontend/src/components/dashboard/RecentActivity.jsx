import { Link as RouterLink } from 'react-router-dom';
import { Card, CardContent, Box, Stack, Typography, Tooltip } from '@mui/material';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { useTheme, alpha } from '@mui/material/styles';
import { BRAND, SURFACE, RADII, surfaceSx } from '../../theme';
import { CATEGORY_LABELS } from '../../constants';
import { CATEGORY_ICONS, swatchFor } from './categoryMeta';
import StatusPill from '../StatusPill';

/**
 * Glyph and ink both come from categoryMeta now, not from tables in this file.
 *
 * The icon map here was the original; CategoryBar was about to grow a copy of it, so it
 * moved to a shared module - the case mix and this feed render the same categories, and a
 * category that looks different between the two cards has to be re-learned on every one.
 *
 * The INK moving there matters more than the icon. This file used to read CATEGORY_COLORS
 * from the theme, which was already a fix for an earlier private table that had drifted on
 * four of five categories (worst of it: `pest: '#B3261E'`, the theme's own critical ink, so
 * a pest case was painted the colour that means "critical" everywhere else). CATEGORY_COLORS
 * solved the drift but is still the four-hue NEON set - cyan, purple, teal, magenta - and
 * CategoryBar has now collapsed to a single-hue ramp keyed by category. Leaving this file on
 * CATEGORY_COLORS would have re-created the very divergence the theme move fixed, one card
 * apart. Both surfaces read swatchFor().
 */
function CategoryGlyph({ category }) {
  const mode = useTheme().palette.mode;
  const Icon = CATEGORY_ICONS[category] || CATEGORY_ICONS.other;
  const ink = swatchFor(category, mode);
  const label = CATEGORY_LABELS[category] || category || 'Uncategorised';
  return (
    <Tooltip title={label}>
      <Box
        aria-label={label}
        sx={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
          bgcolor: `${ink}14`, display: 'grid', placeItems: 'center',
        }}
      >
        <Icon sx={{ fontSize: 17, color: ink }} />
      </Box>
    </Tooltip>
  );
}

function fmtWhen(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Grey metadata text (not a pill) - pills are reserved for case status.
function Meta({ icon: Icon, children }) {
  return (
    <Stack direction="row" spacing={0.35} sx={{ alignItems: 'center' }}>
      <Icon sx={{ fontSize: 13, color: BRAND.textLight }} aria-hidden />
      <Typography sx={{ fontSize: 12, color: BRAND.textLight, fontWeight: 500, whiteSpace: 'nowrap' }}>{children}</Typography>
    </Stack>
  );
}

/**
 * Recent Activity feed. The Latest Incident used to sit inside the hero, competing
 * with the risk score; it now leads this persistent feed instead, where it reads as
 * the newest entry in a list rather than a stranded one-off card.
 */
export default function RecentActivity({ cases = [], limit = 5 }) {
  const mode = useTheme().palette.mode;
  const s = SURFACE[mode] || SURFACE.dark;
  const items = cases.slice(0, limit);

  return (
    <Card sx={{ ...surfaceSx(mode, 'card'), height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ p: { xs: 2.25, md: 2.75 }, display: 'flex', flexDirection: 'column', flexGrow: 1, '&:last-child': { pb: { xs: 2.25, md: 2.75 } } }}>
        <Typography component="h2" variant="h6" fontWeight={700} sx={{ color: BRAND.heading }}>
          Recent Activity
        </Typography>
        {/* mb 2.5, matching Cases by Category, Block Performance and Behavioural
            Diagnosis. The four cards sat at 1.5 / 2 / 2.5 / 2, so the gap under a heading
            depended on which card you were reading - the kind of inconsistency that reads
            as "unfinished" without anyone being able to name it. 2.5 is the widest of the
            four, which is also the direction this needed: at 1.5 the subtitle and the first
            row were closer to each other than the subtitle was to its own heading. */}
        <Typography variant="body2" sx={{ color: BRAND.textLight, mb: 2.5 }}>
          Latest reports across the estate, newest first
        </Typography>

        {items.length === 0 ? (
          <Typography variant="body2" sx={{ color: BRAND.textLight, py: 5, textAlign: 'center' }}>
            No recent cases.
          </Typography>
        ) : (
          // Separation by whitespace, not rules: the row hover gives the grouping
          // cue instead, so five entries do not read as five boxed cells.
          //
          // WIDTH CAP. The card runs the full 12 columns, and without a cap each row
          // stretched to match: the title sat at the far left and the status pill at the
          // far right, so on a wide monitor the eye had to cross the whole screen to
          // connect an issue to its state. Capped and left-aligned (not centred) so the
          // list still lines up with the card's own heading above it.
          <Stack spacing={0.75} sx={{ flexGrow: 1, width: '100%', maxWidth: 860 }}>
            {items.map((c, i) => {
              // Only a row with an id can navigate, and only a navigable row gets the
              // chevron. A hover affordance on a dead row is a promise the UI cannot
              // keep, so the two are driven off the same condition.
              const clickable = c.id != null;
              return (
              <Box
                key={c.id ?? `${c.title}-${i}`}
                className="rc-row"
                {...(clickable ? { component: RouterLink, to: `/reports/${c.id}` } : {})}
                sx={{
                  // Tighter rows: py 1.25 + spacing 0.5 between five entries spent
                  // more of the card on gaps than on content. The hover wash still
                  // groups each row, so the whitespace was doing no work.
                  // Rows on the INSET surface rather than a white wash, so the list
                  // reads as a set of dark chips inside a dark card.
                  py: 1.1, px: 1.25, borderRadius: `${RADII.chip}px`,
                  bgcolor: s.inset,
                  // A HAIRLINE, not fill alone. On the light scheme the inset fill and the
                  // card behind it are two near-whites a few percent apart, so each row had
                  // no edge and five rows read as one soft block - the "cluttered" feeling.
                  // The border is what makes each entry a contained object.
                  border: `1px solid ${s.insetBorder}`,
                  display: 'block', textDecoration: 'none', color: 'inherit',
                  cursor: clickable ? 'pointer' : 'default',
                  transition: 'background-color .15s ease',
                  '&:hover': { bgcolor: s.raised },
                  // the chevron is revealed by the row's own hover, not its own
                  '&:hover .rc-chevron, &:focus-visible .rc-chevron': { opacity: 1, transform: 'none' },
                  '&:focus-visible': { outline: `2px solid ${BRAND.accent}`, outlineOffset: 2 },
                }}
              >
                <Stack direction="row" spacing={1.25} sx={{ alignItems: 'flex-start' }}>
                  <CategoryGlyph category={c.category} />
                  <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
                      {/* the newest entry is the "latest incident" - marked, not duplicated */}
                      {i === 0 && (
                        <Typography sx={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: BRAND.accent }}>
                          Latest
                        </Typography>
                      )}
                      {/* 15/700: the issue is the row's subject and has to out-rank the
                          metadata beneath it outright. At 14.5/600 against 11.5 metadata the
                          step existed but was slight, so the row read as three lines of
                          similar text rather than a headline with supporting detail. */}
                      <Typography sx={{ fontSize: 15, fontWeight: 700, color: BRAND.heading, lineHeight: 1.35 }}>
                        {c.title}
                      </Typography>
                    </Stack>
                    {/* category text is gone from this row - the glyph carries it */}
                    <Stack direction="row" spacing={1.25} sx={{ mt: 0.35, flexWrap: 'wrap', rowGap: 0.5 }}>
                      {c.block_number && <Meta icon={PlaceOutlinedIcon}>{c.block_number}</Meta>}
                      {c.createdAt && <Meta icon={ScheduleRoundedIcon}>{fmtWhen(c.createdAt)}</Meta>}
                    </Stack>
                  </Box>
                  {/* STATUS, THEN AN ACTION.
                      The row used to end at the status pill, which states a fact and
                      invites nothing - the list read as a display. The pill stays,
                      because "open" is genuinely information, but an outlined
                      "Review case" now sits beside it so the row offers the next step
                      rather than leaving the reader to work out that the whole row is
                      clickable.

                      Rendered as a Box, not a Button: the row is already a RouterLink,
                      and nesting an <a> inside an <a> is invalid HTML that browsers
                      silently un-nest. It carries the row's own hover, and the chevron
                      keeps signalling the row itself is the target. */}
                  {/* STATUS, THEN AN ACTION - stacked, and both always visible.
                      The row used to end at the status pill, which states a fact and
                      invites nothing, so the list read as a display rather than a tool.
                      The pill stays (an open case IS information) with "Review case"
                      beneath it.

                      ALWAYS VISIBLE, not hover-revealed: this rail is narrow enough
                      that a control appearing on hover would be undiscoverable on
                      touch, where there is no hover at all. Stacked rather than
                      side-by-side for the same reason - at 4 of 12 columns there is no
                      horizontal room for a pill and a button on one line.

                      A Box, not a Button: the whole row is already a RouterLink, and an
                      <a> inside an <a> is invalid HTML that browsers silently un-nest.
                      It inherits the row's target, and `aria-hidden` keeps assistive
                      tech from announcing a second control for the same destination -
                      the row's own link text already carries it. */}
                  {/* A FIXED-WIDTH ACTION RAIL, not a shrink-to-fit column.
                      The status pill and the button were flex-shrink-0 and sized to their
                      own content, so "In Progress" pushed its Review button further left
                      than "Open" did - the buttons stepped in and out down the feed and
                      the eye had to re-find the target on every row. A fixed rail means
                      they land on one vertical line, which is what makes rapid-fire
                      clearing possible. */}
                  <Stack spacing={0.6} sx={{ flexShrink: 0, alignItems: 'flex-end', width: 104 }}>
                    {c.status && <StatusPill status={c.status} />}
                    {clickable && (
                      <Box
                        aria-hidden
                        sx={{
                          display: 'inline-flex', alignItems: 'center', gap: 0.25,
                          px: 0.9, py: 0.3, borderRadius: `${RADII.control}px`,
                          border: `1px solid ${alpha(BRAND.action, 0.4)}`,
                          color: BRAND.action, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
                          transition: 'background-color .15s ease, border-color .15s ease',
                          '.rc-row:hover &': { borderColor: BRAND.action, bgcolor: alpha(BRAND.action, 0.08) },
                        }}
                      >
                        Review case
                        <ChevronRightRoundedIcon sx={{ fontSize: 15 }} />
                      </Box>
                    )}
                  </Stack>
                </Stack>
              </Box>
              );
            })}

            {/* Secondary conversion: the full history is a page, so the list does not
                need to scroll inside a card. Shown only when there is genuinely more
                than this card holds. */}
            {cases.length > items.length && (
              // Ghost button rather than a text link. As plain 12.5px text with a "→"
              // glyph it was the quietest thing on the card and read as a caption, so
              // the one route out of this summary was easy to miss. A bordered target
              // with a real icon gives it a hit area and marks it as secondary to the
              // header's primary action without competing with it.
              // A CARD FOOTER, not a button floating at the bottom-left. Full width on a
              // faint wash, separated by a rule: it reads as the card's own "go to the
              // full list" action rather than a sixth item in the feed, which is what a
              // left-aligned outlined button beside five rows looked like. minHeight 44
              // so the touch target clears the accessibility floor.
              <Box
                component={RouterLink}
                to="/all-reports"
                sx={{
                  mt: 'auto', mx: -1.25, mb: -1.25, px: 1.25,
                  minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 0.5, textDecoration: 'none',
                  borderTop: `1px solid ${mode === 'dark' ? 'rgba(255,255,255,0.08)' : BRAND.border}`,
                  bgcolor: alpha(BRAND.action, mode === 'dark' ? 0.10 : 0.04),
                  borderBottomLeftRadius: `${RADII.card}px`, borderBottomRightRadius: `${RADII.card}px`,
                  color: BRAND.action, fontSize: 13, fontWeight: 700,
                  transition: 'background-color .15s ease',
                  '&:hover': { bgcolor: alpha(BRAND.action, mode === 'dark' ? 0.16 : 0.08) },
                  '&:focus-visible': { outline: `2px solid ${BRAND.accent}`, outlineOffset: -2 },
                }}
              >
                View all {cases.length} reports
                <ArrowForwardRoundedIcon sx={{ fontSize: 16 }} />
              </Box>
            )}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
