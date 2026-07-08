import { useEffect, useState } from 'react';
import {
  Box, Typography, TextField, Button, Card, CardContent,
  Alert, CircularProgress, Chip, Table, TableHead,
  TableRow, TableCell, TableBody, Paper
} from '@mui/material';
import http from '../http';

const BRAND = {
  primary: '#C1272D',
  primaryHover: '#A61D22',
  heading: '#222222',
  textLight: '#777777',
  border: '#E5E5E5',
  section: '#F7F7F7',
  success: '#2E7D32',
  warning: '#F4B400',
};

// risk level -> MUI chip color. high and critical both map to error (red),
// but critical is filled and high is outlined so they stay visually distinct
const riskChipColor = { low: 'success', medium: 'warning', high: 'error', critical: 'error' };

export default function RodentAssessment() {
  const [block, setBlock] = useState('');
  const [floorLevel, setFloorLevel] = useState('');
  const [observations, setObservations] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => { loadHistory(); }, []);

  async function loadHistory() {
    try {
      const { data } = await http.get('/api/rodent-assessments?limit=10');
      setHistory(data);
    } catch (e) {
      console.error('failed to load history', e);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!observations.trim()) return;

    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const { data } = await http.post('/api/rodent-assessments', {
        block_number: block.trim() || null,
        floor_level: floorLevel.trim() || null,
        observations: observations.trim(),
      });
      setResult(data);
      loadHistory();
    } catch (e) {
      setError(e.response?.data?.error || 'assessment failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700} sx={{ color: BRAND.heading }}>Rodent Risk Assessment</Typography>
        <Typography variant="body2" sx={{ color: BRAND.textLight }}>
          Describe what you observed in the field — AI assesses risk level and recommends action
        </Typography>
      </Box>

      <Card sx={{ mb: 3, border: `1px solid ${BRAND.border}`, borderRadius: '10px' }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={600} mb={2} sx={{ color: BRAND.heading }}>New Field Observation</Typography>
          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Block (optional)"
                value={block}
                onChange={e => setBlock(e.target.value)}
                size="small"
                fullWidth
                placeholder="e.g. Block 234"
                disabled={submitting}
              />
              <TextField
                label="Floor / Area (optional)"
                value={floorLevel}
                onChange={e => setFloorLevel(e.target.value)}
                size="small"
                fullWidth
                placeholder="e.g. L1, Community garden"
                disabled={submitting}
              />
            </Box>

            <TextField
              label="What did you observe?"
              value={observations}
              onChange={e => setObservations(e.target.value)}
              multiline
              rows={4}
              required
              fullWidth
              disabled={submitting}
              placeholder="e.g. Found droppings near the compost area. A few small holes in the soil along the fence line. Resident has fruit trees planted close to the void deck."
            />

            {error && <Alert severity="error">{error}</Alert>}

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Button onClick={() => { setBlock(''); setFloorLevel(''); setObservations(''); setResult(null); setError(null); }} disabled={submitting}>
                Clear
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={submitting || !observations.trim()}
                sx={{ bgcolor: BRAND.primary, '&:hover': { bgcolor: BRAND.primaryHover } }}
              >
                {submitting ? <><CircularProgress size={16} sx={{ mr: 1, color: 'white' }} />Assessing...</> : 'Get AI Assessment'}
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {result && (
        <Card sx={{ mb: 3, borderLeft: `4px solid ${BRAND.primary}`, border: `1px solid ${BRAND.border}`, borderRadius: '10px' }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 2 }}>
              <Typography variant="subtitle1" fontWeight={600} sx={{ color: BRAND.heading }}>Assessment Result</Typography>
              <Chip
                label={`${result.risk_level} risk`}
                color={riskChipColor[result.risk_level] || 'default'}
                variant={result.risk_level === 'critical' ? 'filled' : 'outlined'}
                sx={{ flexShrink: 0 }}
              />
            </Box>

            {result.stubbed && (
              <Alert severity="info" sx={{ mb: 2 }}>Stub mode — set GEMINI_API_KEY for real AI assessment.</Alert>
            )}

            <Typography variant="body2" mb={1.5}>
              <strong>Likely cause:</strong> {result.likely_cause}
            </Typography>

            {result.signs_identified?.length > 0 && (
              <Box mb={1.5}>
                <Typography variant="body2" fontWeight={600} mb={0.5}>Signs identified:</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {result.signs_identified.map((s, i) => (
                    <Chip key={i} label={s} size="small" variant="outlined" />
                  ))}
                </Box>
              </Box>
            )}

            <Box mb={1.5}>
              <Typography variant="body2" fontWeight={600} mb={0.5}>Immediate actions:</Typography>
              <Box component="ol" sx={{ pl: 2.5, m: 0, fontSize: 14, lineHeight: 2 }}>
                {result.immediate_actions?.map((a, i) => <li key={i}>{a}</li>)}
              </Box>
            </Box>

            {result.estimated_timeline && (
              <Typography variant="caption" sx={{ color: BRAND.textLight }}>
                Timeline: {result.estimated_timeline}
              </Typography>
            )}

            {result.escalate_to_contractor && (
              <Alert severity="error" sx={{ mt: 1.5 }}>
                <strong>Escalate to pest contractor.</strong> {result.escalation_reason}
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      <Typography variant="h6" fontWeight={600} mb={1.5} sx={{ color: BRAND.heading }}>Recent Assessments</Typography>
      {loadingHistory ? (
        <CircularProgress size={24} sx={{ color: BRAND.primary }} />
      ) : history.length === 0 ? (
        <Typography sx={{ color: BRAND.textLight }}>No assessments logged yet.</Typography>
      ) : (
        <Paper variant="outlined" sx={{ border: `1px solid ${BRAND.border}`, borderRadius: '10px', overflow: 'hidden' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: BRAND.section }}>
                <TableCell>Date</TableCell>
                <TableCell>Location</TableCell>
                <TableCell>Risk</TableCell>
                <TableCell>Escalated</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {history.map(h => (
                <TableRow key={h.id}>
                  <TableCell>{new Date(h.createdAt).toLocaleDateString('en-SG')}</TableCell>
                  <TableCell>{[h.block_number, h.floor_level].filter(Boolean).join(', ') || '—'}</TableCell>
                  <TableCell>
                    <Chip label={h.risk_level} size="small" color={riskChipColor[h.risk_level] || 'default'} variant="outlined" />
                  </TableCell>
                  <TableCell>{h.escalate_to_contractor ? '✓ Yes' : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Box>
  );
}
