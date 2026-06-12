import { BrowserRouter, Routes, Route, Link as RouterLink } from 'react-router-dom'
import { AppBar, Toolbar, Typography, Button, Container, Box } from '@mui/material'
import { UserProvider, useUser } from './contexts/UserContext'
import Login from './pages/Login'
import Register from './pages/Register'

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

function App() {
  return (
    <UserProvider>
      <BrowserRouter>
        <AppBar position="static">
          <Toolbar>
            <Typography variant="h6" component={RouterLink} to="/" sx={{ color: 'inherit', textDecoration: 'none' }}>
              4E Biodiversity Tracker
            </Typography>
          </Toolbar>
        </AppBar>
        <Container>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </Routes>
        </Container>
      </BrowserRouter>
    </UserProvider>
  )
}

export default App
