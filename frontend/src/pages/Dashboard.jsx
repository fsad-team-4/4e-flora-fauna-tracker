import { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, Button, Alert, Collapse, Stack, IconButton,
  Skeleton, LinearProgress, Tooltip,
  Menu, MenuItem, GlobalStyles,
  useMediaQuery, useTheme,
} from '@mui/material';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CalendarTodayRoundedIcon from '@mui/icons-material/CalendarTodayRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { useUser } from '../contexts/UserContext';
import { useDashboardMetrics } from '../hooks/useDashboardMetrics';
import { alpha } from '@mui/material/styles';
import { BRAND, SURFACE, RADII, SVG_ACCENT } from '../theme';
import SiteFooter from '../components/SiteFooter';

import http from '../http';
import ActivityCard, { RiskIndexCard, PreventionImpactCard } from '../components/dashboard/HeroCommandCard';
import { KpiTile } from '../components/dashboard/KpiStack';
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

// NO MEASURE CAP - the content fills the page width.
//
// A 1440px centred cap was tried here and removed: it left empty gutters either side
// while the header band ran edge to edge, so the grid read as floating inside the page
// rather than filling it. The scorecard and the assessment page are un-capped for the
// same reason, and all three full-height pages now agree.
//
// The 12 columns therefore stretch on an ultra-wide monitor. That is the accepted
// trade: the cost is a KPI number sitting in a wider card, and the fix if it ever
// bites is per-card `maxWidth` on the sparse ones, not a cap on the whole grid - the
// dense sections (block performance, the diagnosis table, the activity chart) all
// genuinely use the width.
const contentWidth = { width: '100%' };

// Every content row hangs off one 12-column grid, so card edges line up down the
// whole page instead of each row picking its own fractional split.
const GRID_12 = {
  ...contentWidth,
  display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: 3, alignItems: 'start',
};
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
 * NO COLOUR, TINT OR ICON. The per-tile accent ink went with the sparkline it coloured,
 * so the tone lookup and the per-metric icon that used to ride along on each item were
 * dead weight passed into a component that ignores them. What is left is the data:
 * label, value and the week-over-week movement.
 */
