import { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { useFormik } from 'formik';
import * as yup from 'yup';
import { Box, TextField, Button, Typography, Alert, Link, Divider } from '@mui/material';
import http from '../http';
import AuthVisualPanel from '../components/AuthVisualPanel';
import { NAVBAR_HEIGHT } from '../theme';

const validationSchema = yup.object({
  name: yup.string().required('Name is required').min(2, 'Name must be at least 2 characters'),
  email: yup.string().required('Email is required').email('Enter a valid email'),
  password: yup.string().required('Password is required').min(6, 'Password must be at least 6 characters'),
});

export default function Register() {
  const navigate = useNavigate();
  const [apiError, setApiError] = useState('');

  const formik = useFormik({
    initialValues: { name: '', email: '', password: '' },
    validationSchema,
    onSubmit: async (values) => {
      setApiError('');
      try {
        await http.post('/api/auth/register', values);
        navigate('/login');
      } catch (err) {
        const data = err.response?.data?.error;
        setApiError(Array.isArray(data) ? data.join(', ') : data || 'Registration failed');
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

          <Typography variant="h4" sx={{ mb: 0.5 }}>Register</Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Create an account to get started.
          </Typography>

          {apiError && <Alert severity="error" sx={{ mb: 2 }}>{apiError}</Alert>}
          <TextField
            fullWidth
            margin="normal"
            label="Name"
            name="name"
            value={formik.values.name}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            error={formik.touched.name && Boolean(formik.errors.name)}
            helperText={formik.touched.name && formik.errors.name}
          />
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
            Register
          </Button>
          <Divider sx={{ mt: 3, mb: 2 }} />
          <Typography sx={{ textAlign: 'center' }}>
            Have an account? <Link component={RouterLink} to="/login">Login</Link>
          </Typography>
        </Box>
      </Box>

      <AuthVisualPanel />
    </Box>
  );
}
