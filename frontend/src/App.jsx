import { useState } from 'react'
import { BrowserRouter, Routes, Route, Link as RouterLink, useLocation } from 'react-router-dom'
import {
  AppBar, Toolbar, Typography, Button, Container, Box, Divider, IconButton, Drawer,
  List, ListItemButton, ListItemText, ListSubheader, ListItemIcon, Card, CardActionArea,
  CardContent, Skeleton, Stack,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import WavingHandOutlinedIcon from '@mui/icons-material/WavingHandOutlined'
import AddCircleOutlineOutlinedIcon from '@mui/icons-material/AddCircleOutlineOutlined'
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined'
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined'
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined'
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined'
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined'
import LocalFloristOutlinedIcon from '@mui/icons-material/LocalFloristOutlined'
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined'
import PetsOutlinedIcon from '@mui/icons-material/PetsOutlined'
import AddLocationAltOutlinedIcon from '@mui/icons-material/AddLocationAltOutlined'
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined'
import PestControlRodentOutlinedIcon from '@mui/icons-material/PestControlRodentOutlined'
import { UserProvider, useUser } from './contexts/UserContext'
import ProtectedRoute from './components/ProtectedRoute'
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
import FaunaSightings from './pages/FaunaSightings'
import FaunaLogSighting from './pages/FaunaLogSighting'
import FaunaSightingDetail from './pages/FaunaSightingDetail'
import FaunaHotspots from './pages/FaunaHotspots'
import { useDashboardMetrics } from './hooks/useDashboardMetrics'
import { alpha } from '@mui/material/styles'
import { BRAND, STATUS_META, HEALTH_META } from './theme'

// Same elevated-card shadow used across FloraDetail/HorticultureHandbook, so the
// Home summary cards share the same look.
const CARD_SHADOW = '0 4px 16px rgba(0,0,0,.05)'
const CARD_SHADOW_HOVER = '0 6px 20px rgba(0,0,0,.08)'

const SUMMARY_GRID_SX = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 2,
}

// Colored top-border, icon-badge card - shared shape for both the quick-link
// cards (resident / welfare partner) and the stat cards (field officer / manager).
function SummaryCard({ to, icon, color, bg, title, value, loading, description }) {
  return (
    <Card
      sx={{
        height: '100%',
        borderTop: 4,
        borderTopColor: color,
        boxShadow: CARD_SHADOW,
        transition: 'box-shadow 0.2s ease',
        '&:hover': { boxShadow: CARD_SHADOW_HOVER },
      }}
    >
      <CardActionArea component={RouterLink} to={to} sx={{ height: '100%' }}>
        <CardContent sx={{ p: 2.5 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              sx={{
                width: 40, height: 40, borderRadius: '10px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                bgcolor: bg, color,
              }}
            >
              {icon}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                {title}
              </Typography>
              {value !== undefined ? (
                loading
                  ? <Skeleton width={36} height={32} />
                  : <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.3 }}>{value}</Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">{description}</Typography>
              )}
            </Box>
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  )
}

// Field Officer / Manager - quick-glance counts, reusing the same
// /api/dashboard/metrics call the Command Centre already polls.
function InternalSummaryCards() {
  const { metrics, loading } = useDashboardMetrics()
  return (
    <Box sx={SUMMARY_GRID_SX}>
      <SummaryCard
        to="/all-reports"
        icon={<FolderOpenOutlinedIcon fontSize="small" />}
        color={STATUS_META.open.color}
        bg={STATUS_META.open.bg}
        title="Open Reports"
        value={metrics?.openCases ?? 0}
        loading={loading}
      />
      <SummaryCard
        to="/notif-log"
        icon={<NotificationsActiveOutlinedIcon fontSize="small" />}
        color={HEALTH_META.watch.color}
        bg={HEALTH_META.watch.bg}
        title="Alerts Sent (7d)"
        value={metrics?.notificationsLast7Days ?? 0}
        loading={loading}
      />
      <SummaryCard
        to="/flora"
        icon={<LocalFloristOutlinedIcon fontSize="small" />}
        color={HEALTH_META.critical.color}
        bg={HEALTH_META.critical.bg}
        title="Flora Needing Attention"
        value={metrics?.criticalFlora ?? 0}
        loading={loading}
      />
    </Box>
  )
}

