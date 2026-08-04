import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFormik } from 'formik';
import * as yup from 'yup';
import {
  Box, TextField, Button, Typography, Alert, MenuItem, Stack,
  Paper, CircularProgress,
} from '@mui/material';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import http from '../http';
import { CATEGORIES } from '../constants';
import { BRAND } from '../theme';

// Validation is unchanged from the original form - the schema contract with the
// backend (title + description required) is deliberately untouched by this restyle.
const validationSchema = yup.object({
  category: yup.string().required('Category is required'),
  title: yup.string().required('Title is required').max(200, 'Title must be at most 200 characters'),
  description: yup.string().required('Description is required'),
  block_number: yup.string(),
  floor_level: yup.string(),
});

// Section label sitting above each input (replaces MUI's floating label so the
// form reads like the mockup). Required fields get a red asterisk.
function FieldLabel({ children, required, hint }) {
  return (
    <Typography
      component="label"
      sx={{ display: 'block', mb: 0.75, fontSize: 14, fontWeight: 600, color: BRAND.heading }}
    >
      {children}
      {required && <Box component="span" sx={{ color: BRAND.primary, ml: 0.5 }}>*</Box>}
      {hint && (
        <Box component="span" sx={{ ml: 0.75, fontWeight: 400, color: BRAND.textLight }}>
          {hint}
        </Box>
      )}
    </Typography>
  );
}

