import { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Routes, Route, Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import { AppBar, Toolbar, Typography, Button, Container, Box, Divider, IconButton, Drawer, List, ListItemButton, ListItemText, ListSubheader, Menu, MenuItem, Card, Stack, Avatar, Tooltip, ListItemIcon, Dialog, TextField, InputAdornment } from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
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
import PetsOutlinedIcon from '@mui/icons-material/PetsOutlined'
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

/**
 * Navigation taxonomy.
 *
 * Rodents ARE fauna, so listing Flora / Fauna / Rodent as peers put a single pest
 * category at the same level as whole biological groups. They now sit inside one
 * MONITORING group, sub-grouped by domain, leaving the top level for user goals:
 * Dashboard, Monitoring, Reports.
 *
 * `roles: 'any'` shows for every logged-in user; 'staff' is staff/admin only.
 * Shared by the desktop dropdowns, the mobile drawer and the home service cards,
 * so all three stay in sync. `sections` groups items inside one dropdown.
 */
const NAV_GROUPS = [
  { header: 'Dashboard', roles: 'staff', to: '/dashboard', items: [{ to: '/dashboard', label: 'Command Centre' }] },
  {
    header: 'Monitoring',
    roles: 'staff',
    sections: [
      { label: 'Fauna & pests', items: [
        { to: '/fauna', label: 'Fauna Sightings' },
        { to: '/fauna/log', label: 'Log Sighting' },
        { to: '/fauna/hotspots', label: 'Fauna Hotspots' },
        { to: '/rodent', label: 'Rodent Assessment' },
        { to: '/rodent-heatmap', label: 'Rodent Risk Map' },
      ] },
      { label: 'Flora', items: [
        { to: '/flora', label: 'Greenery Records' },
        { to: '/handbook', label: 'Horticulture Handbook' },
      ] },
      { label: 'Response', items: [
        { to: '/action-queue', label: 'Action Queue' },
        { to: '/prevention', label: 'Prevention Scorecard' },
      ] },
    ],
  },
  {
    header: 'Reports',
    roles: 'any',
    sections: [
      { label: 'Cases', items: [
        { to: '/reports', label: 'My Reports' },
        { to: '/all-reports', label: 'All Reports', roles: 'staff' },
      ] },
      { label: 'Alerting', items: [
        { to: '/alert-rules', label: 'Alert Rules', roles: 'staff' },
        { to: '/notif-log', label: 'Notification Log', roles: 'staff' },
      ] },
    ],
  },
]

// Flatten a group to its items, honouring per-item role gates.
function groupItems(group, isStaff) {
  const fromSections = (group.sections || []).flatMap(s => s.items)
  return [...(group.items || []), ...fromSections].filter(i => i.roles !== 'staff' || isStaff)
}

// Icon + one-line blurb per group, for the home service cards.
const GROUP_META = {
  Dashboard: { icon: SpaceDashboardOutlinedIcon, blurb: 'Estate risk, KPIs and the action queue.' },
  Monitoring: { icon: PetsOutlinedIcon, blurb: 'Fauna, pests, flora and response tools.' },
  Reports: { icon: DescriptionOutlinedIcon, blurb: 'Cases, alert rules and the dispatch log.' },
}

// `label` defaults to 4E so the badge matches the product name it sits beside.
// The footer passes "EM" deliberately - there the badge sits next to "EM Services",
// the operating company, so the two are consistent in each place.
function BrandMark({ size = 30, fontSize = 14, label = '4E' }) {
  return (
    <Box sx={{ width: size, height: size, borderRadius: '8px', bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize, flexShrink: 0 }}>
      {label}
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

function ServiceCard({ group, isStaff }) {
  const key = group.header
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
        {groupItems(group, isStaff).map(item => (
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
        {groups.map((g, gi) => <ServiceCard key={gi} group={g} isStaff={isStaff} />)}
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

/**
 * Active-state treatment for a top-level item: a 2px brand accent bar underneath
 * plus a low-opacity pill and semi-bold text. Raw red *text* read as an error or a
 * broken link rather than a selected tab, so the colour now lives in the indicator,
 * not in the label.
 */
function topNavSx(active) {
  return {
    textTransform: 'none', fontSize: 14.5, px: 1.5, py: 1, borderRadius: '8px',
    position: 'relative', fontWeight: active ? 700 : 600,
    color: active ? 'text.primary' : 'text.secondary',
    bgcolor: active ? 'action.selected' : 'transparent',
    '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
    '&::after': active ? {
      content: '""', position: 'absolute', left: 10, right: 10, bottom: -1,
      height: 2, borderRadius: '2px', bgcolor: 'primary.main',
    } : undefined,
  }
}

function NavDrawer({ open, onClose, isStaff }) {
  const location = useLocation()
  const groups = NAV_GROUPS.filter(g => g.roles === 'any' || isStaff)
  return (
    <Drawer anchor="left" open={open} onClose={onClose}>
      <Box sx={{ width: 280, pb: 2 }} role="navigation" onClick={onClose}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 2 }}>
          <BrandMark />
          <Typography sx={{ fontWeight: 800, letterSpacing: '-0.3px', fontSize: 16 }}>Biodiversity Tracker</Typography>
        </Box>
        <Divider />
        {groups.map((g, gi) => {
          // one flat section per domain group, so the drawer mirrors the dropdowns
          const sections = g.sections || [{ label: null, items: g.items || [] }]
          return (
            <List
              key={gi}
              dense
              subheader={
                <ListSubheader disableSticky sx={{ fontWeight: 800, fontSize: 11, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'text.secondary', lineHeight: 2.4, bgcolor: 'transparent' }}>
                  {g.header}
                </ListSubheader>
              }
              sx={{ py: 0.5 }}
            >
              {sections.map((sec, si) => {
                const visible = sec.items.filter(i => i.roles !== 'staff' || isStaff)
                if (!visible.length) return null
                return (
                  <Box key={si}>
                    {sec.label && (
                      <Typography sx={{ px: 2, pt: si ? 1 : 0.5, pb: 0.25, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'text.secondary', opacity: 0.8 }}>
                        {sec.label}
                      </Typography>
                    )}
                    {visible.map(item => {
                      const active = location.pathname === item.to
                      return (
                        <ListItemButton
                          key={item.to}
                          component={RouterLink}
                          to={item.to}
                          selected={active}
                          sx={{ mx: 1, my: 0.25, borderRadius: 2, '&.Mui-selected': { bgcolor: 'action.selected' } }}
                        >
                          <ListItemText
                            primary={item.label}
                            slotProps={{ primary: { sx: { fontWeight: active ? 700 : 500, fontSize: 14 } } }}
                          />
                        </ListItemButton>
                      )
                    })}
                  </Box>
                )
              })}
            </List>
          )
        })}
      </Box>
    </Drawer>
  )
}

// A grouped dropdown for the desktop top nav, with sub-headed sections so one menu
// can hold a whole domain without becoming a flat wall of links.
function NavGroupMenu({ group, isStaff }) {
  const [anchor, setAnchor] = useState(null)
  const location = useLocation()
  const items = groupItems(group, isStaff)
  const activeInGroup = items.some(i => i.to === location.pathname)
  const sections = group.sections || [{ label: null, items: group.items || [] }]

  return (
    <>
      <Button
        onClick={e => setAnchor(e.currentTarget)}
        endIcon={<ExpandMoreRoundedIcon sx={{ fontSize: 18 }} />}
        disableRipple
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        sx={topNavSx(activeInGroup)}
      >
        {group.header}
      </Button>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { minWidth: 232, mt: 0.5 } } }}
      >
        {sections.map((sec, si) => {
          const visible = sec.items.filter(i => i.roles !== 'staff' || isStaff)
          if (!visible.length) return null
          return (
            <Box key={si}>
              {sec.label && (
                <Typography sx={{ px: 2, pt: si ? 1.25 : 0.75, pb: 0.5, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'text.secondary' }}>
                  {sec.label}
                </Typography>
              )}
              {visible.map(i => (
                <MenuItem key={i.to} component={RouterLink} to={i.to} selected={i.to === location.pathname} onClick={() => setAnchor(null)}
                  sx={{ fontSize: 14, fontWeight: 500, '&.Mui-selected': { fontWeight: 700, bgcolor: 'action.selected' } }}>
                  {i.label}
                </MenuItem>
              ))}
            </Box>
          )
        })}
      </Menu>
    </>
  )
}

function HorizontalNav({ isStaff }) {
  const location = useLocation()
  const groups = NAV_GROUPS.filter(g => g.roles === 'any' || isStaff)
  return (
    // collapses to the drawer below lg (1200px) - three top-level items plus the
    // utility cluster is what makes that breakpoint survivable
    <Box sx={{ display: { xs: 'none', lg: 'flex' }, alignItems: 'center', gap: 0.5, ml: 2 }}>
      {groups.map((g, gi) => (
        // a group with a single destination is a plain link, not a dropdown
        g.to
          ? (
            <Button key={gi} component={RouterLink} to={g.to} disableRipple sx={topNavSx(location.pathname === g.to)}>
              {g.header}
            </Button>
          )
          : <NavGroupMenu key={gi} group={g} isStaff={isStaff} />
      ))}
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
        {/* Display name on top, system role as a subtle pill. The seeded admin is
            literally named "Estate Admin", so plain "Admin" underneath read as the
            same word twice - a badge makes it obviously a role, not a second name. */}
        <Box sx={{ textAlign: 'left', lineHeight: 1.25, display: { xs: 'none', md: 'block' } }}>
          <Typography sx={{ fontWeight: 600, fontSize: 14, color: 'text.primary' }}>{user.name}</Typography>
          <Box
            component="span"
            sx={{
              display: 'inline-block', px: 0.7, py: '1px', borderRadius: '999px',
              bgcolor: 'action.selected', color: 'text.secondary',
              fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px',
            }}
          >
            {user.role}
          </Box>
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
          <ListItemText slotProps={{ primary: { sx: { fontSize: 14 } } }}>My profile</ListItemText>
        </MenuItem>
        {isAdmin && (
          <MenuItem component={RouterLink} to="/settings" onClick={close}>
            <ListItemIcon><SettingsOutlinedIcon fontSize="small" /></ListItemIcon>
            <ListItemText slotProps={{ primary: { sx: { fontSize: 14 } } }}>Estate settings</ListItemText>
          </MenuItem>
        )}
        <Divider />
        <MenuItem onClick={() => { close(); onLogout() }}>
          <ListItemIcon><LogoutRoundedIcon fontSize="small" /></ListItemIcon>
          <ListItemText slotProps={{ primary: { sx: { fontSize: 14 } } }}>Log out</ListItemText>
        </MenuItem>
      </Menu>
    </>
  )
}

// Standard 32x32 utility icon container, so the toggle, bell and search trigger are
// one consistent control size with a real hover state.
const UTILITY_BTN_SX = {
  width: 32, height: 32, borderRadius: '8px', color: 'text.secondary',
  '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
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
        sx={UTILITY_BTN_SX}
      >
        {dark ? <LightModeOutlinedIcon sx={{ fontSize: 19 }} /> : <DarkModeOutlinedIcon sx={{ fontSize: 19 }} />}
      </IconButton>
    </Tooltip>
  )
}

/**
 * Global ⌘/Ctrl+K palette. This navigates - it jumps to any page in the app by
 * name. It deliberately does NOT claim to search records: there is no endpoint that
 * queries across blocks or report IDs, so offering that would be a dead control.
 */
function CommandPalette({ open, onClose, isStaff }) {
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const all = useMemo(
    () => NAV_GROUPS
      .filter(g => g.roles === 'any' || isStaff)
      .flatMap(g => groupItems(g, isStaff).map(i => ({ ...i, group: g.header }))),
    [isStaff]
  )
  const results = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return all
    return all.filter(i => `${i.group} ${i.label}`.toLowerCase().includes(t))
  }, [q, all])

  const go = to => { onClose(); setQ(''); navigate(to) }

  return (
    <Dialog open={open} onClose={() => { onClose(); setQ('') }} fullWidth maxWidth="sm"
      slotProps={{ paper: { sx: { borderRadius: '12px', mt: -18 } } }}>
      <Box sx={{ p: 1.5, borderBottom: `1px solid ${BRAND.border}` }}>
        <TextField
          autoFocus fullWidth size="small" placeholder="Jump to a page…"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && results[0]) go(results[0].to) }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ fontSize: 19, color: 'text.secondary' }} /></InputAdornment> } }}
        />
      </Box>
      <Box sx={{ maxHeight: 320, overflowY: 'auto', py: 0.5 }}>
        {results.length === 0 ? (
          <Typography sx={{ px: 2, py: 2, fontSize: 13, color: 'text.secondary' }}>No pages match “{q}”.</Typography>
        ) : results.map(r => (
          <MenuItem key={r.to} onClick={() => go(r.to)} sx={{ fontSize: 14 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{r.label}</Typography>
              <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>{r.group}</Typography>
            </Box>
          </MenuItem>
        ))}
      </Box>
      <Box sx={{ px: 2, py: 1, borderTop: `1px solid ${BRAND.border}` }}>
        <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>
          Navigation only - Enter opens the first match, Esc closes.
        </Typography>
      </Box>
    </Dialog>
  )
}

