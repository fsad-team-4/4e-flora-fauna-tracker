import { useState } from 'react'
import { BrowserRouter, Routes, Route, Link as RouterLink, useLocation } from 'react-router-dom'
import { AppBar, Toolbar, Typography, Button, Container, Box, Divider, IconButton, Drawer, List, ListItemButton, ListItemText, ListSubheader, Menu, MenuItem, Card, Stack, Avatar, Tooltip, ListItemIcon } from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded'
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined'
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined'
import NotificationsNoneRoundedIcon from '@mui/icons-material/NotificationsNoneRounded'
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded'
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded'
import SpaceDashboardOutlinedIcon from '@mui/icons-material/SpaceDashboardOutlined'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import LocalFloristOutlinedIcon from '@mui/icons-material/LocalFloristOutlined'
import PetsOutlinedIcon from '@mui/icons-material/PetsOutlined'
import PestControlOutlinedIcon from '@mui/icons-material/PestControlOutlined'
import { UserProvider, useUser } from './contexts/UserContext'
import { useThemeMode } from './contexts/ThemeModeContext'
import { useDashboardMetrics } from './hooks/useDashboardMetrics'
import { BRAND } from './theme'
import ProtectedRoute from './components/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
import Login from './pages/Login'
import Register from './pages/Register'
import SubmitReport from './pages/SubmitReport'
import MyReports from './pages/MyReports'
import ReportDetail from './pages/ReportDetail'
import AllReports from './pages/AllReports'
import FloraList from './pages/FloraList'
import AddFlora from './pages/AddFlora'
import FloraDetail from './pages/FloraDetail'
import HorticultureHandbook from './pages/HorticultureHandbook'
import Dashboard from './pages/Dashboard'
import AlertRules from './pages/AlertRules'
import NotificationLog from './pages/NotificationLog'
import RodentAssessment from './pages/RodentAssessment'
import ActionQueue from './pages/ActionQueue'
import PreventionScorecard from './pages/PreventionScorecard'
import FaunaSightings from './pages/FaunaSightings'
import FaunaLogSighting from './pages/FaunaLogSighting'
import FaunaSightingDetail from './pages/FaunaSightingDetail'
import FaunaHotspots from './pages/FaunaHotspots'
import RodentRiskMap from './components/dashboard/RodentRiskMap'
import Profile from './pages/Profile'
import Settings from './pages/Settings'

// Grouped navigation. `any` shows for every logged-in user; `staff` groups only
// for staff/admin. Shared by the desktop top-nav dropdowns, the mobile drawer,
// and the home service-card grid, so all three stay in sync.
const NAV_GROUPS = [
  { header: null, roles: 'any', items: [
    { to: '/submit-report', label: 'Submit Report' },
    { to: '/reports', label: 'My Reports' },
  ] },
  { header: 'Estate', roles: 'staff', items: [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/all-reports', label: 'All Reports' },
    { to: '/alert-rules', label: 'Alerts' },
    { to: '/notif-log', label: 'Log' },
  ] },
  { header: 'Flora', roles: 'staff', items: [
    { to: '/flora', label: 'Flora' },
    { to: '/handbook', label: 'Handbook' },
  ] },
  { header: 'Fauna', roles: 'staff', items: [
    { to: '/fauna', label: 'Fauna Sightings' },
    { to: '/fauna/log', label: 'Log Sighting' },
    { to: '/fauna/hotspots', label: 'Fauna Hotspots' },
  ] },
  { header: 'Rodent', roles: 'staff', items: [
    { to: '/rodent', label: 'Rodent' },
    { to: '/rodent-heatmap', label: 'Risk Map' },
    { to: '/action-queue', label: 'Action Queue' },
    { to: '/prevention', label: 'Prevention' },
  ] },
]

// Icon + one-line blurb per group, for the home service cards. Keyed by header
// ('Reports' stands in for the header-less "any" group).
const GROUP_META = {
  Reports: { icon: DescriptionOutlinedIcon, blurb: 'Submit a case and track its status.' },
  Estate: { icon: SpaceDashboardOutlinedIcon, blurb: 'Command centre, alerts and dispatch log.' },
  Flora: { icon: LocalFloristOutlinedIcon, blurb: 'Greenery records and care guidance.' },
  Fauna: { icon: PetsOutlinedIcon, blurb: 'Sightings and hotspot tracking.' },
  Rodent: { icon: PestControlOutlinedIcon, blurb: 'Risk map, action queue and prevention.' },
}

