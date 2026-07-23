import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, Button, Alert, Collapse, Stack, IconButton, Skeleton, Card, CardContent, Divider,
} from '@mui/material';
import AssignmentTurnedInOutlinedIcon from '@mui/icons-material/AssignmentTurnedInOutlined';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import LocalFloristOutlinedIcon from '@mui/icons-material/LocalFloristOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import ShieldMoonOutlinedIcon from '@mui/icons-material/ShieldMoonOutlined';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { useUser } from '../contexts/UserContext';
import { useDashboardMetrics } from '../hooks/useDashboardMetrics';
import { BRAND, TREND } from '../theme';
import http from '../http';
import EstateHealthHero from '../components/dashboard/EstateHealthHero';
import KpiCard from '../components/dashboard/KpiCard';
import ActivityChart from '../components/dashboard/ActivityChart';
import CategoryBar from '../components/dashboard/CategoryBar';
import BlocksRanked from '../components/dashboard/BlocksRanked';
import FeedingRodentCorrelation from '../components/dashboard/FeedingRodentCorrelation';

function buildKpis(m) {
  const t = m?.trends || {};
  return [
    {
      label: 'Open Cases', value: m?.openCases ?? 0, color: '#8A5200', tint: '#FFF4E5',
      icon: <FolderOpenOutlinedIcon />,
      trend: m ? { delta: t.open_cases?.sinceLastWeek ?? null, improve: 'down', base: m.openCases } : null,
    },
    {
      label: 'Critical Flora', value: m?.criticalFlora ?? 0, color: BRAND.primary, tint: '#FDECEA',
      icon: <LocalFloristOutlinedIcon />,
      trend: m ? { delta: t.critical_flora?.sinceLastWeek ?? null, improve: 'down', base: m.criticalFlora } : null,
    },
    {
      label: 'Active Hotspots', value: m?.activeHotspots ?? 0, color: '#1565C0', tint: '#E8F1FB',
      icon: <PlaceOutlinedIcon />,
      trend: m ? { delta: t.active_hotspots?.sinceLastWeek ?? null, improve: 'down', base: m.activeHotspots } : null,
    },
    {
      label: 'Alerts Sent (7d)', value: m?.notificationsLast7Days ?? 0, color: '#2E7D32', tint: '#E7F4E8',
      icon: <MarkEmailReadOutlinedIcon />,
      trend: m ? { delta: (m.notificationsLast7Days ?? 0) - (m.notificationsPrev7Days ?? 0), improve: null, base: m.notificationsLast7Days } : null,
      trendLabel: 'vs prev 7 days',
    },
  ];
}

function useSyncedAgo(updatedAt) {
  const [label, setLabel] = useState(null);
  useEffect(() => {
    if (!updatedAt) return undefined;
    const tick = () => {
      const secs = Math.max(0, Math.round((Date.now() - updatedAt.getTime()) / 1000));
      setLabel(secs < 60 ? `${secs}s ago` : secs < 3600 ? `${Math.floor(secs / 60)}m ago` : `${Math.floor(secs / 3600)}h ago`);
    };
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 5000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [updatedAt]);
  return label;
}

// Section spine: a numbered header that turns the dashboard into a narrative -
// Verdict -> Why -> Act -> Impact (the estate's detect -> act -> measure story).
function BandHeader({ n, title, blurb }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1.75 }}>
      <Box aria-hidden sx={{ width: 30, height: 30, borderRadius: '50%', bgcolor: BRAND.heading, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
        {n}
      </Box>
      <Box>
        <Typography sx={{ fontSize: 17, fontWeight: 800, color: BRAND.heading, lineHeight: 1.15 }}>{title}</Typography>
        <Typography sx={{ fontSize: 13, color: BRAND.textLight }}>{blurb}</Typography>
      </Box>
    </Stack>
  );
}

// Tiny inline trend line for the Impact band (weekly rodent report volume).
function Sparkline({ points, color = TREND.good }) {
  if (!points || points.length < 2) return null;
  const w = 150, h = 38;
  const max = Math.max(...points), min = Math.min(...points);
  const range = max - min || 1;
  const pts = points.map((v, i) => [(i / (points.length - 1)) * w, h - ((v - min) / range) * (h - 6) - 3]);
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return (
    <Box component="svg" viewBox={`0 0 ${w} ${h}`} sx={{ width: 150, height: 38, display: 'block' }} preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </Box>
  );
}

