import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, CardActionArea, CardContent, Chip, Alert,
  Stack, TextField, MenuItem, Button, CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import ParkOutlinedIcon from '@mui/icons-material/ParkOutlined';
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
      .catch(() => setError('Failed to load flora'))
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
    <Box sx={{ maxWidth: 760, mx: 'auto', mt: 4, mb: 6, px: 2 }}>
      {/* Page header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 3, gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h4">Flora Management</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Track estate greenery health and log new inspections.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate('/flora/add')}
        >
          Add Plant
        </Button>
      </Box>

      {/* CSV upload */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
            <UploadFileOutlinedIcon fontSize="small" color="action" />
            <Typography variant="h6">Bulk Import</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Upload a CSV export (e.g. from NParks) to add multiple records at once.
          </Typography>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            <Button variant="outlined" component="label" size="small">
              Choose File
              <input
                type="file"
                accept=".csv"
                hidden
                onChange={(e) => setCsvFile(e.target.files[0] || null)}
              />
            </Button>
            {csvFile && (
              <Typography variant="body2" color="text.secondary">{csvFile.name}</Typography>
            )}
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

      {/* Filter toolbar */}
      <Stack direction="row" spacing={2} sx={{ mb: 2 }} alignItems="center">
        <TextField
          select
          label="Health Status"
          size="small"
          value={healthFilter}
          onChange={(e) => setHealthFilter(e.target.value)}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">All statuses</MenuItem>
          {HEALTH_STATUS_OPTIONS.map((s) => (
            <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
          ))}
        </TextField>
        {!loading && !error && (
          <Typography variant="body2" color="text.secondary">
            {plants.length} plant{plants.length === 1 ? '' : 's'}
          </Typography>
        )}
      </Stack>

      {/* Loading state */}
      {loading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, py: 8 }}>
          <CircularProgress size={28} />
          <Typography variant="body2" color="text.secondary">Loading flora records...</Typography>
        </Box>
      )}

      {!loading && error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Empty state */}
      {!loading && !error && plants.length === 0 && (
        <Box
          sx={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 1.5, py: 8, textAlign: 'center',
          }}
        >
          <ParkOutlinedIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
          <Typography variant="h6" color="text.secondary">
            {healthFilter ? 'No plants match this filter' : 'No plants recorded yet'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 340 }}>
            {healthFilter
              ? 'Try a different health status, or clear the filter to see everything.'
              : 'Add your first plant record, or bulk-import a CSV to get started.'}
          </Typography>
          {!healthFilter && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => navigate('/flora/add')}
              sx={{ mt: 1 }}
            >
              Add Plant
            </Button>
          )}
        </Box>
      )}

      {/* Plant cards */}
      {!loading && !error && plants.map((plant) => {
        const statusColor = HEALTH_STATUS_COLORS[plant.health_status] || 'default';
        return (
          <Card
            key={plant.id}
            sx={{
              mb: 2,
              borderLeft: 4,
              borderLeftColor: `${statusColor}.main`,
              transition: 'box-shadow .15s, transform .15s',
            }}
          >
            <CardActionArea
              onClick={() => navigate(`/flora/${plant.id}`)}
              sx={{
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
                  <Box>
                    <Typography variant="h6" sx={{ lineHeight: 1.3 }}>{plant.species}</Typography>
                    {plant.common_name && (
                      <Typography color="text.secondary" variant="body2">{plant.common_name}</Typography>
                    )}
                  </Box>
                  <Chip
                    label={HEALTH_STATUS_LABELS[plant.health_status] || plant.health_status}
                    color={statusColor}
                    size="small"
                  />
                </Box>

                {plant.location_zone && (
                  <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 1 }}>
                    <LocationOnOutlinedIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                    <Typography variant="body2" color="text.secondary">{plant.location_zone}</Typography>
                  </Stack>
                )}
              </CardContent>
            </CardActionArea>
          </Card>
        );
      })}
    </Box>
  );
}