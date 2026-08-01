import { useState, useEffect } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Typography, Card, Stack, Tooltip, Button, Skeleton } from '@mui/material';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import TrendingFlatRoundedIcon from '@mui/icons-material/TrendingFlatRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import { useTheme } from '@mui/material/styles';
import { BRAND, HEALTH_META, TREND, GAUGE_ZONES } from '../../theme';

const HEALTHY_MAX = 25;
const WATCH_MAX = 60;

// Plain-language risk level for the action copy, keyed off the same thresholds the
// backend uses for riskStatus.
const LEVEL_WORD = { healthy: 'Low', watch: 'Elevated', critical: 'High' };
const money = n => `S$${(n || 0).toLocaleString('en-SG')}`;

function useCountUp(target, duration = 800) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let startTimestamp = null;
    let animationFrameId;
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) animationFrameId = requestAnimationFrame(step);
      else setCount(target);
    };
    animationFrameId = requestAnimationFrame(step);
    return () => { if (animationFrameId) cancelAnimationFrame(animationFrameId); };
  }, [target, duration]);
  return count;
}

/**
 * The supplementary stats, as CELLS for the micro-grid rather than a rendered row.
 *
 * Returning data instead of JSX is what lets the trend and the prevention figures
 * share ONE strict 2-column grid. They used to be two separately-laid-out rows -
 * a baseline-aligned inline list under a flex pill - so nothing lined up
 * vertically and the block read as scattered.
 *
 * Returns null when there is nothing measurable, so the caller can fall back to
 * saying so rather than rendering an empty grid.
 */
function impactCells(scorecard, trend) {
  const s = scorecard?.summary;
  const r = s?.repeat_risk_reduction;
  if (r == null) return null;
  const improved = r > 0;
  return [
    {
      v: `${Math.round(Math.abs(r) * 100)}%`,
      l: improved ? 'fewer repeats' : 'change',
      ink: improved ? trend.good : BRAND.heading,
      icon: improved ? TrendingDownRoundedIcon : null,
    },
    { v: s.call_outs_avoided, l: 'call-outs avoided', ink: BRAND.heading },
    { v: money(s.est_savings), l: 'est. savings', ink: BRAND.heading },
  ];
}

// Percentage change across the window, as a grid cell in the same shape as the
// prevention figures, so all four align on one baseline grid.
function trendCell(scores, trend) {
  if (!scores || scores.length < 2) return null;
  const first = scores[0], last = scores[scores.length - 1];
  const delta = last - first;
  const pct = first > 0 ? Math.round((delta / first) * 100) : null;
  const rising = delta > 0;
  return {
    v: pct == null ? `${delta > 0 ? '+' : ''}${delta}` : `${pct > 0 ? '+' : ''}${pct}%`,
    l: `${delta === 0 ? 'no change' : rising ? 'worsening' : 'improving'} vs ${scores.length}d ago`,
    ink: delta === 0 ? trend.neutral : rising ? trend.bad : trend.good,
    icon: delta === 0 ? TrendingFlatRoundedIcon : rising ? ArrowUpwardRoundedIcon : ArrowDownwardRoundedIcon,
  };
}

