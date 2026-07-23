import { useEffect, useRef, useState } from 'react';
import {
  Box, Typography, TextField, Button, Card, CardContent,
  Alert, CircularProgress, Chip, Table, TableHead,
  TableRow, TableCell, TableBody, Paper, Stack, Checkbox, Divider, Tooltip, MenuItem,
} from '@mui/material';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import MyLocationRoundedIcon from '@mui/icons-material/MyLocationRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import { BRAND } from '../theme';
import http from '../http';

// Risk levels on one scale, so an officer can see where their result sits.
// Critical gets a distinctly heavier treatment, not just a redder chip.
const RISK_SCALE = ['low', 'medium', 'high', 'critical'];
const RISK_META = {
  low: { label: 'Low Risk', bg: '#E7F4E8', color: '#1E6023', bar: '#2E7D32' },
  medium: { label: 'Medium Risk', bg: '#FFF4E5', color: '#8A5200', bar: '#ED9B00' },
  high: { label: 'High Risk', bg: '#FDECEA', color: '#B3261E', bar: '#D93F3F' },
  critical: { label: 'CRITICAL', bg: '#B3261E', color: '#FFFFFF', bar: '#7A1A15', solid: true },
};
function riskChipSx(level) {
  const m = RISK_META[level] || { bg: '#F0F1F3', color: '#444' };
  return { bgcolor: m.bg, color: m.color, fontWeight: 700, borderRadius: '6px', textTransform: 'capitalize' };
}

const MIN_CHARS = 15;
function isValidObservation(text) {
  const t = (text || '').trim();
  if (t.length < MIN_CHARS) return false;
  const words = t.split(/\s+/).filter(w => w.length >= 2);
  if (words.length < 3) return false;
  const distinct = new Set(t.replace(/\s/g, '').toLowerCase()).size;
  if (distinct < 4) return false;
  return true;
}

function normalizeAction(a) {
  if (a && typeof a === 'object') return { title: a.title || '', detail: a.detail || a.text || '' };
  return { title: '', detail: String(a) };
}

// Downscale + re-encode the photo to JPEG client-side, so the base64 payload
// stays well under the server body limit and any camera format the browser can
// decode (incl. HEIC on Safari) is normalised to one the backend accepts.
const MAX_PHOTO_DIM = 1600;
function fileToJpegDataUrl(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, MAX_PHOTO_DIM / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('unreadable image'));
    };
    img.src = objectUrl;
  });
}

// The verdict band: the one thing the eye should hit first. Large, colour-filled,
// with the confidence and the position on the full scale, so the reader knows both
// what the AI concluded and how much to trust it.
function VerdictBand({ result }) {
  const level = result.risk_level;
  const meta = RISK_META[level] || RISK_META.low;
  const idx = RISK_SCALE.indexOf(level);
  return (
    <Box sx={{ bgcolor: meta.solid ? meta.bg : meta.bg, px: 3, py: 2.5, borderBottom: `1px solid ${BRAND.border}` }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
        <Box>
          <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: meta.solid ? 'rgba(255,255,255,.75)' : BRAND.textLight }}>
            AI Risk Assessment
          </Typography>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'baseline', mt: 0.25 }}>
            <Typography sx={{ fontSize: 32, fontWeight: 800, lineHeight: 1.1, color: meta.color, letterSpacing: '-0.5px' }}>
              {meta.label}
            </Typography>
            {result.confidence && (
              <Tooltip title="How confident the AI is, given the detail provided. This is an inference, not a measurement." arrow>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: meta.solid ? 'rgba(255,255,255,.85)' : BRAND.textLight, cursor: 'default' }}>
                  · {result.confidence} confidence
                </Typography>
              </Tooltip>
            )}
          </Stack>
        </Box>

        {/* position on the full scale */}
        <Box sx={{ minWidth: 180 }}>
          <Stack direction="row" spacing={0.5}>
            {RISK_SCALE.map((lv, i) => (
              <Box key={lv} sx={{ flex: 1, height: 5, borderRadius: '3px', bgcolor: i <= idx ? RISK_META[lv].bar : (meta.solid ? 'rgba(255,255,255,.25)' : '#E0E0E0') }} />
            ))}
          </Stack>
          <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 0.5 }}>
            <Typography sx={{ fontSize: 9.5, color: meta.solid ? 'rgba(255,255,255,.7)' : BRAND.textLight }}>LOW</Typography>
            <Typography sx={{ fontSize: 9.5, color: meta.solid ? 'rgba(255,255,255,.7)' : BRAND.textLight }}>CRITICAL</Typography>
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}

