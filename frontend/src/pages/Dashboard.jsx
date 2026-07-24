import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, Button, Alert, Collapse, Stack, IconButton,
  Skeleton, Card, CardContent, LinearProgress,
  useMediaQuery, useTheme, Tabs, Tab,
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
      setLabel(
        secs < 60 ? `${secs}s ago`
        : secs < 3600 ? `${Math.floor(secs / 60)}m ago`
        : `${Math.floor(secs / 3600)}h ago`
      );
    };
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 5000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [updatedAt]);
  return label;
}

// Compact inline act banner — sits in the grid, not a full-width band
function ActBanner({ count = 0, blocks = 0 }) {
  const active = count > 0;
  return (
    <Card
      sx={{
        border: `1px solid ${active ? '#F0D9B5' : BRAND.border}`,
        bgcolor: active ? '#FFF8EC' : '#F2FAF3',
        p: 2.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
      }}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <Box
          aria-hidden
          sx={{
            width: 40, height: 40, borderRadius: '12px',
            bgcolor: active ? '#FFF0D6' : '#E7F4E8',
            display: 'grid', placeItems: 'center', flexShrink: 0,
            '@keyframes pulse': {
              '0%,100%': { boxShadow: '0 0 0 0 rgba(138,82,0,0.35)' },
              '50%': { boxShadow: '0 0 0 7px rgba(138,82,0,0)' },
            },
            animation: active ? 'pulse 2s ease-in-out infinite' : 'none',
          }}
        >
          {active
            ? <AssignmentTurnedInOutlinedIcon sx={{ color: '#8A5200', fontSize: 22 }} />
            : <CheckCircleOutlineRoundedIcon sx={{ color: '#1E6023', fontSize: 22 }} />}
        </Box>
        <Box>
          {active ? (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
              <Typography sx={{ fontSize: 32, fontWeight: 800, color: '#8A5200', lineHeight: 1, letterSpacing: '-0.5px' }}>{count}</Typography>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#6B4200' }}>escalation{count === 1 ? '' : 's'} pending</Typography>
            </Stack>
          ) : (
            <Typography sx={{ fontSize: 15, fontWeight: 700, color: '#1E6023', lineHeight: 1.2 }}>Action queue clear</Typography>
          )}
          <Typography sx={{ fontSize: 12, color: active ? '#8A5200' : '#3B7A40' }}>
            {active
              ? `${blocks > 0 ? `${blocks} block${blocks === 1 ? '' : 's'} · ` : ''}awaiting your review`
              : 'Nothing needs approval right now'}
          </Typography>
        </Box>
      </Stack>
      <Button
        component={RouterLink}
        to="/action-queue"
        variant="contained"
        size="small"
        endIcon={<ArrowForwardRoundedIcon />}
        sx={{
          mt: 'auto',
          bgcolor: active ? '#8A5200' : '#37474F',
          alignSelf: 'flex-start',
          '&:hover': { bgcolor: active ? '#6B4200' : '#263238' },
        }}
      >
        {active ? 'Review queue' : 'Open queue'}
      </Button>
    </Card>
  );
}

// Impact summary — compact card for the grid
function ImpactCard({ scorecard }) {
  const s = scorecard?.summary;
  const r = s?.repeat_risk_reduction;
  const known = r != null;
  const improved = known && r > 0;
  const money = n => `S$${(n || 0).toLocaleString('en-SG')}`;

  return (
    <Card sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        Prevention Impact
      </Typography>

      {!scorecard ? (
        <Skeleton variant="rounded" height={60} sx={{ mt: 1 }} />
      ) : known ? (
        <>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
            {improved && <TrendingDownRoundedIcon sx={{ color: TREND.good, fontSize: 22, alignSelf: 'center' }} />}
            <Typography sx={{ fontSize: 38, fontWeight: 800, lineHeight: 1, color: improved ? TREND.good : BRAND.heading, letterSpacing: '-1px' }}>
              {Math.round(Math.abs(r) * 100)}%
            </Typography>
            <Typography sx={{ fontSize: 13, color: BRAND.textLight }}>
              {improved ? 'fewer repeats' : 'change'}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={2.5} sx={{ flexWrap: 'wrap', rowGap: 1, mt: 0.5 }}>
            <Box>
              <Typography sx={{ fontSize: 15, fontWeight: 700, color: BRAND.heading }}>{s.call_outs_avoided}</Typography>
              <Typography sx={{ fontSize: 11, color: BRAND.textLight }}>call-outs avoided</Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: 15, fontWeight: 700, color: BRAND.heading }}>{money(s.est_savings)}</Typography>
              <Typography sx={{ fontSize: 11, color: BRAND.textLight }}>est. savings</Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: 15, fontWeight: 700, color: BRAND.heading }}>
                {s.avg_time_to_close_days == null ? '—' : `${s.avg_time_to_close_days}d`}
              </Typography>
              <Typography sx={{ fontSize: 11, color: BRAND.textLight }}>avg to close</Typography>
            </Box>
          </Stack>
          <Button
            component={RouterLink}
            to="/prevention"
            variant="outlined"
            size="small"
            endIcon={<ArrowForwardRoundedIcon />}
            sx={{ alignSelf: 'flex-start', mt: 'auto', borderColor: BRAND.border, color: '#37474F', '&:hover': { borderColor: '#37474F' } }}
          >
            Full scorecard
          </Button>
        </>
      ) : (
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexGrow: 1 }}>
          <ShieldMoonOutlinedIcon sx={{ color: BRAND.textLight, fontSize: 32 }} />
          <Box>
            <Typography sx={{ fontSize: 13, color: BRAND.textLight, lineHeight: 1.4 }}>
              Not enough data yet. Close out work orders to start measuring impact.
            </Typography>
            <Button
              component={RouterLink}
              to="/prevention"
              size="small"
              sx={{ mt: 1, p: 0, color: BRAND.primary, fontWeight: 600 }}
            >
              Open scorecard →
            </Button>
          </Box>
        </Stack>
      )}
    </Card>
  );
}