function NavBar() {
  const { user, setUser } = useUser()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const logout = () => {
    localStorage.removeItem('accessToken')
    setUser(null)
  }
  const isStaff = Boolean(user && (user.role === 'staff' || user.role === 'admin'))

  useEffect(() => {
    if (!user) return undefined
    const onKey = e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [user])

  return (
    <>
      <AppBar position="sticky">
        {/* fixed 64px, centre-aligned, 24px horizontal padding */}
        <Toolbar
          disableGutters
          sx={{ minHeight: 64, height: 64, px: 3, gap: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
            {/* hamburger below lg; the horizontal nav takes over above it */}
            {user && (
              <IconButton onClick={() => setDrawerOpen(true)} aria-label="Open navigation menu" sx={{ ...UTILITY_BTN_SX, color: 'text.primary', mr: 1, display: { xs: 'inline-flex', lg: 'none' } }}>
                <MenuIcon sx={{ fontSize: 20 }} />
              </IconButton>
            )}
            <Box component={RouterLink} to="/" sx={{ display: 'flex', alignItems: 'center', gap: 1.25, textDecoration: 'none', flexShrink: 0 }}>
              <BrandMark />
              {/* the badge already says 4E, so the wordmark does not repeat it */}
              <Typography sx={{ color: 'text.primary', fontWeight: 800, letterSpacing: '-0.3px', fontSize: 16.5, whiteSpace: 'nowrap', display: { xs: 'none', sm: 'block' } }}>
                Biodiversity Tracker
              </Typography>
            </Box>

            {user && <HorizontalNav isStaff={isStaff} />}
          </Box>

          {/* Utility area: search, notifications, appearance, then the primary write
              action and identity. Global chrome lives here ONLY - page headers must
              not repeat it, or the dashboard ends up with two avatars stacked. */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
            {user && (
              <Tooltip title="Jump to a page (⌘/Ctrl + K)">
                <IconButton onClick={() => setPaletteOpen(true)} aria-label="Open command palette" sx={UTILITY_BTN_SX}>
                  <SearchRoundedIcon sx={{ fontSize: 19 }} />
                </IconButton>
              </Tooltip>
            )}
            {isStaff && (
              <Tooltip title="Notification log">
                <IconButton component={RouterLink} to="/notif-log" aria-label="Open notification log" sx={UTILITY_BTN_SX}>
                  <NotificationsNoneRoundedIcon sx={{ fontSize: 19 }} />
                </IconButton>
              </Tooltip>
            )}
            <ThemeToggleButton />

            {/* Filing a report is the system's most important write operation, so it
                is a high-contrast button in the utility area - not a text link buried
                among the navigation items. */}
            {user && (
              <Button
                component={RouterLink}
                to="/submit-report"
                variant="contained"
                startIcon={<AddRoundedIcon sx={{ fontSize: 18 }} />}
                sx={{ ml: 0.5, px: 1.75, py: 0.75, fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>New Report</Box>
                <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>New</Box>
              </Button>
            )}

            {user && <AccountMenu user={user} onLogout={logout} />}
          </Box>
        </Toolbar>
      </AppBar>
      {user && <NavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} isStaff={isStaff} />}
      {user && <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} isStaff={isStaff} />}
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
              {/* "EM" here: the badge sits beside the operating company's name */}
              <BrandMark size={28} fontSize={12} label="EM" />
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
const FULL_BLEED_PATHS = new Set(['/rodent-heatmap', '/action-queue'])
// Routes that keep the app chrome and footer but drop the centred max-width, so a
// dense grid can use the full screen instead of being boxed at 1536px.
const WIDE_PATHS = new Set(['/dashboard'])

function AppFrame() {
  const location = useLocation()
  const fullBleed = FULL_BLEED_PATHS.has(location.pathname)
  const wide = WIDE_PATHS.has(location.pathname)
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
        : <Container maxWidth={wide ? false : 'xl'} sx={{ flexGrow: 1, px: wide ? { xs: 2, md: 3 } : undefined }}>{routed}</Container>}
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
