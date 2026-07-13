import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, CardActionArea, CardContent, Chip, Alert,
  Stack, TextField, MenuItem, Button, Skeleton, InputAdornment, Divider, IconButton,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import CloseIcon from '@mui/icons-material/Close';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import ParkOutlinedIcon from '@mui/icons-material/ParkOutlined';
import SearchIcon from '@mui/icons-material/Search';
import SortIcon from '@mui/icons-material/Sort';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined';
import PriorityHighIcon from '@mui/icons-material/PriorityHigh';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import http from '../http';
import { HEALTH_STATUS_LABELS, HEALTH_STATUS_COLORS, HEALTH_STATUS_OPTIONS } from '../constants';

const HEALTH_SEVERITY_RANK = { critical: 0, at_risk: 1, healthy: 2 };

// Plain CSS grid instead of MUI's <Grid> component - guarantees equal-width
// cards regardless of MUI version differences in the Grid API.
const CARD_GRID_SX = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: 2,
};

const SORT_OPTIONS = [
  { value: 'species_asc', label: 'Species (A-Z)' },
  { value: 'species_desc', label: 'Species (Z-A)' },
  { value: 'health_severity', label: 'Health (critical first)' },
  { value: 'health_severity_desc', label: 'Health (healthy first)' },
  { value: 'zone_asc', label: 'Location Zone (A-Z)' },
];

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

// One small breakdown item within the metrics card (icon + label + count + %),
// as opposed to a full standalone card - keeps the whole metrics area reading
// as one cohesive panel instead of several disconnected boxes.
function BreakdownStat({ label, count, color, icon, percent }) {
  return (
    <Box sx={{ minWidth: 110 }}>
      <Stack direction="row" spacing={0.75} alignItems="center">
        <Box sx={{ color: `${color}.main`, display: 'flex' }}>{icon}</Box>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
      </Stack>
      <Stack direction="row" alignItems="baseline" spacing={0.75}>
        <Typography variant="h5" sx={{ color: `${color}.main`, fontWeight: 800 }}>
          {count}
        </Typography>
        <Typography variant="caption" color="text.secondary">{percent}%</Typography>
      </Stack>
    </Box>
  );
}

function PlantCardSkeleton() {
  return (
    <Card sx={{ borderLeft: 4, borderLeftColor: 'divider' }}>
      <CardContent>
        <Skeleton variant="text" width="70%" height={32} />
        <Skeleton variant="text" width="40%" />
        <Skeleton variant="text" width="55%" sx={{ mt: 1 }} />
      </CardContent>
    </Card>
  );
}

