import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFormik } from 'formik';
import * as yup from 'yup';
import { Box, TextField, Button, Typography, Alert, MenuItem } from '@mui/material';
import http from '../http';

const CATEGORIES = [
  { value: 'flora_health', label: 'Flora Health' },
  { value: 'community_cat', label: 'Community Cat' },
  { value: 'pigeon', label: 'Pigeon' },
  { value: 'pest', label: 'Pest' },
  { value: 'other', label: 'Other' },
];

const validationSchema = yup.object({
  category: yup.string().required('Category is required'),
  title: yup.string().required('Title is required').max(200, 'Title must be at most 200 characters'),
  description: yup.string().required('Description is required'),
  block_number: yup.string(),
  floor_level: yup.string(),
});

export default function SubmitReport() {
  const navigate = useNavigate();
  const [apiError, setApiError] = useState('');

  const formik = useFormik({
    initialValues: {
      category: '',
      title: '',
      description: '',
      block_number: '',
      floor_level: '',
    },
    validationSchema,
    onSubmit: async (values) => {
      setApiError('');
      try {
        await http.post('/api/reports', values);
        navigate('/reports');
      } catch (err) {
        const data = err.response?.data?.error;
        setApiError(Array.isArray(data) ? data.join(', ') : data || 'Failed to submit report');
      }
    },
  });

  return (
    <Box component="form" onSubmit={formik.handleSubmit} sx={{ maxWidth: 500, mx: 'auto', mt: 4 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>Submit a Report</Typography>
      {apiError && <Alert severity="error" sx={{ mb: 2 }}>{apiError}</Alert>}
      <TextField
        select
        fullWidth
        margin="normal"
        label="Category"
        name="category"
        value={formik.values.category}
        onChange={formik.handleChange}
        onBlur={formik.handleBlur}
        error={formik.touched.category && Boolean(formik.errors.category)}
        helperText={formik.touched.category && formik.errors.category}
      >
        {CATEGORIES.map((c) => (
          <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
        ))}
      </TextField>
      <TextField
        fullWidth
        margin="normal"
        label="Title"
        name="title"
        value={formik.values.title}
        onChange={formik.handleChange}
        onBlur={formik.handleBlur}
        error={formik.touched.title && Boolean(formik.errors.title)}
        helperText={formik.touched.title && formik.errors.title}
      />
      <TextField
        fullWidth
        multiline
        minRows={3}
        margin="normal"
        label="Description"
        name="description"
        value={formik.values.description}
        onChange={formik.handleChange}
        onBlur={formik.handleBlur}
        error={formik.touched.description && Boolean(formik.errors.description)}
        helperText={formik.touched.description && formik.errors.description}
      />
      <TextField
        fullWidth
        margin="normal"
        label="Block Number"
        name="block_number"
        value={formik.values.block_number}
        onChange={formik.handleChange}
        onBlur={formik.handleBlur}
      />
      <TextField
        fullWidth
        margin="normal"
        label="Floor Level"
        name="floor_level"
        value={formik.values.floor_level}
        onChange={formik.handleChange}
        onBlur={formik.handleBlur}
      />
      <Button fullWidth type="submit" variant="contained" sx={{ mt: 2 }} disabled={formik.isSubmitting}>
        Submit
      </Button>
    </Box>
  );
}