function Figure({ value, label }) {
  return (
    <Box>
      <Typography sx={{ fontSize: 22, fontWeight: 800, color: BRAND.heading, lineHeight: 1.1 }}>{value}</Typography>
      <Typography sx={{ fontSize: 12, color: BRAND.textLight }}>{label}</Typography>
    </Box>
  );
}

// Band 3 - the human-in-the-loop action step. Amber when escalations are pending,
// calm green when the queue is clear.
function ActBand({ count = 0, blocks = 0 }) {
  const active = count > 0;
  return (
    <Card sx={{ p: { xs: 2.5, md: 3 }, border: `1px solid ${active ? '#F0D9B5' : BRAND.border}`, bgcolor: active ? '#FFF8EC' : '#F2FAF3', display: 'flex', alignItems: 'center', gap: 2.5, flexWrap: 'wrap' }}>
      <Box aria-hidden sx={{ width: 52, height: 52, borderRadius: '14px', bgcolor: active ? '#FFF0D6' : '#E7F4E8', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        {active ? <AssignmentTurnedInOutlinedIcon sx={{ color: '#8A5200', fontSize: 26 }} /> : <CheckCircleOutlineRoundedIcon sx={{ color: '#1E6023', fontSize: 26 }} />}
      </Box>
      <Box sx={{ flexGrow: 1, minWidth: 220 }}>
        {active ? (
          <>
            <Typography sx={{ fontSize: 19, fontWeight: 800, color: '#6B4200' }}>
              {count} escalation{count === 1 ? '' : 's'} awaiting your review{blocks > 0 ? ` at ${blocks} block${blocks === 1 ? '' : 's'}` : ''}
            </Typography>
            <Typography sx={{ fontSize: 13.5, color: '#8A5200' }}>
              The AI recommends contractor call-outs. You approve before any dispatch - consolidating repeat reports at the same block so the estate never pays for separate visits.
            </Typography>
          </>
        ) : (
          <>
            <Typography sx={{ fontSize: 19, fontWeight: 800, color: '#1E6023' }}>All clear - nothing awaiting approval</Typography>
            <Typography sx={{ fontSize: 13.5, color: '#3B7A40' }}>New AI-flagged rodent risks surface here for review before any contractor is engaged.</Typography>
          </>
        )}
      </Box>
      <Button
        component={RouterLink}
        to="/action-queue"
        variant="contained"
        endIcon={<ArrowForwardRoundedIcon />}
        sx={{ bgcolor: active ? '#8A5200' : '#37474F', whiteSpace: 'nowrap', '&:hover': { bgcolor: active ? '#6B4200' : '#263238' } }}
      >
        {active ? 'Review the queue' : 'Open Action Queue'}
      </Button>
    </Card>
  );
}

// Band 4 - did the interventions work? Headline repeat-risk reduction + supporting
// figures + the weekly report trend, linking to the full Prevention Scorecard.
function ImpactBand({ scorecard }) {
  const s = scorecard?.summary;
  const r = s?.repeat_risk_reduction;
  const known = r != null;
  const improved = known && r > 0;
  const trendPts = (scorecard?.trend || []).map(w => w.reports);
  const money = n => `S$${(n || 0).toLocaleString('en-SG')}`;

  return (
    <Card sx={{ p: { xs: 2.5, md: 3 } }}>
      {!s ? (
        <Skeleton variant="rounded" height={72} />
      ) : known ? (
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} sx={{ alignItems: { md: 'center' } }}>
          <Box sx={{ minWidth: 170 }}>
            <Typography variant="overline" sx={{ color: BRAND.textLight, fontWeight: 700, letterSpacing: '0.6px' }}>Repeat-risk reduction</Typography>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'baseline', mt: 0.25 }}>
              {improved && <TrendingDownRoundedIcon sx={{ color: TREND.good, fontSize: 30, alignSelf: 'center' }} />}
              <Typography sx={{ fontSize: 46, fontWeight: 800, lineHeight: 1, color: improved ? TREND.good : BRAND.heading, letterSpacing: '-1px' }}>
                {Math.round(Math.abs(r) * 100)}%
              </Typography>
            </Stack>
            <Typography sx={{ fontSize: 12.5, color: BRAND.textLight }}>{improved ? 'fewer repeat reports' : 'change in repeat risk'}</Typography>
          </Box>
          <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', md: 'block' } }} />
          <Stack direction="row" spacing={4} sx={{ flexWrap: 'wrap', rowGap: 1.5 }}>
            <Figure value={`${s.prevented}/${s.measured}`} label="held, no repeat" />
            <Figure value={s.avg_time_to_close_days == null ? '-' : `${s.avg_time_to_close_days}d`} label="avg time to close" />
            <Figure value={money(s.est_savings)} label={`${s.call_outs_avoided} call-outs avoided`} />
          </Stack>
          <Box sx={{ ml: { md: 'auto' }, textAlign: 'center' }}>
            <Sparkline points={trendPts} />
            <Typography sx={{ fontSize: 11, color: BRAND.textLight }}>rodent reports / week</Typography>
          </Box>
          <Button component={RouterLink} to="/prevention" variant="outlined" endIcon={<ArrowForwardRoundedIcon />} sx={{ whiteSpace: 'nowrap', borderColor: BRAND.border, color: '#37474F', '&:hover': { borderColor: '#37474F' } }}>
            View scorecard
          </Button>
        </Stack>
      ) : (
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <ShieldMoonOutlinedIcon sx={{ color: BRAND.textLight }} />
          <Typography sx={{ color: BRAND.textLight, flexGrow: 1 }}>Not enough follow-up data yet - approve and close work orders to measure prevention impact.</Typography>
          <Button component={RouterLink} to="/prevention" variant="outlined" endIcon={<ArrowForwardRoundedIcon />} sx={{ borderColor: BRAND.border, color: '#37474F' }}>Open scorecard</Button>
        </Stack>
      )}
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useUser();
  const { metrics, loading, error, updatedAt, reload } = useDashboardMetrics();
  const syncedAgo = useSyncedAgo(updatedAt);

  const [summaryResult, setSummaryResult] = useState(null);
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [scorecard, setScorecard] = useState(null);

  const kpis = useMemo(() => buildKpis(metrics), [metrics]);

  // prevention headline for the bento tile - best-effort, non-blocking
  useEffect(() => {
    http.get('/api/scorecard').then(r => setScorecard(r.data)).catch(() => {});
  }, []);

  async function triggerSummary() {
    setSending(true);
    setSummaryResult(null);
    try {
      const { data } = await http.post('/api/dashboard/trigger-summary');
      setSummaryResult({ ok: true, ...data });
      reload();
    } catch (e) {
      setSummaryResult({ ok: false, error: e.response?.data?.error || e.message });
    } finally {
      setSending(false);
    }
  }

  if (error && !metrics) {
    return (
      <Box sx={{ maxWidth: 640, mx: 'auto', px: 3, py: 8, textAlign: 'center' }}>
        <Alert
          severity="error"
          action={<Button color="inherit" size="small" onClick={reload}>Retry</Button>}
          sx={{ justifyContent: 'center' }}
        >
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <Box component="main" sx={{ width: '100%', px: { xs: 0, md: 1 }, py: 4 }} aria-busy={loading}>
      {/* header */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, mb: 3 }}
      >
        <Box>
          <Typography variant="h4" component="h1" sx={{ color: BRAND.heading }}>
            Command Centre
          </Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.75 }}>
            <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#0ca30c', boxShadow: '0 0 0 3px rgba(12,163,12,.18)', flexShrink: 0 }} />
            <Typography variant="body2" sx={{ color: BRAND.textLight }} aria-live="polite">
              Live estate feed{syncedAgo && ` · synced ${syncedAgo}`}
            </Typography>
            <IconButton onClick={reload} disabled={loading} size="small" aria-label="Refresh metrics" sx={{ color: BRAND.textLight, '&:hover': { color: BRAND.primary } }}>
              <RefreshRoundedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Stack>
        </Box>
        {user?.role === 'admin' && (
          <Button
            variant="outlined"
            color="secondary"
            onClick={triggerSummary}
            disabled={sending}
            startIcon={<EmailOutlinedIcon />}
            sx={{ py: 1.25, fontSize: 15, whiteSpace: 'nowrap', flexShrink: 0, borderColor: '#37474F', color: '#37474F', '&:hover': { borderColor: '#263238', bgcolor: 'rgba(55,71,79,.04)' } }}
          >
            {sending ? 'Sending…' : 'Send Weekly Summary'}
          </Button>
        )}
      </Stack>

      {/* weekly-summary result */}
      <Box role="status" aria-live="polite">
        {summaryResult && (
          <Alert severity={summaryResult.ok ? 'success' : 'error'} sx={{ mb: 2.5, borderRadius: '10px' }}>
            {summaryResult.ok ? (
              <Box>
                <Typography variant="body2" fontWeight={600}>
                  Summary sent to {summaryResult.recipientCount} recipient(s) · generated by {summaryResult.generatedBy}
                </Typography>
                <Button size="small" onClick={() => setShowPreview(p => !p)} sx={{ mt: 0.5, p: 0, color: BRAND.primary }}>
                  {showPreview ? 'Hide preview' : 'Show preview'}
                </Button>
                <Collapse in={showPreview}>
                  <Box component="pre" sx={{ mt: 1.5, p: 2, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', bgcolor: 'rgba(255,255,255,0.6)', borderRadius: '8px', fontFamily: 'inherit', color: BRAND.text }}>
                    {summaryResult.preview}
                  </Box>
                </Collapse>
              </Box>
            ) : summaryResult.error}
          </Alert>
        )}
      </Box>

      {/* Storyline: the page reads top-to-bottom as the estate's narrative -
          Verdict (where we stand) -> Why (the drivers) -> Act (what to do now)
          -> Impact (did it work). That mirrors detect -> act -> measure. */}
      {loading && !metrics ? (
        <Stack spacing={2.5}>
          <Card sx={{ borderRadius: '16px' }}><CardContent sx={{ p: 4 }}><Skeleton variant="text" width={160} height={24} /><Skeleton variant="text" width={120} height={72} /><Skeleton variant="rounded" height={56} sx={{ mt: 1 }} /></CardContent></Card>
          <Card><CardContent sx={{ p: 3 }}><Skeleton variant="rounded" height={220} /></CardContent></Card>
          <Card><CardContent sx={{ p: 3 }}><Skeleton variant="rounded" height={72} /></CardContent></Card>
          <Card><CardContent sx={{ p: 3 }}><Skeleton variant="rounded" height={72} /></CardContent></Card>
        </Stack>
      ) : metrics && (
        <Stack spacing={4}>
          {/* Band 1 - Verdict */}
          <Box>
            <BandHeader n={1} title="The verdict" blurb="Where the estate stands right now" />
            <EstateHealthHero
              estateHealth={metrics.estateHealth}
              history={metrics.history || []}
              tiedBlocks={(metrics.sightingsByBlock || [])
                .filter(b => b.count === metrics.sightingsByBlock?.[0]?.count)
                .map(b => b.block_number)}
              loading={loading}
            />
          </Box>

          {/* Band 2 - Why (the drivers) */}
          <Box>
            <BandHeader n={2} title="Why - the drivers" blurb="What's pushing the risk index, and where" />
            <Stack spacing={2.5}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2, alignItems: 'stretch' }}>
                {kpis.map(kpi => <KpiCard key={kpi.label} {...kpi} loading={loading} />)}
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5, alignItems: 'stretch' }}>
                <Box sx={{ display: 'flex', '& > *': { width: '100%' } }}><CategoryBar casesByCategory={metrics.casesByCategory} /></Box>
                <Box sx={{ display: 'flex', '& > *': { width: '100%' } }}><BlocksRanked sightingsByBlock={metrics.sightingsByBlock || []} hotspots={metrics.hotspots || []} /></Box>
              </Box>
              <ActivityChart history={metrics.history} />
              <FeedingRodentCorrelation />
            </Stack>
          </Box>

          {/* Band 3 - Act (what to do now) */}
          <Box>
            <BandHeader n={3} title="Act - what to do now" blurb="Human-approved before any contractor cost" />
            <ActBand count={metrics.pendingEscalations || 0} blocks={metrics.pendingEscalationBlocks || 0} />
          </Box>

          {/* Band 4 - Impact (did it work) */}
          <Box>
            <BandHeader n={4} title="Impact - did it work" blurb="Repeat-risk reduction from past interventions" />
            <ImpactBand scorecard={scorecard} />
          </Box>
        </Stack>
      )}
    </Box>
  );
}