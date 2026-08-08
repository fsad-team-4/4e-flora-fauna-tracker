import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, CardActionArea, CardContent, Chip, Alert,
  Stack, Collapse, Divider, ToggleButton, ToggleButtonGroup, Button, TextField,
  IconButton, Autocomplete,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PetsIcon from '@mui/icons-material/Pets';
import FlutterDashIcon from '@mui/icons-material/FlutterDash';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import http from '../http';
import { formatBlock, TOKEN_SX, tokenVariant } from '../faunaDisplay';

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
      // Tuned to read at the default zoom of 12. `maxZoom` is the zoom at which
      // a point reaches full intensity, so pinning it at the default is what
      // stops the heat washing out when zoomed out.
      //
      // Colour tracks case volume: each sighting contributes 1.0, so `max: 8`
      // puts a lone sighting at 1/8 intensity - the blue end of the gradient,
      // faint but visible - and only as sightings stack in a block does it
      // climb through lime, yellow and orange to full red at 8. That matches
      // the urgent-by-volume threshold in the backend risk rules, so a block
      // reading red on the map is a block the API calls urgent.
      radius: 28,
      blur: 22,
      maxZoom: 12,
      max: 8,
      minOpacity: 0.15,
      gradient: { 0.2: 'blue', 0.4: 'lime', 0.6: 'yellow', 0.8: 'orange', 1.0: 'red' },
    }).addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, points]);
  return null;
}

// Moves the map onto a block's pinned sightings when one is expanded. Purely a
// viewport change - no layer is added or removed, so every pin stays on the map.
// A null/empty `points` leaves the current view alone.
function MapFocus({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points || points.length === 0) return;
    if (points.length === 1) {
      map.flyTo(points[0], 17, { duration: 1 });
    } else {
      map.flyToBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 17, duration: 1 });
    }
  }, [map, points]);
  return null;
}

// Risk level -> MUI chip colour.
const RISK_COLORS = { urgent: 'error', monitor: 'warning', routine: 'success' };

// The bucket the backend files sightings under when they carry no block_number.
// It is not a real block, so the block endpoints cannot resolve it - the card is
// rendered as a count only, with no expand, summary or drill-down.
const UNKNOWN_BLOCK = 'Unknown';

// How a bucket name is shown. The Unknown bucket gets its own wording because
// formatBlock would render it as "Block Unknown". Shared by the card heading and
// the block selector so the two can never drift apart.
function blockLabel(block) {
  return block === UNKNOWN_BLOCK ? 'Unknown block' : formatBlock(block);
}

// The window this page reports on. Sent to every call the page makes so the map
// pins, the heat and the block cards all describe the same period - 30 matches
// the backend default used by the hotspot, summary and alert endpoints.
const HOTSPOT_DAYS = 30;

// True only for a pointer that can genuinely hover (a mouse or trackpad).
//
// Leaflet binds a non-permanent tooltip to click and focus as well as mouseover,
// but its only close paths are mouseout and blur - neither of which a touch tap
// produces - and it never closes a tooltip when a popup opens. On touch the
// tooltip therefore stays open behind the popup as a stray box. Not rendering it
// at all means those handlers are never bound, so the artifact cannot occur.
// Touch loses nothing: the Popup already carries everything the Tooltip showed,
// plus notes and photo.
const HAS_HOVER = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

// Default map view - central Singapore.
const DEFAULT_CENTER = [1.3521, 103.8198];

