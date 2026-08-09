import { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { useFormik } from 'formik';
import * as yup from 'yup';
import { Box, TextField, Button, Typography, Alert, Link, Divider } from '@mui/material';
import http from '../http';
import { useUser, decodeToken } from '../contexts/UserContext';
import AuthVisualPanel from '../components/AuthVisualPanel';
import { NAVBAR_HEIGHT } from '../theme';

const validationSchema = yup.object({
  email: yup.string().required('Email is required').email('Enter a valid email'),
  password: yup.string().required('Password is required'),
});

export default function Login() {
  const { setUser } = useUser();
  const navigate = useNavigate();
  const [apiError, setApiError] = useState('');

  const formik = useFormik({
    initialValues: { email: '', password: '' },
    validationSchema,
    onSubmit: async (values) => {
      setApiError('');
      try {
        const res = await http.post('/api/auth/login', values);
        localStorage.setItem('accessToken', res.data.token);
        setUser(decodeToken(res.data.token));
        navigate('/');
      } catch (err) {
        setApiError(err.response?.data?.error || 'Login failed');
      }
    },
  });

  return (
    <Box
      sx={{
        width: '100vw',
        marginLeft: 'calc(50% - 50vw)',
        marginRight: 'calc(50% - 50vw)',
        minHeight: { xs: `calc(100vh - ${NAVBAR_HEIGHT.xs}px)`, sm: `calc(100vh - ${NAVBAR_HEIGHT.sm}px)` },
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        bgcolor: '#fff',
      }}
    >
      <Box
        sx={{
          flex: { xs: '1 1 auto', md: '0 0 42%' },
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: { xs: 3, sm: 6, md: 8 },
          py: { xs: 6, md: 4 },
        }}
      >
        <Box component="form" onSubmit={formik.handleSubmit} sx={{ width: '100%', maxWidth: 400 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 4 }}>
            <Box
              sx={{
                width: 36, height: 36, borderRadius: '10px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                bgcolor: 'primary.main', color: '#fff', fontWeight: 800, fontSize: 15,
              }}
            >
              EM
            </Box>
            <Typography sx={{ fontWeight: 800, letterSpacing: '-0.3px', fontSize: 17 }}>
              Biodiversity Tracker
            </Typography>
          </Box>

          <Typography variant="h4" sx={{ mb: 0.5 }}>Login</Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Welcome back. Enter your details to continue.
          </Typography>

          {apiError && <Alert severity="error" sx={{ mb: 2 }}>{apiError}</Alert>}
          <TextField
            fullWidth
            margin="normal"
            label="Email"
            name="email"
            value={formik.values.email}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            error={formik.touched.email && Boolean(formik.errors.email)}
            helperText={formik.touched.email && formik.errors.email}
          />
          <TextField
            fullWidth
            margin="normal"
            label="Password"
            name="password"
            type="password"
            value={formik.values.password}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            error={formik.touched.password && Boolean(formik.errors.password)}
            helperText={formik.touched.password && formik.errors.password}
          />
          <Button fullWidth type="submit" variant="contained" sx={{ mt: 3 }} disabled={formik.isSubmitting}>
            Login
          </Button>
          <Divider sx={{ mt: 3, mb: 2 }} />
          <Typography sx={{ textAlign: 'center' }}>
            No account? <Link component={RouterLink} to="/register">Register</Link>
          </Typography>
        </Box>
      </Box>

      <AuthVisualPanel />
    </Box>
  );
}
