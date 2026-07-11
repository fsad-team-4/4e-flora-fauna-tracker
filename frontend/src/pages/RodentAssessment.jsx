import { useEffect, useState } from 'react';
import {
  Box, Typography, TextField, Button, Card, CardContent,
  Alert, CircularProgress, Chip, Table, TableHead,
  TableRow, TableCell, TableBody, Paper,
} from '@mui/material';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import http from '../http';

const BRAND = {
  primary: '#C1272D',
  primaryHover: '#A61D22',
  heading: '#222222',
  text: '#444444',
  textLight: '#777777',
  border: '#E5E5E5',
  section: '#F7F7F7',
  success: '#2E7D32',
  warning: '#F4B400',
  slate: '#37474F',
  slateHover: '#263238',
};

// soft-fill status styling: pale background + dark text (status, not action).
// outlines are reserved for clickable things; fills mean state.
const RISK_FILL = {
  low: { bg: '#E7F4E8', color: '#1E6023' },
  medium: { bg: '#FFF4E5', color: '#8A5200' },
  high: { bg: '#FDECEA', color: '#B3261E' },
  critical: { bg: '#FDECEA', color: '#B3261E' },
};
function riskChipSx(level) {
  const m = RISK_FILL[level] || { bg: '#F0F1F3', color: '#444' };
  return { bgcolor: m.bg, color: m.color, fontWeight: 700, borderRadius: '6px', textTransform: 'capitalize' };
}

// Guard against garbage input ("eeeee") producing a confident fake assessment.
// Require a meaningful phrase: enough characters, a few distinct words, and not
// just one character repeated.
const MIN_CHARS = 15;
function isValidObservation(text) {
  const t = (text || '').trim();
  if (t.length < MIN_CHARS) return false;
  const words = t.split(/\s+/).filter(w => w.length >= 2);
  if (words.length < 3) return false;
  // reject a single repeated character like "eeeee" or "aaa aaa aaa"
  const distinct = new Set(t.replace(/\s/g, '').toLowerCase()).size;
  if (distinct < 4) return false;
  return true;
}

// Actions may arrive as new structured { title, detail } objects OR as legacy
// plain strings (older saved assessments). Normalise to { title, detail } so the
// UI renders both. For a legacy string with no title, we leave title empty and
// just show the detail.
function normalizeAction(a) {
  if (a && typeof a === 'object') {
    return { title: a.title || '', detail: a.detail || a.text || '' };
  }
  return { title: '', detail: String(a) };
}

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

  const actions = (result?.immediate_actions || []).map(normalizeAction);

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
              <TextField label="Block (optional)" value={block} onChange={e => setBlock(e.target.value)} size="small" fullWidth placeholder="e.g. Block 234" disabled={submitting} />
              <TextField label="Floor / Area (optional)" value={floorLevel} onChange={e => setFloorLevel(e.target.value)} size="small" fullWidth placeholder="e.g. L1, Community garden" disabled={submitting} />
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
              placeholder="e.g. Found droppings near the compost area. A few small holes in the soil along the fenceline. Resident has fruit trees planted close to the void deck."
              helperText={observations.trim().length > 0 && !isValidObservation(observations)
                ? 'Please describe what you observed in a bit more detail (a full sentence or two) so the assessment is meaningful.'
                : ' '}
            />
            {error && <Alert severity="error">{error}</Alert>}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Button onClick={() => { setBlock(''); setFloorLevel(''); setObservations(''); setResult(null); setError(null); }} disabled={submitting} sx={{ color: BRAND.textLight }}>
                Clear
              </Button>
              <Button type="submit" variant="contained" disabled={submitting || !isValidObservation(observations)} sx={{ bgcolor: BRAND.slate, '&:hover': { bgcolor: BRAND.slateHover } }}>
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
                sx={{ flexShrink: 0, ...riskChipSx(result.risk_level) }}
              />
            </Box>

            {/* FIX 1: escalation banner leads the results - highest-stakes directive first */}
            {result.escalate_to_contractor && (
              <Alert
                severity="error"
                icon={<ReportProblemOutlinedIcon />}
                sx={{ mb: 2, alignItems: 'flex-start', '& .MuiAlert-message': { fontSize: 14 } }}
              >
                <Typography sx={{ fontWeight: 700, mb: 0.25 }}>Escalate to pest contractor</Typography>
                {result.escalation_reason}
              </Alert>
            )}

            {result.stubbed && (
              <Alert severity="info" sx={{ mb: 2 }}>Stub mode — set GEMINI_API_KEY for real AI assessment.</Alert>
            )}

            <Box mb={2}>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: BRAND.heading, textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.75 }}>Likely Cause</Typography>
              <Typography variant="body2" sx={{ color: BRAND.text }}>{result.likely_cause}</Typography>
            </Box>

            {result.signs_identified?.length > 0 && (
              <Box mb={2}>
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: BRAND.heading, textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.75 }}>Signs Identified</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {result.signs_identified.map((s, i) => (
                    <Chip key={i} label={s} size="small" variant="outlined" />
                  ))}
                </Box>
              </Box>
            )}

            {/* FIX 2: chunked, front-loaded actions - numbered, bold lead-in, scannable */}
            {actions.length > 0 && (
              <Box mb={1}>
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: BRAND.heading, textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.75 }}>Immediate Actions</Typography>
                {actions.map((a, i) => (
                  <Typography
                    key={i}
                    variant="body2"
                    sx={{ color: BRAND.text, lineHeight: 1.6, py: 0.6, borderTop: i === 0 ? 'none' : `1px solid ${BRAND.section}` }}
                  >
                    {/* number sits inline, snug against the bold action title */}
                    <Box component="span" sx={{ fontWeight: 700, color: BRAND.heading }}>
                      {i + 1}. {a.title && `${a.title}: `}
                    </Box>
                    {a.detail}
                  </Typography>
                ))}
              </Box>
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
        // FIX 3: cap width so columns sit close, zebra striping, centred Risk/Escalated
        <Paper variant="outlined" sx={{ border: `1px solid ${BRAND.border}`, borderRadius: '10px', overflow: 'hidden' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: BRAND.section }}>
                <TableCell sx={{ fontWeight: 600, color: BRAND.textLight }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 600, color: BRAND.textLight }}>Location</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, color: BRAND.textLight }}>Risk</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, color: BRAND.textLight }}>Escalated</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {history.map((h, i) => (
                <TableRow key={h.id} sx={{ bgcolor: i % 2 ? BRAND.section : 'inherit' }}>
                  <TableCell sx={{ color: BRAND.text }}>{new Date(h.createdAt).toLocaleDateString('en-SG')}</TableCell>
                  <TableCell sx={{ color: BRAND.text }}>{[h.block_number, h.floor_level].filter(Boolean).join(', ') || '—'}</TableCell>
                  <TableCell align="center">
                    <Chip label={h.risk_level} size="small" sx={riskChipSx(h.risk_level)} />
                  </TableCell>
                  <TableCell align="center">
                    {h.escalate_to_contractor
                      ? <Chip label="Yes" size="small" sx={{ bgcolor: '#FDECEA', color: '#B3261E', fontWeight: 700, borderRadius: '6px' }} />
                      : <Box component="span" sx={{ color: BRAND.textLight }}>—</Box>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Box>
  );
}