import { useState, useEffect } from 'react';
import { Box, Typography, Card, Stack, Chip, Tooltip } from '@mui/material';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { BRAND, HEALTH_META, TREND, GAUGE_ZONES } from '../../theme';

const HEALTHY_MAX = 25;
const WATCH_MAX = 60;
const MUTED = '#4B5563';

function useCountUp(target, duration = 800) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTimestamp = null;
    const startVal = 0;
    const endVal = target;
    let animationFrameId;

    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const currentVal = Math.round(startVal + easeProgress * (endVal - startVal));
      
      setCount(currentVal);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step);
      } else {
        setCount(endVal);
      }
    };

    animationFrameId = requestAnimationFrame(step);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [target, duration]);

  return count;
}

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
            transition: 'left 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        />
      </Box>
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

function ScoreSparkline({ scores }) {
  if (!scores || scores.length < 2) return null;
  const w = 200, h = 40;
  const min = Math.min(...scores), max = Math.max(...scores);
  const range = max - min || 1;
  const first = scores[0], last = scores[scores.length - 1];
  const pts = scores.map((s, i) => [(i / (scores.length - 1)) * w, h - ((s - min) / range) * (h - 6) - 3]);
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const end = pts[pts.length - 1];
  const rising = last >= first;
  const lineColor = rising ? TREND.bad : TREND.good;
  const delta = last - first;
  const summary = delta === 0
    ? `Risk index steady at ${last} over the last ${scores.length} days.`
    : `Risk index ${last}, ${rising ? 'up' : 'down'} from ${first} over the last ${scores.length} days.`;

  // Area fill path: go to bottom-right, bottom-left, close
  const areaD = `${d} L ${w},${h} L 0,${h} Z`;

  return (
    <Box sx={{ mt: 2.5 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Typography variant="overline" sx={{ color: MUTED, fontWeight: 700, letterSpacing: '0.8px' }}>
          Risk trend ({scores.length}d)
        </Typography>
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: lineColor }}>
          {delta === 0 ? `steady at ${last}` : `${last}, ${rising ? 'up' : 'down'} from ${first}`}
        </Typography>
      </Stack>
      <Box role="img" aria-label={summary}>
        <Box component="svg" viewBox={`0 0 ${w} ${h}`} sx={{ display: 'block', width: '100%', height: 40, mt: 0.5 }} preserveAspectRatio="none">
          {/* area fill */}
          <path d={areaD} fill={lineColor} fillOpacity={0.12} stroke="none" />
          {/* line */}
          <path d={d} fill="none" stroke={lineColor} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={end[0]} cy={end[1]} r={3} fill={lineColor} />
        </Box>
      </Box>
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
  const hasScore = estateHealth != null && typeof estateHealth.score === 'number';
  const score = hasScore ? estateHealth.score : null;
  const { highestRiskBlock, lastIncident } = estateHealth || {};
  const scores = history.map(h => h.riskScore).filter(v => typeof v === 'number');

  const animatedScore = useCountUp(score ?? 0, 800);

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
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'baseline', mt: 1 }}>
                <Typography sx={{ fontSize: 76, fontWeight: 800, lineHeight: 1, color: meta.color, letterSpacing: '-2px', fontVariantNumeric: 'tabular-nums' }}>
                  {animatedScore}
                </Typography>
                <Typography sx={{ color: MUTED, fontSize: 20, fontWeight: 600 }}>/ 100</Typography>
                <Chip 
                  label={meta.label} 
                  size="medium" 
                  sx={{ 
                    bgcolor: meta.color, 
                    color: '#fff', 
                    fontWeight: 700, 
                    borderRadius: '8px', 
                    alignSelf: 'center',
                    fontSize: 13,
                    px: 1.5,
                    letterSpacing: '0.3px'
                  }} 
                />
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
            <Typography variant="overline" sx={{ display: 'block', color: MUTED, fontWeight: 700, letterSpacing: '0.8px' }}>
              Highest-Risk Block
            </Typography>
            {highestRiskBlock ? (
              <>
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1.5, py: 0.5, bgcolor: '#FDECEA', borderRadius: '10px', border: '1px solid #F5C2C2', mt: 1 }}>
                  <PlaceOutlinedIcon sx={{ color: BRAND.primary, fontSize: 20 }} />
                  <Typography sx={{ fontSize: 18, fontWeight: 700, color: BRAND.heading }}>{highestRiskBlock}</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.75 }}>
                  <InfoOutlinedIcon sx={{ fontSize: 14, color: MUTED }} />
                  <Typography variant="body2" sx={{ color: MUTED }}>
                    {tiedBlocks.length > 1
                      ? `most sightings this period — tied with ${tiedBlocks.filter(b => b !== highestRiskBlock).join(', ')}`
                      : 'most sightings this period'}
                  </Typography>
                </Box>
              </>
            ) : (
              <Typography sx={{ mt: 0.5, color: MUTED }}>No active hotspots</Typography>
            )}
          </Box>

          <Box sx={{ height: '1px', bgcolor: BRAND.border }} />

          <Box>
            <Typography variant="overline" sx={{ display: 'block', color: MUTED, fontWeight: 700, letterSpacing: '0.8px' }}>
              Latest Incident
            </Typography>
            {lastIncident ? (
              <Box sx={{ mt: 0.75, p: 1.5, bgcolor: '#fff', border: '1px solid ' + BRAND.border, borderRadius: '10px' }}>
                <Typography sx={{ fontSize: 14, fontWeight: 600, color: BRAND.heading, lineHeight: 1.3 }}>{lastIncident.title}</Typography>
                {lastIncident.block_number && (
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 0.75, px: 1, py: 0.25, bgcolor: BRAND.section, borderRadius: '6px', border: `1px solid ${BRAND.border}` }}>
                    <PlaceOutlinedIcon sx={{ fontSize: 12, color: BRAND.textLight }} />
                    <Typography sx={{ fontSize: 11, color: BRAND.textLight, fontWeight: 600 }}>{lastIncident.block_number}</Typography>
                  </Box>
                )}
                {lastIncident.at && (
                  <Typography sx={{ fontSize: 11, color: MUTED, mt: 0.5 }}>
                    {new Date(lastIncident.at).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </Typography>
                )}
              </Box>
            ) : (
              <Typography sx={{ mt: 0.5, color: MUTED }}>No recent incidents</Typography>
            )}
          </Box>
        </Box>
      </Box>
    </Card>
  );
}