export default function FloraList() {
  const navigate = useNavigate();
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [healthFilter, setHealthFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('species_asc');
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

  // Stats are computed off the full server-filtered set (before search/sort),
  // so the metrics panel reflects "what health_status filter is active", not
  // the narrower text-searched subset.
  const stats = useMemo(() => {
    const counts = { healthy: 0, at_risk: 0, critical: 0 };
    plants.forEach((p) => {
      if (counts[p.health_status] !== undefined) counts[p.health_status] += 1;
    });
    const total = plants.length;
    const pct = (n) => (total === 0 ? 0 : Math.round((n / total) * 100));
    const zones = new Set(plants.map((p) => p.location_zone).filter(Boolean));
    const needsAttention = counts.at_risk + counts.critical;
    return { ...counts, total, pct, zoneCount: zones.size, needsAttention };
  }, [plants]);

  const visiblePlants = useMemo(() => {
    let result = plants;

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (p) =>
          p.species.toLowerCase().includes(q) ||
          (p.common_name || '').toLowerCase().includes(q)
      );
    }

    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'species_desc':
          return b.species.localeCompare(a.species);
        case 'health_severity':
          return HEALTH_SEVERITY_RANK[a.health_status] - HEALTH_SEVERITY_RANK[b.health_status];
        case 'health_severity_desc':
          return HEALTH_SEVERITY_RANK[b.health_status] - HEALTH_SEVERITY_RANK[a.health_status];
        case 'zone_asc':
          return (a.location_zone || '').localeCompare(b.location_zone || '');
        case 'species_asc':
        default:
          return a.species.localeCompare(b.species);
      }
    });

    return result;
  }, [plants, searchQuery, sortBy]);

  const filtersActive = Boolean(searchQuery || healthFilter);

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', mt: 4, mb: 6, px: 2 }}>
      {/* Page header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 3, gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Stack direction="row" spacing={1.25} alignItems="center">
            <ParkOutlinedIcon sx={{ color: 'primary.main', fontSize: 30 }} />
            <Typography variant="h4">Flora Management</Typography>
          </Stack>
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

      {/* Needs-attention banner - only shown when it's actually true, directly
          serves the client priority of early detection for deteriorating
          greenery (per the task allocation's stated client priorities). */}
      {!loading && !error && stats.needsAttention > 0 && (
        <Box
          sx={{
            display: 'flex', alignItems: 'flex-start', gap: 1.5,
            bgcolor: (theme) => alpha(theme.palette.error.main, 0.08),
            border: (theme) => `1px solid ${alpha(theme.palette.error.main, 0.25)}`,
            borderRadius: 2, p: 2, mb: 3,
          }}
        >
          <PriorityHighIcon sx={{ color: 'error.main', mt: 0.25 }} />
          <Box>
            <Typography sx={{ fontWeight: 700, color: 'error.dark' }}>
              {stats.needsAttention} plant{stats.needsAttention === 1 ? '' : 's'} need{stats.needsAttention === 1 ? 's' : ''} attention
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {stats.critical > 0 && `${stats.critical} critical`}
              {stats.critical > 0 && stats.at_risk > 0 && ' · '}
              {stats.at_risk > 0 && `${stats.at_risk} at risk`}
              {' - review and treat before the condition worsens.'}
            </Typography>
          </Box>
        </Box>
      )}

      {/* Unified metrics panel: total (separated by a divider) + health
          breakdown + zone coverage + a proportional distribution bar. One
          cohesive card rather than several disconnected boxes. */}
      {!loading && !error && plants.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Stack
              direction="row"
              spacing={3}
              alignItems="center"
              flexWrap="wrap"
              useFlexGap
              divider={<Divider orientation="vertical" flexItem />}
            >
              <Box sx={{ minWidth: 110 }}>
                <Typography variant="body2" color="text.secondary">Total Plants</Typography>
                <Typography variant="h3" sx={{ fontWeight: 800 }}>{stats.total}</Typography>
              </Box>

              <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
                <BreakdownStat
                  label="Healthy"
                  count={stats.healthy}
                  color="success"
                  icon={<CheckCircleOutlineIcon fontSize="small" />}
                  percent={stats.pct(stats.healthy)}
                />
                <BreakdownStat
                  label="At Risk"
                  count={stats.at_risk}
                  color="warning"
                  icon={<WarningAmberOutlinedIcon fontSize="small" />}
                  percent={stats.pct(stats.at_risk)}
                />
                <BreakdownStat
                  label="Critical"
                  count={stats.critical}
                  color="error"
                  icon={<ErrorOutlineIcon fontSize="small" />}
                  percent={stats.pct(stats.critical)}
                />
              </Stack>

              <Box sx={{ minWidth: 110 }}>
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <MapOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                  <Typography variant="body2" color="text.secondary">Zones Covered</Typography>
                </Stack>
                <Typography variant="h5" sx={{ fontWeight: 800 }}>{stats.zoneCount}</Typography>
              </Box>
            </Stack>

            {/* Proportional health distribution bar */}
            <Box sx={{ mt: 2.5 }}>
              <Box
                sx={{
                  display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden',
                  bgcolor: 'action.hover',
                }}
              >
                {stats.healthy > 0 && (
                  <Box sx={{ width: `${stats.pct(stats.healthy)}%`, bgcolor: 'success.main' }} />
                )}
                {stats.at_risk > 0 && (
                  <Box sx={{ width: `${stats.pct(stats.at_risk)}%`, bgcolor: 'warning.main' }} />
                )}
                {stats.critical > 0 && (
                  <Box sx={{ width: `${stats.pct(stats.critical)}%`, bgcolor: 'error.main' }} />
                )}
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

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
          <Box
            component="label"
            sx={{
              display: 'flex', alignItems: 'center', gap: 2,
              border: '2px dashed', borderColor: csvFile ? 'primary.main' : 'divider',
              borderRadius: 2, p: 2.5, cursor: 'pointer',
              bgcolor: csvFile ? (theme) => alpha(theme.palette.primary.main, 0.04) : 'action.hover',
              transition: 'border-color .15s, background-color .15s',
              '&:hover': { borderColor: 'primary.main' },
            }}
          >
            <UploadFileOutlinedIcon sx={{ fontSize: 32, color: csvFile ? 'primary.main' : 'text.disabled' }} />
            <Box sx={{ flexGrow: 1 }}>
              <Typography sx={{ fontWeight: 600 }}>
                {csvFile ? csvFile.name : 'Click to choose a CSV file'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {csvFile ? 'Ready to upload' : 'species, common_name, location_zone, health_status and more'}
              </Typography>
            </Box>
            {csvFile && (
              <IconButton
                size="small"
                aria-label="Remove selected file"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setCsvFile(null);
                }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            )}
            <input
              type="file"
              accept=".csv"
              hidden
              onChange={(e) => setCsvFile(e.target.files[0] || null)}
            />
          </Box>

          <Button
            variant="contained"
            onClick={handleUpload}
            disabled={!csvFile || uploading}
            sx={{ mt: 2 }}
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </Button>

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

      {/* Filter / search / sort toolbar */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
            <SearchIcon fontSize="small" color="action" />
            <Typography variant="h6">Search &amp; Filter</Typography>
          </Stack>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <TextField
              placeholder="Search by species or name"
              size="small"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              sx={{ minWidth: 240, flexGrow: 1 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
              }}
            />
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
                <MenuItem key={s.value} value={s.value}>
                  <StatusDot color={HEALTH_STATUS_COLORS[s.value]} />
                  {s.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Sort by"
              size="small"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              sx={{ minWidth: 210 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SortIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
              }}
            >
              {SORT_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </TextField>
          </Stack>
        </CardContent>
      </Card>

      {/* Contextual line - only shown once a filter/search narrows the list,
          since the always-true total now lives in the metrics panel. */}
      {!loading && !error && filtersActive && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Showing {visiblePlants.length} of {plants.length} plants matching your filters
        </Typography>
      )}
      {!loading && !error && !filtersActive && <Box sx={{ mb: 2 }} />}

      {/* Loading state - skeleton cards */}
      {loading && (
        <Box sx={CARD_GRID_SX}>
          {Array.from({ length: 6 }).map((_, i) => (
            <PlantCardSkeleton key={i} />
          ))}
        </Box>
      )}

      {!loading && error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Empty state */}
      {!loading && !error && visiblePlants.length === 0 && (
        <Box
          sx={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 1.5, py: 8, textAlign: 'center',
          }}
        >
          <ParkOutlinedIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
          <Typography variant="h6" color="text.secondary">
            {filtersActive ? 'No plants match your search or filter' : 'No plants recorded yet'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 340 }}>
            {filtersActive
              ? 'Try a different search term or health status, or clear the filters.'
              : 'Add your first plant record, or bulk-import a CSV to get started.'}
          </Typography>
          {!filtersActive && (
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

      {/* Plant cards - equal-width CSS grid */}
      {!loading && !error && visiblePlants.length > 0 && (
        <Box sx={CARD_GRID_SX}>
          {visiblePlants.map((plant) => {
            const statusColor = HEALTH_STATUS_COLORS[plant.health_status] || 'default';
            return (
              <Card
                key={plant.id}
                sx={{
                  height: '100%',
                  borderLeft: 4,
                  borderLeftColor: `${statusColor}.main`,
                }}
              >
                <CardActionArea
                  onClick={() => navigate(`/flora/${plant.id}`)}
                  sx={{ height: '100%', '&:hover': { bgcolor: 'action.hover' } }}
                >
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="h6" sx={{ lineHeight: 1.3 }} noWrap>
                          {plant.species}
                        </Typography>
                        {plant.common_name && (
                          <Typography color="text.secondary" variant="body2" noWrap>
                            {plant.common_name}
                          </Typography>
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
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {plant.location_zone}
                        </Typography>
                      </Stack>
                    )}
                  </CardContent>
                </CardActionArea>
              </Card>
            );
          })}
        </Box>
      )}
    </Box>
  );
}