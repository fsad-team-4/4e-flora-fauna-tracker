import { useState, useEffect } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, Button, Chip, Alert, Stack, Divider,
  TextField, MenuItem, Link,
} from '@mui/material';
import PetsIcon from '@mui/icons-material/Pets';
import FlutterDashIcon from '@mui/icons-material/FlutterDash';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import http from '../http';
import { useUser } from '../contexts/UserContext';
import { STATUS_COLORS, STATUS_OPTIONS } from '../constants';

// Species -> MUI icon element. Birds get a bird icon, cats a paw, anything else a
// neutral marker. Spreads props so it works in chips and larger headers alike.
function SpeciesIcon({ species, ...props }) {
  if (species === 'cat') return <PetsIcon {...props} />;
  if (species === 'other') return <HelpOutlineRoundedIcon {...props} />;
  return <FlutterDashIcon {...props} />; // pigeon, crow, mynah
}

// Which agency handles each species (mirrors the backend AGENCY_MAP).
const AGENCY_MAP = {
  cat: 'Cat Welfare Society / SPCA',
  pigeon: 'ACRES',
  crow: 'ACRES',
  mynah: 'ACRES',
  other: 'Town Council to assess',
};

export default function FaunaSightingDetail() {
  const { id } = useParams();
  const { user } = useUser();
  const [sighting, setSighting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState('');

  const loadSighting = () =>
    http
      .get(`/api/fauna/${id}`)
      .then((res) => {
        setSighting(res.data);
        setNewStatus(res.data.status);
        setError('');
      })
      .catch((err) => {
        if (err.response?.status === 403) setError('You do not have access to this sighting.');
        else if (err.response?.status === 404) setError('Sighting not found.');
        else setError('Failed to load sighting.');
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    loadSighting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleUpdateStatus = async () => {
    setUpdateError('');
    setUpdating(true);
    try {
      await http.patch(`/api/fauna/${id}/status`, { status: newStatus });
      await loadSighting();
    } catch (err) {
      setUpdateError(err.response?.data?.error || 'Failed to update status');
    } finally {
      setUpdating(false);
    }
  };

  const canUpdate = user && (user.role === 'field_officer' || user.role === 'manager');

  return (
    <Box sx={{ maxWidth: 700, mx: 'auto', mt: 4 }}>
      <Button component={RouterLink} to="/fauna" sx={{ mb: 2 }}>
        &larr; Back
      </Button>

      {loading && <Typography>Loading...</Typography>}
      {!loading && error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && sighting && (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <SpeciesIcon species={sighting.species} color="action" />
              <Typography variant="h5" sx={{ textTransform: 'capitalize' }}>{sighting.species}</Typography>
            </Box>
            <Chip
              label={sighting.status}
              color={STATUS_COLORS[sighting.status] || 'default'}
            />
          </Box>

          <Alert severity="info" sx={{ my: 2 }}>
            Recommended agency: {AGENCY_MAP[sighting.species] || 'Town Council to assess'}
          </Alert>

          {sighting.block_number && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <LocationOnIcon fontSize="small" color="action" />
              <Typography>{sighting.block_number}</Typography>
            </Box>
          )}
          {sighting.floor_level && <Typography>Floor: {sighting.floor_level}</Typography>}
          {sighting.gps_lat != null && sighting.gps_lng != null && (
            <>
              <Typography>GPS: {sighting.gps_lat}, {sighting.gps_lng}</Typography>
              <Link
                href={`https://www.google.com/maps?q=${sighting.gps_lat},${sighting.gps_lng}`}
                target="_blank"
                rel="noopener noreferrer"
                variant="body2"
              >
                View on Google Maps
              </Link>
            </>
          )}
          <Typography>Reported by: {sighting.reporter?.name || 'Unknown'}</Typography>
          <Typography variant="caption" color="text.secondary">
            {new Date(sighting.createdAt).toLocaleString()}
          </Typography>

          {sighting.behaviour_tags?.length > 0 && (
            <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap' }}>
              {sighting.behaviour_tags.map((tag) => (
                <Chip key={tag} label={tag} size="small" />
              ))}
            </Stack>
          )}

          {sighting.notes && <Typography sx={{ mt: 2 }}>{sighting.notes}</Typography>}

          {sighting.photo_url && (
            <Box sx={{ mt: 2 }}>
              <a href={sighting.photo_url} target="_blank" rel="noreferrer">
                <img
                  src={sighting.photo_url}
                  alt="Sighting"
                  style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 4 }}
                />
              </a>
            </Box>
          )}

          {canUpdate && (
            <Box sx={{ mt: 3 }}>
              <Divider sx={{ mb: 2 }} />
              <Typography variant="h6" sx={{ mb: 1 }}>Update Status</Typography>
              {updateError && <Alert severity="error" sx={{ mb: 1 }}>{updateError}</Alert>}
              <Stack direction="row" spacing={2} alignItems="center">
                <TextField
                  select
                  label="Status"
                  size="small"
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  sx={{ minWidth: 160 }}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <MenuItem key={s} value={s}>{s}</MenuItem>
                  ))}
                </TextField>
                <Button
                  variant="contained"
                  onClick={handleUpdateStatus}
                  disabled={updating || newStatus === sighting.status}
                >
                  Update Status
                </Button>
              </Stack>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
