import { useState } from 'react'
import { BrowserRouter, Routes, Route, Link as RouterLink, useLocation } from 'react-router-dom'
import { AppBar, Toolbar, Typography, Button, Container, Box, Divider, IconButton, Drawer, List, ListItemButton, ListItemText, ListSubheader } from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
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
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        Welcome back, {user.name}
      </Typography>
      <Typography color="text.secondary">
        {user.role === 'welfare_partner'
          ? 'Use the navigation above to log and view fauna sightings in your assigned zones.'
          : 'Open the menu (top-left) to submit or manage reports.'}
      </Typography>
    </Box>
  )
}

// EM staff roles - the two that see the full estate nav.
const INTERNAL_ROLES = ['field_officer', 'manager']

// Grouped so the drawer stays scannable. `roles` on a group lists who sees it;
// an item can narrow that further (welfare partners get fauna, but not hotspots).
const NAV_GROUPS = [
  { header: null, roles: ['resident', ...INTERNAL_ROLES], items: [
    { to: '/submit-report', label: 'Submit Report' },
    { to: '/reports', label: 'My Reports' },
  ] },
  { header: 'Estate', roles: INTERNAL_ROLES, items: [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/all-reports', label: 'All Reports' },
    { to: '/alert-rules', label: 'Alerts' },
    { to: '/notif-log', label: 'Log' },
  ] },
  { header: 'Flora', roles: INTERNAL_ROLES, items: [
    { to: '/flora', label: 'Flora' },
    { to: '/handbook', label: 'Handbook' },
  ] },
  { header: 'Fauna', roles: [...INTERNAL_ROLES, 'welfare_partner'], items: [
    { to: '/fauna', label: 'Fauna Sightings' },
    { to: '/fauna/log', label: 'Log Sighting' },
    { to: '/fauna/hotspots', label: 'Fauna Hotspots', roles: INTERNAL_ROLES },
  ] },
  { header: 'Rodent', roles: INTERNAL_ROLES, items: [
    { to: '/rodent', label: 'Rodent' },
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
