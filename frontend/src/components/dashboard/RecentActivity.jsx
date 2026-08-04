import { Link as RouterLink } from 'react-router-dom';
import { Card, CardContent, Box, Stack, Typography, Tooltip } from '@mui/material';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import PetsOutlinedIcon from '@mui/icons-material/PetsOutlined';
import FlutterDashOutlinedIcon from '@mui/icons-material/FlutterDashOutlined';
import LocalFloristOutlinedIcon from '@mui/icons-material/LocalFloristOutlined';
import PestControlRodentOutlinedIcon from '@mui/icons-material/PestControlRodentOutlined';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import { useTheme } from '@mui/material/styles';
import { BRAND, SURFACE, RADII, surfaceSx } from '../../theme';
import { CATEGORY_LABELS } from '../../constants';
import StatusPill from '../StatusPill';

// One recognisable glyph per category, replacing the repeated category text on every
// row. The label still reaches screen readers and hover via the tooltip/aria-label,
// so nothing is lost by dropping the visible words.
const CATEGORY_ICON = {
  community_cat: PetsOutlinedIcon,
  pigeon: FlutterDashOutlinedIcon,
  flora_health: LocalFloristOutlinedIcon,
  pest: PestControlRodentOutlinedIcon,
  other: HelpOutlineRoundedIcon,
};
// Per scheme: the dark inks are lightened so the glyph and its 8% tint well stay
// visible on the dark card.
const CATEGORY_INK = {
  light: {
    community_cat: '#1E3A5F',
    pigeon: '#2C5687',
    flora_health: '#0E8A8A',
    pest: '#B3261E',
    other: '#6E88A6',
  },
  dark: {
    community_cat: '#8FB8E8',
    pigeon: '#9BB8D6',
    flora_health: '#4FC3C3',
    pest: '#F08A8F',
    other: '#9DB0C6',
  },
};

function CategoryGlyph({ category }) {
  const inkMap = CATEGORY_INK[useTheme().palette.mode] || CATEGORY_INK.light;
  const Icon = CATEGORY_ICON[category] || HelpOutlineRoundedIcon;
  const ink = inkMap[category] || inkMap.other;
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
      <Typography sx={{ fontSize: 11.5, color: BRAND.textLight, fontWeight: 500, whiteSpace: 'nowrap' }}>{children}</Typography>
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
        <Typography variant="body2" sx={{ color: BRAND.textLight, mb: 1.5 }}>
          Latest reports across the estate, newest first
        </Typography>

        {items.length === 0 ? (
          <Typography variant="body2" sx={{ color: BRAND.textLight, py: 5, textAlign: 'center' }}>
            No recent cases.
          </Typography>
        ) : (
          // Separation by whitespace, not rules: the row hover gives the grouping
          // cue instead, so five entries do not read as five boxed cells.
          <Stack spacing={0.75} sx={{ flexGrow: 1 }}>
            {items.map((c, i) => (
              <Box
                key={c.id ?? `${c.title}-${i}`}
                sx={{
                  // Tighter rows: py 1.25 + spacing 0.5 between five entries spent
                  // more of the card on gaps than on content. The hover wash still
                  // groups each row, so the whitespace was doing no work.
                  // Rows on the INSET surface rather than a white wash, so the list
                  // reads as a set of dark chips inside a dark card.
                  py: 1, px: 1.25, borderRadius: `${RADII.chip}px`,
                  bgcolor: s.inset,
                  transition: 'background-color .15s ease',
                  '&:hover': { bgcolor: s.raised },
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
                      <Typography sx={{ fontSize: 14.5, fontWeight: 600, color: BRAND.heading, lineHeight: 1.35 }}>
                        {c.title}
                      </Typography>
                    </Stack>
                    {/* category text is gone from this row - the glyph carries it */}
                    <Stack direction="row" spacing={1.25} sx={{ mt: 0.35, flexWrap: 'wrap', rowGap: 0.5 }}>
                      {c.block_number && <Meta icon={PlaceOutlinedIcon}>{c.block_number}</Meta>}
                      {c.createdAt && <Meta icon={ScheduleRoundedIcon}>{fmtWhen(c.createdAt)}</Meta>}
                    </Stack>
                  </Box>
                  {c.status && <Box sx={{ flexShrink: 0 }}><StatusPill status={c.status} /></Box>}
                </Stack>
              </Box>
            ))}

            {/* Secondary conversion: the full history is a page, so the list does not
                need to scroll inside a card. Shown only when there is genuinely more
                than this card holds. */}
            {cases.length > items.length && (
              <Box
                component={RouterLink}
                to="/all-reports"
                sx={{
                  mt: 'auto', pt: 1.25, alignSelf: 'flex-start',
                  fontSize: 12.5, fontWeight: 600, color: BRAND.action, textDecoration: 'none',
                  '&:hover': { textDecoration: 'underline' },
                  '&:focus-visible': { outline: `2px solid ${BRAND.accent}`, outlineOffset: 2 },
                }}
              >
                View all {cases.length} reports →
              </Box>
            )}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