function BrandMark({ size = 30, fontSize = 15 }) {
  return (
    <Box sx={{ width: size, height: size, borderRadius: '8px', bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize, flexShrink: 0 }}>
      EM
    </Box>
  )
}

// ---- Home: hero -> at-a-glance stats (staff) -> service cards --------------
function Hero({ user, isStaff }) {
  return (
    <Box sx={{ mt: 3, mb: 4, p: { xs: 3, md: 5 }, borderRadius: '18px', border: `1px solid ${BRAND.border}`, background: `linear-gradient(120deg, ${BRAND.surface} 0%, ${BRAND.section} 100%)` }}>
      <Typography sx={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: BRAND.accent, mb: 1 }}>
        EM Services · Township Management
      </Typography>
      <Typography component="h1" sx={{ fontSize: { xs: 28, md: 40 }, fontWeight: 800, letterSpacing: '-0.8px', color: BRAND.heading, lineHeight: 1.1, maxWidth: 720 }}>
        {user ? `Welcome back, ${user.name}` : '4E Flora, Fauna & Estate Biodiversity Tracker'}
      </Typography>
      <Typography sx={{ mt: 1.5, fontSize: { xs: 15, md: 17 }, color: BRAND.text, maxWidth: 640, lineHeight: 1.5 }}>
        {user
          ? 'Monitor greenery, fauna and rodent risk across the estate, and act on the cases that matter most.'
          : 'One place for residents and estate officers to report, monitor and act on flora, fauna and rodent activity across the township.'}
      </Typography>
      <Stack direction="row" spacing={1.5} sx={{ mt: 3, flexWrap: 'wrap', rowGap: 1.5 }}>
        {!user && (
          <>
            <Button component={RouterLink} to="/login" variant="contained" size="large" endIcon={<ArrowForwardRoundedIcon />}>Log in</Button>
            <Button component={RouterLink} to="/register" variant="outlined" size="large" color="secondary">Register</Button>
          </>
        )}
        {user && isStaff && (
          <>
            <Button component={RouterLink} to="/dashboard" variant="contained" size="large" endIcon={<ArrowForwardRoundedIcon />}>Open Command Centre</Button>
            <Button component={RouterLink} to="/submit-report" variant="outlined" size="large" color="secondary">Submit a report</Button>
          </>
        )}
        {user && !isStaff && (
          <>
            <Button component={RouterLink} to="/submit-report" variant="contained" size="large" endIcon={<ArrowForwardRoundedIcon />}>Submit a report</Button>
            <Button component={RouterLink} to="/reports" variant="outlined" size="large" color="secondary">My reports</Button>
          </>
        )}
      </Stack>
    </Box>
  )
}

// At-a-glance band. Real numbers only - reuses the dashboard metrics and renders
// nothing until they load (never fabricates a figure). Mounted for staff only, so
// residents never trigger the staff-scoped fetch.
function StatBand() {
  const { metrics } = useDashboardMetrics()
  if (!metrics) return null
  const tiles = [
    { label: 'Open cases', value: metrics.openCases ?? 0 },
    { label: 'Active hotspots', value: metrics.activeHotspots ?? 0 },
    { label: 'Critical flora', value: metrics.criticalFlora ?? 0 },
    { label: 'Alerts sent (7d)', value: metrics.notificationsLast7Days ?? 0 },
  ]
  return (
    <Box sx={{ mb: 4 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: BRAND.textLight, mb: 1 }}>
        The estate at a glance
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2 }}>
        {tiles.map(t => (
          <Card key={t.label} sx={{ p: 2.5 }}>
            <Typography sx={{ fontSize: 32, fontWeight: 800, lineHeight: 1, color: BRAND.heading, fontVariantNumeric: 'tabular-nums' }}>{t.value}</Typography>
            <Typography sx={{ fontSize: 13, color: BRAND.textLight, mt: 0.5 }}>{t.label}</Typography>
          </Card>
        ))}
      </Box>
    </Box>
  )
}

