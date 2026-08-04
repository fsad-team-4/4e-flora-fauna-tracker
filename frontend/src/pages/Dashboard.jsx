import { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, Button, Alert, Collapse, Stack, IconButton,
  Skeleton, Card, CardContent, LinearProgress, Tooltip,
  Menu, MenuItem, GlobalStyles,
  useMediaQuery, useTheme, useScrollTrigger,
} from '@mui/material';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CalendarTodayRoundedIcon from '@mui/icons-material/CalendarTodayRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { useUser } from '../contexts/UserContext';
import { useDashboardMetrics } from '../hooks/useDashboardMetrics';
import { alpha } from '@mui/material/styles';
import { BRAND, SURFACE, RADII } from '../theme';

import http from '../http';
import HeroCommandCard from '../components/dashboard/HeroCommandCard';
import KpiStack from '../components/dashboard/KpiStack';
import CategoryBar from '../components/dashboard/CategoryBar';
import FeedingRodentCorrelation from '../components/dashboard/FeedingRodentCorrelation';
import BlockPerformance from '../components/dashboard/BlockPerformance';
import RecentActivity from '../components/dashboard/RecentActivity';

/**
 * The LIVE indicator, per scheme. Green because "the feed is live" IS a status - the one
 * thing the status hues are reserved for - and it is the only green on this page.
 *
 * PER SCHEME, and not cosmetically. The neon #34D399 that glows correctly on a charcoal
 * card measures about 1.9:1 as TEXT on white - a clear AA failure - so light drops to a
 * deep emerald for both the ink and the dot. See the note on the light values for why the
 * dot had to move too.
 *
 * Literals rather than tokens: both go through alpha() for the pulse keyframes, and
 * alpha() cannot parse a var() string.
 */
const LIVE = {
  dark: { dot: '#34D399', ink: '#34D399' },
  // The dot sits on a 14%-alpha wash of ITSELF, so on light its backdrop is a very pale
  // mint (~#E7F8F1), not white - and #10B981 measured only ~2.5:1 against that, under
  // the 3:1 floor for a graphical object. #047857 measures ~5.3:1 on the same wash.
  light: { dot: '#047857', ink: '#047857' },
};

/**
 * Centred nav tabs.
 *
 * The blueprint asked for Overview / Analytics / Map / Reports. "Analytics" HAS NO ROUTE
 * in this app, and a tab that navigates nowhere is worse than one fewer tab - so these
 * four map to destinations that exist and are all staff-reachable. Assessments takes the
 * slot Analytics would have had; it is the closest real thing.
 */
const NAV_TABS = [
  { to: '/dashboard', label: 'Overview' },
  { to: '/rodent-heatmap', label: 'Risk Map' },
  { to: '/rodent', label: 'Assessments' },
  { to: '/all-reports', label: 'Reports' },
];

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

/**
 * The three supporting metrics.
 *
 * NO COLOUR, TINT OR ICON in here any more. KpiStack assigns its own neon ink per slot
 * from NEON[mode], so the tone lookup that used to ride along on each item - and the
 * per-metric icon - were dead weight passed into a component that ignores them. What is
 * left is the data: label, value, the week-over-week movement, and the series.
 */
