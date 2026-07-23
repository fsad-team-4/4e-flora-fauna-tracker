import { Box, Typography, Card, Stack, Chip, Tooltip } from '@mui/material';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import { BRAND, HEALTH_META, TREND, GAUGE_ZONES } from '../../theme';

// Thresholds match riskStatus() in estateStats.js: <25 healthy, 25-59 watch, 60+
// critical. The gauge uses HARD STOPS because those thresholds are discrete, not
// a continuous gradient.
const HEALTHY_MAX = 25;
const WATCH_MAX = 60;

// Darker muted gray than MUTED: the hero's labels sit on the coloured
// risk-tint band, where #6b7280 drops to 4.2:1. This clears WCAG AA (4.5:1) on
// the tint and on white.
const MUTED = '#4B5563';

// A score of 0 with no data is NOT "healthy" - it means we know nothing. Rendering
// an unknown estate as a green needle at 0 would actively mislead, so the no-data
// case gets its own visual state.
function GaugeUnknown() {
  return (
    <Box sx={{ mt: 2 }}>
      <Box sx={{ height: 10, borderRadius: '5px', bgcolor: '#ECECEC', border: `1px dashed ${BRAND.border}` }} />
      <Typography sx={{ fontSize: 11, color: MUTED, mt: 0.75 }}>
        No scored data yet — this is not a healthy reading, it is an absent one.
      </Typography>
    </Box>
  );
}

function RiskGauge({ score }) {
  const pct = Math.max(0, Math.min(100, score));
  return (
    <Box sx={{ mt: 2 }}>
      {/* hard stops: three discrete zones, no gradient blending */}
      <Box sx={{ position: 'relative', height: 10, borderRadius: '5px', overflow: 'hidden', display: 'flex' }}>
        <Box sx={{ width: `${HEALTHY_MAX}%`, bgcolor: GAUGE_ZONES.healthy.fill }} />
        <Box sx={{ width: `${WATCH_MAX - HEALTHY_MAX}%`, bgcolor: GAUGE_ZONES.watch.fill }} />
        <Box sx={{ width: `${100 - WATCH_MAX}%`, bgcolor: GAUGE_ZONES.critical.fill }} />
      </Box>
      <Box sx={{ position: 'relative', height: 0 }}>
        <Box
          aria-hidden
          sx={{
            position: 'absolute', top: -13, left: `${pct}%`, transform: 'translateX(-50%)',
            width: 3, height: 16, bgcolor: BRAND.heading, borderRadius: '2px', boxShadow: '0 0 0 2px #fff',
          }}
        />
      </Box>
      {/* zone labels so the number explains itself without the chip */}
      <Box sx={{ display: 'flex', mt: 0.75 }}>
        <Typography sx={{ width: `${HEALTHY_MAX}%`, fontSize: 9.5, color: MUTED, textAlign: 'left' }}>
          {GAUGE_ZONES.healthy.label}
        </Typography>
        <Typography sx={{ width: `${WATCH_MAX - HEALTHY_MAX}%`, fontSize: 9.5, color: MUTED, textAlign: 'center' }}>
          {GAUGE_ZONES.watch.label}
        </Typography>
        <Typography sx={{ width: `${100 - WATCH_MAX}%`, fontSize: 9.5, color: MUTED, textAlign: 'right' }}>
          {GAUGE_ZONES.critical.label}
        </Typography>
      </Box>
    </Box>
  );
}

// A line with direction but no magnitude is decoration. Labelling start and end
// turns it into a sentence: "76, down from 84".
function ScoreSparkline({ scores }) {
  if (!scores || scores.length < 2) return null;
  const w = 200, h = 40;
  const min = Math.min(...scores), max = Math.max(...scores);
  const range = max - min || 1;
  const first = scores[0], last = scores[scores.length - 1];
  const pts = scores.map((s, i) => [(i / (scores.length - 1)) * w, h - ((s - min) / range) * (h - 6) - 3]);
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const end = pts[pts.length - 1];
  const rising = last >= first; // rising risk is bad
  const lineColor = rising ? TREND.bad : TREND.good;
  const delta = last - first;
  const summary = delta === 0
    ? `Risk index steady at ${last} over the last ${scores.length} days.`
    : `Risk index ${last}, ${rising ? 'up' : 'down'} from ${first} over the last ${scores.length} days.`;

  return (
    <Box sx={{ mt: 2.5 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Typography variant="overline" sx={{ color: MUTED, fontWeight: 700, letterSpacing: '0.8px' }}>
          Risk trend ({scores.length}d)
        </Typography>
        {/* magnitude, not just direction */}
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: lineColor }}>
          {delta === 0 ? `steady at ${last}` : `${last}, ${rising ? 'up' : 'down'} from ${first}`}
        </Typography>
      </Stack>
      <Box role="img" aria-label={summary}>
        <Box component="svg" viewBox={`0 0 ${w} ${h}`} sx={{ display: 'block', width: '100%', height: 40, mt: 0.5 }} preserveAspectRatio="none">
          <path d={d} fill="none" stroke={lineColor} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={end[0]} cy={end[1]} r={3} fill={lineColor} />
        </Box>
      </Box>
      {/* visually hidden table for screen readers. Wrapped in an overflow:hidden
          1px box - a bare <table> ignores width:1px (table-layout auto sizes to
          content) and clip only hides painting, so the unclipped layout box was
          overflowing the page; the wrapper clips it out of layout entirely. */}
      <Box sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' }}>
        <table>
          <caption>{summary}</caption>
          <tbody>
            <tr><th scope="row">Start</th><td>{first}</td></tr>
            <tr><th scope="row">End</th><td>{last}</td></tr>
          </tbody>
        </table>
      </Box>
    </Box>
  );
}