function ServiceCard({ group }) {
  const key = group.header || 'Reports'
  const meta = GROUP_META[key]
  const Icon = meta.icon
  return (
    <Card sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1.25 }}>
        <Box sx={{ width: 44, height: 44, borderRadius: '12px', bgcolor: BRAND.section, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon sx={{ color: BRAND.accent, fontSize: 24 }} />
        </Box>
        <Box>
          <Typography sx={{ fontSize: 16, fontWeight: 800, color: BRAND.heading }}>{key}</Typography>
          <Typography sx={{ fontSize: 12.5, color: BRAND.textLight }}>{meta.blurb}</Typography>
        </Box>
      </Stack>
      <Stack spacing={0.25} sx={{ mt: 'auto' }}>
        {group.items.map(item => (
          <Button key={item.to} component={RouterLink} to={item.to} endIcon={<ArrowForwardRoundedIcon sx={{ fontSize: 16 }} />}
            sx={{ justifyContent: 'space-between', textTransform: 'none', fontWeight: 600, color: BRAND.text, px: 1, '&:hover': { color: BRAND.accent, bgcolor: BRAND.section } }}>
            {item.label}
          </Button>
        ))}
      </Stack>
    </Card>
  )
}

function ServiceGrid({ isStaff }) {
  const groups = NAV_GROUPS.filter(g => g.roles === 'any' || isStaff)
  return (
    <Box sx={{ mb: 5 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: BRAND.textLight, mb: 1.5 }}>
        Explore the tracker
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 2.5 }}>
        {groups.map((g, gi) => <ServiceCard key={gi} group={g} />)}
      </Box>
    </Box>
  )
}

function Home() {
  const { user } = useUser()
  const isStaff = Boolean(user && (user.role === 'staff' || user.role === 'admin'))
  return (
    <Box component="main">
      <Hero user={user} isStaff={isStaff} />
      {isStaff && <StatBand />}
      {user && <ServiceGrid isStaff={isStaff} />}
    </Box>
  )
}

// ---- Navigation -----------------------------------------------------------
function NavDrawer({ open, onClose, isStaff }) {
  const location = useLocation()
  const groups = NAV_GROUPS.filter(g => g.roles === 'any' || isStaff)
  return (
    <Drawer anchor="left" open={open} onClose={onClose}>
      <Box sx={{ width: 264, pb: 2 }} role="navigation" onClick={onClose}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 2 }}>
          <BrandMark />
          <Typography sx={{ fontWeight: 800, letterSpacing: '-0.3px', fontSize: 17 }}>4E Biodiversity Tracker</Typography>
        </Box>
        <Divider />
        {groups.map((g, gi) => (
          <List
            key={gi}
            dense
            subheader={g.header ? (
              <ListSubheader disableSticky sx={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'text.secondary', lineHeight: 2.4, bgcolor: 'transparent' }}>
        {g.header}
              </ListSubheader>
            ) : undefined}
            sx={{ py: 0.5 }}
          >
            {g.items.map(item => {
              const active = location.pathname === item.to
              return (
        <ListItemButton
                  key={item.to}
                  component={RouterLink}
                  to={item.to}
                  selected={active}
                  sx={{
                    mx: 1, my: 0.25, borderRadius: 2,
                    '&.Mui-selected': { bgcolor: 'rgba(193,39,45,.08)', '&:hover': { bgcolor: 'rgba(193,39,45,.12)' } },
                  }}
                >
                  <ListItemText
                    primary={item.label}
                    sx={{ '& .MuiListItemText-primary': { fontWeight: active ? 700 : 500, color: active ? 'primary.main' : 'text.primary' } }}
                  />
        </ListItemButton>
              )
            })}
          </List>
        ))}
      </Box>
    </Drawer>
  )
}

