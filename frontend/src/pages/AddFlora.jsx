import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFormik } from 'formik';
import * as yup from 'yup';
import {
  Box, TextField, Button, Typography, Alert, MenuItem, Stack, Card,
  CardContent, Divider, Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ParkOutlinedIcon from '@mui/icons-material/ParkOutlined';
import LocalFloristOutlinedIcon from '@mui/icons-material/LocalFloristOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import TipsAndUpdatesOutlinedIcon from '@mui/icons-material/TipsAndUpdatesOutlined';
import http from '../http';
import { HEALTH_STATUS_OPTIONS, HEALTH_STATUS_LABELS, HEALTH_STATUS_COLORS } from '../constants';

const validationSchema = yup.object({
  species: yup.string().required('Species is required'),
  common_name: yup.string(),
  location_zone: yup.string(),
  health_status: yup.string().required('Health status is required'),
  health_notes: yup.string(),
  plant_family: yup.string(),
  site_suitability: yup.string(),
  color: yup.string(),
  max_height_at_maturity: yup
    .number()
    .transform((value) => (isNaN(value) ? null : value))
    .positive('Max height must be a positive number')
    .nullable(),
});

// Small colored dot matching the same convention used in FloraList's filter
// dropdown, so the health-status selector reads consistently across pages.
function StatusDot({ color }) {
  return (
    <Box
      component="span"
      sx={{
        width: 8, height: 8, borderRadius: '50%',
        bgcolor: `${color}.main`, display: 'inline-block', mr: 1,
      }}
    />
  );
}

function SectionHeading({ icon, title, subtitle }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        {icon}
        <Typography variant="h6">{title}</Typography>
      </Stack>
      {subtitle && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          {subtitle}
        </Typography>
      )}
    </Box>
  );
}