// One cell of the 2-column micro-grid. Fixed structure - icon slot, figure,
// caption - so every cell occupies the same shape whatever it holds.
function StatCell({ cell }) {
  return (
    <Stack direction="row" spacing={0.6} sx={{ alignItems: 'baseline', minWidth: 0 }}>
      {cell.icon && <cell.icon sx={{ color: cell.ink, fontSize: 16, alignSelf: 'center', flexShrink: 0 }} aria-hidden />}
      <Typography sx={{ fontSize: 19, fontWeight: 800, lineHeight: 1.1, color: cell.ink, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
        {cell.v}
      </Typography>
      <Typography sx={{ fontSize: 12.5, color: BRAND.text, lineHeight: 1.3 }}>{cell.l}</Typography>
    </Stack>
  );
}

/**
 * Zone A - the Command Card. Estate status, what it achieved, and the one action it
 * demands, in a single 12-column card. Left: score + trend + prevention impact.
 * Right: a distinct Action Area holding the primary CTA.
 */
export default function EstateHealthHero({ estateHealth, history = [], loading, pendingEscalations = 0, pendingBlocks = 0, scorecard = null }) {
  const trend = TREND[useTheme().palette.mode] || TREND.light;
  const meta = HEALTH_META[estateHealth?.status] || HEALTH_META.watch;
  const hasScore = estateHealth != null && typeof estateHealth.score === 'number';
  const score = hasScore ? estateHealth.score : null;
  const scores = history.map(h => h.riskScore).filter(v => typeof v === 'number');
  const animatedScore = useCountUp(score ?? 0, 800);
  const active = pendingEscalations > 0;
  const level = LEVEL_WORD[estateHealth?.status] || 'Elevated';

  // Trend first, then what past action achieved. Nulls are dropped rather than
  // rendered as blanks, so the grid never shows an empty cell.
  const impact = impactCells(scorecard, trend);
  const cells = [trendCell(scores, trend), ...(impact || [])].filter(Boolean);

  return (
    <Card
      sx={{
        overflow: 'hidden', opacity: loading ? 0.6 : 1, transition: 'opacity .2s',
        // A deliberately heavier edge than the KPI tiles below it. The hero used the
        // same 1px hairline as every other card, so nothing marked it as the thing to
        // read first; 2px is enough to rank it without resorting to a tinted fill.
        border: `2px solid ${BRAND.border}`, borderRadius: '14px',
      }}
    >
      {/* SPLIT PANE. Two columns on one grid: the hook on the left, the conversion
          point on the right, vertically centred against it. Previously the CTA was
          pinned to the card's top-right while the score sat lower-left, so the eye
          had to travel diagonally past the supplementary stats to reach the action. */}
      <Box
        sx={{
          p: { xs: 2.5, md: 3.5 },
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) auto' },
          columnGap: 4, rowGap: 3,
          alignItems: 'center',
        }}
      >
        {/* ── LEFT: the hook ─────────────────────────────── */}
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mb: 1.25 }}>
            <Typography
              component="h2"
              sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.7px', textTransform: 'uppercase', color: BRAND.textLight }}
            >
              Estate Risk Index
            </Typography>
            <Tooltip
              arrow
              title="A weighted 0-100 heuristic: critical flora (x15), active hotspots (x10), open cases (x5) and at-risk flora (x3), capped at 100. Higher means more needs attention."
            >
              <HelpOutlineRoundedIcon sx={{ fontSize: 14, color: BRAND.textLight, cursor: 'help' }} />
            </Tooltip>
          </Stack>

          {hasScore ? (
            <>
              {/* Score + a colour-coded status indicator, not a solid pill. A filled
                  red lozenge beside a red number was the same alarm stated twice and
                  the heaviest object on the page. A rule plus the status word in the
                  SAME ink as the score reads as one unit, and the words carry the
                  level so colour is never the only cue. */}
              <Stack direction="row" spacing={{ xs: 1.5, md: 2 }} sx={{ alignItems: 'center', mb: 2 }}>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline', flexShrink: 0 }}>
                  <Typography
                    sx={{
                      fontSize: { xs: 60, md: 80 }, fontWeight: 800,
                      // tighter than the type size, so the figure sits compactly
                      // against the stats beneath instead of floating in leading
                      lineHeight: 0.82,
                      color: meta.display, letterSpacing: '-3.5px', fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {animatedScore}
                  </Typography>
                  <Typography sx={{ fontSize: 20, fontWeight: 700, color: BRAND.textLight }}>/ 100</Typography>
                </Stack>
                <Box aria-hidden sx={{ width: 4, alignSelf: 'stretch', my: 0.5, borderRadius: '2px', bgcolor: meta.display, flexShrink: 0 }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 800, color: meta.display, textTransform: 'uppercase', letterSpacing: '0.6px', lineHeight: 1.25 }}>
                    Risk {level}
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: BRAND.text, lineHeight: 1.25 }}>{meta.label}</Typography>
                </Box>
              </Stack>

              {/* Strict 2-column micro-grid: every figure starts on one of two
                  vertical rails, which is what removes the scattered look. */}
              {cells.length > 0 ? (
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, columnGap: 3, rowGap: 1.25 }}>
                  {cells.map(c => <StatCell key={c.l} cell={c} />)}
                </Box>
              ) : !scorecard ? (
                <Skeleton variant="rounded" width="100%" height={56} />
              ) : (
                <Typography sx={{ fontSize: 12.5, color: BRAND.textLight }}>
                  Prevention impact not measurable yet - close out work orders to start tracking it.
                </Typography>
              )}

              <Typography sx={{ fontSize: 11.5, color: BRAND.textLight, mt: 1.75 }}>
                {GAUGE_ZONES.healthy.label} &lt;{HEALTHY_MAX} · {GAUGE_ZONES.watch.label} {HEALTHY_MAX}-{WATCH_MAX - 1} · {GAUGE_ZONES.critical.label} {WATCH_MAX}+
              </Typography>
            </>
          ) : (
            <Box>
              <Typography sx={{ fontSize: 44, fontWeight: 700, lineHeight: 1.1, color: BRAND.textLight }}>No data</Typography>
              <Typography sx={{ fontSize: 12.5, color: BRAND.textLight, mt: 0.5, maxWidth: 380 }}>
                No scored data yet - this is not a healthy reading, it is an absent one.
              </Typography>
            </Box>
          )}
        </Box>

        {/* ── RIGHT: the conversion point ─────────────────── */}
        <Stack spacing={0.75} sx={{ alignItems: { md: 'flex-end' }, flexShrink: 0, width: { xs: '100%', md: 'auto' } }}>
          <Button
            component={RouterLink}
            to="/action-queue"
            variant="contained"
            endIcon={<ArrowForwardRoundedIcon />}
            aria-label={active ? `Process escalation queue, ${pendingEscalations} pending` : 'Open queue'}
            sx={{
              // Thicker and deeper. The gradient runs from BRAND.action to its own
              // hover shade, which reads richer than a flat fill while staying inside
              // the one action-blue the rest of the app uses - a bespoke hex here
              // would have put a second blue in the palette.
              minHeight: 54, px: 3, fontSize: 15, fontWeight: 800, letterSpacing: '0.1px',
              width: { xs: '100%', md: 'auto' },
              background: active ? `linear-gradient(180deg, ${BRAND.action} 0%, ${BRAND.actionHover} 100%)` : BRAND.slate,
              boxShadow: active ? '0 0 0 4px rgba(29,78,216,.12), 0 8px 20px rgba(29,78,216,.38)' : 'none',
              transition: 'transform .15s ease, box-shadow .15s ease, background .15s ease',
              '&:hover': {
                background: active ? `linear-gradient(180deg, ${BRAND.actionHover} 0%, #143A9E 100%)` : BRAND.slateHover,
                transform: 'translateY(-1px)',
                boxShadow: active ? '0 0 0 5px rgba(29,78,216,.16), 0 10px 24px rgba(29,78,216,.46)' : 'none',
              },
              '@keyframes ctaPulse': {
                '0%': { boxShadow: '0 0 0 0 rgba(193,39,45,.6)' },
                '70%': { boxShadow: '0 0 0 6px rgba(193,39,45,0)' },
                '100%': { boxShadow: '0 0 0 0 rgba(193,39,45,0)' },
              },
            }}
          >
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25 }}>
              {active ? 'Process Escalation Queue' : 'Open Queue'}
              {active && (
                // A true circular count badge, the way an unread counter reads. It
                // held "9 Pending" before, which made it a wide lozenge that competed
                // with the button label; the word now lives in the caption below.
                <Box
                  component="span"
                  aria-hidden
                  sx={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                    bgcolor: BRAND.primary, color: '#fff',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                    animation: 'ctaPulse 2s ease-out infinite',
                  }}
                >
                  {pendingEscalations}
                </Box>
              )}
            </Box>
          </Button>
          <Typography sx={{ fontSize: 11.5, color: BRAND.textLight, textAlign: { md: 'right' }, maxWidth: 260 }}>
            {active
              ? `${pendingEscalations} pending${pendingBlocks > 0 ? ` across ${pendingBlocks} block${pendingBlocks === 1 ? '' : 's'}` : ''} · AI-flagged, none auto-dispatched`
              : 'Nothing awaiting approval'}
          </Typography>
        </Stack>
      </Box>
    </Card>
  );
}