// Resident - quick links to the two actions residents care about.
function ResidentSummaryCards() {
  return (
    <Box sx={SUMMARY_GRID_SX}>
      <SummaryCard
        to="/submit-report"
        icon={<AddCircleOutlineOutlinedIcon fontSize="small" />}
        color={STATUS_META.open.color}
        bg={STATUS_META.open.bg}
        title="Submit Report"
        description="Report an issue in the estate"
      />
      <SummaryCard
        to="/reports"
        icon={<ListAltOutlinedIcon fontSize="small" />}
        color={HEALTH_META.watch.color}
        bg={HEALTH_META.watch.bg}
        title="My Reports"
        description="Track the status of your reports"
      />
    </Box>
  )
}

// Welfare Partner - quick links to fauna sighting logging and browsing.
function WelfarePartnerSummaryCards() {
  return (
    <Box sx={SUMMARY_GRID_SX}>
      <SummaryCard
        to="/fauna/log"
        icon={<AddLocationAltOutlinedIcon fontSize="small" />}
        color={STATUS_META.open.color}
        bg={STATUS_META.open.bg}
        title="Log Sighting"
        description="Record a new fauna sighting"
      />
      <SummaryCard
        to="/fauna"
        icon={<PetsOutlinedIcon fontSize="small" />}
        color={HEALTH_META.watch.color}
        bg={HEALTH_META.watch.bg}
        title="Fauna Sightings"
        description="View sightings in your zones"
      />
    </Box>
  )
}

function Home() {
  const { user } = useUser()
  if (!user) {
    return (
      <Box sx={{ mt: 4 }}>
        <Typography>You are not logged in.</Typography>
        <Button component={RouterLink} to="/login">Login</Button>
        <Button component={RouterLink} to="/register">Register</Button>
      </Box>
    )
  }
  return (
    <Box sx={{ mt: 4, mb: 6 }}>
      <Box sx={{ mb: 3 }}>
        <Stack direction="row" spacing={1.25} alignItems="center">
          <WavingHandOutlinedIcon sx={{ color: 'primary.main', fontSize: 28 }} />
          <Typography variant="h4">Welcome back, {user.name}</Typography>
        </Stack>
        <Typography color="text.secondary" sx={{ mt: 0.5 }}>
          {user.role === 'welfare_partner'
            ? 'Use the navigation above to log and view fauna sightings in your assigned zones.'
            : 'Open the menu (top-left) to submit or manage reports.'}
        </Typography>
      </Box>

      {user.role === 'welfare_partner' ? (
        <WelfarePartnerSummaryCards />
      ) : user.role === 'field_officer' || user.role === 'manager' ? (
        <InternalSummaryCards />
      ) : (
        <ResidentSummaryCards />
      )}
    </Box>
  )
}

// EM staff roles - the two that see the full estate nav.
const INTERNAL_ROLES = ['field_officer', 'manager']

