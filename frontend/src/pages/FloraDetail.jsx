import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import { useFormik } from 'formik';
import * as yup from 'yup';
import {
  Box, Typography, Button, Chip, Alert, Stack, Divider,
  TextField, MenuItem, Card, CardContent, Dialog, DialogTitle,
  DialogContent, DialogContentText, DialogActions, Skeleton, Snackbar,
  Autocomplete,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LocalFloristOutlinedIcon from '@mui/icons-material/LocalFloristOutlined';
import ParkOutlinedIcon from '@mui/icons-material/ParkOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import NotesOutlinedIcon from '@mui/icons-material/NotesOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import TerrainOutlinedIcon from '@mui/icons-material/TerrainOutlined';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import HeightOutlinedIcon from '@mui/icons-material/HeightOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import http from '../http';
import { HEALTH_STATUS_LABELS, HEALTH_STATUS_COLORS, HEALTH_STATUS_OPTIONS } from '../constants';
import { SINGAPORE_LOCATIONS } from '../constants/singaporeLocations';
import { toTitleCase } from '../utils/formatters';

const validationSchema = yup.object({
  species: yup.string().required('Species is required'),
  common_name: yup.string(),
  location: yup.string(),
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

// Same colored-dot convention as FloraList's filter and AddFlora's selector,
// so the health-status dropdown reads consistently across pages.
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

// Icon + caption label + value row for the read-only view.
function DetailRow({ icon, label, value }) {
  return (
    <Stack direction="row" spacing={1.5} alignItems="flex-start">
      <Box sx={{ color: 'text.disabled', display: 'flex', mt: 0.25 }}>{icon}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" display="block">
          {label}
        </Typography>
        <Typography variant="body1" sx={{ whiteSpace: 'pre-line' }}>
          {value}
        </Typography>
      </Box>
    </Stack>
  );
}

export default function FloraDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [plant, setPlant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [recError, setRecError] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [speciesCatalog, setSpeciesCatalog] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    http.get('/api/flora/species-catalog')
      .then((res) => setSpeciesCatalog(res.data))
      .catch(() => setSpeciesCatalog([]));
  }, []);

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

  const loadPlant = () =>
    http
      .get('/api/flora')
      .then((res) => {
        const found = res.data.find((p) => String(p.id) === id);
        if (found) {
          setPlant(found);
          // Sync the photo draft with the loaded plant, mirroring what
          // enableReinitialize does for the formik fields.
          setImageUrl(found.image_url || '');
          setError('');
        } else {
          setError('Plant not found.');
        }
      })
      .catch(() => setError('Failed to load plant.'))
      .finally(() => setLoading(false));

  useEffect(() => {
    loadPlant();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const formik = useFormik({
    enableReinitialize: true,
    initialValues: {
      species: plant?.species || '',
      common_name: plant?.common_name || '',
      location: plant?.location || '',
      location_zone: plant?.location_zone || '',
      health_status: plant?.health_status || 'healthy',
      health_notes: plant?.health_notes || '',
      plant_family: plant?.plant_family || '',
      site_suitability: plant?.site_suitability || '',
      color: plant?.color || '',
      max_height_at_maturity: plant?.max_height_at_maturity ?? '',
    },
    validationSchema,
    onSubmit: async (values) => {
      setSaveError('');
      try {
        const res = await http.patch(`/api/flora/${id}`, { ...values, image_url: imageUrl || null });
        setPlant(res.data);
        setEditing(false);
        setSaveSuccess(true);
      } catch (err) {
        const data = err.response?.data?.error;
        setSaveError(Array.isArray(data) ? data.join(', ') : data || 'Failed to update plant');
      }
    },
  });

  const handleSpeciesSelect = (_e, newValue) => {
    formik.setFieldValue('species', newValue || '');

    const match = speciesCatalog.find((entry) => entry.species === newValue);
    if (!match) return;

    ['plant_family', 'site_suitability', 'color', 'max_height_at_maturity'].forEach((field) => {
      if (!formik.values[field] && match[field] != null) {
        formik.setFieldValue(field, match[field]);
      }
    });
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await http.delete(`/api/flora/${id}`);
      navigate('/flora');
    } catch {
      setDeleting(false);
      setDeleteOpen(false);
      setError('Failed to delete plant.');
    }
  };

  const handleGetRecommendation = async () => {
    setRecError('');
    setRecommending(true);
    try {
      const res = await http.post(`/api/flora/${id}/care-recommendation`);
      setPlant(res.data);
    } catch (err) {
      setRecError(err.response?.data?.error || 'Failed to get AI recommendation');
    } finally {
      setRecommending(false);
    }
  };

  const statusColor = plant ? (HEALTH_STATUS_COLORS[plant.health_status] || 'default') : 'default';

  // Species + status chip - mirrors the plant card design in FloraList
  const detailsHeader = plant && (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h5" sx={{ lineHeight: 1.3 }}>
          {toTitleCase(plant.species)}
        </Typography>
        {plant.common_name && (
          <Typography color="text.secondary">{plant.common_name}</Typography>
        )}
      </Box>
      <Chip
        label={HEALTH_STATUS_LABELS[plant.health_status] || plant.health_status}
        color={statusColor}
      />
    </Box>
  );

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', mt: 4, mb: 6, px: 2 }}>
      <Button
        component={RouterLink}
        to="/flora"
        startIcon={<ArrowBackIcon />}
        sx={{ mb: 2 }}
      >
        Back to Flora Management
      </Button>

      {/* Page header */}
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 0.5 }}>
        <LocalFloristOutlinedIcon sx={{ color: 'primary.main', fontSize: 28 }} />
        <Typography variant="h4">{editing ? 'Edit Plant' : 'Plant Details'}</Typography>
      </Stack>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {editing
          ? 'Update this greenery record for the estate.'
          : 'View and manage this greenery record.'}
      </Typography>

      {/* Loading state - skeleton card matching the list page */}
      {loading && (
        <Card sx={{ borderLeft: 4, borderLeftColor: 'divider' }}>
          <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
            <Skeleton variant="text" width="45%" height={40} />
            <Skeleton variant="text" width="30%" />
            <Skeleton variant="text" width="60%" sx={{ mt: 2 }} />
            <Skeleton variant="text" width="55%" />
            <Skeleton variant="text" width="50%" />
          </CardContent>
        </Card>
      )}

      {!loading && error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && plant && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 340px' },
            gap: 3,
            alignItems: 'start',
          }}
        >
          {editing ? (
            <Card component="form" onSubmit={formik.handleSubmit}>
              <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
                {saveError && <Alert severity="error" sx={{ mb: 3 }}>{saveError}</Alert>}

                <SectionHeading
                  icon={<ParkOutlinedIcon color="success" />}
                  title="Basic Information"
                  subtitle="Identifies the plant and its current condition"
                />

                <Autocomplete
                  freeSolo
                  fullWidth
                  options={speciesCatalog.map((entry) => entry.species)}
                  value={formik.values.species}
                  onChange={handleSpeciesSelect}
                  onInputChange={(e, newInputValue) => formik.setFieldValue('species', newInputValue)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      margin="normal"
                      label="Species"
                      name="species"
                      onBlur={formik.handleBlur}
                      error={formik.touched.species && Boolean(formik.errors.species)}
                      helperText={formik.touched.species && formik.errors.species}
                    />
                  )}
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
                <Autocomplete
                  freeSolo
                  fullWidth
                  options={SINGAPORE_LOCATIONS}
                  value={formik.values.location}
                  onChange={(e, newValue) => formik.setFieldValue('location', newValue || '')}
                  onInputChange={(e, newInputValue) => formik.setFieldValue('location', newInputValue)}
                  renderInput={(params) => (
                    <TextField {...params} margin="normal" label="Location" onBlur={formik.handleBlur} name="location" />
                  )}
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
                    onClick={() => {
                      setEditing(false);
                      setSaveError('');
                      setUploadError('');
                      setImageUrl(plant?.image_url || '');
                      formik.resetForm();
                    }}
                    disabled={formik.isSubmitting || uploading}
                  >
                    Cancel
                  </Button>
                  <Button fullWidth type="submit" variant="contained" disabled={formik.isSubmitting || uploading}>
                    {formik.isSubmitting ? 'Saving...' : 'Save Changes'}
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          ) : (
            <Card sx={{ borderLeft: 4, borderLeftColor: `${statusColor}.main` }}>
              <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
                {plant.image_url ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box
                      component="img"
                      src={plant.image_url}
                      alt={plant.species}
                      sx={{
                        width: 200, height: 200, objectFit: 'cover',
                        borderRadius: 2, display: 'block', flexShrink: 0,
                      }}
                    />
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      {detailsHeader}
                    </Box>
                  </Box>
                ) : (
                  detailsHeader
                )}

                <Divider sx={{ my: 3 }} />

                <SectionHeading
                  icon={<ParkOutlinedIcon color="success" />}
                  title="Basic Information"
                  subtitle="Current condition and where to find it"
                />

                <Stack spacing={2}>
                  {plant.location && (
                    <DetailRow
                      icon={<LocationOnOutlinedIcon fontSize="small" />}
                      label="Location"
                      value={plant.location}
                    />
                  )}
                  {plant.location_zone && (
                    <DetailRow
                      icon={<LocationOnOutlinedIcon fontSize="small" />}
                      label="Location Zone"
                      value={plant.location_zone}
                    />
                  )}
                  <DetailRow
                    icon={<NotesOutlinedIcon fontSize="small" />}
                    label="Health Notes"
                    value={plant.health_notes || '-'}
                  />
                  <DetailRow
                    icon={<EventOutlinedIcon fontSize="small" />}
                    label="Last Inspected"
                    value={plant.last_inspected_at
                      ? new Date(plant.last_inspected_at).toLocaleDateString()
                      : '-'}
                  />
                </Stack>

                <Divider sx={{ my: 3 }} />

                <SectionHeading
                  icon={<LocalFloristOutlinedIcon color="primary" />}
                  title="Botanical Catalog Details"
                  subtitle="Catalog attributes shown in the Horticulture Handbook"
                />

                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                    gap: 2,
                  }}
                >
                  <DetailRow
                    icon={<CategoryOutlinedIcon fontSize="small" />}
                    label="Plant Family"
                    value={plant.plant_family || '-'}
                  />
                  <DetailRow
                    icon={<TerrainOutlinedIcon fontSize="small" />}
                    label="Site Suitability"
                    value={plant.site_suitability || '-'}
                  />
                  <DetailRow
                    icon={<PaletteOutlinedIcon fontSize="small" />}
                    label="Color"
                    value={plant.color || '-'}
                  />
                  <DetailRow
                    icon={<HeightOutlinedIcon fontSize="small" />}
                    label="Max Height at Maturity"
                    value={plant.max_height_at_maturity != null
                      ? `${plant.max_height_at_maturity} m`
                      : '-'}
                  />
                </Box>

                <Stack direction="row" spacing={2} sx={{ mt: 4 }}>
                  <Button
                    variant="contained"
                    startIcon={<EditOutlinedIcon />}
                    onClick={() => setEditing(true)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteOutlinedIcon />}
                    onClick={() => setDeleteOpen(true)}
                  >
                    Delete
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          )}

          {/* Sidebar: AI recommendation + record metadata */}
          <Box>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                  <AutoAwesomeOutlinedIcon fontSize="small" color="action" />
                  <Typography variant="h6">AI Care Recommendation</Typography>
                </Stack>
                {recError && <Alert severity="error" sx={{ mb: 2 }}>{recError}</Alert>}

                {plant.care_recommendation && (
                  <Card variant="outlined" sx={{ mb: 2, bgcolor: 'action.hover' }}>
                    <CardContent>
                      <Typography sx={{ whiteSpace: 'pre-line' }}>
                        {plant.care_recommendation}
                      </Typography>
                    </CardContent>
                  </Card>
                )}

                <Button
                  variant="outlined"
                  onClick={handleGetRecommendation}
                  disabled={recommending}
                >
                  {recommending
                    ? 'Getting recommendation...'
                    : plant.care_recommendation
                      ? 'Regenerate'
                      : 'Get AI Recommendation'}
                </Button>
              </CardContent>
            </Card>

            <Card variant="outlined" sx={{ mt: 2 }}>
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
                  Record Info
                </Typography>
                <Stack spacing={1.5}>
                  {plant.recorder?.name && (
                    <DetailRow
                      icon={<PersonOutlinedIcon fontSize="small" />}
                      label="Recorded by"
                      value={plant.recorder.name}
                    />
                  )}
                  <DetailRow
                    icon={<AccessTimeOutlinedIcon fontSize="small" />}
                    label="Created"
                    value={new Date(plant.createdAt).toLocaleString()}
                  />
                  <DetailRow
                    icon={<AccessTimeOutlinedIcon fontSize="small" />}
                    label="Updated"
                    value={new Date(plant.updatedAt).toLocaleString()}
                  />
                </Stack>
              </CardContent>
            </Card>
          </Box>
        </Box>
      )}

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>Delete plant?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will remove the plant record. This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button color="error" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={saveSuccess}
        autoHideDuration={3000}
        onClose={() => setSaveSuccess(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={() => setSaveSuccess(false)} severity="success" variant="filled">
          Plant updated successfully.
        </Alert>
      </Snackbar>
    </Box>
  );
}