export default function FaunaHotspots() {
  const navigate = useNavigate();
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

  // Drill-down list of the sightings behind the expanded block. `listOpen` is
  // the card's own close button, independent of whether the block is expanded.
  const [blockSightings, setBlockSightings] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [listOpen, setListOpen] = useState(false);

  // Coordinates the map should move to. A new array identity per block click is
  // what re-triggers the fly, so re-expanding the same block re-focuses it.
  const [mapFocus, setMapFocus] = useState(null);

  // block_number -> the card's DOM node, so the block selector can scroll the
  // right card into view.
  const blockRefs = useRef({});

  useEffect(() => {
    Promise.all([
      http.get('/api/fauna', { params: { days: HOTSPOT_DAYS } }),
      http.get('/api/fauna/hotspots', { params: { days: HOTSPOT_DAYS } }),
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

  // Expands a block, focuses the map on it, loads its panels and scrolls its card
  // into view. Shared by the card click and the block selector, so both land the
  // user in exactly the same state.
  const openBlock = (block) => {
    resetDraft();
    setExpandedBlock(block);

    // The card is already mounted, so it can be scrolled to immediately; the
    // Collapse animates open underneath it.
    blockRefs.current[block]?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Focus the map on this block. Blocks with no GPS-tagged sighting leave the
    // map untouched rather than jumping somewhere arbitrary. The Unknown bucket
    // matches the blockless rows, which is where its own pins come from.
    const blockPoints = pinned
      .filter((s) => (block === UNKNOWN_BLOCK ? !s.block_number : s.block_number === block))
      .map((s) => [s.gps_lat, s.gps_lng]);
    if (blockPoints.length > 0) {
      setMapFocus(blockPoints);
    }

    setBlockSightings([]);
    setListError('');
    setListOpen(true);
    setListLoading(true);
    http
      .get(`/api/fauna/hotspots/${encodeURIComponent(block)}/sightings`, { params: { days: HOTSPOT_DAYS } })
      .then((res) => setBlockSightings(res.data))
      .catch(() => setListError('Failed to load sightings'))
      .finally(() => setListLoading(false));

    setSummary(null);
    setSummaryError('');

    // The Unknown bucket is not a real block, so a risk level, an AI summary and
    // an alert email would all be meaningless for it - it opens as a plain list.
    if (block === UNKNOWN_BLOCK) {
      setSummaryLoading(false);
      return;
    }

    setSummaryLoading(true);
    http
      .get(`/api/fauna/hotspots/${encodeURIComponent(block)}/summary`, { params: { days: HOTSPOT_DAYS } })
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

  // Card clicks toggle: clicking the open block collapses it again.
  const handleBlockClick = (block) => {
    if (expandedBlock === block) {
      resetDraft();
      setExpandedBlock(null);
      return;
    }
    openBlock(block);
  };

  const handleDraftAlert = (block) => {
    resetDraft();
    setDraftLoading(true);
    http
      .post(`/api/fauna/hotspots/${encodeURIComponent(block)}/alert-draft`, null, { params: { days: HOTSPOT_DAYS } })
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
                  {HAS_HOVER && (
                    <Tooltip direction="top" offset={[0, -13]}>
                      <Typography variant="subtitle2" sx={{ textTransform: 'capitalize' }}>{s.species}</Typography>
                      {s.behaviour_tags?.length > 0 && (
                        <Typography variant="body2">Behaviour: {s.behaviour_tags.join(', ')}</Typography>
                      )}
                      {s.floor_level && <Typography variant="body2">Floor: {s.floor_level}</Typography>}
                      {s.block_number && <Typography variant="body2">{s.block_number}</Typography>}
                      <Typography variant="caption">{new Date(s.createdAt).toLocaleString()}</Typography>
                    </Tooltip>
                  )}
                  <Popup>
                    <Typography variant="subtitle2" sx={{ textTransform: 'capitalize' }}>{s.species}</Typography>
                    {s.behaviour_tags?.length > 0 && (
                      <Typography variant="body2">Behaviour: {s.behaviour_tags.join(', ')}</Typography>
                    )}
                    {s.floor_level && <Typography variant="body2">Floor: {s.floor_level}</Typography>}
                    {s.block_number && <Typography variant="body2">{s.block_number}</Typography>}
                    <Typography variant="caption">{new Date(s.createdAt).toLocaleString()}</Typography>
                    {/* notes and photo only on click, never in the hover Tooltip */}
                    {s.notes && (
                      <Typography variant="body2" sx={{ mt: 1 }}>{s.notes}</Typography>
                    )}
                    {s.photo_url && (
                      <Box
                        component="img"
                        src={s.photo_url}
                        alt="Sighting"
                        sx={{ display: 'block', mt: 1, maxWidth: 180, height: 'auto', borderRadius: 1 }}
                      />
                    )}
                  </Popup>
                </Marker>
              ))}
              {view === 'heatmap' && <HeatLayer points={heatPoints} />}
              <MapFocus points={mapFocus} />
            </MapContainer>
          </Box>

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{ mb: 1.5, justifyContent: 'space-between', alignItems: { sm: 'center' } }}
          >
            <Typography variant="h6">Hotspots by Block</Typography>
            <Autocomplete
              options={hotspots.map((h) => h.block_number)}
              getOptionLabel={(option) => blockLabel(option)}
              // Acts as an action, not a selection: the value is cleared after each
              // jump so picking the same block again re-jumps to it.
              value={null}
              blurOnSelect
              onChange={(_, block) => { if (block) openBlock(block); }}
              size="small"
              sx={{ minWidth: 240 }}
              renderInput={(params) => <TextField {...params} label="Jump to block" />}
            />
          </Stack>
          {hotspots.length === 0 && <Typography>No hotspots found</Typography>}

          {hotspots.map((hotspot) => {
            // The Unknown bucket is not a real block, so the block endpoints
            // cannot resolve it. Render it as a count only - no click target and
            // no Collapse, so it can never fire a request that 404s.
            const isUnknown = hotspot.block_number === UNKNOWN_BLOCK;

            const cardBody = (
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <LocationOnIcon fontSize="small" color="action" />
                    <Typography variant="h6">
                      {blockLabel(hotspot.block_number)}
                    </Typography>
                  </Box>
                  <Chip label={`${hotspot.total} total`} size="small" variant="outlined" sx={TOKEN_SX} />
                </Box>
                <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                  {Object.entries(hotspot.breakdown).map(([species, count]) => (
                    <Chip
                      key={species}
                      icon={<SpeciesIcon species={species} />}
                      label={`${species}: ${count}`}
                      size="small"
                      variant="outlined"
                      sx={TOKEN_SX}
                    />
                  ))}
                </Stack>
                {isUnknown && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                    Sightings logged without a block number. Click to review individually - no
                    summary or alert available since these aren&apos;t attributed to a specific block.
                    Open a sighting&apos;s detail page to set its block number.
                  </Typography>
                )}
              </CardContent>
            );

            return (
            <Card
              key={hotspot.block_number}
              ref={(node) => { blockRefs.current[hotspot.block_number] = node; }}
              sx={{ mb: 2 }}
            >
              <CardActionArea onClick={() => handleBlockClick(hotspot.block_number)}>
                {cardBody}
              </CardActionArea>

              <Collapse in={expandedBlock === hotspot.block_number} unmountOnExit>
                <Box sx={{ px: 2, pb: 2 }}>
                  <Divider sx={{ mb: 2 }} />
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-start">
                    {/* The Unknown bucket has no block to summarise, so its panel is
                        the sightings list alone - no risk chip, summary or alert. */}
                    {!isUnknown && (
                    <Box sx={{ flex: 1, minWidth: 0 }}>
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
                            label={summary.risk_level}
                            size="small"
                            color={RISK_COLORS[summary.risk_level] || 'default'}
                            variant={tokenVariant(RISK_COLORS[summary.risk_level])}
                            sx={TOKEN_SX}
                          />
                        )}
                      </Stack>
                      <Typography sx={{ mb: 2 }}>{summary.summary}</Typography>
                      {summary.behaviour_tags?.length > 0 && (
                        <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
                          {summary.behaviour_tags.map((tag) => (
                            <Chip
                              key={tag}
                              label={tag}
                              size="small"
                              variant="outlined"
                              sx={TOKEN_SX}
                            />
                          ))}
                        </Stack>
                      )}
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
                    )}

                    {listOpen && (
                      <Card variant="outlined" sx={{ width: { xs: '100%', md: 320 }, flexShrink: 0, bgcolor: 'action.hover' }}>
                        <CardContent>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                            <Typography variant="subtitle2">
                              {isUnknown ? 'Sightings without a block' : 'Sightings in this block'}
                            </Typography>
                            <IconButton size="small" aria-label="Hide sightings" onClick={() => setListOpen(false)}>
                              <CloseIcon fontSize="small" />
                            </IconButton>
                          </Box>

                          {listLoading && <Typography variant="body2">Loading sightings...</Typography>}
                          {!listLoading && listError && <Alert severity="error">{listError}</Alert>}
                          {!listLoading && !listError && blockSightings.length === 0 && (
                            <Typography variant="body2">No sightings found</Typography>
                          )}

                          <Stack divider={<Divider />}>
                            {blockSightings.map((s) => (
                              <Box
                                key={s.id}
                                onClick={() => navigate(`/fauna/${s.id}`)}
                                sx={{ py: 1, cursor: 'pointer', '&:hover': { opacity: 0.7 } }}
                              >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <SpeciesIcon species={s.species} fontSize="small" color="action" />
                                  <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                                    {s.species}
                                  </Typography>
                                </Box>
                                <Typography variant="caption" color="text.secondary" display="block">
                                  {s.reporter?.name || 'Unknown'} - {new Date(s.createdAt).toLocaleDateString()}
                                </Typography>
                                {s.untagged_mentions?.length > 0 && (
                                  <Chip
                                    label={`Notes mention: ${s.untagged_mentions.join(', ')}`}
                                    size="small"
                                    variant="outlined"
                                    sx={{ ...TOKEN_SX, mt: 0.5 }}
                                  />
                                )}
                              </Box>
                            ))}
                          </Stack>
                        </CardContent>
                      </Card>
                    )}
                  </Stack>
                </Box>
              </Collapse>
            </Card>
            );
          })}
        </>
      )}
    </Box>
  );
}
