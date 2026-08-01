import { Box, Card, CardContent, Typography } from '@mui/material';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, LabelList,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { useTheme } from '@mui/material/styles';
import { BRAND } from '../../theme';

// The estate's own hotspot rule (backend computeHotspots uses minCount = 3, see
// backend/src/services/estateStats.js:10, and both production call sites take the
// default), so the banding here is the same threshold the rest of the app already
// acts on rather than an arbitrary cut.
//
// It is duplicated rather than imported because the backend declares it as a JS
// default parameter, not an exported constant. If that default ever changes this
// copy drifts silently - worth exporting properly if the value is ever tuned.
const HOTSPOT_MIN = 3;
const DEFAULT_LIMIT = 5;

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

function BarTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <Box sx={{ bgcolor: BRAND.surface, border: `1px solid ${BRAND.border}`, borderRadius: '8px', boxShadow: '0 12px 32px rgba(16,24,40,.15)', px: 1.5, py: 1 }}>
      <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.heading }}>{d.block_number}</Typography>
      <Typography sx={{ fontSize: 12.5, color: BRAND.text }}>
        {d.count} sighting{d.count === 1 ? '' : 's'}
      </Typography>
      <Typography sx={{ fontSize: 11.5, color: BRAND.textLight }}>{bandLabel(d.count)}</Typography>
    </Box>
  );
}

/**
 * Top blocks by sighting volume, as a ranked horizontal bar chart.
 *
 * This was a stack of 5px progress tracks with the figure floated to the right of
 * each label. That reads as a set of meters - one per row, each its own widget -
 * rather than as one chart whose bars are directly comparable. A real bar chart on a
 * shared, LABELLED value axis makes the comparison the point, and the axis states
 * what the lengths mean instead of leaving them as bare proportions.
 *
 * The hotspot threshold is drawn as a reference line, so "over the line" is a thing
 * you can see rather than a colour you have to decode. Only the top N are shown, and
 * the footer says how many blocks were left out so the truncation is never silent.
 */
// `embedded` = rendered inside the Block Performance widget's toggle, so the Card
// wrapper and title are supplied by the parent instead.
export default function TopRiskBlocks({ sightingsByBlock = [], topBlock = null, limit = DEFAULT_LIMIT, embedded = false }) {
  const theme = useTheme();
  const mode = theme.palette.mode;
  const heat = HEAT[mode] || HEAT.light;
  const gridInk = theme.palette.divider;
  const axisInk = theme.palette.text.secondary;
  const ranked = [...sightingsByBlock]
    .filter(b => b.count > 0)
    .sort((a, b) => b.count - a.count || String(a.block_number).localeCompare(String(b.block_number), undefined, { numeric: true }));
  const shown = ranked.slice(0, limit);
  const hidden = ranked.length - shown.length;
  const max = shown.length ? shown[0].count : 0;
  // Headroom for the end-of-bar value labels, and enough room that the threshold
  // line is never flush against the plot edge when every block sits at or below it.
  const axisMax = Math.max(HOTSPOT_MIN + 1, max + 1);
  const summary = shown.length
    ? `Top ${shown.length} blocks by fauna sightings: ${shown.map(b => `${b.block_number} ${b.count}`).join(', ')}. Hotspot threshold is ${HOTSPOT_MIN}.`
    : 'No sightings logged in this period.';

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
            <Box role="img" aria-label={summary}>
              <ResponsiveContainer width="100%" height={Math.max(140, shown.length * 46 + 58)}>
                <BarChart
                  data={shown}
                  layout="vertical"
                  margin={{ top: 18, right: 30, left: 0, bottom: 22 }}
                  barCategoryGap="28%"
                >
                  {/* vertical rules only - on a horizontal chart those are the ones
                      that help you read a bar's length */}
                  <CartesianGrid stroke={gridInk} strokeDasharray="3 4" strokeOpacity={0.55} horizontal={false} />
                  <XAxis
                    type="number"
                    domain={[0, axisMax]}
                    allowDecimals={false}
                    tick={{ fontSize: 11.5, fill: axisInk }}
                    axisLine={{ stroke: gridInk }}
                    tickLine={false}
                    label={{ value: 'fauna sightings', position: 'insideBottom', offset: -12, style: { fontSize: 11, fill: axisInk } }}
                  />
                  <YAxis
                    type="category"
                    dataKey="block_number"
                    width={82}
                    tick={{ fontSize: 12.5, fill: theme.palette.text.primary, fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  {/* The estate's real hotspot rule, drawn rather than described. */}
                  <ReferenceLine
                    x={HOTSPOT_MIN}
                    stroke={BREACH_INK[mode] || BREACH_INK.light}
                    strokeDasharray="4 3"
                    strokeWidth={1.5}
                    label={{ value: `hotspot ${HOTSPOT_MIN}`, position: 'top', style: { fontSize: 10, fill: axisInk } }}
                  />
                  <Tooltip cursor={{ fill: gridInk, fillOpacity: 0.25 }} content={<BarTooltip />} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22} animationDuration={600}>
                    {shown.map((b, i) => {
                      const over = b.count >= HOTSPOT_MIN;
                      const isTop = topBlock != null && b.block_number === topBlock;
                      // only the worst breaching block earns red; the rest ride the heat scale
                      const ink = isTop && over ? (BREACH_INK[mode] || BREACH_INK.light) : heat[Math.min(i, heat.length - 1)];
                      return <Cell key={b.block_number} fill={ink} />;
                    })}
                    <LabelList
                      dataKey="count"
                      position="right"
                      style={{ fontSize: 12.5, fontWeight: 700, fill: theme.palette.text.primary }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Box>

            {/* The "highest" marker is text, not a bar colour, so it survives for
                anyone who cannot separate the red from the blues. */}
            {topBlock != null && shown.some(b => b.block_number === topBlock && b.count >= HOTSPOT_MIN) && (
              <Typography sx={{ fontSize: 11.5, color: BRAND.textLight, mt: 0.5 }}>
                <Box component="span" sx={{ fontWeight: 800, letterSpacing: '0.4px', textTransform: 'uppercase', color: BRAND.accent, fontSize: 10 }}>
                  Highest
                </Box>
                {' '}{topBlock} - over the hotspot threshold.
              </Typography>
            )}

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