export default function RodentAssessment() {
  const [block, setBlock] = useState('');
  const [floorLevel, setFloorLevel] = useState('');
  const [observations, setObservations] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [total, setTotal] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [doneActions, setDoneActions] = useState({});
  const [photo, setPhoto] = useState(null); // { dataUrl, name }
  const [photoError, setPhotoError] = useState(null);
  const [location, setLocation] = useState(null); // { lat, lng, accuracy } - the reported position
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const [filters, setFilters] = useState({ search: '', block: '', risk: 'all', escalated: 'all' });
  const fileInputRef = useRef(null);

  // Filtering is server-side (the list paginates, so filtering only the loaded
  // rows would show a subset and call it the whole answer). Text inputs are
  // debounced so a query isn't fired on every keystroke.
  useEffect(() => {
    const t = setTimeout(loadHistory, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const filtersActive =
    filters.search.trim() || filters.block.trim() || filters.risk !== 'all' || filters.escalated !== 'all';

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (filters.search.trim()) params.append('search', filters.search.trim());
      if (filters.block.trim()) params.append('block', filters.block.trim());
      if (filters.risk !== 'all') params.append('risk_level', filters.risk);
      if (filters.escalated !== 'all') params.append('escalated', filters.escalated);
      const res = await http.get(`/api/rodent-assessments?${params.toString()}`);
      setHistory(res.data);
      setTotal(Number(res.headers['x-total-count']) || res.data.length);
    } catch (e) {
      console.error('failed to load history', e);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handlePhotoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoError(null);
    try {
      const dataUrl = await fileToJpegDataUrl(file);
      setPhoto({ dataUrl, name: file.name });
    } catch {
      setPhotoError('Could not read that image - please choose a photo file (JPEG or PNG).');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleRemovePhoto() {
    setPhoto(null);
    setPhotoError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // Capture the officer's actual position from the device. Optional by design: a
  // failure (no signal in a stairwell, permission denied) must never block filing,
  // so it only sets an explanatory message - it never disables submit.
  function handleCaptureLocation() {
    setLocationError(null);
    if (!('geolocation' in navigator)) {
      setLocationError('This device has no location support - you can still file without it.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setLocating(false);
      },
      err => {
        setLocationError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied - you can still file without it.'
            : 'Could not get a location fix (no signal?) - you can still file without it.'
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  function handleClearLocation() {
    setLocation(null);
    setLocationError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isValidObservation(observations)) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    setDoneActions({});
    try {
      const { data } = await http.post('/api/rodent-assessments', {
        block_number: block.trim() || null,
        floor_level: floorLevel.trim() || null,
        observations: observations.trim(),
        image: photo ? photo.dataUrl : undefined,
        gps_lat: location ? location.lat : null,
        gps_lng: location ? location.lng : null,
      });
      // keep the local preview so the result can show the photo even when
      // storage is not configured and no image_url came back
      setResult({ ...data, local_photo: photo ? photo.dataUrl : null });
      loadHistory();
    } catch (e) {
      setError(e.response?.data?.error || 'assessment failed');
    } finally {
      setSubmitting(false);
    }
  }

  const actions = (result?.immediate_actions || []).map(normalizeAction);
  const labelSx = { fontSize: 11, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.6px', mb: 1 };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" component="h1" fontWeight={700} sx={{ color: BRAND.heading }}>Rodent Risk Assessment</Typography>
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
                label="Block"
                value={block}
                onChange={e => setBlock(e.target.value)}
                size="small"
                fullWidth
                placeholder="e.g. Block 234"
                disabled={submitting}
                helperText="Adding a block lets the AI check for repeat reports here"
              />
              <TextField label="Floor / Area (optional)" value={floorLevel} onChange={e => setFloorLevel(e.target.value)} size="small" fullWidth placeholder="e.g. L1, Community garden" disabled={submitting} helperText=" " />
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
            {/* optional field photo - Gemini reads it as evidence alongside the note */}
            <Box>
              <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handlePhotoChange} />
              {!photo ? (
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<PhotoCameraOutlinedIcon />}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={submitting}
                  sx={{ color: BRAND.slate, borderColor: BRAND.border, textTransform: 'none', '&:hover': { borderColor: BRAND.slate } }}
                >
                  Attach photo (optional)
                </Button>
              ) : (
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                  <Box
                    component="img"
                    src={photo.dataUrl}
                    alt="field photo preview"
                    sx={{ width: 72, height: 72, objectFit: 'cover', borderRadius: '8px', border: `1px solid ${BRAND.border}` }}
                  />
                  <Box>
                    <Typography sx={{ fontSize: 13, color: BRAND.text }}>{photo.name}</Typography>
                    <Button size="small" color="error" onClick={handleRemovePhoto} disabled={submitting} sx={{ px: 0.5, minWidth: 0 }}>
                      Remove
                    </Button>
                  </Box>
                </Stack>
              )}
              <Typography sx={{ fontSize: 12, color: photoError ? '#B3261E' : BRAND.textLight, mt: 0.5 }}>
                {photoError || 'A photo of droppings, gnaw marks or burrows lets the AI assess what is visible, not just the note.'}
              </Typography>
            </Box>
            {/* optional reported position - lets this report appear on the risk map.
                Never required: an officer with no signal must still be able to file. */}
            <Box>
              {!location ? (
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<MyLocationRoundedIcon />}
                  onClick={handleCaptureLocation}
                  disabled={submitting || locating}
                  sx={{ color: BRAND.slate, borderColor: BRAND.border, textTransform: 'none', '&:hover': { borderColor: BRAND.slate } }}
                >
                  {locating ? 'Getting location…' : 'Capture location (optional)'}
                </Button>
              ) : (
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', px: 1.25, py: 0.75, borderRadius: '8px', bgcolor: '#E7F4E8', color: '#1E6023' }}>
                    <CheckCircleRoundedIcon sx={{ fontSize: 18 }} />
                    <Typography sx={{ fontSize: 13, fontWeight: 700 }}>Location recorded</Typography>
                  </Stack>
                  <Box>
                    <Typography sx={{ fontSize: 13, color: BRAND.text, fontVariantNumeric: 'tabular-nums' }}>
                      {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                      {location.accuracy ? ` · ±${Math.round(location.accuracy)}m` : ''}
                    </Typography>
                    <Button size="small" color="error" onClick={handleClearLocation} disabled={submitting} sx={{ px: 0.5, minWidth: 0 }}>
                      Remove
                    </Button>
                  </Box>
                </Stack>
              )}
              <Typography sx={{ fontSize: 12, color: locationError ? '#B3261E' : BRAND.textLight, mt: 0.5 }}>
                {locationError || 'Records where you are standing so this report can be mapped. Optional - you can file without it.'}
              </Typography>
            </Box>
            {error && <Alert severity="error">{error}</Alert>}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Button onClick={() => { setBlock(''); setFloorLevel(''); setObservations(''); setResult(null); setError(null); handleRemovePhoto(); handleClearLocation(); }} disabled={submitting} sx={{ color: BRAND.textLight }}>
                Clear
              </Button>
              <Button type="submit" variant="contained" disabled={submitting || !isValidObservation(observations)} sx={{ bgcolor: BRAND.slate, '&:hover': { bgcolor: BRAND.slateHover } }}>
                {submitting ? <><CircularProgress size={16} sx={{ mr: 1, color: 'white' }} />Assessing...</> : 'Get AI Assessment'}
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* loading skeleton so the AI wait doesn't read as broken */}
      {submitting && (
        <Card sx={{ mb: 3, border: `1px solid ${BRAND.border}`, borderRadius: '10px' }}>
          <CardContent sx={{ py: 5, textAlign: 'center' }}>
            <CircularProgress size={28} sx={{ color: BRAND.slate, mb: 1.5 }} />
            <Typography sx={{ color: BRAND.textLight, fontSize: 14 }}>
              Assessing the observation{photo ? ' and photo' : ''}{block ? ` and checking prior reports at ${block}` : ''}…
            </Typography>
          </CardContent>
        </Card>
      )}

      {result && !submitting && (
        <Card sx={{ mb: 3, border: `1px solid ${BRAND.border}`, borderRadius: '12px', overflow: 'hidden' }}>
          {/* HERO: the verdict dominates */}
          <VerdictBand result={result} />

          <CardContent sx={{ p: 3 }}>
            {/* recurrence context - the judgement a single note can't give */}
            {result.recurrence_note && (
              <Box sx={{ display: 'flex', gap: 1.25, p: 1.5, mb: 2.5, bgcolor: '#FFF4E5', border: '1px solid #F0D9B5', borderRadius: '8px' }}>
                <HistoryRoundedIcon sx={{ color: '#8A5200', fontSize: 20, flexShrink: 0, mt: 0.1 }} />
                <Box>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: '#8A5200' }}>
                    Recurring location{result.prior_count ? ` · ${result.prior_count} prior report${result.prior_count === 1 ? '' : 's'} in 7 days` : ''}
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: '#6B4200' }}>{result.recurrence_note}</Typography>
                </Box>
              </Box>
            )}

            {result.escalate_to_contractor && (
              <Alert severity="error" icon={<ReportProblemOutlinedIcon />} sx={{ mb: 2.5, alignItems: 'flex-start' }}>
                <Typography sx={{ fontWeight: 700, mb: 0.25 }}>Escalate to pest contractor</Typography>
                {result.escalation_reason}
              </Alert>
            )}

            {result.stubbed && (
              <Alert severity="info" sx={{ mb: 2.5 }}>
                Offline assessment — the AI service was unavailable, so this used the built-in fallback.
              </Alert>
            )}

            {/* two zones: reasoning (light) | actions (the tasks) */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1px 1.1fr' }, gap: { xs: 2.5, md: 3 } }}>
              {/* zone 1: reasoning */}
              <Box>
                <Typography sx={labelSx}>Likely cause</Typography>
                <Typography variant="body2" sx={{ color: BRAND.text, mb: 2.5, lineHeight: 1.6 }}>{result.likely_cause}</Typography>

                {result.signs_identified?.length > 0 && (
                  <>
                    <Typography sx={labelSx}>Signs identified</Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {result.signs_identified.map((s, i) => (
                        <Chip key={i} label={s} size="small" sx={{ bgcolor: BRAND.section, color: BRAND.text, borderRadius: '6px', fontWeight: 500 }} />
                      ))}
                    </Box>
                  </>
                )}

                {result.estimated_timeline && (
                  <Box sx={{ mt: 2.5 }}>
                    <Typography sx={labelSx}>Timeline</Typography>
                    <Typography variant="body2" sx={{ color: BRAND.text }}>{result.estimated_timeline}</Typography>
                  </Box>
                )}

                {/* the evidence the AI actually looked at */}
                {result.assessed_from_image && (result.image_url || result.local_photo) && (
                  <Box sx={{ mt: 2.5 }}>
                    <Typography sx={labelSx}>Field photo (analysed by AI)</Typography>
                    <Box
                      component="img"
                      src={result.image_url || result.local_photo}
                      alt="field photo"
                      sx={{ maxWidth: '100%', maxHeight: 240, borderRadius: '8px', border: `1px solid ${BRAND.border}`, display: 'block' }}
                    />
                    {result.image_stored === false && (
                      <Typography sx={{ fontSize: 12, color: BRAND.textLight, mt: 0.5 }}>
                        The AI assessed this photo, but it was not saved (image storage is not configured).
                      </Typography>
                    )}
                  </Box>
                )}
              </Box>

              <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', md: 'block' } }} />

              {/* zone 2: actions as a checklist - these are tasks, not prose */}
              <Box>
                <Typography sx={labelSx}>Immediate actions</Typography>
                <Stack spacing={0}>
                  {actions.map((a, i) => {
                    const done = Boolean(doneActions[i]);
                    return (
                      <Box
                        key={i}
                        sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', py: 1, borderTop: i === 0 ? 'none' : `1px solid ${BRAND.section}` }}
                      >
                        <Typography sx={{ fontSize: 11, color: BRAND.textLight, mt: 1, fontStyle: 'italic' }}>
                          Working checklist — ticks aren't saved yet
                        </Typography>
                        <Checkbox
                          size="small"
                          checked={done}
                          onChange={() => setDoneActions(p => ({ ...p, [i]: !p[i] }))}
                          sx={{ p: 0.25, mt: 0.1, color: BRAND.textLight, '&.Mui-checked': { color: BRAND.slate } }}
                        />
                        <Typography variant="body2" sx={{ color: done ? BRAND.textLight : BRAND.text, lineHeight: 1.6, textDecoration: done ? 'line-through' : 'none' }}>
                          <Box component="span" sx={{ fontWeight: 700, color: done ? BRAND.textLight : BRAND.heading }}>
                            {a.title ? `${a.title}: ` : ''}
                          </Box>
                          {a.detail}
                        </Typography>
                      </Box>
                    );
                  })}
                </Stack>
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'baseline' }, justifyContent: 'space-between', mb: 1.5 }}>
        <Typography variant="h6" fontWeight={600} sx={{ color: BRAND.heading }}>Recent Assessments</Typography>
        {!loadingHistory && (
          <Typography sx={{ fontSize: 13, color: BRAND.textLight }}>
            {total} result{total === 1 ? '' : 's'}{filtersActive ? ' · filtered' : ''}
          </Typography>
        )}
      </Stack>

      {/* server-side filters (backend supports search / block / risk_level / escalated) */}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small" label="Search text" placeholder="observations or cause"
          value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          sx={{ flexGrow: 1, minWidth: 200 }}
        />
        <TextField
          size="small" label="Block"
          value={filters.block}
          onChange={e => setFilters(f => ({ ...f, block: e.target.value }))}
          sx={{ width: { xs: '100%', md: 150 } }}
        />
        <TextField
          size="small" select label="Risk"
          value={filters.risk}
          onChange={e => setFilters(f => ({ ...f, risk: e.target.value }))}
          sx={{ width: { xs: '100%', md: 140 } }}
        >
          <MenuItem value="all">All risks</MenuItem>
          <MenuItem value="low">Low</MenuItem>
          <MenuItem value="medium">Medium</MenuItem>
          <MenuItem value="high">High</MenuItem>
          <MenuItem value="critical">Critical</MenuItem>
        </TextField>
        <TextField
          size="small" select label="Escalated"
          value={filters.escalated}
          onChange={e => setFilters(f => ({ ...f, escalated: e.target.value }))}
          sx={{ width: { xs: '100%', md: 160 } }}
        >
          <MenuItem value="all">All</MenuItem>
          <MenuItem value="true">Escalated only</MenuItem>
          <MenuItem value="false">Not escalated</MenuItem>
        </TextField>
        {filtersActive && (
          <Button
            onClick={() => setFilters({ search: '', block: '', risk: 'all', escalated: 'all' })}
            sx={{ color: BRAND.textLight, alignSelf: { md: 'center' }, flexShrink: 0 }}
          >
            Clear
          </Button>
        )}
      </Stack>

      {loadingHistory ? (
        <CircularProgress size={24} sx={{ color: BRAND.primary }} />
      ) : history.length === 0 ? (
        <Typography sx={{ color: BRAND.textLight }}>
          {filtersActive ? 'No assessments match these filters.' : 'No assessments logged yet.'}
        </Typography>
      ) : (
        <Paper variant="outlined" sx={{ border: `1px solid ${BRAND.border}`, borderRadius: '10px', overflow: 'hidden' }}>
          {/* the 6-column history scrolls inside its card on narrow screens rather than widening the page */}
          <Box tabIndex={0} role="region" aria-label="Recent assessments (scrollable)" sx={{ overflowX: 'auto', '&:focus-visible': { outline: `2px solid ${BRAND.primary}`, outlineOffset: '-2px' } }}>
          <Table size="small" sx={{ minWidth: 680 }}>
            <TableHead>
              <TableRow sx={{ bgcolor: BRAND.section }}>
                <TableCell sx={{ fontWeight: 600, color: BRAND.textLight }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 600, color: BRAND.textLight }}>Location</TableCell>
                <TableCell sx={{ fontWeight: 600, color: BRAND.textLight }}>Observation</TableCell>
                <TableCell sx={{ fontWeight: 600, color: BRAND.textLight }}>Photo</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, color: BRAND.textLight }}>Risk</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, color: BRAND.textLight }}>Escalated</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {history.map((h, i) => (
                <TableRow key={h.id} sx={{ bgcolor: i % 2 ? BRAND.section : 'inherit' }}>
                  <TableCell sx={{ color: BRAND.text, whiteSpace: 'nowrap' }}>{new Date(h.createdAt).toLocaleDateString('en-SG')}</TableCell>
                  <TableCell sx={{ color: BRAND.text, whiteSpace: 'nowrap' }}>{[h.block_number, h.floor_level].filter(Boolean).join(', ') || '—'}</TableCell>
                  {/* snippet so the history is scannable and recurrence is visible */}
                  <TableCell sx={{ color: BRAND.textLight, maxWidth: 280 }}>
                    <Tooltip title={h.observations || ''} arrow>
                      <Typography sx={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'default' }}>
                        {h.observations}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    {h.image_url ? (
                      <a href={h.image_url} target="_blank" rel="noreferrer">
                        <Box
                          component="img"
                          src={h.image_url}
                          alt="field photo"
                          sx={{ width: 40, height: 40, objectFit: 'cover', borderRadius: '6px', border: `1px solid ${BRAND.border}`, display: 'block' }}
                        />
                      </a>
                    ) : (
                      <Box component="span" sx={{ color: BRAND.textLight }}>—</Box>
                    )}
                  </TableCell>
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
          </Box>
        </Paper>
      )}
    </Box>
  );
}