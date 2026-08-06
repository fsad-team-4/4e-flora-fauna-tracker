import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, TextField, Card, CardActionArea, CardContent,
  Chip, Stack, InputAdornment, Skeleton, Alert, Divider, MenuItem,
  Button, CircularProgress, IconButton,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import SearchIcon from '@mui/icons-material/Search';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import TerrainOutlinedIcon from '@mui/icons-material/TerrainOutlined';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import CloseIcon from '@mui/icons-material/Close';
import http from '../http';
import { HEALTH_STATUS_LABELS, HEALTH_STATUS_COLORS } from '../constants';
import { getPlantIcon } from '../utils/plantIcons';
import { toTitleCase } from '../utils/formatters';

// Plain CSS grid instead of MUI's <Grid> component - guarantees equal-width
// cards regardless of MUI version differences in the Grid API.
const CARD_GRID_SX = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: 2,
};

// Sanitize a family name into a safe DOM id for the jump-to-family scroll targets.
function familyId(family) {
  return `family-${family.replace(/[^a-zA-Z0-9]+/g, '-')}`;
}

// Debounce a value so we don't fire a request on every keystroke.
function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
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

// klemens - example questions for the "Ask the Handbook" AI query box
const EXAMPLE_QUESTIONS = [
  'Which trees should not be planted near carparks?',
  'What is safe to plant near a playground?',
  'Which plants are currently critical and why?',
  'What is the lowest-maintenance shade tree?',
];