function buildKpis(m) {
  const t = m?.trends || {};
  const h = m?.history || [];
  const win = m?.windowDays ?? 7;
  // OPEN CASES IS NOT A TILE. Its figure and its week-over-week delta are the headline of
  // the hero's activity panel, so a tile repeating both was the same reading twice.
  return [
    {
      label: 'Critical Flora', value: m?.criticalFlora ?? 0,
      trend: m ? { delta: t.critical_flora?.sinceLastWeek ?? null, improve: 'down', base: m.criticalFlora } : null,
      series: seriesOf(h, 'criticalFlora'),
    },
    {
      label: 'Active Hotspots', value: m?.activeHotspots ?? 0,
      trend: m ? { delta: t.active_hotspots?.sinceLastWeek ?? null, improve: 'down', base: m.activeHotspots } : null,
      series: seriesOf(h, 'hotspots'),
    },
    {
      // tracks the picker: value, delta and sparkline all cover the same window
      label: `Alerts Sent (${win}d)`, value: m?.notificationsWindow ?? m?.notificationsLast7Days ?? 0,
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
  const mode = theme.palette.mode;
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
  // MUI's own passive scroll listener rather than a hand-rolled one. disableHysteresis
  // means it tracks absolute position, so the shadow stays put while scrolled down
  // instead of flickering off whenever the scroll direction reverses.
  const scrolled = useScrollTrigger({ disableHysteresis: true, threshold: 8 });

  const kpis = useMemo(() => buildKpis(metrics), [metrics]);
  // Drives the header CTA's badge. Already in the metrics payload, so no extra request.
  const pendingCount = metrics?.pendingEscalations || 0;
  const live = LIVE[mode] || LIVE.dark;

  // Mobile only: once the hero has scrolled off the top, the queue CTA re-appears
  // pinned to the bottom of the viewport, so the primary action is never more than
  // a thumb away without cluttering the initial view.
  const heroRef = useRef(null);
  const [heroPassed, setHeroPassed] = useState(false);
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
      sx={{ width: '100%', px: { xs: 0, md: 1 }, pb: showStickyCta ? 12 : 6 }}
      aria-busy={loading}
    >

      {/* The reference's near-black page field. Set on `body` so it covers the whole
          viewport including behind the footer, and scoped to this route - it unmounts
          with the page, so no other screen inherits it while the rebuild is partial. */}
      <GlobalStyles styles={{ body: { backgroundColor: SURFACE[mode].page } }} />

      {/* thin reload progress bar at top of page */}
      {loading && metrics && (
        <LinearProgress sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1400, height: 2 }} />
      )}

      {/* ── Page header ─────────────────────────────────── */}
      <Box
        sx={{
          // Sticks BELOW the app bar, not at top: 0. Both were pinned to 0, so the
          // two bars overlapped the moment the page scrolled.
          //
          // A FLAT 64, not a responsive 56/64: App.jsx pins its Toolbar to
          // `minHeight: 64, height: 64` at every breakpoint, so the old xs:56
          // offset left an 8px slot on mobile where page content scrolled through
          // the gap between the two bars.
          position: 'sticky', top: 64, zIndex: 100,
          /* GLASSMORPHIC. Translucent card colour plus a backdrop blur, so content
             scrolling underneath is sensed rather than seen. The fallback matters: with
             no `backdrop-filter` support the bar would be plain see-through and the
             title would sit on moving content, so the colour only goes translucent
             behind an `@supports` guard and stays fully opaque otherwise. */
          bgcolor: SURFACE[mode].card,
          borderBottom: `1px solid ${SURFACE[mode].border}`,
          '@supports (backdrop-filter: blur(1px))': {
            bgcolor: mode === 'dark' ? 'rgba(30,30,36,0.72)' : 'rgba(255,255,255,0.72)',
            backdropFilter: 'blur(16px) saturate(150%)',
          },
          // The shadow is the scroll cue and only appears once the page has moved.
          boxShadow: scrolled
            ? (mode === 'dark' ? '0 4px 16px rgba(0,0,0,.45)' : '0 4px 6px -1px rgba(16,24,40,.05)')
            : 'none',
          transition: 'box-shadow .2s ease',
          px: { xs: 2, md: 1 }, pt: 2, pb: 1.5, mb: 3,
          mx: { xs: -2, md: -1 },
        }}
      >
        {/* Strict two-cluster flex row. `alignItems: center` on BOTH the row and the
            left cluster is what puts the live dot on the title's optical centre. */}
        <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0 }}>
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
              sx={{
                alignItems: 'center', pl: 1, pr: 0.25, py: 0.25, borderRadius: `${RADII.pill}px`,
                bgcolor: alpha(live.dot, 0.14),
                border: `1px solid ${alpha(live.dot, 0.32)}`,
              }}
            >
              <Box
                aria-hidden
                sx={{
                  width: 9, height: 9, borderRadius: '50%', bgcolor: live.dot, flexShrink: 0,
                  // Two-part glow: a constant tight halo so the dot reads as lit even
                  // between pulses, and the expanding ring for the heartbeat. The
                  // pulse alone left the dot flat at the bottom of its cycle.
                  '@keyframes liveDot': {
                    '0%': { boxShadow: `0 0 6px 1px ${alpha(live.dot, 0.7)}, 0 0 0 0 ${alpha(live.dot, 0.5)}` },
                    '70%': { boxShadow: `0 0 6px 1px ${alpha(live.dot, 0.7)}, 0 0 0 7px ${alpha(live.dot, 0)}` },
                    '100%': { boxShadow: `0 0 6px 1px ${alpha(live.dot, 0.7)}, 0 0 0 0 ${alpha(live.dot, 0)}` },
                  },
                  animation: 'liveDot 2s ease-in-out infinite',
                }}
              />
              <Typography sx={{ color: live.ink, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.3px' }}>LIVE</Typography>
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

          {/* ── CENTRE: underline tabs ───────────────────────────────────────
              UNDERLINE, NOT PILLS. The pill group read as a row of disabled buttons:
              inactive pills sat in muted grey on a tinted track, which is the same
              treatment this app uses for a disabled control, so the tabs looked
              unavailable rather than unselected. An underline carries the active state
              with weight and a 2px rule and needs no container at all - less chrome, and
              no ambiguity about what is clickable. */}
          <Stack
            component="nav"
            aria-label="Dashboard sections"
            direction="row"
            spacing={0.5}
            sx={{ display: { xs: 'none', lg: 'flex' }, alignItems: 'stretch', flexShrink: 0, alignSelf: 'stretch' }}
          >
            {NAV_TABS.map(tab => {
              const active = tab.to === '/dashboard';
              return (
                <Box
                  key={tab.to}
                  component={RouterLink}
                  to={tab.to}
                  aria-current={active ? 'page' : undefined}
                  sx={{
                    display: 'flex', alignItems: 'center',
                    px: 1.75, pt: 0.5, pb: 0.75,
                    fontSize: 13.5, textDecoration: 'none', whiteSpace: 'nowrap',
                    fontWeight: active ? 700 : 500,
                    color: active ? BRAND.heading : BRAND.text,
                    // the rule is always present so the row never shifts by 2px when
                    // the active tab changes; it is just transparent when inactive
                    borderBottom: `2px solid ${active ? BRAND.action : 'transparent'}`,
                    transition: 'color .15s ease, border-color .15s ease',
                    '&:hover': { color: BRAND.heading, borderBottomColor: active ? BRAND.action : BRAND.border },
                    '&:focus-visible': { outline: `2px solid ${BRAND.accent}`, outlineOffset: 2 },
                  }}
                >
                  {tab.label}
                </Box>
              );
            })}
          </Stack>

          {/* Right cluster: the global time window, then the primary action. */}
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexShrink: 0 }}>
            <Button
              onClick={e => setRangeAnchor(e.currentTarget)}
              startIcon={<CalendarTodayRoundedIcon sx={{ fontSize: 17 }} />}
              endIcon={<ExpandMoreRoundedIcon sx={{ fontSize: 20, transform: rangeAnchor ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />}
              aria-haspopup="listbox"
              aria-expanded={Boolean(rangeAnchor)}
              // A bordered select, not a ghost button. Borderless read as static text
              // on a white bar - there was nothing to say it could be opened. The
              // hairline gives it a hit area, and the grey wash on hover confirms it.
              sx={{
                textTransform: 'none', fontWeight: 600, fontSize: 13.5, color: BRAND.text,
                px: 1.5, py: 0.65, whiteSpace: 'nowrap', borderRadius: '8px',
                border: `1px solid ${BRAND.border}`, bgcolor: BRAND.surface,
                '&:hover': { bgcolor: BRAND.section, borderColor: BRAND.textLight, color: BRAND.heading },
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
                  sx={{ color: BRAND.textLight, '&:hover': { color: BRAND.accent, bgcolor: 'action.hover' } }}
                >
                  <EmailOutlinedIcon sx={{ fontSize: 19 }} />
                </IconButton>
              </Tooltip>
            )}

            {/* ── PRIMARY CTA, always reachable ──────────────────────────────────
                The blueprint suggested "Dispatch Team" or "Generate Report". Neither
                exists as an action in this system, and a header button that does
                nothing is the most expensive kind of decoration - so this is the real
                primary operational action: the escalation queue, with its live count.

                Gradient in the ACTION BLUE, not purple. Chrome stays brand per the
                palette decision, and this is the one blue the app already reserves for
                "the system's biggest action" (see BRAND.action). The count badge is
                brand red because a pending call-out is a genuine status. */}
            <Button
              component={RouterLink}
              to="/action-queue"
              variant="contained"
              endIcon={<ArrowForwardRoundedIcon sx={{ fontSize: 17 }} />}
              aria-label={pendingCount > 0 ? `Process escalation queue, ${pendingCount} pending` : 'Open escalation queue'}
              sx={{
                ml: 0.5, px: 2, py: 0.85, fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap', flexShrink: 0,
                borderRadius: `${RADII.control}px`,
                background: `linear-gradient(135deg, ${BRAND.action} 0%, ${BRAND.actionHover} 100%)`,
                boxShadow: 'none',
                transition: 'transform .15s ease, box-shadow .15s ease',
                '&:hover': {
                  background: `linear-gradient(135deg, ${BRAND.actionHover} 0%, #143A9E 100%)`,
                  transform: 'translateY(-1px)',
                  boxShadow: `0 8px 18px -6px ${alpha(BRAND.action, 0.55)}`,
                },
                '&:active': { transform: 'none' },
              }}
            >
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Process Queue</Box>
              <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>Queue</Box>
              {pendingCount > 0 && (
                <Box
                  component="span"
                  aria-hidden
                  sx={{
                    ml: 1, minWidth: 20, height: 20, px: 0.5, borderRadius: `${RADII.pill}px`,
                    bgcolor: BRAND.primary, color: '#fff',
                    display: 'inline-grid', placeItems: 'center',
                    fontSize: 11.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {pendingCount}
                </Box>
              )}
            </Button>
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
                  <Box component="pre" sx={{ mt: 1.5, p: 2, fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', bgcolor: BRAND.surface, borderRadius: '8px', fontFamily: 'inherit', color: BRAND.text }}>
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
          {/* ── ZONE A · ONE hero card ─────────────────────────────────────────
              The risk index and the activity chart were two full-width cards, each
              spending a screen on a single idea. Merged: instrument left, trend right. */}
          <Box ref={heroRef} sx={span(12)}>
            <HeroCommandCard
              estateHealth={metrics.estateHealth}
              scorecard={scorecard}
              trends={metrics.trends}
              history={metrics.history || []}
              sightingsByDay={metrics.sightingsByDay || []}
              openCases={metrics.openCases ?? 0}
              windowDays={windowDays}
              onWindowChange={setWindowDays}
              loading={loading}
            />
          </Box>

          {/* ── ZONE B · BENTO ROW ─────────────────────────────────────────────
              Three panels on one row instead of a row of KPI tiles followed by a row of
              panels: the three supporting metrics are now a vertical stack occupying one
              cell, which is what frees the other two. */}
          <Box sx={span(3, 12, 6)}>
            <KpiStack items={kpis} loading={loading} />
          </Box>
          <Box sx={span(4, 12, 6)}>
            <CategoryBar casesByCategory={metrics.casesByCategory} />
          </Box>
          <Box sx={span(5)}>
            <RecentActivity cases={metrics.recentCases || []} />
          </Box>

          {/* ── ZONE C · block performance, full width ────────────────────────── */}
          <Box sx={span(12)}>
            <BlockPerformance
              sightingsByBlock={metrics.sightingsByBlock || []}
              hotspots={metrics.hotspots || []}
              topBlock={metrics.estateHealth?.highestRiskBlock}
            />
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
            bgcolor: mode === 'dark' ? 'rgba(22,28,38,0.94)' : 'rgba(255,255,255,0.94)',
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