// Tabbed detail panel — replaces the two stacked full-width cards (CategoryBar + BlocksRanked)
// by nesting them in tabs so they occupy the same vertical space
function DetailTabs({ casesByCategory, sightingsByBlock, hotspots }) {
  const [tab, setTab] = useState(0);
  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ borderBottom: `1px solid ${BRAND.border}`, px: 1.5, pt: 1 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{
            minHeight: 40,
            '& .MuiTab-root': { minHeight: 40, fontSize: 13, fontWeight: 600, textTransform: 'none', py: 0 },
          }}
        >
          <Tab label="Cases by type" />
          <Tab label="Activity by block" />
        </Tabs>
      </Box>
      <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
        {tab === 0 && (
          <CategoryBar casesByCategory={casesByCategory} embedded />
        )}
        {tab === 1 && (
          <BlocksRanked sightingsByBlock={sightingsByBlock} hotspots={hotspots} embedded />
        )}
      </Box>
    </Card>
  );
}

// Loading skeleton mirrors the actual grid layout
function DashboardSkeleton() {
  return (
    <Stack spacing={2.5}>
      {/* Hero card */}
      <Card sx={{ borderRadius: '16px' }}>
        <CardContent sx={{ p: { xs: 3, md: 4 } }}>
          <Skeleton variant="text" width={140} height={20} />
          <Skeleton variant="text" width={100} height={68} sx={{ mt: 0.5 }} />
          <Skeleton variant="rounded" height={10} sx={{ mt: 1.5, borderRadius: '5px' }} />
        </CardContent>
      </Card>

      {/* 4 KPI tiles */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
        {[0, 1, 2, 3].map(i => (
          <Card key={i} sx={{ p: 2 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
              <Skeleton variant="rounded" width={28} height={28} sx={{ borderRadius: '8px' }} />
              <Skeleton variant="text" width={80} />
            </Stack>
            <Skeleton variant="text" width={56} height={40} />
            <Skeleton variant="text" width={72} />
          </Card>
        ))}
      </Box>

      {/* Main 2-col grid */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.3fr 1fr' }, gap: 2.5 }}>
        <Skeleton variant="rounded" height={280} sx={{ borderRadius: '12px' }} />
        <Stack spacing={2}>
          <Skeleton variant="rounded" height={130} sx={{ borderRadius: '12px' }} />
          <Skeleton variant="rounded" height={130} sx={{ borderRadius: '12px' }} />
        </Stack>
      </Box>
    </Stack>
  );
}

export default function Dashboard() {
  const { user } = useUser();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { metrics, loading, error, updatedAt, reload } = useDashboardMetrics();
  const syncedAgo = useSyncedAgo(updatedAt);

  const [summaryResult, setSummaryResult] = useState(null);
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [scorecard, setScorecard] = useState(null);

  const kpis = useMemo(() => buildKpis(metrics), [metrics]);

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
      <Box sx={{ maxWidth: 560, mx: 'auto', px: 3, py: 10, textAlign: 'center' }}>
        <Alert
          severity="error"
          action={<Button color="inherit" size="small" onClick={reload}>Retry</Button>}
        >
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <Box component="main" sx={{ width: '100%', px: { xs: 0, md: 1 }, pb: 6 }} aria-busy={loading}>

      {/* thin reload progress bar at top of page */}
      {loading && metrics && (
        <LinearProgress sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1400, height: 2 }} />
      )}

      {/* ── Page header ─────────────────────────────────── */}
      <Box
        sx={{
          position: 'sticky', top: 0, zIndex: 100,
          bgcolor: 'rgba(255,255,255,0.82)',
          backdropFilter: 'blur(10px)',
          borderBottom: `1px solid ${BRAND.border}`,
          px: { xs: 2, md: 1 }, py: 1.5, mb: 3,
          mx: { xs: -2, md: -1 },
        }}
      >
        <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h6" component="h1" sx={{ fontWeight: 800, color: BRAND.heading, lineHeight: 1.1 }}>
              Command Centre
            </Typography>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mt: 0.25 }}>
              <Box
                aria-hidden
                sx={{
                  width: 7, height: 7, borderRadius: '50%', bgcolor: '#0ca30c', flexShrink: 0,
                  '@keyframes liveDot': {
                    '0%': { boxShadow: '0 0 0 0 rgba(12,163,12,.4)' },
                    '70%': { boxShadow: '0 0 0 5px rgba(12,163,12,0)' },
                    '100%': { boxShadow: '0 0 0 0 rgba(12,163,12,0)' },
                  },
                  animation: 'liveDot 2s ease-in-out infinite',
                }}
              />
              <Typography variant="body2" sx={{ color: BRAND.textLight, fontSize: 12 }} aria-live="polite">
                Live{syncedAgo && ` · ${syncedAgo}`}
              </Typography>
              <IconButton
                onClick={reload}
                disabled={loading}
                size="small"
                aria-label="Refresh"
                sx={{ color: BRAND.textLight, p: 0.25, '&:hover': { color: BRAND.primary } }}
              >
                <RefreshRoundedIcon sx={{ fontSize: 15 }} />
              </IconButton>
            </Stack>
          </Box>

          {user?.role === 'admin' && (
            isMobile ? (
              <IconButton
                onClick={triggerSummary}
                disabled={sending}
                aria-label="Send Weekly Summary"
                sx={{ border: `1px solid #37474F`, borderRadius: '8px', color: '#37474F' }}
              >
                <EmailOutlinedIcon fontSize="small" />
              </IconButton>
            ) : (
              <Button
                variant="outlined"
                onClick={triggerSummary}
                disabled={sending}
                startIcon={<EmailOutlinedIcon />}
                size="small"
                sx={{ whiteSpace: 'nowrap', borderColor: '#37474F', color: '#37474F', '&:hover': { borderColor: '#263238', bgcolor: 'rgba(55,71,79,.04)' } }}
              >
                {sending ? 'Sending…' : 'Send Weekly Summary'}
              </Button>
            )
          )}
        </Stack>
      </Box>

      {/* weekly summary alert */}
      <Box role="status" aria-live="polite" sx={{ mb: summaryResult ? 2.5 : 0 }}>
        {summaryResult && (
          <Alert severity={summaryResult.ok ? 'success' : 'error'} sx={{ borderRadius: '10px' }}>
            {summaryResult.ok ? (
              <Box>
                <Typography variant="body2" fontWeight={600}>
                  Sent to {summaryResult.recipientCount} recipient(s) · {summaryResult.generatedBy}
                </Typography>
                <Button size="small" onClick={() => setShowPreview(p => !p)} sx={{ mt: 0.5, p: 0, color: BRAND.primary }}>
                  {showPreview ? 'Hide preview' : 'Show preview'}
                </Button>
                <Collapse in={showPreview}>
                  <Box component="pre" sx={{ mt: 1.5, p: 2, fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', bgcolor: 'rgba(255,255,255,0.6)', borderRadius: '8px', fontFamily: 'inherit', color: BRAND.text }}>
                    {summaryResult.preview}
                  </Box>
                </Collapse>
              </Box>
            ) : summaryResult.error}
          </Alert>
        )}
      </Box>

      {/* ── Content ─────────────────────────────────────── */}
      {loading && !metrics ? (
        <DashboardSkeleton />
      ) : metrics && (
        <Stack spacing={2.5}>

          {/* Row 1: Hero card — full width */}
          <EstateHealthHero
            estateHealth={metrics.estateHealth}
            history={metrics.history || []}
            tiedBlocks={(metrics.sightingsByBlock || [])
              .filter(b => b.count === metrics.sightingsByBlock?.[0]?.count)
              .map(b => b.block_number)}
            loading={loading}
          />

          {/* Row 2: 4 KPI tiles */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2 }}>
            {kpis.map(kpi => <KpiCard key={kpi.label} {...kpi} loading={loading} />)}
          </Box>

          {/* Row 3: Activity chart + tabbed detail panel (side by side) */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.4fr 1fr' }, gap: 2.5, alignItems: 'stretch' }}>
            <ActivityChart history={metrics.history} />
            <DetailTabs
              casesByCategory={metrics.casesByCategory}
              sightingsByBlock={metrics.sightingsByBlock || []}
              hotspots={metrics.hotspots || []}
            />
          </Box>

          {/* Row 4: Behavioural Diagnosis (tall, left) + stacked Act banner & Impact
              (right). Top-aligned + content-height so the two short cards don't
              stretch to the tall one and leave a void. */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.6fr 1fr' }, gap: 2.5, alignItems: 'start' }}>
            <FeedingRodentCorrelation />
            <Stack spacing={2.5}>
              <ActBanner count={metrics.pendingEscalations || 0} blocks={metrics.pendingEscalationBlocks || 0} />
              <ImpactCard scorecard={scorecard} />
            </Stack>
          </Box>

        </Stack>
      )}
    </Box>
  );
}
