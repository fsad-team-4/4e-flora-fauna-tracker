import { BrowserRouter, Routes, Route, Link as RouterLink } from 'react-router-dom'
import { AppBar, Toolbar, Typography, Button, Container, Box } from '@mui/material'
import { UserProvider, useUser } from './contexts/UserContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Register from './pages/Register'
import SubmitReport from './pages/SubmitReport'
import MyReports from './pages/MyReports'

function Home() {
  const { user, setUser } = useUser()

  const logout = () => {
    localStorage.removeItem('accessToken')
    setUser(null)
  }

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
      <Typography>Logged in as {user.name} ({user.role})</Typography>
      <Button onClick={logout} sx={{ mt: 1 }}>Logout</Button>
    </Box>
  )
}

function NavBar() {
  const { user } = useUser()
  return (
    <AppBar position="static">
      <Toolbar sx={{ gap: 2 }}>
        <Typography variant="h6" component={RouterLink} to="/" sx={{ color: 'inherit', textDecoration: 'none', flexGrow: 1 }}>
          4E Biodiversity Tracker
        </Typography>
        {user && (
          <>
            <Button color="inherit" component={RouterLink} to="/submit-report">Submit Report</Button>
            <Button color="inherit" component={RouterLink} to="/reports">My Reports</Button>
          </>
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
        <Container>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/submit-report" element={<ProtectedRoute><SubmitReport /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute><MyReports /></ProtectedRoute>} />
          </Routes>
        </Container>
      </BrowserRouter>
    </UserProvider>
  )
}

export default App
