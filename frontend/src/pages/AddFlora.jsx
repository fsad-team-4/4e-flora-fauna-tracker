import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFormik } from 'formik';
import * as yup from 'yup';
import { Box, TextField, Button, Typography, Alert, MenuItem, Stack } from '@mui/material';
import http from '../http';
import { HEALTH_STATUS_OPTIONS } from '../constants';

const validationSchema = yup.object({
  species: yup.string().required('Species is required'),
  common_name: yup.string(),
  location_zone: yup.string(),
  health_status: yup.string().required('Health status is required'),
  health_notes: yup.string(),
});

export default function AddFlora() {
  const navigate = useNavigate();
  const [apiError, setApiError] = useState('');

  const formik = useFormik({
    initialValues: {
      species: '',
      common_name: '',
      location_zone: '',
      health_status: 'healthy',
      health_notes: '',
    },
    validationSchema,
    onSubmit: async (values) => {
      setApiError('');
      try {
        await http.post('/api/flora', values);
        navigate('/flora');
      } catch (err) {
        const data = err.response?.data?.error;
        setApiError(Array.isArray(data) ? data.join(', ') : data || 'Failed to add plant');
      }
    },
  });

  return (
    <Box component="form" onSubmit={formik.handleSubmit} sx={{ maxWidth: 500, mx: 'auto', mt: 4 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>Add a Plant</Typography>
      {apiError && <Alert severity="error" sx={{ mb: 2 }}>{apiError}</Alert>}
      <TextField
        fullWidth
        margin="normal"
        label="Species"
        name="species"
        value={formik.values.species}
        onChange={formik.handleChange}
        onBlur={formik.handleBlur}
        error={formik.touched.species && Boolean(formik.errors.species)}
        helperText={formik.touched.species && formik.errors.species}
      />
      <TextField
        fullWidth
        margin="normal"
        label="Common Name"
        name="common_name"
        value={formik.values.common_name}
        onChange={formik.handleChange}
        onBlur={formik.handleBlur}
      />
      <TextField
        fullWidth
        margin="normal"
        label="Location Zone"
        name="location_zone"
        value={formik.values.location_zone}
        onChange={formik.handleChange}
        onBlur={formik.handleBlur}
      />
      <TextField
        select
        fullWidth
        margin="normal"
        label="Health Status"
        name="health_status"
        value={formik.values.health_status}
        onChange={formik.handleChange}
        onBlur={formik.handleBlur}
        error={formik.touched.health_status && Boolean(formik.errors.health_status)}
        helperText={formik.touched.health_status && formik.errors.health_status}
      >
        {HEALTH_STATUS_OPTIONS.map((s) => (
          <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
        ))}
      </TextField>
      <TextField
        fullWidth
        multiline
        minRows={3}
        margin="normal"
        label="Health Notes"
        name="health_notes"
        value={formik.values.health_notes}
        onChange={formik.handleChange}
        onBlur={formik.handleBlur}
      />

      <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
        <Button
          variant="outlined"
          color="secondary"
          onClick={() => navigate('/flora')}
          disabled={formik.isSubmitting}
        >
          Cancel
        </Button>
        <Button fullWidth type="submit" variant="contained" disabled={formik.isSubmitting}>
          Submit
        </Button>
      </Stack>
    </Box>
  );
}