export default function HorticultureHandbook() {
  const [plantFamily, setPlantFamily] = useState('');
  const [siteSuitability, setSiteSuitability] = useState('');
  const [color, setColor] = useState('');
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [jumpTarget, setJumpTarget] = useState('');

  // klemens - state for the AI query box
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState('');

  // state for the AI planting suggestions box
  const [condition, setCondition] = useState('');
  const [suggestions, setSuggestions] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState('');

  // Bulk Import (catalog upload)
  const [csvFile, setCsvFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadResult, setUploadResult] = useState(null);

  const debouncedFamily = useDebouncedValue(plantFamily, 400);
  const debouncedSuitability = useDebouncedValue(siteSuitability, 400);
  const debouncedColor = useDebouncedValue(color, 400);

  const loadPlants = useCallback(() => {
    setLoading(true);
    const params = {};
    if (debouncedFamily) params.plant_family = debouncedFamily;
    if (debouncedSuitability) params.site_suitability = debouncedSuitability;
    if (debouncedColor) params.color = debouncedColor;
    params.include_catalog = 'true';

    http
      .get('/api/flora', { params })
      .then((res) => {
        setPlants(res.data);
        setError('');
      })
      .catch((err) => {
        if (err.response?.status === 403) {
          setError('You do not have permission to view the Horticulture Handbook.');
        } else {
          setError('Failed to load the handbook. Please try again.');
        }
      })
      .finally(() => setLoading(false));
  }, [debouncedFamily, debouncedSuitability, debouncedColor]);

  useEffect(() => {
    loadPlants();
  }, [loadPlants]);

  const handleUpload = () => {
    if (!csvFile) return;
    setUploading(true);
    setUploadError('');
    setUploadResult(null);

    const formData = new FormData();
    formData.append('file', csvFile);
    formData.append('is_catalog_only', 'true');

    http
      .post('/api/flora/bulk', formData)
      .then((res) => {
        setUploadResult(res.data);
        setCsvFile(null);
        loadPlants();
      })
      .catch(() => setUploadError('Failed to upload CSV'))
      .finally(() => setUploading(false));
  };

  // klemens - submit a natural-language question to the AI catalog query endpoint
  const handleAsk = () => {
    setAsking(true);
    setAskError('');
    setAnswer('');
    http
      .post('/api/flora/query', { question: question.trim() })
      .then((res) => setAnswer(res.data.answer))
      .catch((err) => {
        if (err.response?.status === 503) {
          setAskError('AI querying is not configured (no API key set)');
        } else {
          setAskError(err.response?.data?.error || 'Failed to get an answer.');
        }
      })
      .finally(() => setAsking(false));
  };

  // submit a site condition to the AI planting suggestions endpoint
  const handleSuggest = () => {
    setSuggesting(true);
    setSuggestError('');
    setSuggestions('');
    http
      .post('/api/flora/planting-suggestions', { condition: condition.trim() })
      .then((res) => setSuggestions(res.data.suggestions))
      .catch((err) => {
        if (err.response?.status === 503) {
          setSuggestError('AI querying is not configured (no API key set)');
        } else {
          setSuggestError(err.response?.data?.error || 'Failed to get suggestions.');
        }
      })
      .finally(() => setSuggesting(false));
  };

  const filtersActive = Boolean(plantFamily || siteSuitability || color);

  // Group the already-fetched plants by plant_family for display - purely a
  // client-side reorganization, the API call and params are unchanged.
  // Families are sorted alphabetically with "Uncategorized" always last.
  const UNCATEGORIZED = 'Uncategorized';
  const familyGroups = useMemo(() => {
    const groups = new Map();
    plants.forEach((plant) => {
      const family = plant.plant_family || UNCATEGORIZED;
      if (!groups.has(family)) groups.set(family, []);
      groups.get(family).push(plant);
    });
    return [...groups.entries()].sort(([a], [b]) => {
      if (a === UNCATEGORIZED) return 1;
      if (b === UNCATEGORIZED) return -1;
      return a.localeCompare(b);
    });
  }, [plants]);

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', mt: 4, mb: 6, px: 2 }}>
      {/* Page header */}
      <Box sx={{ mb: 3 }}>
        <Stack direction="row" spacing={1.25} alignItems="center">
          <MenuBookOutlinedIcon sx={{ color: 'primary.main', fontSize: 30 }} />
          <Typography variant="h4">Horticulture Handbook</Typography>
        </Stack>
        <Typography color="text.secondary" sx={{ mt: 0.5 }}>
          Browse botanical reference details for plants in the estate catalog.
        </Typography>
      </Box>

      {/* Bulk Import - upload the client's handbook/catalog document (species and
          botanical fields), as opposed to logging physically-planted greenery. */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
            <UploadFileOutlinedIcon fontSize="small" color="action" />
            <Typography variant="h6">Bulk Import</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Upload the client's horticulture handbook or catalog document (species and
            botanical reference fields) to add entries to this reference catalog. These
            are not physically-tracked plants.
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
                {csvFile ? 'Ready to upload' : 'species, common_name, plant_family, site_suitability and more'}
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

      {/* Filter toolbar */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
            <SearchIcon fontSize="small" color="action" />
            <Typography variant="h6">Search &amp; Filter</Typography>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              fullWidth
              size="small"
              label="Plant Family"
              value={plantFamily}
              onChange={(e) => setPlantFamily(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              fullWidth
              size="small"
              label="Site Suitability"
              value={siteSuitability}
              onChange={(e) => setSiteSuitability(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <TerrainOutlinedIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              fullWidth
              size="small"
              label="Color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <PaletteOutlinedIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
              }}
            />
          </Stack>
        </CardContent>
      </Card>

      {/* klemens - "Ask the Handbook" AI query section */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            Ask the Handbook
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Ask a question in plain English about the estate plant catalog.
          </Typography>
          <TextField
            fullWidth
            multiline
            minRows={2}
            label="Your question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            sx={{ mb: 1.5 }}
          />
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
            {EXAMPLE_QUESTIONS.map((example) => (
              <Chip
                key={example}
                label={example}
                size="small"
                variant="outlined"
                onClick={() => setQuestion(example)}
              />
            ))}
          </Box>
          <Button
            variant="contained"
            onClick={handleAsk}
            disabled={asking || question.trim() === ''}
          >
            {asking ? <CircularProgress size={24} color="inherit" /> : 'Ask'}
          </Button>
          {askError && <Alert severity="error" sx={{ mt: 2 }}>{askError}</Alert>}
          {answer && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1, whiteSpace: 'pre-line' }}>
              <Typography variant="body2">{answer}</Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Planting Suggestions - AI recommendations for a given site condition,
          grounded in the actual catalog (as opposed to open-ended Q&A above). */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            Planting Suggestions
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Describe a planting site and get AI suggestions grounded in the estate plant catalog.
          </Typography>
          <TextField
            fullWidth
            label="Site condition"
            placeholder="e.g. shaded car park, low maintenance, no fruiting trees"
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            sx={{ mb: 1.5 }}
          />
          <Button
            variant="contained"
            onClick={handleSuggest}
            disabled={suggesting || condition.trim() === ''}
          >
            {suggesting ? <CircularProgress size={24} color="inherit" /> : 'Suggest'}
          </Button>
          {suggestError && <Alert severity="error" sx={{ mt: 2 }}>{suggestError}</Alert>}
          {suggestions && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1, whiteSpace: 'pre-line' }}>
              <Typography variant="body2">{suggestions}</Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Result count */}
      {!loading && !error && plants.length > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Showing {plants.length} plant{plants.length === 1 ? '' : 's'}
          {filtersActive ? ' matching your filters' : ' in the catalog'}
        </Typography>
      )}

      {/* Jump-to-family quick nav - only useful with 2+ groups */}
      {!loading && !error && familyGroups.length >= 2 && (
        <TextField
          select
          size="small"
          label="Jump to Family"
          value={jumpTarget}
          onChange={(e) => {
            const family = e.target.value;
            document
              .getElementById(familyId(family))
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setJumpTarget('');
          }}
          sx={{ minWidth: 220, mb: 3 }}
        >
          {familyGroups.map(([family, familyPlants]) => (
            <MenuItem key={family} value={family}>
              {family} ({familyPlants.length} plant{familyPlants.length === 1 ? '' : 's'})
            </MenuItem>
          ))}
        </TextField>
      )}

      {/* Loading state - skeleton cards */}
      {loading && (
        <Box sx={CARD_GRID_SX}>
          {Array.from({ length: 6 }).map((_, i) => (
            <PlantCardSkeleton key={i} />
          ))}
        </Box>
      )}

      {/* Empty state */}
      {!loading && !error && plants.length === 0 && (
        <Box
          sx={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 1.5, py: 8, textAlign: 'center',
          }}
        >
          <MenuBookOutlinedIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
          <Typography variant="h6" color="text.secondary">
            {filtersActive ? 'No plants match these filters' : 'No plants in the catalog yet'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 340 }}>
            {filtersActive
              ? 'Try a different plant family, site suitability, or color.'
              : 'Reference details will appear here once plants are recorded.'}
          </Typography>
        </Box>
      )}

      {/* Plant cards - grouped by family, each group an equal-width CSS grid */}
      {!loading && !error && plants.length > 0 && (
        <Stack spacing={4}>
          {familyGroups.map(([family, familyPlants]) => (
            <Box key={family} id={familyId(family)}>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>
                <Box component="span" sx={{ fontWeight: 700 }}>{family}</Box>
                {' '}
                <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary', fontSize: '0.875rem' }}>
                  ({familyPlants.length} plant{familyPlants.length === 1 ? '' : 's'})
                </Box>
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Box sx={CARD_GRID_SX}>
                {familyPlants.map((plant) => {
                  const statusColor = HEALTH_STATUS_COLORS[plant.health_status] || 'default';
                  const { Icon: PlantIcon, color: plantIconColor } = getPlantIcon(plant.plant_family);
                  return (
                    <Card key={plant.id} sx={{ height: '100%', borderLeft: 4, borderLeftColor: `${statusColor}.main` }}>
                      <CardActionArea
                        component={RouterLink}
                        to={`/flora/${plant.id}`}
                        sx={{ height: '100%', '&:hover': { bgcolor: 'action.hover' } }}
                      >
                        <CardContent sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                          {plant.image_url && (
                            <Box
                              component="img"
                              src={plant.image_url}
                              alt={plant.species}
                              sx={{
                                width: 80, height: 80, objectFit: 'cover',
                                borderRadius: 1, display: 'block', flexShrink: 0,
                              }}
                            />
                          )}
                          <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                              <Box sx={{ minWidth: 0 }}>
                                <Stack direction="row" spacing={0.75} alignItems="center">
                                  <PlantIcon sx={{ fontSize: 20, color: plantIconColor, flexShrink: 0 }} />
                                  <Typography variant="h6" sx={{ lineHeight: 1.3 }}>
                                    {toTitleCase(plant.species)}
                                  </Typography>
                                </Stack>
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

                            <Stack spacing={0.25} sx={{ mt: 1 }}>
                              {plant.plant_family && (
                                <Typography variant="body2" color="text.secondary" noWrap>
                                  <Box component="span" sx={{ fontWeight: 700 }}>Family:</Box>{' '}
                                  {plant.plant_family}
                                </Typography>
                              )}
                              {plant.site_suitability && (
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                  }}
                                >
                                  <Box component="span" sx={{ fontWeight: 700 }}>Suitability:</Box>{' '}
                                  {plant.site_suitability}
                                </Typography>
                              )}
                              {plant.color && (
                                <Typography variant="body2" color="text.secondary" noWrap>
                                  <Box component="span" sx={{ fontWeight: 700 }}>Color:</Box>{' '}
                                  {plant.color}
                                </Typography>
                              )}
                              {plant.max_height_at_maturity != null && (
                                <Typography variant="body2" color="text.secondary" noWrap>
                                  <Box component="span" sx={{ fontWeight: 700 }}>Max height:</Box>{' '}
                                  {plant.max_height_at_maturity} m
                                </Typography>
                              )}
                            </Stack>
                          </Box>
                        </CardContent>
                      </CardActionArea>
                    </Card>
                  );
                })}
              </Box>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}
