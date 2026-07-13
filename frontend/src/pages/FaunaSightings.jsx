import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, CardActionArea, CardContent, Chip, Alert,
  Stack, TextField, MenuItem, Grid,
} from '@mui/material';
import PetsIcon from '@mui/icons-material/Pets';
import FlutterDashIcon from '@mui/icons-material/FlutterDash';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import http from '../http';
import { STATUS_COLORS, STATUS_OPTIONS } from '../constants';

const SPECIES_OPTIONS = ['cat', 'pigeon', 'crow', 'mynah', 'other'];

// Species -> MUI icon element. Birds get a bird icon, cats a paw, anything else a
// neutral marker. Spreads props so it works in chips and larger headers alike.
function SpeciesIcon({ species, ...props }) {
  if (species === 'cat') return <PetsIcon {...props} />;
  if (species === 'other') return <HelpOutlineRoundedIcon {...props} />;
  return <FlutterDashIcon {...props} />; // pigeon, crow, mynah
}

export default function FaunaSightings() {
  const navigate = useNavigate();
  const [sightings, setSightings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [speciesFilter, setSpeciesFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    const params = {};
    if (speciesFilter) params.species = speciesFilter;
    if (statusFilter) params.status = statusFilter;

    setLoading(true);
    http
      .get('/api/fauna', { params })
      .then((res) => {
        setSightings(res.data);
        setError('');
      })
      .catch(() => setError('Failed to load fauna sightings'))
      .finally(() => setLoading(false));
  }, [speciesFilter, statusFilter]);

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto', mt: 4 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>Fauna Sightings</Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <TextField
          select
          label="Species"
          size="small"
          value={speciesFilter}
          onChange={(e) => setSpeciesFilter(e.target.value)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">All</MenuItem>
          {SPECIES_OPTIONS.map((s) => (
            <MenuItem key={s} value={s}>{s}</MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Status"
          size="small"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">All</MenuItem>
          {STATUS_OPTIONS.map((s) => (
            <MenuItem key={s} value={s}>{s}</MenuItem>
          ))}
        </TextField>
      </Stack>

      {loading && <Typography>Loading...</Typography>}
      {!loading && error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!loading && !error && sightings.length === 0 && (
        <Typography>No fauna sightings found</Typography>
      )}

      {!loading && !error && sightings.length > 0 && (
        <Grid container spacing={2}>
          {sightings.map((sighting) => (
            <Grid key={sighting.id} size={{ xs: 12, sm: 6, md: 4 }}>
              <Card sx={{ height: '100%' }}>
                <CardActionArea
                  onClick={() => navigate(`/fauna/${sighting.id}`)}
                  sx={{ height: '100%', alignItems: 'stretch' }}
                >
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Chip
                        icon={<SpeciesIcon species={sighting.species} />}
                        label={sighting.species}
                        size="small"
                        sx={{ textTransform: 'capitalize' }}
                      />
                      <Chip
                        label={sighting.status}
                        color={STATUS_COLORS[sighting.status] || 'default'}
                        size="small"
                      />
                    </Box>
                    {sighting.block_number && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
                        <LocationOnIcon fontSize="small" color="action" />
                        <Typography>Block: {sighting.block_number}</Typography>
                      </Box>
                    )}
                    {sighting.floor_level && (
                      <Typography variant="body2">Floor: {sighting.floor_level}</Typography>
                    )}
                    <Typography variant="body2">By: {sighting.reporter?.name || 'Unknown'}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(sighting.createdAt).toLocaleString()}
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