// Grouped so the drawer stays scannable. `roles` on a group lists who sees it;
// an item can narrow that further (welfare partners get fauna, but not hotspots).
const NAV_GROUPS = [
  { header: null, roles: ['resident', ...INTERNAL_ROLES], items: [
    { to: '/submit-report', label: 'Submit Report', icon: AddCircleOutlineOutlinedIcon },
    { to: '/reports', label: 'My Reports', icon: ListAltOutlinedIcon },
  ] },
  { header: 'Estate', roles: INTERNAL_ROLES, items: [
    { to: '/dashboard', label: 'Dashboard', icon: DashboardOutlinedIcon },
    { to: '/all-reports', label: 'All Reports', icon: FolderOpenOutlinedIcon },
    { to: '/alert-rules', label: 'Alerts', icon: NotificationsActiveOutlinedIcon },
    { to: '/notif-log', label: 'Log', icon: HistoryOutlinedIcon },
  ] },
  { header: 'Flora', roles: INTERNAL_ROLES, items: [
    { to: '/flora', label: 'Flora', icon: LocalFloristOutlinedIcon },
    { to: '/handbook', label: 'Handbook', icon: MenuBookOutlinedIcon },
  ] },
  { header: 'Fauna', roles: [...INTERNAL_ROLES, 'welfare_partner'], items: [
    { to: '/fauna', label: 'Fauna Sightings', icon: PetsOutlinedIcon },
    { to: '/fauna/log', label: 'Log Sighting', icon: AddLocationAltOutlinedIcon },
    { to: '/fauna/hotspots', label: 'Fauna Hotspots', icon: PlaceOutlinedIcon, roles: INTERNAL_ROLES },
  ] },
  { header: 'Rodent', roles: INTERNAL_ROLES, items: [
    { to: '/rodent', label: 'Rodent', icon: PestControlRodentOutlinedIcon },
  ] },
]

