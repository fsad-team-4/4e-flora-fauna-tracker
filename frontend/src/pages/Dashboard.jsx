import { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, Button, Alert, Collapse, Stack, IconButton,
  Skeleton, Card, CardContent, LinearProgress, Tooltip,
  Menu, MenuItem,
  useMediaQuery, useTheme,
} from '@mui/material';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import LocalFloristOutlinedIcon from '@mui/icons-material/LocalFloristOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CalendarTodayRoundedIcon from '@mui/icons-material/CalendarTodayRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { useUser } from '../contexts/UserContext';
import { useDashboardMetrics } from '../hooks/useDashboardMetrics';
import { BRAND } from '../theme';
import http from '../http';
import EstateHealthHero from '../components/dashboard/EstateHealthHero';
import KpiCard from '../components/dashboard/KpiCard';
import ActivityChart from '../components/dashboard/ActivityChart';
import CategoryBar from '../components/dashboard/CategoryBar';
import FeedingRodentCorrelation from '../components/dashboard/FeedingRodentCorrelation';
import BlockPerformance from '../components/dashboard/BlockPerformance';
import RecentActivity from '../components/dashboard/RecentActivity';

// Shared secondary/tertiary hover wash - grey-100. Quieter than a border at rest.
const SECONDARY_HOVER = '#F3F4F6';
// Every content row hangs off one 12-column grid, so card edges line up down the
// whole page instead of each row picking its own fractional split.
const GRID_12 = { display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: 3, alignItems: 'start' };
// span(md) => full width below md; pass xs/sm to keep a card multi-up on smaller
// screens (the KPI tiles stay 2-up rather than becoming a tall single file).
const span = (md, xs = 12, sm = 12) => ({ gridColumn: { xs: `span ${xs}`, sm: `span ${sm}`, md: `span ${md}` } });

// Pull one field out of the history series for a KPI sparkline. Returns null unless
// EVERY point is a real number - a snapshot row predating a column would otherwise
// draw a line through holes, inventing a trend that was never recorded.
function seriesOf(history, key) {
  if (!Array.isArray(history) || history.length < 2) return null;
  const vals = history.map(h => h?.[key]);
  return vals.every(v => typeof v === 'number' && Number.isFinite(v)) ? vals : null;
}

function buildKpis(m) {
  const t = m?.trends || {};
  const h = m?.history || [];
  const win = m?.windowDays ?? 7;
  return [
    {
      label: 'Open Cases', value: m?.openCases ?? 0, color: '#8A5200', tint: '#FFF4E5',
      icon: <FolderOpenOutlinedIcon />,
      trend: m ? { delta: t.open_cases?.sinceLastWeek ?? null, improve: 'down', base: m.openCases } : null,
      series: seriesOf(h, 'openCases'),
    },
    {
      // literal, not BRAND.accent: KpiCard compares this against BRAND.primary to
      // flag the critical state, and a var() token would never match. It also goes
      // into the sparkline's SVG stroke, where var() would not resolve.
      label: 'Critical Flora', value: m?.criticalFlora ?? 0, color: BRAND.primary, tint: '#FDECEA',
      icon: <LocalFloristOutlinedIcon />,
      trend: m ? { delta: t.critical_flora?.sinceLastWeek ?? null, improve: 'down', base: m.criticalFlora } : null,
      series: seriesOf(h, 'criticalFlora'),
    },
    {
      label: 'Active Hotspots', value: m?.activeHotspots ?? 0, color: '#1565C0', tint: '#E8F1FB',
      icon: <PlaceOutlinedIcon />,
      trend: m ? { delta: t.active_hotspots?.sinceLastWeek ?? null, improve: 'down', base: m.activeHotspots } : null,
      series: seriesOf(h, 'hotspots'),
    },
    {
      // tracks the picker: value, delta and sparkline all cover the same window
      label: `Alerts Sent (${win}d)`, value: m?.notificationsWindow ?? m?.notificationsLast7Days ?? 0, color: '#2E7D32', tint: '#E7F4E8',
      icon: <MarkEmailReadOutlinedIcon />,
      trend: m ? { delta: (m.notificationsWindow ?? 0) - (m.notificationsPrevWindow ?? 0), improve: null, base: m.notificationsWindow } : null,
      trendLabel: `vs prev ${win} days`,
      series: seriesOf(m?.notificationsByDay || [], 'count'),
    },
  ];
}

