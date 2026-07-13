import { useState, useEffect, useCallback } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, TextField, Grid, Card, CardActionArea, CardContent,
  Chip, Stack, InputAdornment, CircularProgress, Alert, Button,
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

  // klemens - state for the AI query box
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState('');

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

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto', mt: 4, px: 2 }}>
      <Typography variant="h5" sx={{ mb: 1 }}>Horticulture Handbook</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Browse botanical reference details for plants in the estate catalog.
      </Typography>

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