function buildKpis(m) {
  const t = m?.trends || {};
  const h = m?.history || [];
  const win = m?.windowDays ?? 7;
  // OPEN CASES IS NOT A TILE. Its figure and its week-over-week delta are the headline of
  // the hero's activity panel, so a tile repeating both was the same reading twice.
  return [
    {
      key: 'criticalFlora', label: 'Critical Flora', value: m?.criticalFlora ?? 0,
      trend: m ? { delta: t.critical_flora?.sinceLastWeek ?? null, improve: 'down', base: m.criticalFlora } : null,
      series: seriesOf(h, 'criticalFlora'),
    },
    {
      key: 'hotspots', label: 'Active Hotspots', value: m?.activeHotspots ?? 0,
      trend: m ? { delta: t.active_hotspots?.sinceLastWeek ?? null, improve: 'down', base: m.activeHotspots } : null,
      series: seriesOf(h, 'hotspots'),
    },
    {
      // tracks the picker: value, delta and sparkline all cover the same window
      key: 'alerts', label: `Alerts Sent (${win}d)`, value: m?.notificationsWindow ?? m?.notificationsLast7Days ?? 0,
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
      {/* Zone A · four KPI cards, risk index first.
          Kept in step with the real grid on purpose. This block has been wrong twice:
          it drew the pre-rebuild layout (four tiles then an 8|4 split) long after that
          layout was gone, so every load promised one arrangement and delivered
          another. If the zones below change, change these spans with them. */}
      {[0, 1, 2, 3].map(i => (
        <Box key={i} sx={span(3, 12, 6)}>
          <Skeleton variant="rounded" height={i === 0 ? 300 : 132} sx={{ borderRadius: '16px' }} />
        </Box>
      ))}

      {/* Zone B · trend (8) + case mix (4) */}
      <Box sx={span(8, 12, 12)}><Skeleton variant="rounded" height={330} sx={{ borderRadius: '16px' }} /></Box>
      <Box sx={span(4, 12, 12)}><Skeleton variant="rounded" height={330} sx={{ borderRadius: '16px' }} /></Box>

      {/* Zone C · blocks (8) + recent activity (4) */}
      <Box sx={span(8, 12, 12)}><Skeleton variant="rounded" height={260} sx={{ borderRadius: '16px' }} /></Box>
      <Box sx={span(4, 12, 12)}><Skeleton variant="rounded" height={260} sx={{ borderRadius: '16px' }} /></Box>

      {/* Zone D · correlation (8) + prevention impact (4) */}
      <Box sx={span(8, 12, 12)}><Skeleton variant="rounded" height={220} sx={{ borderRadius: '16px' }} /></Box>
      <Box sx={span(4, 12, 12)}><Skeleton variant="rounded" height={220} sx={{ borderRadius: '16px' }} /></Box>
    </Box>
  );
}

export default function Dashboard() {
  const { user } = useUser();
  const theme = useTheme();
  const mode = theme.palette.mode;
  /**
   * SPARKLINE INKS, ONE PER METRIC AND SEMANTIC.
   *
   * This was `[magenta, cyan, teal]` from the NEON palette, indexed by the tile's POSITION
   * in the row - so a metric's colour depended on where it happened to sit, and magenta,
   * cyan and teal said nothing about critical flora, hotspots or alert volume. Three
   * arbitrary pastels also put three hues on the dashboard that appear nowhere else in it,
   * which is most of why the page read as having no palette.
   *
   * Keyed by metric now: danger for critical flora, warning for hotspots (a watch signal,
   * not an emergency - red for both would flatten the distinction), info blue for alert
   * volume, which is a count of activity and not a status at all.
   *
   * SVG_ACCENT, not the CSS custom properties: an SVG `stroke` and a gradient `stop-color`
   * cannot resolve var(), so chart inks have to be mode-indexed literals. Same rule the
   * rodent map's pathOptions follow.
   */
  const kpiInk = useMemo(() => {
    const a = SVG_ACCENT[mode] || SVG_ACCENT.dark;
    return { criticalFlora: a.danger, hotspots: a.warn, alerts: a.info };
  }, [mode]);
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
  // Scroll state for the header's shadow, read off THIS PAGE'S scroll container.
  //
  // This was useScrollTrigger, which listens to the window. That worked while the page
  // scrolled the document, but the page now owns the viewport and scrolls internally -
  // the window never moves, so the trigger would sit at false forever and the shadow
  // would silently never appear. Same approach Alert Rules uses: read scrollTop off the
  // container in its own onScroll.
  const [scrolled, setScrolled] = useState(false);

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
    /* FULL-HEIGHT SHELL, matching Notification Log, Alert Rules, the scorecard and the
       assessment page. The dashboard owns the viewport: a header band that does not
       scroll, then one internal scroll region carrying the zones and the footer.
       Registered in FULL_HEIGHT_PATHS in App.jsx, which supplies the 100dvh that this
       height:100% resolves against - and which also drops the app's own <Container>, so
       the page is responsible for its own measure. */
    <Box
      component="main"
      sx={{
        width: '100%', height: '100%', minHeight: 0,
        display: 'flex', flexDirection: 'column',
      }}
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
          // NOT sticky any more, and it does not need to be.
          //
          // This was `position: sticky, top: 64` - offset to clear App.jsx's 64px
          // Toolbar so the two bars did not overlap as the document scrolled. In the
          // full-height shell the band is simply the first flex child and never
          // scrolls, so stickiness has nothing to do: `flexShrink: 0` is the whole
          // mechanism. Keeping the 64px offset would now push the header 64px DOWN
          // inside its own container, leaving a gap under the app bar.
          flexShrink: 0, zIndex: 100,
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
          // The negative `mx` is gone with the Container it was cancelling: full-height
          // routes render without App.jsx's <Container>, so pulling sideways by -2/-1
          // would now drag the band past the viewport edge instead of undoing padding
          // that no longer exists. `mb` is gone too - the scroll region below owns the
          // gap, so the band sits flush against its own bottom border.
          px: { xs: 2, md: 3 }, pt: 2, pb: 1.5,
        }}
      >
        {/* Strict two-cluster flex row. `alignItems: center` on BOTH the row and the
            left cluster is what puts the live dot on the title's optical centre.
            The row spans the full width, matching the grid below it now that the grid is
            uncapped - so the title still lines up with the first card's left edge and the
            utility cluster with the last card's right edge. */}
        <Stack direction="row" spacing={2} sx={{ ...contentWidth, justifyContent: 'space-between', alignItems: 'center' }}>
          {/* LEFT GROUP: identity and navigation together.
              The nav used to be the middle child of a space-between row, which floated
              it in the centre of the header with a gap on either side - it read as a
              third, unrelated cluster. Branding and navigation belong to each other, so
              they are one group now and space-between separates them from the utility
              tools on the right, which is the only split the header needs. */}
          <Stack
            direction="row"
            spacing={{ md: 2.5, lg: 3.5 }}
            sx={{ alignItems: 'center', minWidth: 0, flexShrink: 1 }}
          >
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
                  // The halo stays so the dot still reads as lit; only the heartbeat stops.
                  '@media (prefers-reduced-motion: reduce)': {
                    animation: 'none',
                    boxShadow: `0 0 6px 1px ${alpha(live.dot, 0.7)}`,
                  },
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
                    // BRAND.textLight for inactive, not BRAND.text. Active was already
                    // 800/heading, but inactive sat at BRAND.text - a mid grey close enough
                    // to heading that the 3px rule was doing nearly all the work of saying
                    // which tab you were on. Dropping the inactive links one step widens the
                    // gap from both sides, so the selected tab reads as selected from
                    // weight and value before the underline is even noticed.
                    fontWeight: active ? 800 : 500,
                    color: active ? BRAND.heading : BRAND.textLight,
                    // the rule is always present so the row never shifts by 2px when
                    // the active tab changes; it is just transparent when inactive
                    // 3px in the action blue, not 2px: at 2 the active rule read as an
                    // underline on a link rather than a selected tab.
                    borderBottom: `3px solid ${active ? BRAND.action : 'transparent'}`,
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
          </Stack>

          {/* Right cluster: the global time window, then the primary action. */}
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexShrink: 0 }}>
            <Button
              onClick={e => setRangeAnchor(e.currentTarget)}
              startIcon={<CalendarTodayRoundedIcon sx={{ fontSize: 17 }} />}
              endIcon={<ExpandMoreRoundedIcon sx={{ fontSize: 20, transform: rangeAnchor ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />}
              aria-haspopup="listbox"
              aria-expanded={Boolean(rangeAnchor)}
              /* A FILLED select, not a bordered-but-white one.
               * It went borderless -> bordered already, which fixed "is this even
               * clickable". What was left is that a white fill on a white header bar means
               * only the 1px hairline separates the control from the bar behind it, so it
               * still read as a label with a box drawn round it. Filling it at rest gives
               * it a body; hover then goes the OTHER way, lifting to white with a darker
               * edge, so the hover state is a real change of state rather than a slightly
               * different grey. */
              sx={{
                textTransform: 'none', fontWeight: 600, fontSize: 13.5, color: BRAND.text,
                px: 1.5, py: 0.65, whiteSpace: 'nowrap', borderRadius: '8px',
                border: `1px solid ${BRAND.border}`, bgcolor: BRAND.section,
                transition: 'background-color .15s ease, border-color .15s ease, color .15s ease',
                '&:hover': { bgcolor: BRAND.surface, borderColor: BRAND.textLight, color: BRAND.heading },
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

            {/* Divider: the date picker and mail are settings, the CTA commits work.
                A rule between them says "these are not the same kind of control" more
                cheaply than extra spacing, which at this density just reads as drift. */}
            <Box
              aria-hidden
              sx={{
                width: '1px', alignSelf: 'stretch', my: 0.75, mx: 0.75,
                bgcolor: SURFACE[mode].border, flexShrink: 0,
              }}
            />

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
                // The count badge is absolutely positioned to overlap the top-right
                // corner, so the button has to BE its containing block. Without this the
                // badge anchors to whatever ancestor happens to be positioned and lands
                // somewhere unrelated - it would not error, it would just be wrong.
                position: 'relative',
                borderRadius: `${RADII.control}px`,
                background: `linear-gradient(135deg, ${BRAND.action} 0%, ${BRAND.actionHover} 100%)`,
                // A resting shadow, not none. Flat, the one committing action on the page
                // sat in the same plane as the ghost buttons beside it; a small lift reads
                // as "this one does something" before the colour is even registered.
                // Outer lift plus a 1px inset highlight along the top edge - the inner
                // shadow reads as a slightly domed surface rather than a flat fill.
                boxShadow: `0 2px 6px -1px ${alpha(BRAND.action, 0.45)}, inset 0 1px 0 rgba(255,255,255,0.18)`,
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
                    // Overlaps the button's top-right corner rather than sitting inside
                    // the label run: a count tucked in the text row reads as part of the
                    // wording, where a badge breaking the edge reads as a notification.
                    position: 'absolute', top: -7, right: -7,
                    minWidth: 20, height: 20, px: 0.5, borderRadius: `${RADII.pill}px`,
                    border: `2px solid ${SURFACE[mode].card}`,
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

      {/* ── Content ───────────────────────────────────────
          The one scroll region, and the only place the header's shadow state comes
          from. `minHeight: 0` is load-bearing: a flex child will not shrink below its
          content without it, so the shell would grow and the page would scroll the
          document again instead of this box. */}
      <Box
        onScroll={e => setScrolled(e.currentTarget.scrollTop > 8)}
        sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto', px: { xs: 2, md: 3 }, pt: 3, pb: showStickyCta ? 12 : 3 }}
      >
      {loading && !metrics ? (
        <DashboardSkeleton />
      ) : metrics && (
        <Box sx={GRID_12}>

          {/* ── ZONE A · KPI BANNER ────────────────────────────────────────────
              Four equal cards, risk index first.
              The gauge and the activity chart used to share one merged card, which
              gave a single time series half the screen before any headline number had
              been stated. The four figures a manager checks first now lead the page as
              one row, and the risk index takes the first slot because it is the one
              number that summarises the rest.
              3 of 12 each on desktop; 6 (two-up) on tablet so the numbers stay
              readable rather than shrinking to a quarter of a narrow screen. */}
          {/* `alignSelf: stretch` on THIS ROW ONLY.
              The grid is alignItems:'start', so every cell sized to its own content and
              the risk card - which carries a label, a figure and a band line - stood
              visibly taller than the three plain tiles, leaving a band of dead space
              under them. Stretching makes the four match.
              Not applied to the grid as a whole on purpose: the 8+4 rows below pair a
              dense table with a short card, and stretching those would inflate the short
              one into a mostly-empty box. */}
          <Box ref={heroRef} sx={{ ...span(3, 12, 6), alignSelf: 'stretch' }}>
            <RiskIndexCard
              estateHealth={metrics.estateHealth}
              scoreSeries={seriesOf(metrics.history || [], 'riskScore')}
              loading={loading}
            />
          </Box>
          {kpis.map(item => (
            <Box key={item.label} sx={{ ...span(3, 12, 6), alignSelf: 'stretch' }}>
              <KpiTile item={item} ink={kpiInk[item.key]} loading={loading} />
            </Box>
          ))}

          {/* ── ZONE B · TREND (8) + CASE MIX (4), one row ──────────────────────
              These were two stacked full-width rows. A 7-point time series across the
              whole measure left a wide, flat, mostly-empty plot, and a five-slice donut
              on its own row was worse - a small ring with half a screen of nothing
              beside it. Pairing them fills both: the chart gets the room a series
              actually uses, the donut gets a column that fits it. */}
          <Box sx={span(8, 12, 12)}>
            <ActivityCard
              trends={metrics.trends}
              history={metrics.history || []}
              sightingsByDay={metrics.sightingsByDay || []}
              openCases={metrics.openCases ?? 0}
              windowDays={windowDays}
              onWindowChange={setWindowDays}
            />
          </Box>
          {/* TWO SHORT CARDS STACKED, so the right column matches the chart's height.
              Cases by Category alone left a large empty area beside the lower half of
              Estate Activity, and Prevention Impact - which is one sentence until work
              orders close - orphaned a second gap next to the diagnosis table further
              down. Paired, they fill one column between them and both gaps close. */}
          <Box sx={span(4, 12, 12)}>
            <Stack spacing={3} sx={{ height: '100%' }}>
              <CategoryBar casesByCategory={metrics.casesByCategory} />
              <PreventionImpactCard scorecard={scorecard} />
            </Stack>
          </Box>

          {/* ── ZONE C · BLOCKS (8) + RECENT ACTIVITY (4) ───────────────────────
              Recent Activity moves up here and narrows to a 4-column rail. At 12
              columns its rows ran the full screen, so the eye had to cross the whole
              glass from a case title to its status - the exact distance problem a
              narrow rail removes. It sits beside the block table because both answer
              "where should I look", one aggregated and one case by case. */}
          <Box sx={span(8, 12, 12)}>
            <BlockPerformance
              sightingsByBlock={metrics.sightingsByBlock || []}
              hotspots={metrics.hotspots || []}
              topBlock={metrics.estateHealth?.highestRiskBlock}
            />
          </Box>
          <Box sx={span(4, 12, 12)}>
            <RecentActivity cases={metrics.recentCases || []} />
          </Box>

          {/* ZONE D — granular data. The diagnosis table gets all 12 columns; in the
              7-col slot its five columns terminated short of the container edge. */}
          <Box sx={span(12)}>
            <FeedingRodentCorrelation />
          </Box>

        </Box>
      )}

      {/* Inside the scroll region, like every other full-height page: the shell hides
          page-level overflow, so a footer outside this box would be unreachable. */}
      <SiteFooter />
      </Box>

      {/* Sticky mobile conversion bar - same destination and wording as the card
          CTA, so it reinforces rather than introduces a second action. It stays OUTSIDE
          the scroll region and `position: fixed`, so it pins to the viewport rather
          than scrolling away with the content. */}
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