// Global time window options for the header picker.
const WINDOW_OPTIONS = [7, 14, 30];

function rangeLabel(days) {
  const end = new Date();
  const start = new Date(Date.now() - (days - 1) * 86400000);
  const f = d => d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
  return `${f(start)} - ${f(end)}`;
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

// Loading skeleton mirrors the actual grid layout
function DashboardSkeleton() {
  return (
    <Box sx={GRID_12}>
      {/* Hero card */}
      <Box sx={span(12)}>
        <Card>
          <CardContent sx={{ p: { xs: 3, md: 4 } }}>
            <Skeleton variant="text" width={140} height={20} />
            <Skeleton variant="text" width={100} height={56} sx={{ mt: 0.5 }} />
            <Skeleton variant="rounded" height={10} sx={{ mt: 1.5, borderRadius: '5px' }} />
          </CardContent>
        </Card>
      </Box>

      {/* 4 KPI tiles */}
      {[0, 1, 2, 3].map(i => (
        <Box key={i} sx={span(3, 6, 6)}>
          <Card sx={{ p: 3 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
              <Skeleton variant="rounded" width={28} height={28} sx={{ borderRadius: '8px' }} />
              <Skeleton variant="text" width={80} />
            </Stack>
            <Skeleton variant="text" width={56} height={40} />
            <Skeleton variant="text" width={72} />
          </Card>
        </Box>
      ))}

      {/* Main 8 | 4 split */}
      <Box sx={span(8)}><Skeleton variant="rounded" height={280} sx={{ borderRadius: '16px' }} /></Box>
      <Box sx={span(4)}>
        <Stack spacing={2.5}>
          <Skeleton variant="rounded" height={130} sx={{ borderRadius: '16px' }} />
          <Skeleton variant="rounded" height={130} sx={{ borderRadius: '16px' }} />
        </Stack>
      </Box>
    </Box>
  );
}

export default function Dashboard() {
  const { user } = useUser();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  // Global time window: governs the history/trend series (charts + sparklines) and
  // the alerts KPI. Point-in-time counts are always "now" regardless.
  const [windowDays, setWindowDays] = useState(7);
  const { metrics, loading, error, updatedAt, reload } = useDashboardMetrics(windowDays);
  const syncedAgo = useSyncedAgo(updatedAt);

  const [summaryResult, setSummaryResult] = useState(null);
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [scorecard, setScorecard] = useState(null);
  const [rangeAnchor, setRangeAnchor] = useState(null);

  const kpis = useMemo(() => buildKpis(metrics), [metrics]);

  // Mobile only: once the hero has scrolled off the top, the queue CTA re-appears
  // pinned to the bottom of the viewport, so the primary action is never more than
  // a thumb away without cluttering the initial view.
  const heroRef = useRef(null);
  const [heroPassed, setHeroPassed] = useState(false);
  const pendingCount = metrics?.pendingEscalations || 0;
  const showStickyCta = isMobile && heroPassed && pendingCount > 0;

  useEffect(() => {
    const el = heroRef.current;
    if (!isMobile || !el) {
      setHeroPassed(false);
      return undefined;
    }
    const io = new IntersectionObserver(
      ([entry]) => setHeroPassed(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [isMobile, metrics]);

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
    <Box
      component="main"
      sx={{ width: '100%', maxWidth: 1440, mx: 'auto', px: { xs: 0, md: 1 }, pb: showStickyCta ? 12 : 6 }}
      aria-busy={loading}
    >

      {/* thin reload progress bar at top of page */}
      {loading && metrics && (
        <LinearProgress sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1400, height: 2 }} />
      )}

      {/* ── Page header ─────────────────────────────────── */}
      <Box
        sx={{
          // Sticks BELOW the app bar, not at top: 0. Both were pinned to 0, so the
          // two bars overlapped the moment the page scrolled. MUI's Toolbar
          // minHeight is 56 on xs and 64 from sm up, which these offsets track.
          // It also takes the page-field colour instead of white, so it reads as
          // part of the page rather than as a second navigation bar.
          position: 'sticky', top: { xs: 56, sm: 64 }, zIndex: 100,
          bgcolor: BRAND.section,
          borderBottom: `1px solid ${BRAND.border}`,
          px: { xs: 2, md: 1 }, pt: 2, pb: 1.5, mb: 3,
          mx: { xs: -2, md: -1 },
        }}
      >
        <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0, flexWrap: 'wrap', rowGap: 0.5 }}>
            <Typography
              component="h1"
              sx={{ fontSize: { xs: 23, md: 28 }, fontWeight: 800, color: BRAND.heading, lineHeight: 1.1, letterSpacing: '-0.8px' }}
            >
              Command Centre
            </Typography>
            {/* Live pill: the dot carries the signal (bigger, ringed), the text is
                deliberately secondary. */}
            <Stack
              direction="row"
              spacing={0.75}
              sx={{ alignItems: 'center', pl: 1, pr: 0.25, py: 0.25, borderRadius: '999px', bgcolor: '#F1F7F2', border: '1px solid #D6E7D9' }}
            >
              <Box
                aria-hidden
                sx={{
                  width: 9, height: 9, borderRadius: '50%', bgcolor: '#0ca30c', flexShrink: 0,
                  '@keyframes liveDot': {
                    '0%': { boxShadow: '0 0 0 0 rgba(12,163,12,.5)' },
                    '70%': { boxShadow: '0 0 0 7px rgba(12,163,12,0)' },
                    '100%': { boxShadow: '0 0 0 0 rgba(12,163,12,0)' },
                  },
                  animation: 'liveDot 2s ease-in-out infinite',
                }}
              />
              <Typography sx={{ color: '#1E6023', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.3px' }}>LIVE</Typography>
              <Typography sx={{ color: BRAND.textLight, fontSize: 11 }} aria-live="polite">
                {syncedAgo || ''}
              </Typography>
              <IconButton
                onClick={reload}
                disabled={loading}
                size="small"
                aria-label="Refresh"
                sx={{ color: BRAND.textLight, p: 0.25, '&:hover': { color: BRAND.accent } }}
              >
                <RefreshRoundedIcon sx={{ fontSize: 15 }} />
              </IconButton>
            </Stack>
          </Stack>

          {/* Right cluster: the global time window is the focal control, then
              notifications, then identity (which owns the account-level action). */}
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexShrink: 0 }}>
            <Button
              onClick={e => setRangeAnchor(e.currentTarget)}
              startIcon={<CalendarTodayRoundedIcon sx={{ fontSize: 17 }} />}
              endIcon={<ExpandMoreRoundedIcon />}
              aria-haspopup="listbox"
              aria-expanded={Boolean(rangeAnchor)}
              // ghost button: borderless and low-profile at rest, grey wash on hover,
              // so the control does not add another rule to the header
              sx={{
                textTransform: 'none', fontWeight: 600, fontSize: 13.5, color: BRAND.text,
                px: 1.25, py: 0.6, whiteSpace: 'nowrap',
                '&:hover': { bgcolor: SECONDARY_HOVER, color: BRAND.heading },
              }}
            >
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                Last {windowDays} days ({rangeLabel(windowDays)})
              </Box>
              <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>{windowDays}d</Box>
            </Button>
            <Menu anchorEl={rangeAnchor} open={Boolean(rangeAnchor)} onClose={() => setRangeAnchor(null)}>
              {WINDOW_OPTIONS.map(d => (
                <MenuItem
                  key={d}
                  selected={d === windowDays}
                  onClick={() => { setWindowDays(d); setRangeAnchor(null); }}
                  sx={{ fontSize: 14 }}
                >
                  Last {d} days
                  <Typography component="span" sx={{ fontSize: 12, color: BRAND.textLight, ml: 1 }}>
                    {rangeLabel(d)}
                  </Typography>
                </MenuItem>
              ))}
            </Menu>

            {/* Identity, notifications and the weekly-summary action all live in the
                global nav bar's account menu now. Duplicating them here put two
                avatars and two bells directly above one another. This header keeps
                only what is genuinely page-scoped: the window, and refresh. */}
            {user?.role === 'admin' && (
              <Tooltip title="Send the estate summary email now">
                <IconButton
                  onClick={triggerSummary}
                  disabled={sending}
                  aria-label="Send weekly summary"
                  sx={{ color: BRAND.textLight, '&:hover': { color: BRAND.accent, bgcolor: SECONDARY_HOVER } }}
                >
                  <EmailOutlinedIcon sx={{ fontSize: 19 }} />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
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
                <Button size="small" onClick={() => setShowPreview(p => !p)} sx={{ mt: 0.5, p: 0, color: BRAND.accent }}>
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
        <Box sx={GRID_12}>

          {/* ZONE A — the hook. Status, what past action achieved, and the one
              action demanded now, in a single Command Card across all 12. */}
          <Box ref={heroRef} sx={span(12)}>
            <EstateHealthHero
              estateHealth={metrics.estateHealth}
              history={metrics.history || []}
              pendingEscalations={metrics.pendingEscalations || 0}
              pendingBlocks={metrics.pendingEscalationBlocks || 0}
              scorecard={scorecard}
              loading={loading}
            />
          </Box>

          {/* ZONE B — scannable insights. 4 KPI tiles, 3 columns each. */}
          {kpis.map(kpi => (
            <Box key={kpi.label} sx={span(3, 6, 6)}>
              <KpiCard {...kpi} loading={loading} />
            </Box>
          ))}

          {/* ZONE C — analytical deep dive on a strict 50/50 split, so both columns
              share one vertical alignment. Risk-by-block and activity-by-block are
              merged into one toggled Block Performance widget. */}
          <Box sx={span(6)}>
            <Stack spacing={3}>
              <CategoryBar casesByCategory={metrics.casesByCategory} />
              <ActivityChart history={metrics.history} />
            </Stack>
          </Box>
          <Box sx={span(6)}>
            <Stack spacing={3}>
              <RecentActivity cases={metrics.recentCases || []} />
              <BlockPerformance
                sightingsByBlock={metrics.sightingsByBlock || []}
                hotspots={metrics.hotspots || []}
                topBlock={metrics.estateHealth?.highestRiskBlock}
              />
            </Stack>
          </Box>

          {/* ZONE D — granular data. The diagnosis table gets all 12 columns; in the
              7-col slot its five columns terminated short of the container edge. */}
          <Box sx={span(12)}>
            <FeedingRodentCorrelation />
          </Box>

        </Box>
      )}

      {/* Sticky mobile conversion bar - same destination and wording as the card
          CTA, so it reinforces rather than introduces a second action. */}
      {showStickyCta && (
        <Box
          sx={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1200,
            px: 2, pt: 1.5, pb: 'calc(12px + env(safe-area-inset-bottom))',
            bgcolor: 'rgba(255,255,255,0.94)',
            backdropFilter: 'blur(8px)',
            borderTop: `1px solid ${BRAND.border}`,
          }}
        >
          <Button
            component={RouterLink}
            to="/action-queue"
            variant="contained"
            color="primary"
            fullWidth
            endIcon={<ArrowForwardRoundedIcon />}
          >
            Review queue · {pendingCount} pending
          </Button>
        </Box>
      )}
    </Box>
  );
}
