import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, CardActionArea, CardContent, Chip, Alert,
  Stack, TextField, MenuItem, Button,
} from '@mui/material';
import http from '../http';
import { HEALTH_STATUS_LABELS, HEALTH_STATUS_COLORS, HEALTH_STATUS_OPTIONS } from '../constants';

export default function FloraList() {
  const navigate = useNavigate();
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [healthFilter, setHealthFilter] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const [csvFile, setCsvFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadResult, setUploadResult] = useState(null);

  useEffect(() => {
    const params = {};
    if (healthFilter) params.health_status = healthFilter;

    http
      .get('/api/flora', { params })
      .then((res) => {
        setPlants(res.data);
        setError('');
      })
      .catch((err) => {
        if (err.response?.status === 403) {
          setError('You do not have permission to view flora records.');
        } else {
          setError('Failed to load flora. Please try again.');
        }
      })
      .finally(() => setLoading(false));
  }, [healthFilter, refreshKey]);

  const handleUpload = () => {
    if (!csvFile) return;
    setUploading(true);
    setUploadError('');
    setUploadResult(null);

    const formData = new FormData();
    formData.append('file', csvFile);

    http
      .post('/api/flora/bulk', formData)
      .then((res) => {
        setUploadResult(res.data);
        setCsvFile(null);
        setRefreshKey((k) => k + 1);
      })
      .catch(() => setUploadError('Failed to upload CSV'))
      .finally(() => setUploading(false));
  };

  return (
    <Box sx={{ maxWidth: 700, mx: 'auto', mt: 4 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>Flora</Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1 }}>CSV Upload</Typography>
          <Stack direction="row" spacing={2} alignItems="center">
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setCsvFile(e.target.files[0] || null)}
            />
            <Button
              variant="contained"
              onClick={handleUpload}
              disabled={!csvFile || uploading}
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </Button>
          </Stack>

          {uploadError && <Alert severity="error" sx={{ mt: 2 }}>{uploadError}</Alert>}

          {uploadResult && (
            <Alert severity="success" sx={{ mt: 2 }}>
              {uploadResult.created} record(s) created
              {uploadResult.errors && uploadResult.errors.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="body2">Row errors:</Typography>
                  {uploadResult.errors.map((e, i) => (
                    <Typography key={i} variant="body2">
                      Row {e.row}: {Array.isArray(e.error) ? e.error.join(', ') : e.error}
                    </Typography>
                  ))}
                </Box>
              )}
            </Alert>
          )}
        </CardContent>
      </Card>

      <Stack direction="row" spacing={2} sx={{ mb: 2 }} alignItems="center">
        <TextField
          select
          label="Health Status"
          size="small"
          value={healthFilter}
          onChange={(e) => setHealthFilter(e.target.value)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">All</MenuItem>
          {HEALTH_STATUS_OPTIONS.map((s) => (
            <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
          ))}
        </TextField>
        <Button variant="contained" onClick={() => navigate('/flora/add')}>
          Add Plant
        </Button>
      </Stack>

      {loading && <Typography>Loading...</Typography>}
      {!loading && error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!loading && !error && plants.length === 0 && (
        <Typography>No flora found</Typography>
      )}

      {!loading && !error && plants.map((plant) => (
        <Card key={plant.id} sx={{ mb: 2 }}>
          <CardActionArea onClick={() => navigate(`/flora/${plant.id}`)}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6">{plant.species}</Typography>
                <Chip
                  label={HEALTH_STATUS_LABELS[plant.health_status] || plant.health_status}
                  color={HEALTH_STATUS_COLORS[plant.health_status] || 'default'}
                  size="small"
                />
              </Box>
              {plant.common_name && (
                <Typography color="text.secondary">{plant.common_name}</Typography>
              )}
              {plant.location_zone && (
                <Typography variant="body2">Zone: {plant.location_zone}</Typography>
              )}
            </CardContent>
          </CardActionArea>
        </Card>
      ))}
    </Box>
  );
}
