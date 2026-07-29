import { Card, CardContent, Box, Stack, Typography, Tooltip } from '@mui/material';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import PetsOutlinedIcon from '@mui/icons-material/PetsOutlined';
import FlutterDashOutlinedIcon from '@mui/icons-material/FlutterDashOutlined';
import LocalFloristOutlinedIcon from '@mui/icons-material/LocalFloristOutlined';
import PestControlRodentOutlinedIcon from '@mui/icons-material/PestControlRodentOutlined';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import { BRAND } from '../../theme';
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
const CATEGORY_INK = {
  community_cat: '#1E3A5F',
  pigeon: '#2C5687',
  flora_health: '#0E8A8A',
  pest: '#B3261E',
  other: '#6E88A6',
};

function CategoryGlyph({ category }) {
  const Icon = CATEGORY_ICON[category] || HelpOutlineRoundedIcon;
  const ink = CATEGORY_INK[category] || CATEGORY_INK.other;
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
  const items = cases.slice(0, limit);

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 3 }}>
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
          <Stack spacing={0.5}>
            {items.map((c, i) => (
              <Box
                key={c.id ?? `${c.title}-${i}`}
                sx={{
                  py: 1.25, px: 1, mx: -1, borderRadius: '8px',
                  transition: 'background-color .15s ease',
                  '&:hover': { bgcolor: BRAND.section },
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
                    <Stack direction="row" spacing={1.25} sx={{ mt: 0.6, flexWrap: 'wrap', rowGap: 0.5 }}>
                      {c.block_number && <Meta icon={PlaceOutlinedIcon}>{c.block_number}</Meta>}
                      {c.createdAt && <Meta icon={ScheduleRoundedIcon}>{fmtWhen(c.createdAt)}</Meta>}
                    </Stack>
                  </Box>
                  {c.status && <Box sx={{ flexShrink: 0 }}><StatusPill status={c.status} /></Box>}
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
