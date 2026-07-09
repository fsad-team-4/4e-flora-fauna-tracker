import { BrowserRouter, Routes, Route, Link as RouterLink, NavLink, useLocation } from 'react-router-dom'
import { AppBar, Toolbar, Typography, Button, Container, Box, Divider } from '@mui/material'
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
import Dashboard from './pages/Dashboard'
import AlertRules from './pages/AlertRules'
import NotificationLog from './pages/NotificationLog'
import RodentAssessment from './pages/RodentAssessment'

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
        Use the navigation above to submit or manage reports.
      </Typography>
    </Box>
  )
}

function NavLinkButton({ to, children }) {
  const location = useLocation()
  const active = location.pathname === to
  return (
    <Button
      component={NavLink}
      to={to}
      disableRipple
      sx={{
        color: active ? 'primary.main' : 'text.secondary',
        fontWeight: active ? 700 : 500,
        px: 1.5,
        borderRadius: 2,
        bgcolor: active ? 'rgba(193,39,45,.08)' : 'transparent',
        '&:hover': { bgcolor: 'rgba(193,39,45,.06)', color: 'primary.main' },
      }}
    >
      {children}
    </Button>
  )
}

function NavBar() {
  const { user, setUser } = useUser()
  const logout = () => {
    localStorage.removeItem('accessToken')
    setUser(null)
  }
  return (
    <AppBar position="sticky">
      <Toolbar sx={{ gap: 1, py: 0.5 }}>
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

        {/* nav links */}
        {user && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 3 }}>
            <NavLinkButton to="/submit-report">Submit Report</NavLinkButton>
            <NavLinkButton to="/reports">My Reports</NavLinkButton>
            {(user.role === 'staff' || user.role === 'admin') && (
              <>
                <NavLinkButton to="/all-reports">All Reports</NavLinkButton>
                <NavLinkButton to="/flora">Flora</NavLinkButton>
                <NavLinkButton to="/dashboard">Dashboard</NavLinkButton>
                <NavLinkButton to="/alert-rules">Alerts</NavLinkButton>
                <NavLinkButton to="/notif-log">Log</NavLinkButton>
                <NavLinkButton to="/rodent">Rodent</NavLinkButton>
              </>
            )}
          </Box>
        )}

        {/* spacer pushes the user block to the far right */}
        <Box sx={{ flexGrow: 1 }} />

        {/* user identity + logout, hard right */}
        {user && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Divider orientation="vertical" flexItem sx={{ my: 1 }} />
            <Box sx={{ textAlign: 'right', lineHeight: 1.2 }}>
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
  )
}

function App() {
  return (
    <UserProvider>
      <BrowserRouter>
        <NavBar />
        <Container maxWidth="xl">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/submit-report" element={<ProtectedRoute><SubmitReport /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute><MyReports /></ProtectedRoute>} />
            <Route path="/all-reports" element={<ProtectedRoute><AllReports /></ProtectedRoute>} />
            <Route path="/flora" element={<ProtectedRoute><FloraList /></ProtectedRoute>} />
            <Route path="/flora/add" element={<ProtectedRoute><AddFlora /></ProtectedRoute>} />
            <Route path="/flora/:id" element={<ProtectedRoute><FloraDetail /></ProtectedRoute>} />
            <Route path="/reports/:id" element={<ProtectedRoute><ReportDetail /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/alert-rules" element={<ProtectedRoute><AlertRules /></ProtectedRoute>} />
            <Route path="/notif-log" element={<ProtectedRoute><NotificationLog /></ProtectedRoute>} />
            <Route path="/rodent" element={<ProtectedRoute><RodentAssessment /></ProtectedRoute>} />
          </Routes>
        </Container>
      </BrowserRouter>
    </UserProvider>
  )
}

export default App