function NavDrawer({ open, onClose, role }) {
  const location = useLocation()
  const groups = NAV_GROUPS
    .filter(g => g.roles.includes(role))
    .map(g => ({ ...g, items: g.items.filter(i => !i.roles || i.roles.includes(role)) }))
  return (
    <Drawer anchor="left" open={open} onClose={onClose}>
      {/* click anywhere in the panel closes it - link navigation still fires first */}
      <Box sx={{ width: 264, pb: 2 }} role="navigation" onClick={onClose}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 2 }}>
          <Box sx={{ width: 30, height: 30, borderRadius: '8px', bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15 }}>
            EM
          </Box>
          <Typography sx={{ fontWeight: 800, letterSpacing: '-0.3px', fontSize: 17 }}>4E Biodiversity Tracker</Typography>
        </Box>
        <Divider />
        {groups.map((g, gi) => (
          <List
            key={gi}
            dense
            subheader={g.header ? (
              <ListSubheader
                disableSticky
                sx={{
                  fontWeight: 700, fontSize: 11, letterSpacing: '1px', textTransform: 'uppercase',
                  color: BRAND.textLight, lineHeight: 2.4, bgcolor: 'transparent', px: 2.5, mt: 0.5,
                }}
              >
                {g.header}
              </ListSubheader>
            ) : undefined}
            sx={{ py: 0.5 }}
          >
            {g.items.map(item => {
              const active = location.pathname === item.to
              const Icon = item.icon
              return (
                <ListItemButton
                  key={item.to}
                  component={RouterLink}
                  to={item.to}
                  selected={active}
                  sx={{
                    mx: 1, my: 0.25, pl: 1.5, borderRadius: 2,
                    borderLeft: '3px solid',
                    borderLeftColor: active ? BRAND.primary : 'transparent',
                    '&.Mui-selected': {
                      bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
                      '&:hover': { bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12) },
                    },
                  }}
                >
                  {Icon && (
                    <ListItemIcon sx={{ minWidth: 36, color: active ? 'primary.main' : 'text.secondary' }}>
                      <Icon fontSize="small" />
                    </ListItemIcon>
                  )}
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

function NavBar() {
  const { user, setUser } = useUser()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const logout = () => {
    localStorage.removeItem('accessToken')
    setUser(null)
  }
  return (
    <>
      <AppBar position="sticky">
        <Toolbar sx={{ gap: 1, py: 0.5 }}>
          {user && (
            <IconButton edge="start" onClick={() => setDrawerOpen(true)} aria-label="Open navigation menu" sx={{ color: 'text.primary', mr: 0.5 }}>
              <MenuIcon />
            </IconButton>
          )}
          <Box
            component={RouterLink}
            to="/"
            sx={{ display: 'flex', alignItems: 'center', gap: 1.25, textDecoration: 'none' }}
          >
            <Box sx={{ width: 30, height: 30, borderRadius: '8px', bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15 }}>
              EM
            </Box>
            <Typography variant="h6" sx={{ color: 'text.primary', fontWeight: 800, letterSpacing: '-0.3px', fontSize: 18 }}>
              4E Biodiversity Tracker
            </Typography>
          </Box>

        {/* spacer pushes the user block to the far right */}
        <Box sx={{ flexGrow: 1 }} />

          {user && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ textAlign: 'right', lineHeight: 1.2, display: { xs: 'none', sm: 'block' } }}>
                <Typography sx={{ fontWeight: 600, fontSize: 14, color: 'text.primary' }}>
                  {user.name}
                </Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary', textTransform: 'capitalize' }}>
                  {user.role}
                </Typography>
              </Box>
              <Button
                onClick={logout}
                variant="outlined"
                size="small"
                color="primary"
                disableRipple
                sx={{ borderRadius: 2 }}
              >
                Logout
              </Button>
            </Box>
          )}
        </Toolbar>
      </AppBar>
      {user && <NavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} role={user.role} />}
    </>
  )
}

function App() {
  return (
    <UserProvider>
      <BrowserRouter>
        <NavBar />
        <Container maxWidth="xl">
          <Routes>
            {/* public */}
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* any logged-in user (residents included) */}
            <Route path="/submit-report" element={<ProtectedRoute><SubmitReport /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute><MyReports /></ProtectedRoute>} />
            <Route path="/reports/:id" element={<ProtectedRoute><ReportDetail /></ProtectedRoute>} />

            {/* field_officer + manager only */}
            <Route path="/all-reports" element={<ProtectedRoute roles={['field_officer', 'manager']}><AllReports /></ProtectedRoute>} />
            <Route path="/flora" element={<ProtectedRoute roles={['field_officer', 'manager']}><FloraList /></ProtectedRoute>} />
            <Route path="/flora/add" element={<ProtectedRoute roles={['field_officer', 'manager']}><AddFlora /></ProtectedRoute>} />
            <Route path="/flora/:id" element={<ProtectedRoute roles={['field_officer', 'manager']}><FloraDetail /></ProtectedRoute>} />
            <Route path="/handbook" element={<ProtectedRoute roles={['field_officer', 'manager']}><HorticultureHandbook /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute roles={['field_officer', 'manager']}><Dashboard /></ProtectedRoute>} />
            <Route path="/alert-rules" element={<ProtectedRoute roles={['field_officer', 'manager']}><AlertRules /></ProtectedRoute>} />
            <Route path="/notif-log" element={<ProtectedRoute roles={['field_officer', 'manager']}><NotificationLog /></ProtectedRoute>} />
            <Route path="/rodent" element={<ProtectedRoute roles={['field_officer', 'manager']}><RodentAssessment /></ProtectedRoute>} />
            {/* fauna sightings are also open to welfare_partner, zone-filtered server-side */}
            <Route path="/fauna" element={<ProtectedRoute roles={['field_officer', 'manager', 'welfare_partner']}><FaunaSightings /></ProtectedRoute>} />
            <Route path="/fauna/log" element={<ProtectedRoute roles={['field_officer', 'manager', 'welfare_partner']}><FaunaLogSighting /></ProtectedRoute>} />
            <Route path="/fauna/hotspots" element={<ProtectedRoute roles={['field_officer', 'manager']}><FaunaHotspots /></ProtectedRoute>} />
            <Route path="/fauna/:id" element={<ProtectedRoute roles={['field_officer', 'manager', 'welfare_partner']}><FaunaSightingDetail /></ProtectedRoute>} />
          </Routes>
        </Container>
      </BrowserRouter>
    </UserProvider>
  )
}

export default App
