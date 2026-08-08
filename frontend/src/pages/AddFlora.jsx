import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFormik } from 'formik';
import * as yup from 'yup';
import {
  Box, TextField, Button, Typography, Alert, MenuItem, Stack, Card,
  CardContent, Divider, Chip, Autocomplete, Dialog, DialogTitle,
  DialogContent, DialogActions,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ParkOutlinedIcon from '@mui/icons-material/ParkOutlined';
import LocalFloristOutlinedIcon from '@mui/icons-material/LocalFloristOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import TipsAndUpdatesOutlinedIcon from '@mui/icons-material/TipsAndUpdatesOutlined';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import http from '../http';
import { HEALTH_STATUS_OPTIONS, HEALTH_STATUS_LABELS, HEALTH_STATUS_COLORS } from '../constants';
import { SINGAPORE_LOCATIONS } from '../constants/singaporeLocations';

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

const validationSchema = yup.object({
  species: yup.string().required('Species is required'),
  common_name: yup.string(),
  plant_family: yup.string(),
  site_suitability: yup.string(),
  color: yup.string(),
  max_height_at_maturity: yup
    .number()
    .transform((value) => (isNaN(value) ? null : value))
    .positive('Max height must be a positive number')
    .nullable(),
});

const makeLocation = (key) => ({
  key,
  location: '',
  location_zone: '',
  health_status: 'healthy',
  health_notes: '',
  imageUrl: '',
  uploading: false,
  uploadError: '',
  submitError: '',
  gps_lat: null,
  gps_lng: null,
  gpsLoading: false,
  gpsError: '',
  locationAutoFillNote: '',
  identifyLoading: false,
  identifyError: '',
  identifySuggestion: null,
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
  const [submitErrors, setSubmitErrors] = useState([]);
  const [savedCount, setSavedCount] = useState(0);
  const [locations, setLocations] = useState([makeLocation(0)]);
  const [speciesCatalog, setSpeciesCatalog] = useState([]);
  const [autofilled, setAutofilled] = useState({
    plant_family: false,
    site_suitability: false,
    color: false,
    max_height_at_maturity: false,
  });
  const nextKeyRef = useRef(1);
  const fileInputRefs = useRef({});
  const [mapPickerKey, setMapPickerKey] = useState(null);
  const [pickedCoords, setPickedCoords] = useState(null);
  const [reverseGeocoding, setReverseGeocoding] = useState(false);
  const [reverseGeocodeError, setReverseGeocodeError] = useState('');

  useEffect(() => {
    http.get('/api/flora/species-catalog')
      .then((res) => setSpeciesCatalog(res.data))
      .catch(() => setSpeciesCatalog([]));
  }, []);

  const updateLocationField = (key, field, value) => {
    setLocations((prev) => prev.map((loc) => (loc.key === key ? { ...loc, [field]: value } : loc)));
  };

  const addLocation = () => {
    setLocations((prev) => [...prev, makeLocation(nextKeyRef.current++)]);
  };

  const removeLocation = (key) => {
    setLocations((prev) => (prev.length > 1 ? prev.filter((loc) => loc.key !== key) : prev));
  };

  const handleLocationFileChange = async (key, event) => {
    const file = event.target.files[0];
    if (!file) return;

    updateLocationField(key, 'uploadError', '');
    updateLocationField(key, 'uploading', true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await http.post('/api/uploads', formData);
      updateLocationField(key, 'imageUrl', res.data.url);
    } catch (err) {
      updateLocationField(key, 'uploadError', err.response?.data?.error || 'Upload failed');
      // reset the input so the same file can be retried
      const input = fileInputRefs.current[key];
      if (input) input.value = '';
    } finally {
      updateLocationField(key, 'uploading', false);
    }
  };

  const handleRemovePhoto = (key) => {
    updateLocationField(key, 'imageUrl', '');
    const input = fileInputRefs.current[key];
    if (input) input.value = '';
  };

  const handleCaptureGps = (key) => {
    if (!navigator.geolocation) {
      updateLocationField(key, 'gpsError', 'Geolocation is not supported by this browser');
      return;
    }

    updateLocationField(key, 'gpsError', '');
    updateLocationField(key, 'gpsLoading', true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        updateLocationField(key, 'gps_lat', position.coords.latitude);
        updateLocationField(key, 'gps_lng', position.coords.longitude);
        updateLocationField(key, 'gpsLoading', false);
      },
      (err) => {
        const message = err.code === err.PERMISSION_DENIED
          ? 'Location permission denied'
          : err.code === err.TIMEOUT
            ? 'Location request timed out'
            : 'Unable to retrieve location';
        updateLocationField(key, 'gpsError', message);
        updateLocationField(key, 'gpsLoading', false);
      }
    );
  };

const openMapPicker = (key) => {
    setMapPickerKey(key);
    setPickedCoords(null);
    setReverseGeocodeError('');
  };

  const closeMapPicker = () => {
    setMapPickerKey(null);
    setPickedCoords(null);
    setReverseGeocoding(false);
    setReverseGeocodeError('');
  };

  // Picks the most sensible short place name out of Nominatim's address
  // breakdown - suburb reads best for estate locations, falling back to
  // broader areas when it's missing.
  const pickPlaceName = (data) => {
    const address = data?.address || {};
    return (
      address.suburb ||
      address.neighbourhood ||
      address.city_district ||
      data?.display_name ||
      ''
    );
  };

  // Looks for a SINGAPORE_LOCATIONS entry inside Nominatim's address fields
  // so the canonical Location value can be auto-selected when possible.
  const matchSingaporeLocation = (data) => {
    const address = data?.address || {};
    const haystack = [
      address.suburb,
      address.neighbourhood,
      address.city_district,
      data?.display_name,
    ]
      .filter(Boolean)
      .join(' | ')
      .toLowerCase();

    return SINGAPORE_LOCATIONS.find((entry) => haystack.includes(entry.toLowerCase())) || '';
  };

  const confirmMapPicker = async () => {
    if (!pickedCoords || mapPickerKey === null) {
      closeMapPicker();
      return;
    }

    const key = mapPickerKey;
    updateLocationField(key, 'gps_lat', pickedCoords.lat);
    updateLocationField(key, 'gps_lng', pickedCoords.lng);
    updateLocationField(key, 'locationAutoFillNote', '');

    setReverseGeocodeError('');
    setReverseGeocoding(true);

    const autoFillFailedNote = "Couldn't auto-fill location name from the map pin - please type it manually.";
    const locationZoneOnlyNote = 'Location zone filled from map pin - please select the Location area manually.';
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${pickedCoords.lat}&lon=${pickedCoords.lng}`
      );
      const data = await res.json();
      const placeName = pickPlaceName(data);
      if (placeName) {
        updateLocationField(key, 'location_zone', placeName);

        const matchedLocation = matchSingaporeLocation(data);
        if (matchedLocation) {
          updateLocationField(key, 'location', matchedLocation);
        } else {
          updateLocationField(key, 'locationAutoFillNote', locationZoneOnlyNote);
        }
      } else {
        updateLocationField(key, 'locationAutoFillNote', autoFillFailedNote);
      }
    } catch {
      updateLocationField(key, 'locationAutoFillNote', autoFillFailedNote);
    } finally {
      setReverseGeocoding(false);
    }

    closeMapPicker();
  };

  const handleIdentifySpecies = async (key) => {
    updateLocationField(key, 'identifyError', '');
    updateLocationField(key, 'identifySuggestion', null);
    updateLocationField(key, 'identifyLoading', true);

    const loc = locations.find((l) => l.key === key);
    try {
      const res = await http.post('/api/flora/identify-species', { image_url: loc.imageUrl });
      updateLocationField(key, 'identifySuggestion', res.data);
    } catch (err) {
      updateLocationField(key, 'identifyError', err.response?.data?.error || 'Species identification failed');
    } finally {
      updateLocationField(key, 'identifyLoading', false);
    }
  };

  const formik = useFormik({
    initialValues: {
      species: '',
      common_name: '',
      plant_family: '',
      site_suitability: '',
      color: '',
      max_height_at_maturity: '',
    },
    validationSchema,
    onSubmit: async (values) => {
      setApiError('');
      setSubmitErrors([]);
      setSavedCount(0);

      if (locations.some((loc) => !loc.health_status)) {
        setApiError('Each location must have a health status.');
        return;
      }

      const results = await Promise.allSettled(
        locations.map((loc) =>
          http.post('/api/flora', {
            ...values,
            location: loc.location,
            location_zone: loc.location_zone,
            health_status: loc.health_status,
            health_notes: loc.health_notes,
            image_url: loc.imageUrl || null,
            gps_lat: loc.gps_lat,
            gps_lng: loc.gps_lng,
          })
        )
      );

      const failures = [];
      const remaining = [];

      results.forEach((result, index) => {
        const loc = locations[index];
        if (result.status === 'rejected') {
          const data = result.reason?.response?.data?.error;
          const message = Array.isArray(data) ? data.join(', ') : data || 'Failed to add plant';
          failures.push({ label: loc.location_zone.trim() || `Location ${index + 1}`, message });
          remaining.push({ ...loc, submitError: message });
        }
      });

      if (failures.length === 0) {
        navigate('/flora');
        return;
      }

      // Only the failed locations stay on the form - the successful ones are
      // already saved, so leaving them would let the user accidentally
      // resubmit and create duplicates.
      setSavedCount(locations.length - failures.length);
      setSubmitErrors(failures);
      setLocations(remaining);
    },
  });

  const handleSpeciesSelect = (_e, newValue) => {
    formik.setFieldValue('species', newValue || '');

    const match = speciesCatalog.find((entry) => entry.species === newValue);
    if (!match) return;

    ['plant_family', 'site_suitability', 'color', 'max_height_at_maturity'].forEach((field) => {
      if ((!formik.values[field] || autofilled[field]) && match[field] != null) {
        formik.setFieldValue(field, match[field]);
        setAutofilled((prev) => ({ ...prev, [field]: true }));
      }
    });
  };

  const handleUseSuggestion = (key, species) => {
    handleSpeciesSelect(null, species);
    updateLocationField(key, 'identifySuggestion', null);
  };

  const anyUploading = locations.some((loc) => loc.uploading);

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
        <Box component="form" onSubmit={formik.handleSubmit}>
          {apiError && <Alert severity="error" sx={{ mb: 3 }}>{apiError}</Alert>}

          {submitErrors.length > 0 && (
            <Alert severity="error" sx={{ mb: 3 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                {savedCount > 0
                  ? `${savedCount} location(s) were saved successfully and have been removed from this form. The location(s) below failed - fix and resubmit just these:`
                  : 'The following location(s) failed to save:'}
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {submitErrors.map((failure, index) => (
                  <Box component="li" key={index}>
                    <Typography variant="body2">{failure.label}: {failure.message}</Typography>
                  </Box>
                ))}
              </Box>
            </Alert>
          )}

          <Stack spacing={4}>
            <Card sx={{ borderTop: 4, borderTopColor: 'success.main', boxShadow: '0 4px 16px rgba(0,0,0,.05)' }}>
              <CardContent sx={{ p: { xs: 3, sm: 4.5 } }}>
                <SectionHeading
                  icon={<ParkOutlinedIcon color="success" />}
                  title="Species Details"
                  subtitle="Identifies the species - applies to every location added below"
                />

                <Stack spacing={2.5}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <Autocomplete
                      freeSolo
                      fullWidth
                      sx={{ flex: 1 }}
                      options={speciesCatalog.map((entry) => entry.species)}
                      value={formik.values.species}
                      onChange={handleSpeciesSelect}
                      onInputChange={(e, newInputValue) => formik.setFieldValue('species', newInputValue)}
                      renderInput={(params) => (
                        <TextField
                          {...params}
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
                      sx={{ flex: 1 }}
                      label="Common Name"
                      name="common_name"
                      value={formik.values.common_name}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                    />
                  </Stack>
                </Stack>
              </CardContent>
            </Card>

            <Card sx={{ borderTop: 4, borderTopColor: 'primary.main', boxShadow: '0 4px 16px rgba(0,0,0,.05)' }}>
              <CardContent sx={{ p: { xs: 3, sm: 4.5 } }}>
                <SectionHeading
                  icon={<LocalFloristOutlinedIcon color="primary" />}
                  title="Botanical Catalog Details"
                  subtitle="Optional - powers the Horticulture Handbook browse view"
                />

                <Stack spacing={2.5}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField
                      fullWidth
                      sx={{ flex: 1 }}
                      label="Plant Family"
                      name="plant_family"
                      value={formik.values.plant_family}
                      onChange={(e) => {
                        setAutofilled((prev) => ({ ...prev, plant_family: false }));
                        formik.handleChange(e);
                      }}
                      onBlur={formik.handleBlur}
                    />
                    <TextField
                      fullWidth
                      sx={{ flex: 1 }}
                      label="Site Suitability"
                      name="site_suitability"
                      value={formik.values.site_suitability}
                      onChange={(e) => {
                        setAutofilled((prev) => ({ ...prev, site_suitability: false }));
                        formik.handleChange(e);
                      }}
                      onBlur={formik.handleBlur}
                    />
                  </Stack>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField
                      fullWidth
                      sx={{ flex: 1 }}
                      label="Color"
                      name="color"
                      value={formik.values.color}
                      onChange={(e) => {
                        setAutofilled((prev) => ({ ...prev, color: false }));
                        formik.handleChange(e);
                      }}
                      onBlur={formik.handleBlur}
                    />
                    <TextField
                      fullWidth
                      sx={{ flex: 1 }}
                      type="number"
                      label="Max Height at Maturity (metres)"
                      name="max_height_at_maturity"
                      value={formik.values.max_height_at_maturity}
                      onChange={(e) => {
                        setAutofilled((prev) => ({ ...prev, max_height_at_maturity: false }));
                        formik.handleChange(e);
                      }}
                      onBlur={formik.handleBlur}
                      error={formik.touched.max_height_at_maturity && Boolean(formik.errors.max_height_at_maturity)}
                      helperText={formik.touched.max_height_at_maturity && formik.errors.max_height_at_maturity}
                    />
                  </Stack>
                </Stack>
              </CardContent>
            </Card>

            <Card sx={{ borderTop: 4, borderTopColor: 'secondary.main', boxShadow: '0 4px 16px rgba(0,0,0,.05)' }}>
              <CardContent sx={{ p: { xs: 3, sm: 4.5 } }}>
                <SectionHeading
                  icon={<LocationOnOutlinedIcon color="secondary" />}
                  title="Locations"
                  subtitle="Add every location this species is planted at, each with its own health status and photo"
                />

                {locations.map((loc, index) => (
                  <Card key={loc.key} variant="outlined" sx={{ mb: 3 }}>
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                        <Typography variant="subtitle1">Location {index + 1}</Typography>
                        {locations.length > 1 && (
                          <Button color="error" size="small" onClick={() => removeLocation(loc.key)}>
                            Remove
                          </Button>
                        )}
                      </Stack>

                      {loc.submitError && (
                        <Alert severity="error" sx={{ mb: 2 }}>{loc.submitError}</Alert>
                      )}

                      <Stack spacing={2.5}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                          <Autocomplete
                            freeSolo
                            fullWidth
                            sx={{ flex: 1 }}
                            options={SINGAPORE_LOCATIONS}
                            value={loc.location}
                            onChange={(e, newValue) => updateLocationField(loc.key, 'location', newValue || '')}
                            onInputChange={(e, newInputValue) => updateLocationField(loc.key, 'location', newInputValue)}
                            renderInput={(params) => (
                              <TextField {...params} label="Location" />
                            )}
                          />
                          <TextField
                            fullWidth
                            sx={{ flex: 1 }}
                            label="Location Zone"
                            value={loc.location_zone}
                            onChange={(e) => updateLocationField(loc.key, 'location_zone', e.target.value)}
                          />
                        </Stack>

                        <Box>
                          {loc.gpsError && <Alert severity="error" sx={{ mb: 1 }}>{loc.gpsError}</Alert>}
                          <Stack direction="row" spacing={1}>
                            <Button
                              variant="outlined"
                              size="small"
                              onClick={() => handleCaptureGps(loc.key)}
                              disabled={loc.gpsLoading}
                            >
                              {loc.gpsLoading ? 'Capturing...' : 'Capture GPS Location'}
                            </Button>
                            <Button
                              variant="outlined"
                              size="small"
                              onClick={() => openMapPicker(loc.key)}
                            >
                              Pick from Map
                            </Button>
                          </Stack>
                          {loc.gps_lat !== null && loc.gps_lng !== null && (
                            <Typography variant="body2" color="success.main" sx={{ mt: 0.5 }}>
                              Location captured ({loc.gps_lat.toFixed(5)}, {loc.gps_lng.toFixed(5)})
                            </Typography>
                          )}
                          {loc.locationAutoFillNote && (
                            <Typography variant="body2" color="warning.main" sx={{ mt: 0.5 }}>
                              {loc.locationAutoFillNote}
                            </Typography>
                          )}
                        </Box>

                        <TextField
                          select
                          fullWidth
                          label="Health Status"
                          value={loc.health_status}
                          onChange={(e) => updateLocationField(loc.key, 'health_status', e.target.value)}
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
                          label="Health Notes"
                          value={loc.health_notes}
                          onChange={(e) => updateLocationField(loc.key, 'health_notes', e.target.value)}
                        />
                      </Stack>

                      <Box sx={{ mt: 2 }}>
                        {loc.uploadError && <Alert severity="error" sx={{ mb: 1 }}>{loc.uploadError}</Alert>}
                        <Button variant="outlined" component="label" disabled={loc.uploading}>
                          {loc.uploading ? 'Uploading...' : 'Add Photo'}
                          <input
                            type="file"
                            hidden
                            accept="image/*"
                            ref={(el) => { fileInputRefs.current[loc.key] = el; }}
                            onChange={(e) => handleLocationFileChange(loc.key, e)}
                          />
                        </Button>
                        {loc.imageUrl && (
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                            <img
                              src={loc.imageUrl}
                              alt="Uploaded preview"
                              style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 4 }}
                            />
                            <Button color="error" onClick={() => handleRemovePhoto(loc.key)} size="small">
                              Remove
                            </Button>
                            <Button
                              variant="outlined"
                              size="small"
                              onClick={() => handleIdentifySpecies(loc.key)}
                              disabled={loc.identifyLoading}
                            >
                              {loc.identifyLoading ? 'Identifying...' : 'Identify Species'}
                            </Button>
                          </Stack>
                        )}

                        {loc.identifyError && (
                          <Alert severity="error" sx={{ mt: 1 }}>{loc.identifyError}</Alert>
                        )}

                        {loc.identifySuggestion && (
                          <Alert
                            severity="info"
                            sx={{ mt: 1 }}
                            onClose={() => updateLocationField(loc.key, 'identifySuggestion', null)}
                          >
                            {loc.identifySuggestion.raw ? (
                              <>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                  Could not be structured into a clean suggestion:
                                </Typography>
                                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.5 }}>
                                  {loc.identifySuggestion.raw}
                                </Typography>
                                <Button
                                  size="small"
                                  sx={{ mt: 1 }}
                                  onClick={() => updateLocationField(loc.key, 'identifySuggestion', null)}
                                >
                                  Dismiss
                                </Button>
                              </>
                            ) : (
                              <>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                  {loc.identifySuggestion.species}
                                </Typography>
                                {loc.identifySuggestion.confidence && (
                                  <Typography variant="body2" color="text.secondary">
                                    Confidence: {loc.identifySuggestion.confidence}
                                  </Typography>
                                )}
                                {loc.identifySuggestion.notes && (
                                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                                    {loc.identifySuggestion.notes}
                                  </Typography>
                                )}
                                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                                  <Button
                                    size="small"
                                    variant="contained"
                                    onClick={() => handleUseSuggestion(loc.key, loc.identifySuggestion.species)}
                                  >
                                    Use this species
                                  </Button>
                                  <Button
                                    size="small"
                                    onClick={() => updateLocationField(loc.key, 'identifySuggestion', null)}
                                  >
                                    Dismiss
                                  </Button>
                                </Stack>
                              </>
                            )}
                          </Alert>
                        )}
                      </Box>
                    </CardContent>
                  </Card>
                ))}

                <Button variant="text" startIcon={<AddIcon />} onClick={addLocation} sx={{ mb: 2 }}>
                  Add Another Location
                </Button>
              </CardContent>
            </Card>

            <Stack direction="row" spacing={2}>
              <Button
                variant="outlined"
                color="secondary"
                onClick={() => navigate('/flora')}
                disabled={formik.isSubmitting || anyUploading}
              >
                Cancel
              </Button>
              <Button fullWidth type="submit" variant="contained" disabled={formik.isSubmitting || anyUploading}>
                {formik.isSubmitting ? 'Saving...' : 'Add Plant'}
              </Button>
            </Stack>
          </Stack>
        </Box>

        <LivePreviewCard
          values={{
            ...formik.values,
            location_zone: locations[0].location_zone,
            health_status: locations[0].health_status,
          }}
        />
      </Box>

      <Dialog open={mapPickerKey !== null} onClose={closeMapPicker} maxWidth="sm" fullWidth>
        <DialogTitle>Pick Location from Map</DialogTitle>
        <DialogContent>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Click on the map to drop a pin.
          </Typography>
          <Box sx={{ height: 350, borderRadius: 2, overflow: 'hidden', border: '1px solid #EAEAEA' }}>
            <MapContainer center={DEFAULT_CENTER} zoom={12} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <ClickCapture onPick={(lat, lng) => setPickedCoords({ lat, lng })} />
              {pickedCoords && <Marker position={[pickedCoords.lat, pickedCoords.lng]} icon={pinIcon} />}
            </MapContainer>
          </Box>
          {pickedCoords && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {pickedCoords.lat.toFixed(5)}, {pickedCoords.lng.toFixed(5)}
            </Typography>
          )}
          {reverseGeocoding && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Looking up location name...
            </Typography>
          )}
          {reverseGeocodeError && (
            <Alert severity="warning" sx={{ mt: 1 }}>{reverseGeocodeError}</Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeMapPicker} disabled={reverseGeocoding}>Cancel</Button>
          <Button onClick={confirmMapPicker} variant="contained" disabled={!pickedCoords || reverseGeocoding}>
            {reverseGeocoding ? 'Saving...' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