// A grouped dropdown for the desktop top nav.
function NavGroupMenu({ group }) {
  const [anchor, setAnchor] = useState(null)
  const location = useLocation()
  const activeInGroup = group.items.some(i => i.to === location.pathname)
  return (
    <>
      <Button
        onClick={e => setAnchor(e.currentTarget)}
        endIcon={<ExpandMoreRoundedIcon />}
        disableRipple
        sx={{ textTransform: 'none', fontSize: 14.5, fontWeight: activeInGroup ? 700 : 600, color: activeInGroup ? 'primary.main' : 'text.primary', px: 1.25 }}
      >
        {group.header}
      </Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} transformOrigin={{ vertical: 'top', horizontal: 'left' }}>
        {group.items.map(i => (
          <MenuItem key={i.to} component={RouterLink} to={i.to} selected={i.to === location.pathname} onClick={() => setAnchor(null)}
            sx={{ fontSize: 14, fontWeight: 500, '&.Mui-selected': { color: 'primary.main', fontWeight: 700 } }}>
            {i.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}

function HorizontalNav({ isStaff }) {
  const location = useLocation()
  const groups = NAV_GROUPS.filter(g => g.roles === 'any' || isStaff)
  return (
    <Box sx={{ display: { xs: 'none', lg: 'flex' }, alignItems: 'center', gap: 0.25, ml: 2 }}>
      {groups.map((g, gi) => g.header
        ? <NavGroupMenu key={gi} group={g} />
        : g.items.map(item => {
          const active = location.pathname === item.to
          return (
            <Button key={item.to} component={RouterLink} to={item.to} disableRipple
              sx={{ textTransform: 'none', fontSize: 14.5, fontWeight: active ? 700 : 600, color: active ? 'primary.main' : 'text.primary', px: 1.25 }}>
              {item.label}
            </Button>
          )
        }))}
    </Box>
  )
}

// Initials for the account avatar, from the real display name.
function initialsOf(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

// Account menu: identity, profile, admin-only settings, then logout. Replaces the
// bare name/role/Logout trio so account actions live in one predictable place.
function AccountMenu({ user, onLogout }) {
  const [anchor, setAnchor] = useState(null)
  const close = () => setAnchor(null)
  const isAdmin = user.role === 'admin'
  return (
    <>
      <Box
        component="button"
        type="button"
        onClick={e => setAnchor(e.currentTarget)}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        aria-label={`Account menu for ${user.name}`}
        sx={{
          display: 'flex', alignItems: 'center', gap: 1, p: 0.5, pr: { xs: 0.5, sm: 1 },
          bgcolor: 'transparent', border: 'none', borderRadius: '999px', cursor: 'pointer',
          '&:hover': { bgcolor: 'rgba(120,130,145,0.12)' },
          '&:focus-visible': { outline: `2px solid ${BRAND.accent}`, outlineOffset: 2 },
        }}
      >
        <Avatar sx={{ width: 32, height: 32, bgcolor: BRAND.navy, color: '#fff', fontSize: 13, fontWeight: 800 }}>
          {initialsOf(user.name)}
        </Avatar>
        <Box sx={{ textAlign: 'left', lineHeight: 1.2, display: { xs: 'none', sm: 'block' } }}>
          <Typography sx={{ fontWeight: 600, fontSize: 14, color: 'text.primary' }}>{user.name}</Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary', textTransform: 'capitalize' }}>{user.role}</Typography>
        </Box>
      </Box>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 220 } } }}
      >
        <Box sx={{ px: 2, py: 1.25 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: 'text.primary' }}>{user.name}</Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary', textTransform: 'capitalize' }}>{user.role}</Typography>
        </Box>
        <Divider />
        <MenuItem component={RouterLink} to="/profile" onClick={close}>
          <ListItemIcon><PersonOutlineRoundedIcon fontSize="small" /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: 14 }}>My profile</ListItemText>
        </MenuItem>
        {isAdmin && (
          <MenuItem component={RouterLink} to="/settings" onClick={close}>
            <ListItemIcon><SettingsOutlinedIcon fontSize="small" /></ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: 14 }}>Estate settings</ListItemText>
          </MenuItem>
        )}
        <Divider />
        <MenuItem onClick={() => { close(); onLogout() }}>
          <ListItemIcon><LogoutRoundedIcon fontSize="small" /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: 14 }}>Log out</ListItemText>
        </MenuItem>
      </Menu>
    </>
  )
}

// One-tap light/dark switch. The full three-way choice (incl. "system") lives on
// the profile and settings pages; this is the shortcut.
function ThemeToggleButton() {
  const { resolvedMode, toggleMode } = useThemeMode()
  const dark = resolvedMode === 'dark'
  return (
    <Tooltip title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
      <IconButton
        onClick={toggleMode}
        aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        sx={{ color: 'text.secondary', '&:hover': { color: BRAND.accent } }}
      >
        {dark ? <LightModeOutlinedIcon sx={{ fontSize: 20 }} /> : <DarkModeOutlinedIcon sx={{ fontSize: 20 }} />}
      </IconButton>
    </Tooltip>
  )
}

