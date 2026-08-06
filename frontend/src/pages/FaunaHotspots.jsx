import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardActionArea, CardContent, Chip, Alert,
  Stack, Collapse, Divider, ToggleButton, ToggleButtonGroup, Button, TextField,
} from '@mui/material';
import PetsIcon from '@mui/icons-material/Pets';
import FlutterDashIcon from '@mui/icons-material/FlutterDash';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import http from '../http';

// Species -> marker colour. Change these to restyle every pin + legend dot.
const SPECIES_COLORS = {
  cat: '#F57C00',    // orange
  pigeon: '#1976D2', // blue
  crow: '#7B1FA2',   // purple
  mynah: '#00897B',  // teal
  other: '#6B7280',  // grey
};

// Species -> MUI icon element. Birds get a bird icon, cats a paw, anything else a
// neutral marker. Spreads props so it works in chips and larger headers alike.
function SpeciesIcon({ species, ...props }) {
  if (species === 'cat') return <PetsIcon {...props} />;
  if (species === 'other') return <HelpOutlineRoundedIcon {...props} />;
  return <FlutterDashIcon {...props} />; // pigeon, crow, mynah
}

// A coloured circular pin as a Leaflet divIcon (replaces the default blue marker).
function speciesIcon(species) {
  const color = SPECIES_COLORS[species] || SPECIES_COLORS.other;
  return L.divIcon({
    className: '',
    html: `<span style="display:block;width:26px;height:26px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 3px rgba(0,0,0,.4)"></span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
  });
}

// Heatmap layer driven by the same GPS points. Rendered only in 'heat' view;
// adds the layer on mount and removes it on unmount so views never overlap.
function HeatLayer({ points }) {
  const map = useMap();
  useEffect(() => {
    const layer = L.heatLayer(points, {
      radius: 30,
      blur: 20,
      maxZoom: 17,
      max: 1.0,
      gradient: { 0.2: 'blue', 0.4: 'lime', 0.6: 'yellow', 0.8: 'orange', 1.0: 'red' },
    }).addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, points]);
  return null;
}

// Risk level -> MUI chip colour.
const RISK_COLORS = { high: 'error', medium: 'warning', low: 'success' };

// Default map view - central Singapore.
const DEFAULT_CENTER = [1.3521, 103.8198];

export default function FaunaHotspots() {
  const [sightings, setSightings] = useState([]);
  const [hotspots, setHotspots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState('pins');

  const [expandedBlock, setExpandedBlock] = useState(null);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');

  // Alert email draft state. `draft` is null until the staff user asks for one.
  const [draft, setDraft] = useState(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState('');
  const [sendError, setSendError] = useState('');

  useEffect(() => {
    Promise.all([
      http.get('/api/fauna'),
      http.get('/api/fauna/hotspots'),
    ])
      .then(([sightingsRes, hotspotsRes]) => {
        setSightings(sightingsRes.data);
        setHotspots(hotspotsRes.data);
        setError('');
      })
      .catch(() => setError('Failed to load hotspots'))
      .finally(() => setLoading(false));
  }, []);

  const pinned = sightings.filter((s) => s.gps_lat != null && s.gps_lng != null);
  const heatPoints = pinned.map((s) => [s.gps_lat, s.gps_lng, 1.0]);

  const resetDraft = () => {
    setDraft(null);
    setDraftError('');
    setSendResult('');
    setSendError('');
  };

  const handleBlockClick = (block) => {
    resetDraft();
    if (expandedBlock === block) {
      setExpandedBlock(null);
      return;
    }
    setExpandedBlock(block);
    setSummary(null);
    setSummaryError('');
    setSummaryLoading(true);
    http
      .get(`/api/fauna/hotspots/${encodeURIComponent(block)}/summary`)
      .then((res) => setSummary(res.data))
      .catch((err) => {
        if (err.response?.status === 503) {
          setSummaryError('AI summary unavailable. Please try again later.');
        } else {
          setSummaryError('Failed to load summary');
        }
      })
      .finally(() => setSummaryLoading(false));
  };

  const handleDraftAlert = (block) => {
    resetDraft();
    setDraftLoading(true);
    http
      .post(`/api/fauna/hotspots/${encodeURIComponent(block)}/alert-draft`)
      .then((res) => setDraft({ to: '', subject: res.data.subject, body: res.data.body }))
      .catch((err) => {
        if (err.response?.status === 503) {
          setDraftError('AI summary unavailable. Please try again later.');
        } else {
          setDraftError('Failed to draft alert email');
        }
      })
      .finally(() => setDraftLoading(false));
  };

  const handleSendAlert = (block) => {
    setSendResult('');
    setSendError('');
    setSending(true);
    http
      .post(`/api/fauna/hotspots/${encodeURIComponent(block)}/alert-send`, draft)
      .then(() => setSendResult('Alert email sent'))
      .catch((err) => {
        const messages = err.response?.data?.error;
        setSendError(Array.isArray(messages) ? messages.join(', ') : 'Failed to send alert email');
      })
      .finally(() => setSending(false));
  };

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', mt: 4 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>Fauna Hotspots</Typography>

      {loading && <Typography>Loading...</Typography>}
      {!loading && error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!loading && !error && (
        <>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{ mb: 1.5, justifyContent: 'space-between', alignItems: { sm: 'center' } }}
          >
            {/* legend: species colour dots */}
            <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
              {Object.entries(SPECIES_COLORS).map(([species, color]) => (
                <Box key={species} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: color, border: '1px solid #fff', boxShadow: '0 0 2px rgba(0,0,0,.4)' }} />
                  <Typography variant="caption" sx={{ textTransform: 'capitalize' }}>{species}</Typography>
                </Box>
              ))}
            </Stack>

            <ToggleButtonGroup
              value={view}
              exclusive
              size="small"
              onChange={(_, next) => { if (next) setView(next); }}
            >
              <ToggleButton value="pins">Pins</ToggleButton>
              <ToggleButton value="heatmap">Heatmap</ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          <Box sx={{ height: 400, mb: 3, borderRadius: 2, overflow: 'hidden', border: '1px solid #EAEAEA' }}>
            <MapContainer center={DEFAULT_CENTER} zoom={12} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {view === 'pins' && pinned.map((s) => (
                <Marker key={s.id} position={[s.gps_lat, s.gps_lng]} icon={speciesIcon(s.species)}>
                  <Tooltip direction="top" offset={[0, -13]}>
                    <Typography variant="subtitle2" sx={{ textTransform: 'capitalize' }}>{s.species}</Typography>
                    {s.behaviour_tags?.length > 0 && (
                      <Typography variant="body2">Behaviour: {s.behaviour_tags.join(', ')}</Typography>
                    )}
                    {s.floor_level && <Typography variant="body2">Floor: {s.floor_level}</Typography>}
                    {s.block_number && <Typography variant="body2">Block: {s.block_number}</Typography>}
                    <Typography variant="caption">{new Date(s.createdAt).toLocaleString()}</Typography>
                  </Tooltip>
                  <Popup>
                    <Typography variant="subtitle2" sx={{ textTransform: 'capitalize' }}>{s.species}</Typography>
                    {s.behaviour_tags?.length > 0 && (
                      <Typography variant="body2">Behaviour: {s.behaviour_tags.join(', ')}</Typography>
                    )}
                    {s.floor_level && <Typography variant="body2">Floor: {s.floor_level}</Typography>}
                    {s.block_number && <Typography variant="body2">Block: {s.block_number}</Typography>}
                    <Typography variant="caption">{new Date(s.createdAt).toLocaleString()}</Typography>
                  </Popup>
                </Marker>
              ))}
              {view === 'heatmap' && <HeatLayer points={heatPoints} />}
            </MapContainer>
          </Box>

          <Typography variant="h6" sx={{ mb: 1 }}>Hotspots by Block</Typography>
          {hotspots.length === 0 && <Typography>No hotspots found</Typography>}

          {hotspots.map((hotspot) => (
            <Card key={hotspot.block_number} sx={{ mb: 2 }}>
              <CardActionArea onClick={() => handleBlockClick(hotspot.block_number)}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <LocationOnIcon fontSize="small" color="action" />
                      <Typography variant="h6">Block {hotspot.block_number}</Typography>
                    </Box>
                    <Chip label={`${hotspot.total} total`} size="small" />
                  </Box>
                  <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                    {Object.entries(hotspot.breakdown).map(([species, count]) => (
                      <Chip
                        key={species}
                        icon={<SpeciesIcon species={species} />}
                        label={`${species}: ${count}`}
                        size="small"
                        variant="outlined"
                        sx={{ textTransform: 'capitalize' }}
                      />
                    ))}
                  </Stack>
                </CardContent>
              </CardActionArea>

              <Collapse in={expandedBlock === hotspot.block_number} unmountOnExit>
                <Box sx={{ px: 2, pb: 2 }}>
                  <Divider sx={{ mb: 2 }} />
                  {summaryLoading && <Typography>Loading summary...</Typography>}
                  {!summaryLoading && summaryError && (
                    <Alert severity="error">{summaryError}</Alert>
                  )}
                  {!summaryLoading && !summaryError && summary && (
                    <>
                      <Stack direction="row" spacing={1} sx={{ mb: 0.5, alignItems: 'center' }}>
                        <Typography variant="subtitle2">AI Summary</Typography>
                        {summary.risk_level && (
                          <Chip
                            label={`${summary.risk_level} risk`}
                            size="small"
                            color={RISK_COLORS[summary.risk_level] || 'default'}
                            sx={{ textTransform: 'capitalize' }}
                          />
                        )}
                      </Stack>
                      <Typography sx={{ mb: 2 }}>{summary.summary}</Typography>
                      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Agency Recommendation</Typography>
                      <Stack spacing={0.5}>
                        {Object.entries(summary.agency_recommendation).map(([species, agency]) => (
                          <Typography key={species} variant="body2" sx={{ textTransform: 'capitalize' }}>
                            {species}: {agency}
                          </Typography>
                        ))}
                      </Stack>

                      <Divider sx={{ my: 2 }} />
                      <Button
                        variant="outlined"
                        size="small"
                        disabled={draftLoading}
                        onClick={() => handleDraftAlert(hotspot.block_number)}
                      >
                        {draftLoading ? 'Drafting...' : 'Draft alert email'}
                      </Button>
                      {draftError && <Alert severity="error" sx={{ mt: 2 }}>{draftError}</Alert>}

                      {draft && (
                        <Stack spacing={2} sx={{ mt: 2 }}>
                          <TextField
                            label="Recipient email"
                            size="small"
                            value={draft.to}
                            onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                          />
                          <TextField
                            label="Subject"
                            size="small"
                            value={draft.subject}
                            onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                          />
                          <TextField
                            label="Body"
                            size="small"
                            multiline
                            minRows={6}
                            value={draft.body}
                            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                          />
                          <Box>
                            <Button
                              variant="contained"
                              size="small"
                              disabled={sending}
                              onClick={() => handleSendAlert(hotspot.block_number)}
                            >
                              {sending ? 'Sending...' : 'Send alert'}
                            </Button>
                          </Box>
                          {sendResult && <Alert severity="success">{sendResult}</Alert>}
                          {sendError && <Alert severity="error">{sendError}</Alert>}
                        </Stack>
                      )}
                    </>
                  )}
                </Box>
              </Collapse>
            </Card>
          ))}
        </>
      )}
    </Box>
  );
}
