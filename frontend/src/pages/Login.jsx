import { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { useFormik } from 'formik';
import * as yup from 'yup';
import { Box, TextField, Button, Typography, Alert, Link } from '@mui/material';
import http from '../http';
import { useUser, decodeToken } from '../contexts/UserContext';

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
    <Box component="form" onSubmit={formik.handleSubmit} sx={{ maxWidth: 400, mx: 'auto', mt: 4 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>Login</Typography>
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
      <Button fullWidth type="submit" variant="contained" sx={{ mt: 2 }} disabled={formik.isSubmitting}>
        Login
      </Button>
      <Typography sx={{ mt: 2 }}>
        No account? <Link component={RouterLink} to="/register">Register</Link>
      </Typography>
    </Box>
  );
}