function NavBar() {
  const { user, setUser } = useUser()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const logout = () => {
    localStorage.removeItem('accessToken')
    setUser(null)
  }
  const isStaff = Boolean(user && (user.role === 'staff' || user.role === 'admin'))
  return (
    <>
      <AppBar position="sticky">
        <Toolbar sx={{ gap: 1, py: 0.5 }}>
          {/* hamburger: mobile only. Desktop uses the horizontal nav below. */}
          {user && (
            <IconButton edge="start" onClick={() => setDrawerOpen(true)} aria-label="Open navigation menu" sx={{ color: 'text.primary', mr: 0.5, display: { xs: 'inline-flex', lg: 'none' } }}>
              <MenuIcon />
            </IconButton>
          )}
          <Box component={RouterLink} to="/" sx={{ display: 'flex', alignItems: 'center', gap: 1.25, textDecoration: 'none' }}>
            <BrandMark />
            <Typography variant="h6" sx={{ color: 'text.primary', fontWeight: 800, letterSpacing: '-0.3px', fontSize: 18, whiteSpace: 'nowrap' }}>
              4E Biodiversity Tracker
            </Typography>
          </Box>

          {user && <HorizontalNav isStaff={isStaff} />}

          <Box sx={{ flexGrow: 1 }} />

          {/* Global chrome: notifications + appearance + identity. These live here
              ONLY - page headers must not repeat them, or the dashboard ends up with
              two avatars stacked above one another. */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {isStaff && (
              <Tooltip title="Notification log">
                <IconButton
                  component={RouterLink}
                  to="/notif-log"
                  aria-label="Open notification log"
                  sx={{ color: 'text.secondary', '&:hover': { color: BRAND.accent } }}
                >
                  <NotificationsNoneRoundedIcon sx={{ fontSize: 20 }} />
                </IconButton>
              </Tooltip>
            )}
            <ThemeToggleButton />
            {user && <AccountMenu user={user} onLogout={logout} />}
          </Box>
        </Toolbar>
      </AppBar>
      {user && <NavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} isStaff={isStaff} />}
    </>
  )
}

// ---- Footer ---------------------------------------------------------------
function SiteFooter() {
  const year = new Date().getFullYear()
  return (
    <Box component="footer" sx={{ mt: 6, borderTop: `1px solid ${BRAND.border}`, bgcolor: BRAND.surface }}>
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.6fr 1fr 1fr' }, gap: 3 }}>
          <Box>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mb: 1 }}>
              <BrandMark size={28} fontSize={13} />
              <Typography sx={{ fontWeight: 800, color: BRAND.heading }}>EM Services</Typography>
            </Stack>
            <Typography sx={{ fontSize: 13.5, color: BRAND.text, maxWidth: 420, lineHeight: 1.5 }}>
              Township Management Partner for Better Communities. This 4E Flora, Fauna & Estate
              Biodiversity Tracker is an internal proof-of-concept tool.
            </Typography>
          </Box>

          <Box>
            <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: BRAND.textLight, mb: 1 }}>Quick links</Typography>
            <Stack spacing={0.5}>
              {[{ to: '/', label: 'Home' }, { to: '/submit-report', label: 'Submit a report' }, { to: '/reports', label: 'My reports' }, { to: '/dashboard', label: 'Command Centre' }].map(l => (
        <Box key={l.to} component={RouterLink} to={l.to} sx={{ fontSize: 13.5, color: BRAND.text, textDecoration: 'none', '&:hover': { color: BRAND.accent } }}>
                  {l.label}
        </Box>
              ))}
            </Stack>
          </Box>

          <Box>
            <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: BRAND.textLight, mb: 1 }}>Contact</Typography>
            <Typography sx={{ fontSize: 13.5, color: BRAND.text, lineHeight: 1.6 }}>201 Kim Tian Road, Singapore</Typography>
            <Box component="a" href="https://www.emservices.com.sg" target="_blank" rel="noopener noreferrer"
              sx={{ fontSize: 13.5, color: BRAND.accent, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
              emservices.com.sg
            </Box>
          </Box>
        </Box>

        <Divider sx={{ my: 2.5 }} />
        <Typography sx={{ fontSize: 12.5, color: BRAND.textLight }}>
          © {year} EM Services · 4E Biodiversity Tracker · proof-of-concept build
        </Typography>
      </Container>
    </Box>
  )
}

// Keys the error boundary by route, so a crash on one page clears the moment the
// user navigates elsewhere (rather than staying broken until a manual reload).
function RouteBoundary({ children }) {
  const location = useLocation()
  return <ErrorBoundary key={location.pathname}>{children}</ErrorBoundary>
}

