import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import { useFormik } from 'formik';
import * as yup from 'yup';
import {
  Box, Typography, Button, Chip, Alert, Stack, Divider,
  TextField, MenuItem, Card, CardContent, Dialog, DialogTitle,
  DialogContent, DialogContentText, DialogActions,
} from '@mui/material';
import http from '../http';
import { HEALTH_STATUS_LABELS, HEALTH_STATUS_COLORS, HEALTH_STATUS_OPTIONS } from '../constants';

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

export default function FloraDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [plant, setPlant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [recError, setRecError] = useState('');

  const loadPlant = () =>
    http
      .get('/api/flora')
      .then((res) => {
        const found = res.data.find((p) => String(p.id) === id);
        if (found) {
          setPlant(found);
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
        const res = await http.patch(`/api/flora/${id}`, values);
        setPlant(res.data);
        setEditing(false);
      } catch (err) {
        const data = err.response?.data?.error;
        setSaveError(Array.isArray(data) ? data.join(', ') : data || 'Failed to update plant');
      }
    },
  });

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

  return (
    <Box sx={{ maxWidth: 700, mx: 'auto', mt: 4 }}>
      <Button component={RouterLink} to="/flora" sx={{ mb: 2 }}>
        &larr; Back
      </Button>

      {loading && <Typography>Loading...</Typography>}
      {!loading && error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && plant && (
        <>
          {editing ? (
            <Box component="form" onSubmit={formik.handleSubmit}>
              <Typography variant="h5" sx={{ mb: 2 }}>Edit Plant</Typography>
              {saveError && <Alert severity="error" sx={{ mb: 2 }}>{saveError}</Alert>}
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
              <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
                <Button
                  variant="outlined"
                  color="secondary"
                  onClick={() => { setEditing(false); setSaveError(''); formik.resetForm(); }}
                  disabled={formik.isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="contained" disabled={formik.isSubmitting}>
                  Save
                </Button>
              </Stack>
            </Box>
          ) : (
            <>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h5">{plant.species}</Typography>
                <Chip
                  label={HEALTH_STATUS_LABELS[plant.health_status] || plant.health_status}
                  color={HEALTH_STATUS_COLORS[plant.health_status] || 'default'}
                />
              </Box>
              {plant.common_name && (
                <Typography color="text.secondary" sx={{ mb: 2 }}>{plant.common_name}</Typography>
              )}

              {plant.location_zone && <Typography>Zone: {plant.location_zone}</Typography>}
              {plant.plant_family && <Typography>Family: {plant.plant_family}</Typography>}
              {plant.site_suitability && <Typography>Site Suitability: {plant.site_suitability}</Typography>}
              {plant.color && <Typography>Color: {plant.color}</Typography>}
              {plant.max_height_at_maturity != null && (
                <Typography>Max Height at Maturity: {plant.max_height_at_maturity} m</Typography>
              )}
              <Typography sx={{ mt: 1 }}>
                Health Notes: {plant.health_notes || '-'}
              </Typography>
              <Typography>
                Last Inspected: {plant.last_inspected_at
                  ? new Date(plant.last_inspected_at).toLocaleDateString()
                  : '-'}
              </Typography>
              {plant.recorder?.name && (
                <Typography>Recorded by: {plant.recorder.name}</Typography>
              )}
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                Created: {new Date(plant.createdAt).toLocaleString()}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                Updated: {new Date(plant.updatedAt).toLocaleString()}
              </Typography>

              <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
                <Button variant="contained" onClick={() => setEditing(true)}>
                  Edit
                </Button>
                <Button variant="outlined" color="error" onClick={() => setDeleteOpen(true)}>
                  Delete
                </Button>
              </Stack>
            </>
          )}

          <Box sx={{ mt: 4 }}>
            <Divider sx={{ mb: 2 }} />
            <Typography variant="h6" sx={{ mb: 1 }}>AI Care Recommendation</Typography>
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
          </Box>
        </>
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
    </Box>
  );
}