// Shared input styling: filled-grey resting state, white on focus, rounded.
const inputSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 2,
    bgcolor: BRAND.section,
    '& fieldset': { borderColor: BRAND.border },
    '&:hover fieldset': { borderColor: BRAND.textLight },
    '&.Mui-focused': { bgcolor: '#fff' },
  },
};

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

  const hasPhoto = photoUrls.length > 0;

  return (
    <Box
      component="form"
      onSubmit={formik.handleSubmit}
      sx={{ maxWidth: 560, mx: 'auto', mt: 4, mb: 6 }}
    >
      <Typography variant="h5" sx={{ mb: 2.5, fontWeight: 700, color: BRAND.heading }}>
        Report an Issue
      </Typography>

      {apiError && <Alert severity="error" sx={{ mb: 2 }}>{apiError}</Alert>}
      {uploadError && <Alert severity="error" sx={{ mb: 2 }}>{uploadError}</Alert>}

      {/* photo dropzone - the whole card is the file picker */}
      <Paper
        component="label"
        elevation={0}
        sx={{
          display: 'block',
          mb: 2.5,
          p: hasPhoto ? 2 : 4,
          textAlign: 'center',
          cursor: uploading ? 'default' : 'pointer',
          borderRadius: 3,
          border: `2px dashed ${BRAND.primaryLight}`,
          bgcolor: '#FDF6F6',
          transition: 'background-color .15s',
          '&:hover': { bgcolor: hasPhoto ? '#FDF6F6' : '#FBEDED' },
        }}
      >
        <input
          type="file"
          hidden
          accept="image/*"
          ref={fileInputRef}
          onChange={handleFileChange}
          disabled={uploading}
        />

        {hasPhoto ? (
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="center">
            <Box
              component="img"
              src={photoUrls[0]}
              alt="Uploaded preview"
              sx={{ width: 88, height: 88, objectFit: 'cover', borderRadius: 2 }}
            />
            <Stack spacing={0.5} alignItems="flex-start">
              <Typography sx={{ fontSize: 14, fontWeight: 600, color: BRAND.heading }}>
                Photo attached
              </Typography>
              <Typography sx={{ fontSize: 13, color: BRAND.textLight }}>
                Tap the card to replace it
              </Typography>
              <Button
                size="small"
                color="error"
                onClick={(e) => { e.preventDefault(); handleRemovePhoto(); }}
                sx={{ px: 0, minWidth: 0 }}
              >
                Remove
              </Button>
            </Stack>
          </Stack>
        ) : (
          <>
            <Box
              sx={{
                width: 56, height: 56, mx: 'auto', mb: 1.5, borderRadius: '50%',
                bgcolor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 1px 3px rgba(0,0,0,.08)',
              }}
            >
              {uploading
                ? <CircularProgress size={24} sx={{ color: BRAND.primary }} />
                : <PhotoCameraOutlinedIcon sx={{ color: BRAND.primary, fontSize: 28 }} />}
            </Box>
            <Typography sx={{ fontWeight: 700, color: BRAND.primary, mb: 0.25 }}>
              {uploading ? 'Uploading...' : 'Snap a Photo'}
            </Typography>
            <Typography sx={{ fontSize: 13, color: BRAND.primaryLight }}>
              or upload from gallery
            </Typography>
          </>
        )}
      </Paper>

      {/* form fields card */}
      <Paper
        elevation={0}
        sx={{ p: 3, borderRadius: 3, border: `1px solid ${BRAND.border}`, bgcolor: '#fff' }}
      >
        <Box sx={{ mb: 2.5 }}>
          <FieldLabel required>What are you reporting?</FieldLabel>
          <TextField
            select
            fullWidth
            size="small"
            name="category"
            value={formik.values.category}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            error={formik.touched.category && Boolean(formik.errors.category)}
            helperText={formik.touched.category && formik.errors.category}
            sx={inputSx}
          >
            <MenuItem value="" disabled>
              <Box component="span" sx={{ color: BRAND.textLight }}>Select an issue category</Box>
            </MenuItem>
            {CATEGORIES.map((c) => (
              <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
            ))}
          </TextField>
        </Box>

        <Box sx={{ mb: 2.5 }}>
          <FieldLabel required>Title</FieldLabel>
          <TextField
            fullWidth
            size="small"
            name="title"
            placeholder="Short summary of the issue"
            value={formik.values.title}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            error={formik.touched.title && Boolean(formik.errors.title)}
            helperText={formik.touched.title && formik.errors.title}
            sx={inputSx}
          />
        </Box>

        <Box sx={{ mb: 2.5 }}>
          <FieldLabel required>Description</FieldLabel>
          <TextField
            fullWidth
            multiline
            minRows={4}
            size="small"
            name="description"
            placeholder="Describe what you saw, and where exactly..."
            value={formik.values.description}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            error={formik.touched.description && Boolean(formik.errors.description)}
            helperText={formik.touched.description && formik.errors.description}
            sx={inputSx}
          />
        </Box>

        <Box sx={{ mb: 2.5 }}>
          <FieldLabel hint="(optional)">Block / Location</FieldLabel>
          <TextField
            fullWidth
            size="small"
            name="block_number"
            placeholder="e.g. Blk 123, Void Deck"
            value={formik.values.block_number}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            sx={inputSx}
          />
        </Box>

        <Box>
          <FieldLabel hint="(if applicable)">Floor Level</FieldLabel>
          <TextField
            fullWidth
            size="small"
            name="floor_level"
            placeholder="e.g. Ground, L5"
            value={formik.values.floor_level}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            sx={inputSx}
          />
        </Box>
      </Paper>

      <Stack direction="row" spacing={1.5} sx={{ mt: 3 }}>
        <Button
          variant="outlined"
          onClick={() => navigate('/reports')}
          disabled={formik.isSubmitting || uploading}
          sx={{ borderRadius: 2, py: 1.25, px: 3, borderColor: BRAND.border, color: BRAND.text }}
        >
          Cancel
        </Button>
        <Button
          fullWidth
          type="submit"
          variant="contained"
          disabled={formik.isSubmitting || uploading}
          sx={{ borderRadius: 2, py: 1.25, fontWeight: 700, fontSize: 16 }}
        >
          {formik.isSubmitting ? 'Submitting...' : 'Submit Report'}
        </Button>
      </Stack>
    </Box>
  );
}