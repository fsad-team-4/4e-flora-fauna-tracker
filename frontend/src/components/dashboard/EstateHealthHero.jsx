import { useState, useEffect, useId } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Typography, Card, Stack, Chip, Tooltip, Button, Skeleton } from '@mui/material';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import TrendingFlatRoundedIcon from '@mui/icons-material/TrendingFlatRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import { BRAND, HEALTH_META, TREND, GAUGE_ZONES } from '../../theme';

const HEALTHY_MAX = 25;
const WATCH_MAX = 60;
const MUTED = '#4B5563';

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
 * Semicircle donut gauge. A thick arc uses vertical space better than a full ring
 * and leaves a natural well for the score to sit in, where nothing overlaps it.
 *
 * The "glow" is a blurred copy of the progress arc underneath the crisp one - an SVG
 * filter rather than a CSS shadow, so it follows the arc's shape.
 *
 * Colours are literal HEALTH_META values, never BRAND CSS variables: these land in
 * SVG stroke attributes, where var() does not resolve.
 */
function SemiDonut({ score, ink, label, size = 216 }) {
  const glowId = useId();
  const pct = Math.max(0, Math.min(100, score));
  const cx = 100, cy = 100, r = 76, stroke = 20;
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const len = Math.PI * r;
  // band boundary ticks, so thresholds stay visible without a separate legend
  const tick = v => {
    const th = ((180 - v * 1.8) * Math.PI) / 180;
    return {
      x1: cx + (r - stroke / 2) * Math.cos(th), y1: cy - (r - stroke / 2) * Math.sin(th),
      x2: cx + (r + stroke / 2) * Math.cos(th), y2: cy - (r + stroke / 2) * Math.sin(th),
    };
  };

  return (
    <Box
      role="img"
      aria-label={`Estate risk index ${score} out of 100 - ${label}`}
      sx={{ width: size, maxWidth: '100%', flexShrink: 0 }}
    >
      <Box component="svg" viewBox="0 0 200 116" sx={{ display: 'block', width: '100%' }}>
        <defs>
          <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>
        <path d={arc} fill="none" stroke="#E5E7EB" strokeWidth={stroke} strokeLinecap="round" />
        {/* soft glow copy beneath the crisp arc */}
        <path
          d={arc} fill="none" stroke={ink} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${len} ${len}`} strokeDashoffset={len * (1 - pct / 100)}
          filter={`url(#${glowId})`} opacity={0.5}
        />
        <path
          d={arc} fill="none" stroke={ink} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${len} ${len}`} strokeDashoffset={len * (1 - pct / 100)}
          style={{ transition: 'stroke-dashoffset .9s cubic-bezier(.34,1.2,.64,1)' }}
        />
        {[HEALTHY_MAX, WATCH_MAX].map(v => {
          const t = tick(v);
          return <line key={v} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="#FFFFFF" strokeWidth={2} />;
        })}
        <text x={cx - r} y={cy + 18} textAnchor="middle" fontSize="11" fill={MUTED}>0</text>
        <text x={cx + r} y={cy + 18} textAnchor="middle" fontSize="11" fill={MUTED}>100</text>
      </Box>
    </Box>
  );
}

// Percentage change across the window. Falling risk is good, so it reads green; the
// word states that outright rather than leaving the colour to be decoded.
function TrendPill({ scores }) {
  if (!scores || scores.length < 2) return null;
  const first = scores[0], last = scores[scores.length - 1];
  const delta = last - first;
  const pct = first > 0 ? Math.round((delta / first) * 100) : null;
  const rising = delta > 0;
  const color = delta === 0 ? TREND.neutral : rising ? TREND.bad : TREND.good;
  const Icon = delta === 0 ? TrendingFlatRoundedIcon : rising ? ArrowUpwardRoundedIcon : ArrowDownwardRoundedIcon;
  const word = delta === 0 ? 'No change' : rising ? 'Worsening' : 'Improving';

  return (
    <Stack direction="row" spacing={0.4} sx={{ alignItems: 'center', color }}>
      <Icon sx={{ fontSize: 18 }} aria-hidden />
      <Typography sx={{ fontSize: 15, fontWeight: 800, color: 'inherit', fontVariantNumeric: 'tabular-nums' }}>
        {pct == null ? `${delta > 0 ? '+' : ''}${delta}` : `${pct > 0 ? '+' : ''}${pct}%`}
      </Typography>
      <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'inherit' }}>{word}</Typography>
      <Typography sx={{ fontSize: 12.5, color: MUTED }}>vs {scores.length}d ago</Typography>
    </Stack>
  );
}

/**
 * Prevention impact, as a secondary row INSIDE the command card. Placing it here
 * validates what the officer's past approvals achieved immediately before the card
 * asks them to approve more - it used to be a separate strip that broke the flow
 * between the hero and the KPI grid.
 */
function ImpactRow({ scorecard }) {
  const s = scorecard?.summary;
  const r = s?.repeat_risk_reduction;
  if (!scorecard) return <Skeleton variant="rounded" width="100%" height={74} />;
  if (r == null) {
    return (
      <Typography sx={{ fontSize: 12.5, color: MUTED }}>
        Prevention impact not measurable yet - close out work orders to start tracking it.
      </Typography>
    );
  }
  const improved = r > 0;
  const widgets = [
    {
      v: `${Math.round(Math.abs(r) * 100)}%`,
      l: improved ? 'fewer repeats' : 'change',
      ink: improved ? TREND.good : BRAND.heading,
      icon: improved ? TrendingDownRoundedIcon : null,
    },
    { v: s.call_outs_avoided, l: 'call-outs avoided', ink: BRAND.heading },
    { v: money(s.est_savings), l: 'est. savings', ink: BRAND.heading },
  ];

  // Secondary statistics, not a feature panel: no borders, no tinted cells, just a
  // quiet stacked list beside the gauge. Its job is to validate the system's worth
  // in passing - it must not compete with the score or the CTA.
  return (
    <Stack spacing={1} sx={{ pl: { sm: 2 }, borderLeft: { sm: `1px solid ${BRAND.border}` } }}>
      <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED }}>
        Prevention impact
      </Typography>
      {widgets.map(w => (
        <Stack key={w.l} direction="row" spacing={0.5} sx={{ alignItems: 'baseline' }}>
          {w.icon && <w.icon sx={{ color: w.ink, fontSize: 15, alignSelf: 'center' }} />}
          <Typography sx={{ fontSize: 16, fontWeight: 800, lineHeight: 1.2, color: w.ink, fontVariantNumeric: 'tabular-nums' }}>
            {w.v}
          </Typography>
          <Typography sx={{ fontSize: 11.5, color: BRAND.text }}>{w.l}</Typography>
        </Stack>
      ))}
    </Stack>
  );
}

/**
 * Zone A - the Command Card. Estate status, what it achieved, and the one action it
 * demands, in a single 12-column card. Left: score + trend + prevention impact.
 * Right: a distinct Action Area holding the primary CTA.
 */
export default function EstateHealthHero({ estateHealth, history = [], loading, pendingEscalations = 0, pendingBlocks = 0, scorecard = null }) {
  const meta = HEALTH_META[estateHealth?.status] || HEALTH_META.watch;
  const hasScore = estateHealth != null && typeof estateHealth.score === 'number';
  const score = hasScore ? estateHealth.score : null;
  const scores = history.map(h => h.riskScore).filter(v => typeof v === 'number');
  const animatedScore = useCountUp(score ?? 0, 800);
  const ink = meta.ink;
  const active = pendingEscalations > 0;
  const level = LEVEL_WORD[estateHealth?.status] || 'Elevated';

  return (
    <Card sx={{ overflow: 'hidden', opacity: loading ? 0.6 : 1, transition: 'opacity .2s' }}>
      {/* ONE continuous surface. The Action Centre used to be a separate white panel
          behind its own rule, which read as a second box competing with the index.
          The CTA now sits top-right of this single banner, so the whole card reads as
          "risk is high -> here is the one thing to do". */}
      <Box sx={{ p: { xs: 2.5, md: 3 } }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ justifyContent: 'space-between', alignItems: { sm: 'flex-start' }, mb: 2 }}
        >
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <Typography
              component="h2"
              sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.7px', textTransform: 'uppercase', color: MUTED }}
            >
              Estate Risk Index
            </Typography>
            <Tooltip
              arrow
              title="A weighted 0-100 heuristic: critical flora (x15), active hotspots (x10), open cases (x5) and at-risk flora (x3), capped at 100. Higher means more needs attention."
            >
              <HelpOutlineRoundedIcon sx={{ fontSize: 14, color: MUTED, cursor: 'help' }} />
            </Tooltip>
          </Stack>

          {/* Primary CTA, anchored top-right: the globally accessible action. */}
          <Stack spacing={0.5} sx={{ alignItems: { sm: 'flex-end' }, flexShrink: 0 }}>
            <Button
              component={RouterLink}
              to="/action-queue"
              variant="contained"
              endIcon={<ArrowForwardRoundedIcon />}
              sx={{
                minHeight: 48, px: 2.5, fontSize: 14.5, fontWeight: 700,
                width: { xs: '100%', sm: 'auto' },
                bgcolor: active ? BRAND.action : BRAND.slate,
                boxShadow: active ? '0 4px 12px rgba(29,78,216,.26)' : 'none',
                transition: 'transform .15s ease, box-shadow .15s ease, background-color .15s ease',
                '&:hover': {
                  bgcolor: active ? BRAND.actionHover : BRAND.slateHover,
                  transform: 'translateY(-1px)',
                  boxShadow: '0 6px 16px rgba(29,78,216,.32)',
                },
                '@keyframes ctaPulse': {
                  '0%': { boxShadow: '0 0 0 0 rgba(193,39,45,.6)' },
                  '70%': { boxShadow: '0 0 0 7px rgba(193,39,45,0)' },
                  '100%': { boxShadow: '0 0 0 0 rgba(193,39,45,0)' },
                },
              }}
            >
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                {active ? 'Process Escalation Queue' : 'Open Queue'}
                {active && (
                  <Box
                    component="span"
                    sx={{
                      px: 0.85, py: '1px', borderRadius: '999px', bgcolor: BRAND.primary, color: '#fff',
                      fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap',
                      animation: 'ctaPulse 2s ease-out infinite',
                    }}
                  >
                    {pendingEscalations} Pending
                  </Box>
                )}
              </Box>
            </Button>
            <Typography sx={{ fontSize: 11.5, color: MUTED, textAlign: { sm: 'right' } }}>
              {active
                ? `${pendingBlocks > 0 ? `Across ${pendingBlocks} block${pendingBlocks === 1 ? '' : 's'} · ` : ''}AI-flagged, none auto-dispatched`
                : 'Nothing awaiting approval'}
            </Typography>
          </Stack>
        </Stack>

        <Box>
          {hasScore ? (
            <>
              <Stack direction="row" spacing={3} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 2 }}>
                <Box sx={{ position: 'relative', flexShrink: 0, display: 'flex' }}>
                  <SemiDonut score={score} ink={ink} label={meta.label} />
                  {/* score seated in the well of the arc; the status badge sits INLINE
                      beside the heading rather than floating above */}
                  <Box
                    sx={{
                      position: 'absolute', left: 0, right: 0, bottom: 8,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none',
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: 54, fontWeight: 700, lineHeight: 1,
                        color: meta.display, letterSpacing: '-2px', fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {animatedScore}
                    </Typography>
                    <Typography sx={{ fontSize: 11, fontWeight: 600, color: MUTED }}>of 100</Typography>
                  </Box>
                </Box>

                <Stack spacing={1.25} sx={{ minWidth: 0, flexGrow: 1 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
                    <Typography sx={{ fontSize: 20, fontWeight: 800, color: BRAND.heading, letterSpacing: '-0.3px' }}>
                      Risk is {level}
                    </Typography>
                    <Chip
                      label={meta.label}
                      size="small"
                      sx={{ bgcolor: ink, color: '#fff', fontWeight: 700, borderRadius: '6px', fontSize: 12, height: 24, px: 0.5, letterSpacing: '0.3px' }}
                    />
                  </Stack>
                  <TrendPill scores={scores} />
                  <Typography sx={{ fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>
                    {GAUGE_ZONES.healthy.label} &lt;{HEALTHY_MAX} · {GAUGE_ZONES.watch.label} {HEALTHY_MAX}-{WATCH_MAX - 1} · {GAUGE_ZONES.critical.label} {WATCH_MAX}+
                  </Typography>
                </Stack>

                {/* impact sits in the SAME row as the gauge, as secondary stats */}
                <ImpactRow scorecard={scorecard} />
              </Stack>

            </>
          ) : (
            <Box>
              <Typography sx={{ fontSize: 44, fontWeight: 700, lineHeight: 1.1, color: MUTED }}>No data</Typography>
              <Typography sx={{ fontSize: 12.5, color: MUTED, mt: 0.5, maxWidth: 380 }}>
                No scored data yet — this is not a healthy reading, it is an absent one.
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Card>
  );
}
