import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFormik } from 'formik';
import * as yup from 'yup';
import {
  Box, TextField, Button, Typography, Alert, MenuItem, Stack,
  FormControl, FormLabel, FormGroup, FormControlLabel, Checkbox,
} from '@mui/material';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import http from '../http';
import { speciesLabel } from '../faunaDisplay';

const SPECIES = ['cat', 'pigeon', 'crow', 'mynah', 'other'];
const BEHAVIOUR_TAGS = ['urinating', 'feeding', 'nesting', 'droppings', 'aggressive'];

// Default map view - central Singapore.
const DEFAULT_CENTER = [1.3521, 103.8198];

// A single red pin as a Leaflet divIcon (avoids the default marker asset that
// Vite does not bundle correctly).
const pinIcon = L.divIcon({
  className: '',
  html: '<span style="display:block;width:26px;height:26px;border-radius:50%;background:#C1272D;border:2px solid #fff;box-shadow:0 0 3px rgba(0,0,0,.4)"></span>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

// Captures map clicks and reports the clicked coordinates upward.
function ClickCapture({ onPick }) {
  useMapEvents({
    click: (e) => onPick(e.latlng.lat, e.latlng.lng),
  });
  return null;
}

// Recentres the map when coords are set from the GPS button.
function RecenterOnCoords({ coords }) {
  const map = useMap();
  useEffect(() => {
    if (coords) map.setView([coords.lat, coords.lng], map.getZoom());
  }, [map, coords]);
  return null;
}

const validationSchema = yup.object({
  species: yup.string().required('Species is required').oneOf(SPECIES),
  block_number: yup.string().required('Block number is required'),
  floor_level: yup.string(),
  notes: yup
    .string()
    .required('Description is required')
    .trim()
    .max(500, 'Notes must be at most 500 characters'),
});

export default function FaunaLogSighting() {
  const navigate = useNavigate();
  const [apiError, setApiError] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [coords, setCoords] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const fileInputRef = useRef(null);

  const formik = useFormik({
    initialValues: {
      species: '',
      block_number: '',
      floor_level: '',
      behaviour_tags: [],
      notes: '',
    },
    validationSchema,
    onSubmit: async (values) => {
      setApiError('');
      try {
        const payload = { ...values };
        if (photoUrl) payload.photo_url = photoUrl;
        if (coords) {
          payload.gps_lat = coords.lat;
          payload.gps_lng = coords.lng;
        }
        await http.post('/api/fauna', payload);
        navigate('/fauna');
      } catch (err) {
        const data = err.response?.data?.error;
        setApiError(Array.isArray(data) ? data.join(', ') : data || 'Failed to log sighting');
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
      setPhotoUrl(res.data.url);
    } catch (err) {
      setUploadError(err.response?.data?.error || 'Upload failed');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = () => {
    setPhotoUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleToggleTag = (tag) => {
    const current = formik.values.behaviour_tags;
    const next = current.includes(tag)
      ? current.filter((t) => t !== tag)
      : [...current, tag];
    formik.setFieldValue('behaviour_tags', next);
  };

  const handleUseLocation = () => {
    setLocationError('');
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by this browser');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLocating(false);
      },
      (err) => {
        setLocationError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. You can still submit without GPS.'
            : 'Could not get your location. Please try again.'
        );
        setLocating(false);
      }
    );
  };

  return (
    <Box component="form" onSubmit={formik.handleSubmit} sx={{ maxWidth: 500, mx: 'auto', mt: 4 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>Log a Fauna Sighting</Typography>
      {apiError && <Alert severity="error" sx={{ mb: 2 }}>{apiError}</Alert>}

      <TextField
        select
        fullWidth
        margin="normal"
        label="Species"
        name="species"
        value={formik.values.species}
        onChange={formik.handleChange}
        onBlur={formik.handleBlur}
        error={formik.touched.species && Boolean(formik.errors.species)}
        helperText={formik.touched.species && formik.errors.species}
      >
        {SPECIES.map((s) => (
          <MenuItem key={s} value={s}>{speciesLabel(s)}</MenuItem>
        ))}
      </TextField>

      <TextField
        fullWidth
        margin="normal"
        label="Block Number"
        name="block_number"
        value={formik.values.block_number}
        onChange={formik.handleChange}
        onBlur={formik.handleBlur}
        error={formik.touched.block_number && Boolean(formik.errors.block_number)}
        helperText={formik.touched.block_number && formik.errors.block_number}
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

      <FormControl component="fieldset" sx={{ mt: 2 }}>
        <FormLabel component="legend">Behaviour Tags</FormLabel>
        <FormGroup row>
          {BEHAVIOUR_TAGS.map((tag) => (
            <FormControlLabel
              key={tag}
              control={
                <Checkbox
                  checked={formik.values.behaviour_tags.includes(tag)}
                  onChange={() => handleToggleTag(tag)}
                />
              }
              label={tag}
              sx={{ textTransform: 'capitalize' }}
            />
          ))}
        </FormGroup>
      </FormControl>

      {/* No `required` prop: it renders a native required attribute, whose
          constraint validation blocks submit before formik runs and shows a
          browser tooltip instead of the schema message. Species and block
          number have none either, so yup owns all three consistently. */}
      <TextField
        fullWidth
        multiline
        minRows={3}
        margin="normal"
        label="Notes"
        name="notes"
        value={formik.values.notes}
        onChange={formik.handleChange}
        onBlur={formik.handleBlur}
        error={formik.touched.notes && Boolean(formik.errors.notes)}
        helperText={formik.touched.notes && formik.errors.notes}
      />

      <Box sx={{ mt: 2 }}>
        <FormLabel component="legend">GPS Location</FormLabel>
        {locationError && <Alert severity="warning" sx={{ my: 1 }}>{locationError}</Alert>}
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1 }}>
          <Button variant="outlined" onClick={handleUseLocation} disabled={locating}>
            {locating ? 'Locating...' : 'Use My Location'}
          </Button>
          {coords && (
            <Typography variant="body2" color="text.secondary">
              {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
            </Typography>
          )}
        </Stack>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Or click on the map to drop a pin.
        </Typography>
        <Box sx={{ height: 250, mt: 1, borderRadius: 2, overflow: 'hidden', border: '1px solid #EAEAEA' }}>
          <MapContainer center={DEFAULT_CENTER} zoom={12} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <ClickCapture onPick={(lat, lng) => setCoords({ lat, lng })} />
            <RecenterOnCoords coords={coords} />
            {coords && <Marker position={[coords.lat, coords.lng]} icon={pinIcon} />}
          </MapContainer>
        </Box>
      </Box>

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
        {photoUrl && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
            <img
              src={photoUrl}
              alt="Uploaded preview"
              style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 4 }}
            />
            <Button color="error" onClick={handleRemovePhoto} size="small">
              Remove
            </Button>
          </Stack>
        )}
      </Box>

      <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
        <Button
          variant="outlined"
          color="secondary"
          onClick={() => navigate('/fauna')}
          disabled={formik.isSubmitting || uploading}
        >
          Cancel
        </Button>
        <Button fullWidth type="submit" variant="contained" disabled={formik.isSubmitting || uploading}>
          Log Sighting
        </Button>
      </Stack>
    </Box>
  );
}