export default function EstateHealthHero({ estateHealth, history = [], loading, tiedBlocks = [] }) {
  const meta = HEALTH_META[estateHealth?.status] || HEALTH_META.watch;
  // distinguish "no data" from "scored zero" - they must never look the same
  const hasScore = estateHealth != null && typeof estateHealth.score === 'number';
  const score = hasScore ? estateHealth.score : null;
  const { highestRiskBlock, lastIncident } = estateHealth || {};
  const scores = history.map(h => h.riskScore).filter(v => typeof v === 'number');

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: '16px', border: `1px solid ${BRAND.border}`,
        boxShadow: '0 4px 16px rgba(0,0,0,.05)', overflow: 'hidden', height: '100%',
        opacity: loading ? 0.6 : 1, transition: 'opacity .2s',
      }}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.15fr 1px 1fr' }, alignItems: 'stretch' }}>
        <Box sx={{ p: { xs: 3, md: 4 }, bgcolor: hasScore ? meta.bg : '#FAFAFA' }}>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <Typography variant="overline" sx={{ color: MUTED, fontWeight: 700, letterSpacing: '0.8px' }}>
              Estate Risk Index
            </Typography>
            <Tooltip
              arrow
              title="A weighted 0–100 heuristic: critical flora, active hotspots, open cases and at-risk flora each contribute. Higher means more needs attention."
            >
              <HelpOutlineRoundedIcon sx={{ fontSize: 14, color: MUTED, cursor: 'help' }} />
            </Tooltip>
          </Stack>

          {hasScore ? (
            <>
              {/* baseline-aligned: both sit on the same alignItems: 'baseline' row */}
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'baseline', mt: 1 }}>
                <Typography sx={{ fontSize: 76, fontWeight: 800, lineHeight: 1, color: meta.color, letterSpacing: '-2px', fontVariantNumeric: 'tabular-nums' }}>
                  {score}
                </Typography>
                <Typography sx={{ color: MUTED, fontSize: 20, fontWeight: 600 }}>/ 100</Typography>
                <Chip label={meta.label} size="small" sx={{ bgcolor: meta.color, color: '#fff', fontWeight: 700, borderRadius: '8px', alignSelf: 'center' }} />
              </Stack>
              <RiskGauge score={score} />
              <ScoreSparkline scores={scores} />
            </>
          ) : (
            <>
              <Typography sx={{ fontSize: 40, fontWeight: 800, lineHeight: 1.2, color: MUTED, mt: 1 }}>
                No data
              </Typography>
              <GaugeUnknown />
            </>
          )}
        </Box>

        <Box sx={{ display: { xs: 'none', md: 'block' }, bgcolor: BRAND.border }} />

        <Box sx={{ p: { xs: 3, md: 4 }, bgcolor: BRAND.section, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2.75 }}>
          <Box>
            <Typography variant="overline" sx={{ color: MUTED, fontWeight: 700, letterSpacing: '0.8px' }}>
              Highest-Risk Block
            </Typography>
            {highestRiskBlock ? (
              <>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5, flexWrap: 'wrap' }}>
                  <PlaceOutlinedIcon sx={{ color: BRAND.primary, fontSize: 22 }} />
                  <Typography sx={{ fontSize: 22, fontWeight: 700, color: BRAND.heading }}>{highestRiskBlock}</Typography>
                </Stack>
                {/* data trust: if blocks tie, say so rather than contradicting the
                    Activity by Block card, which shows them level */}
                <Typography variant="body2" sx={{ color: MUTED, mt: 0.25 }}>
                  {tiedBlocks.length > 1
                    ? `most sightings this period — tied with ${tiedBlocks.filter(b => b !== highestRiskBlock).join(', ')}`
                    : 'most sightings this period'}
                </Typography>
              </>
            ) : (
              <Typography sx={{ mt: 0.5, color: MUTED }}>No active hotspots</Typography>
            )}
          </Box>

          <Box sx={{ height: '1px', bgcolor: BRAND.border }} />

          <Box>
            <Typography variant="overline" sx={{ color: MUTED, fontWeight: 700, letterSpacing: '0.8px' }}>
              Latest Incident
            </Typography>
            {lastIncident ? (
              <Typography sx={{ mt: 0.5, color: BRAND.text, fontSize: 15 }}>
                <Box component="span" sx={{ fontWeight: 600, color: BRAND.heading }}>{lastIncident.title}</Box>
                {lastIncident.block_number ? ` · ${lastIncident.block_number}` : ''}
              </Typography>
            ) : (
              <Typography sx={{ mt: 0.5, color: MUTED }}>No recent incidents</Typography>
            )}
          </Box>
        </Box>
      </Box>
    </Card>
  );
}