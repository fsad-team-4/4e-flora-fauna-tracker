import { useState, useEffect, useCallback } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, TextField, Grid, Card, CardActionArea, CardContent,
  Chip, Stack, InputAdornment, CircularProgress, Alert,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import http from '../http';
import { HEALTH_STATUS_LABELS, HEALTH_STATUS_COLORS } from '../constants';

// Debounce a value so we don't fire a request on every keystroke.
function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export default function HorticultureHandbook() {
  const [plantFamily, setPlantFamily] = useState('');
  const [siteSuitability, setSiteSuitability] = useState('');
  const [color, setColor] = useState('');
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const debouncedFamily = useDebouncedValue(plantFamily, 400);
  const debouncedSuitability = useDebouncedValue(siteSuitability, 400);
  const debouncedColor = useDebouncedValue(color, 400);

  const loadPlants = useCallback(() => {
    setLoading(true);
    const params = {};
    if (debouncedFamily) params.plant_family = debouncedFamily;
    if (debouncedSuitability) params.site_suitability = debouncedSuitability;
    if (debouncedColor) params.color = debouncedColor;

    http
      .get('/api/flora', { params })
      .then((res) => {
        setPlants(res.data);
        setError('');
      })
      .catch(() => setError('Failed to load the handbook.'))
      .finally(() => setLoading(false));
  }, [debouncedFamily, debouncedSuitability, debouncedColor]);

  useEffect(() => {
    loadPlants();
  }, [loadPlants]);

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto', mt: 4, px: 2 }}>
      <Typography variant="h5" sx={{ mb: 1 }}>Horticulture Handbook</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Browse botanical reference details for plants in the estate catalog.
      </Typography>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }}>
        <TextField
          fullWidth
          label="Plant Family"
          value={plantFamily}
          onChange={(e) => setPlantFamily(e.target.value)}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
          }}
        />
        <TextField
          fullWidth
          label="Site Suitability"
          value={siteSuitability}
          onChange={(e) => setSiteSuitability(e.target.value)}
        />
        <TextField
          fullWidth
          label="Color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : plants.length === 0 ? (
        <Typography color="text.secondary">No plants match these filters.</Typography>
      ) : (
        <Grid container spacing={2}>
          {plants.map((plant) => (
            <Grid item xs={12} sm={6} md={4} key={plant.id}>
              <Card variant="outlined">
                <CardActionArea component={RouterLink} to={`/flora/${plant.id}`}>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        {plant.species}
                      </Typography>
                      <Chip
                        size="small"
                        label={HEALTH_STATUS_LABELS[plant.health_status] || plant.health_status}
                        color={HEALTH_STATUS_COLORS[plant.health_status] || 'default'}
                      />
                    </Box>
                    {plant.common_name && (
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        {plant.common_name}
                      </Typography>
                    )}
                    {plant.plant_family && (
                      <Typography variant="body2">Family: {plant.plant_family}</Typography>
                    )}
                    {plant.site_suitability && (
                      <Typography variant="body2">Suitability: {plant.site_suitability}</Typography>
                    )}
                    {plant.color && (
                      <Typography variant="body2">Color: {plant.color}</Typography>
                    )}
                    {plant.max_height_at_maturity != null && (
                      <Typography variant="body2">
                        Max height: {plant.max_height_at_maturity} m
                      </Typography>
                    )}
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