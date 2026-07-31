import { Box, Card, CardContent, Stack, Typography, Tooltip } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { BRAND } from '../../theme';

// The estate's own hotspot rule (backend computeHotspots uses minCount = 3), so the
// banding here is the same threshold the rest of the app already acts on rather
// than an arbitrary cut.
const HOTSPOT_MIN = 3;
const TOP_N = 3; // a leaderboard, not a chart - the top offenders only

// Blue heat scale: strongest for the highest volume, fading out as counts drop, so
// intensity is carried by depth of colour as well as by bar length. Red is spent on
// nothing but the single worst breaching block - rows of red bars read as an alarm
// and stop meaning anything. Per scheme: light runs darkest-first; dark runs
// brightest-first so the worst bar is the most visible on the dark track.
const BREACH_INK = { light: '#B3261E', dark: '#F08A8F' };
const HEAT = {
  light: ['#1E3A5F', '#2C5687', '#4A7CB0', '#7C9DBF', '#A9BDD1'],
  dark: ['#A9C7E8', '#8FB3D9', '#6E96C2', '#54789F', '#3F5D7E'],
};

function bandLabel(count) {
  if (!count) return 'No recorded activity';
  if (count < HOTSPOT_MIN) return `Below the hotspot threshold (${HOTSPOT_MIN})`;
  if (count < HOTSPOT_MIN * 2) return `At or above the hotspot threshold (${HOTSPOT_MIN})`;
  return `${HOTSPOT_MIN * 2}+ sightings - double the threshold`;
}

/**
 * Top blocks by sighting volume, as a sorted horizontal bar chart.
 *
 * This replaced a grid of coloured squares: ranked bars are read in one pass
 * (longest = worst, top to bottom) whereas the squares needed the legend decoded
 * for every tile. Only the top N are shown, and the footer says how many blocks
 * were left out so the truncation is never silent.
 */
// `embedded` = rendered inside the Block Performance widget's toggle, so the Card
// wrapper and title are supplied by the parent instead.
export default function TopRiskBlocks({ sightingsByBlock = [], topBlock = null, limit = TOP_N, embedded = false }) {
  const mode = useTheme().palette.mode;
  const heat = HEAT[mode] || HEAT.light;
  const ranked = [...sightingsByBlock]
    .filter(b => b.count > 0)
    .sort((a, b) => b.count - a.count || String(a.block_number).localeCompare(String(b.block_number), undefined, { numeric: true }));
  const shown = ranked.slice(0, limit);
  const hidden = ranked.length - shown.length;
  const max = shown.length ? shown[0].count : 0;

  const inner = (
      <>
        {!embedded && (
          <>
            <Typography component="h2" variant="h6" fontWeight={700} sx={{ color: BRAND.heading }}>
              Risk by Block
            </Typography>
            <Typography variant="body2" sx={{ color: BRAND.textLight, mb: 2 }}>
              Top {limit} blocks by sighting volume, highest first
            </Typography>
          </>
        )}

        {shown.length === 0 ? (
          <Typography variant="body2" sx={{ color: BRAND.textLight, py: 4, textAlign: 'center' }}>
            No sightings logged in this period.
          </Typography>
        ) : (
          <>
            <Stack spacing={1.75}>
              {shown.map((b, i) => {
                const over = b.count >= HOTSPOT_MIN;
                const isTop = topBlock != null && b.block_number === topBlock;
                // only the worst breaching block earns red; the rest ride the heat scale
                const ink = isTop && over ? (BREACH_INK[mode] || BREACH_INK.light) : heat[Math.min(i, heat.length - 1)];
                const pct = max ? (b.count / max) * 100 : 0;
                return (
                  <Tooltip
                    key={b.block_number}
                    placement="top"
                    title={`${b.block_number}: ${b.count} sighting${b.count === 1 ? '' : 's'} · ${bandLabel(b.count)}`}
                  >
                    <Box>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', justifyContent: 'space-between', mb: 0.5 }}>
                        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline', minWidth: 0 }}>
                          <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: BRAND.textLight, fontVariantNumeric: 'tabular-nums' }}>
                            {i + 1}
                          </Typography>
                          <Typography sx={{ fontSize: 14, fontWeight: 600, color: BRAND.heading, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {b.block_number}
                          </Typography>
                          {isTop && (
                            <Typography sx={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.4px', textTransform: 'uppercase', color: BRAND.accent }}>
                              Highest
                            </Typography>
                          )}
                        </Stack>
                        <Typography sx={{ fontSize: 14, fontWeight: 700, color: BRAND.heading, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                          {b.count}
                        </Typography>
                      </Stack>
                      {/* slender 5px track: a lightweight leader-board rather than a
                          row of heavy blocks. Intensity rides the heat scale. */}
                      <Box sx={{ height: 5, borderRadius: '3px', bgcolor: BRAND.section, overflow: 'hidden' }}>
                        <Box
                          sx={{
                            height: '100%', width: `${pct}%`, bgcolor: ink, borderRadius: '3px',
                            transition: 'width .5s ease', transitionDelay: `${i * 60}ms`,
                          }}
                        />
                      </Box>
                    </Box>
                  </Tooltip>
                );
              })}
            </Stack>

            {hidden > 0 && (
              <Typography sx={{ fontSize: 12, color: BRAND.textLight, mt: 1 }}>
                {hidden} further block{hidden === 1 ? '' : 's'} with activity not shown.
              </Typography>
            )}
          </>
        )}
      </>
  );

  if (embedded) return inner;

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 3 }}>{inner}</CardContent>
    </Card>
  );
}
