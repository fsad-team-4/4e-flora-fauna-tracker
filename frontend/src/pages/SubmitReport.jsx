import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFormik } from 'formik';
import * as yup from 'yup';
import { Box, TextField, Button, Typography, Alert, MenuItem, Stack } from '@mui/material';
import http from '../http';
import { CATEGORIES } from '../constants';

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
  const [photoUrls, setPhotoUrls] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);

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
        await http.post('/api/reports', { ...values, photo_urls: photoUrls });
        navigate('/reports');
      } catch (err) {
        const data = err.response?.data?.error;
        setApiError(Array.isArray(data) ? data.join(', ') : data || 'Failed to submit report');
      }
    },
  });

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploadError('');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await http.post('/api/uploads', formData);
      setPhotoUrls([res.data.url]);
    } catch (err) {
      setUploadError(err.response?.data?.error || 'Upload failed');
      // reset the input so the same file can be retried
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = () => {
    setPhotoUrls([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

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

      <Box sx={{ mt: 2 }}>
        {uploadError && <Alert severity="error" sx={{ mb: 1 }}>{uploadError}</Alert>}
        <Button variant="outlined" component="label" disabled={uploading}>
          {uploading ? 'Uploading...' : 'Add Photo'}
          <input
            type="file"
            hidden
            accept="image/*"
            ref={fileInputRef}
            onChange={handleFileChange}
          />
        </Button>
        {photoUrls.length > 0 && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
            <img
              src={photoUrls[0]}
              alt="Uploaded preview"
              style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 4 }}
            />
            <Button color="error" onClick={handleRemovePhoto} size="small">
              Remove
            </Button>
          </Stack>
        )}
      </Box>

      <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
        <Button
          variant="outlined"
          color="secondary"
          onClick={() => navigate('/reports')}
          disabled={formik.isSubmitting || uploading}
        >
          Cancel
        </Button>
        <Button fullWidth type="submit" variant="contained" disabled={formik.isSubmitting || uploading}>
          Submit
        </Button>
      </Stack>
    </Box>
  );
}