// Mirrors the real plant card design from FloraList.jsx exactly (accent
// bar keyed to health status, chip, location line) so what's shown here is
// a true preview of how the record will actually appear once created.
function LivePreviewCard({ values }) {
  const statusColor = HEALTH_STATUS_COLORS[values.health_status] || 'default';
  const hasSpecies = Boolean(values.species.trim());

  return (
    <Box sx={{ position: { md: 'sticky' }, top: { md: 88 } }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
        <VisibilityOutlinedIcon fontSize="small" color="action" />
        <Typography variant="subtitle2" color="text.secondary">
          Live Preview
        </Typography>
      </Stack>

      <Card
        sx={{
          borderLeft: 4,
          borderLeftColor: `${statusColor}.main`,
          opacity: hasSpecies ? 1 : 0.6,
          transition: 'border-color 0.2s ease, opacity 0.2s ease',
        }}
      >
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" sx={{ lineHeight: 1.3 }} noWrap>
                {values.species.trim() || 'Your plant species'}
              </Typography>
              {values.common_name && (
                <Typography color="text.secondary" variant="body2" noWrap>
                  {values.common_name}
                </Typography>
              )}
            </Box>
            <Chip
              label={HEALTH_STATUS_LABELS[values.health_status] || values.health_status}
              color={statusColor}
              size="small"
              sx={{ transition: 'background-color 0.2s ease' }}
            />
          </Box>

          {values.location_zone && (
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 1 }}>
              <LocationOnOutlinedIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
              <Typography variant="body2" color="text.secondary" noWrap>
                {values.location_zone}
              </Typography>
            </Stack>
          )}

          {(values.plant_family || values.site_suitability || values.color || values.max_height_at_maturity) && (
            <>
              <Divider sx={{ my: 1.5 }} />
              {values.plant_family && (
                <Typography variant="body2">Family: {values.plant_family}</Typography>
              )}
              {values.site_suitability && (
                <Typography variant="body2">Suitability: {values.site_suitability}</Typography>
              )}
              {values.color && (
                <Typography variant="body2">Color: {values.color}</Typography>
              )}
              {values.max_height_at_maturity && (
                <Typography variant="body2">
                  Max height: {values.max_height_at_maturity} m
                </Typography>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Typography variant="caption" color="text.disabled" sx={{ mt: 1, display: 'block' }}>
        This is how the record will look in Flora Management once added.
      </Typography>

      <Card variant="outlined" sx={{ mt: 2 }}>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
            <TipsAndUpdatesOutlinedIcon fontSize="small" color="action" />
            <Typography variant="subtitle2" color="text.secondary">
              Quick Tips
            </Typography>
          </Stack>
          <Stack spacing={1}>
            <Typography variant="body2">
              - Species is the only required field
            </Typography>
            <Typography variant="body2">
              - Health Status determines the colour badge shown throughout the app
            </Typography>
            <Typography variant="body2">
              - Botanical fields (family, suitability, colour, height) are optional
              but power the Horticulture Handbook browse page
            </Typography>
            <Typography variant="body2">
              - You can edit any of these details later from the plant's detail page
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}

export default function AddFlora() {
  const navigate = useNavigate();
  const [apiError, setApiError] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploadError('');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await http.post('/api/uploads', formData);
      setImageUrl(res.data.url);
    } catch (err) {
      setUploadError(err.response?.data?.error || 'Upload failed');
      // reset the input so the same file can be retried
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = () => {
    setImageUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formik = useFormik({
    initialValues: {
      species: '',
      common_name: '',
      location_zone: '',
      health_status: 'healthy',
      health_notes: '',
      plant_family: '',
      site_suitability: '',
      color: '',
      max_height_at_maturity: '',
    },
    validationSchema,
    onSubmit: async (values) => {
      setApiError('');
      try {
        await http.post('/api/flora', { ...values, image_url: imageUrl || null });
        navigate('/flora');
      } catch (err) {
        const data = err.response?.data?.error;
        setApiError(Array.isArray(data) ? data.join(', ') : data || 'Failed to add plant');
      }
    },
  });

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', mt: 4, mb: 6, px: 2 }}>
      {/* Page header */}
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 0.5 }}>
        <AddIcon sx={{ color: 'primary.main', fontSize: 28 }} />
        <Typography variant="h4">Add a Plant</Typography>
      </Stack>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Log a new greenery record for the estate.
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 340px' },
          gap: 3,
          alignItems: 'start',
        }}
      >
        <Card component="form" onSubmit={formik.handleSubmit}>
          <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
            {apiError && <Alert severity="error" sx={{ mb: 3 }}>{apiError}</Alert>}

            <SectionHeading
              icon={<ParkOutlinedIcon color="success" />}
              title="Basic Information"
              subtitle="Identifies the plant and its current condition"
            />

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
                <MenuItem key={s.value} value={s.value}>
                  <StatusDot color={HEALTH_STATUS_COLORS[s.value]} />
                  {s.label}
                </MenuItem>
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

            <Divider sx={{ my: 4 }} />

            <SectionHeading
              icon={<LocalFloristOutlinedIcon color="primary" />}
              title="Botanical Catalog Details"
              subtitle="Optional - powers the Horticulture Handbook browse view"
            />

            <TextField
              fullWidth
              margin="normal"
              label="Plant Family"
              name="plant_family"
              value={formik.values.plant_family}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
            />
            <TextField
              fullWidth
              margin="normal"
              label="Site Suitability"
              name="site_suitability"
              value={formik.values.site_suitability}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
            />
            <TextField
              fullWidth
              margin="normal"
              label="Color"
              name="color"
              value={formik.values.color}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
            />
            <TextField
              fullWidth
              type="number"
              margin="normal"
              label="Max Height at Maturity (metres)"
              name="max_height_at_maturity"
              value={formik.values.max_height_at_maturity}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              error={formik.touched.max_height_at_maturity && Boolean(formik.errors.max_height_at_maturity)}
              helperText={formik.touched.max_height_at_maturity && formik.errors.max_height_at_maturity}
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
              {imageUrl && (
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                  <img
                    src={imageUrl}
                    alt="Uploaded preview"
                    style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 4 }}
                  />
                  <Button color="error" onClick={handleRemovePhoto} size="small">
                    Remove
                  </Button>
                </Stack>
              )}
            </Box>

            <Stack direction="row" spacing={2} sx={{ mt: 4 }}>
              <Button
                variant="outlined"
                color="secondary"
                onClick={() => navigate('/flora')}
                disabled={formik.isSubmitting || uploading}
              >
                Cancel
              </Button>
              <Button fullWidth type="submit" variant="contained" disabled={formik.isSubmitting || uploading}>
                {formik.isSubmitting ? 'Saving...' : 'Add Plant'}
              </Button>
            </Stack>
          </CardContent>
        </Card>

        <LivePreviewCard values={formik.values} />
      </Box>
    </Box>
  );
}