// Routes that own the whole viewport (map dashboards): rendered edge-to-edge with
// no Container, no footer and no page scroll - the viewport is locked and any
// scrolling happens inside the page's own panels.
const FULL_BLEED_PATHS = new Set(['/rodent-heatmap'])

function AppFrame() {
  const location = useLocation()
  const fullBleed = FULL_BLEED_PATHS.has(location.pathname)
  const routed = (
    <RouteBoundary>
      <Routes>
        {/* public */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* any logged-in user (residents included) */}
        <Route path="/submit-report" element={<ProtectedRoute><SubmitReport /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute><MyReports /></ProtectedRoute>} />
        <Route path="/reports/:id" element={<ProtectedRoute><ReportDetail /></ProtectedRoute>} />

        {/* staff + admin only */}
        <Route path="/all-reports" element={<ProtectedRoute roles={['staff', 'admin']}><AllReports /></ProtectedRoute>} />
        <Route path="/flora" element={<ProtectedRoute roles={['staff', 'admin']}><FloraList /></ProtectedRoute>} />
        <Route path="/flora/add" element={<ProtectedRoute roles={['staff', 'admin']}><AddFlora /></ProtectedRoute>} />
        <Route path="/flora/:id" element={<ProtectedRoute roles={['staff', 'admin']}><FloraDetail /></ProtectedRoute>} />
        <Route path="/handbook" element={<ProtectedRoute roles={['staff', 'admin']}><HorticultureHandbook /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute roles={['staff', 'admin']}><Dashboard /></ProtectedRoute>} />
        <Route path="/alert-rules" element={<ProtectedRoute roles={['staff', 'admin']}><AlertRules /></ProtectedRoute>} />
        <Route path="/notif-log" element={<ProtectedRoute roles={['staff', 'admin']}><NotificationLog /></ProtectedRoute>} />
        <Route path="/rodent" element={<ProtectedRoute roles={['staff', 'admin']}><RodentAssessment /></ProtectedRoute>} />
        <Route path="/rodent-heatmap" element={<ProtectedRoute roles={['staff', 'admin']}><RodentRiskMap /></ProtectedRoute>} />
        <Route path="/action-queue" element={<ProtectedRoute roles={['staff', 'admin']}><ActionQueue /></ProtectedRoute>} />
        <Route path="/prevention" element={<ProtectedRoute roles={['staff', 'admin']}><PreventionScorecard /></ProtectedRoute>} />
        <Route path="/fauna" element={<ProtectedRoute roles={['staff', 'admin']}><FaunaSightings /></ProtectedRoute>} />
        <Route path="/fauna/log" element={<ProtectedRoute roles={['staff', 'admin']}><FaunaLogSighting /></ProtectedRoute>} />
        <Route path="/fauna/hotspots" element={<ProtectedRoute roles={['staff', 'admin']}><FaunaHotspots /></ProtectedRoute>} />
        <Route path="/fauna/:id" element={<ProtectedRoute roles={['staff', 'admin']}><FaunaSightingDetail /></ProtectedRoute>} />

        {/* account: profile is any logged-in user; settings is admin only */}
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute roles={['admin']}><Settings /></ProtectedRoute>} />
      </Routes>
    </RouteBoundary>
  )
  return (
    /* overflowX: clip stops any stray element from forcing a horizontal
       scrollbar; unlike 'hidden' it doesn't create a scroll container, so the
       sticky AppBar keeps working. Full-bleed routes instead lock the viewport
       outright: fixed height, overflow hidden, no footer - the map owns the rest. */
    <Box sx={{ display: 'flex', flexDirection: 'column', ...(fullBleed ? { height: '100dvh', overflow: 'hidden' } : { minHeight: '100vh', overflowX: 'clip' }) }}>
      <NavBar />
      {fullBleed
        ? <Box component="main" sx={{ flexGrow: 1, minHeight: 0 }}>{routed}</Box>
        : <Container maxWidth="xl" sx={{ flexGrow: 1 }}>{routed}</Container>}
      {!fullBleed && <SiteFooter />}
    </Box>
  )
}

function App() {
  return (
    <UserProvider>
      <BrowserRouter>
        <AppFrame />
      </BrowserRouter>
    </UserProvider>
  )
}

export default App
