import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polygon, Popup, Tooltip, useMap } from 'react-leaflet';
import { Card, CardContent, Box, Stack, Typography, Chip, Skeleton } from '@mui/material';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import 'leaflet/dist/leaflet.css';
import { BRAND, CHART, CATEGORY_COLORS } from '../../theme';
import http from '../../http';

const RAMP = CHART.ramp;                       // 5-step sequential blue = MAGNITUDE (rodent severity), not status
const FEEDING_INK = CATEGORY_COLORS.community_cat; // navy = a CATEGORY (feeding), matching the Behavioural Diagnosis card
const BAND_LABEL = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };
const SPECIES_LABEL = { cat: 'Cat', pigeon: 'Pigeon', crow: 'Crow', mynah: 'Mynah', other: 'Other' };
const SG_CENTER = [1.3690, 103.8456]; // fallback view only; the boundary + real points drive the bounds

// Illustrative estate extent for the SYNTHETIC demo fixtures (one Ang Mo Kio
// estate). Drawn so "no reports here" reads as a real statement about a bounded
// area rather than empty space. It is a fixed context outline, not an official
// cadastral boundary - and it never places or moves any data point.
const ESTATE_BOUNDARY = [
  [1.37080, 103.84470],
  [1.37080, 103.84720],
  [1.36960, 103.84760],
  [1.36740, 103.84700],
  [1.36730, 103.84500],
  [1.36840, 103.84440],
];

// Rodent fill from the sequential-blue ramp, keyed to severity-weighted intensity.
function rampColor(weighted, scaleMax) {
  if (!weighted || !scaleMax) return RAMP[0];
  const frac = Math.min(1, weighted / scaleMax);
  const idx = Math.max(0, Math.min(RAMP.length - 1, Math.ceil(frac * RAMP.length) - 1));
  return RAMP[idx];
}

// Rodent radius encodes how MANY reports back the point, so one report and eight
// are visually different even at the same severity (which drives colour).
function radiusFor(count) {
  return 8 + Math.min(16, (count - 1) * 4);
}

function fmtDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function speciesSummary(species) {
  return Object.entries(species || {})
    .map(([k, v]) => `${v} ${SPECIES_LABEL[k] || k}`)
    .join(' · ');
}

// Fit the viewport to everything drawn (boundary + both layers' points) once it
// loads. Never invents a view - the boundary alone gives a stable estate-scale
// frame, and every reported point is guaranteed to be inside it.
function FitToAll({ latlngs }) {
  const map = useMap();
  useEffect(() => {
    if (!latlngs.length) return;
    if (latlngs.length === 1) map.setView(latlngs[0], 17);
    else map.fitBounds(latlngs, { padding: [30, 30], maxZoom: 18 });
  }, [latlngs, map]);
  return null;
}

// A pill toggle for one layer. Shows the layer's swatch (disc vs ring, mirroring
// the map marks), a count, and an eye icon - so on/off never rests on colour alone.
function LayerToggle({ active, disabled, onClick, swatch, label }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      sx={{
        display: 'inline-flex', alignItems: 'center', gap: 0.75,
        px: 1.25, py: 0.6, borderRadius: '999px', font: 'inherit', fontSize: 12.5, fontWeight: 600,
        border: `1px solid ${active && !disabled ? BRAND.slate : BRAND.border}`,
        bgcolor: active && !disabled ? BRAND.section : '#fff',
        color: disabled ? BRAND.textLight : BRAND.text,
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        '&:focus-visible': { outline: `2px solid ${BRAND.primary}`, outlineOffset: 2 },
      }}
    >
      {swatch}
      <span>{label}</span>
      {active
        ? <VisibilityOutlinedIcon sx={{ fontSize: 16 }} />
        : <VisibilityOffOutlinedIcon sx={{ fontSize: 16 }} />}
    </Box>
  );
}

const RodentSwatch = () => <Box aria-hidden sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: RAMP[3], flexShrink: 0 }} />;
const FeedingSwatch = () => <Box aria-hidden sx={{ width: 12, height: 12, borderRadius: '50%', border: `3px solid ${FEEDING_INK}`, boxSizing: 'border-box', flexShrink: 0 }} />;

// Build the coverage sentence for one layer - the map's honesty about its own
// reach. Unmapped reports are stated, never placed. Deliberately prominent.
function coverageLine({ error, total, mapped, unmapped, noun, windowDays }) {
  if (error) return `${noun} coverage unavailable.`;
  if (total === 0) return `No ${noun} in the last ${windowDays} days.`;
  if (mapped === 0) return `0 of ${total} ${noun} in the last ${windowDays} days have a recorded location - nothing is shown at a guessed position.`;
  return `${mapped} of ${total} ${noun} in the last ${windowDays} days have a recorded location${unmapped ? `; the other ${unmapped} ${unmapped === 1 ? 'is' : 'are'} not shown (never placed at a guessed spot)` : ''}.`;
}

/**
 * Rodent Risk & Feeding Map. Two honest layers over reported coordinates only:
 *   - Rodent risk: filled discs, colour = severity weight (CHART.ramp magnitude),
 *     size = how many reports back the point.
 *   - Feeding sightings: hollow rings, a single CATEGORY colour - overlaid so the
 *     feeding/rodent co-occurrence the Behavioural Diagnosis computes is visible
 *     on the ground. Proximity is co-occurrence worth investigating, never proof.
 * Each layer toggles independently. Unmapped reports are counted, never placed.
 */
export default function RodentRiskMap() {
  const [state, setState] = useState({
    loading: true, error: false, windowDays: 30, scaleMax: 0, points: [],
    totalAssessments: 0, mappedCount: 0, unmappedCount: 0,
    feeding: { total: 0, mappedCount: 0, unmappedCount: 0, points: [] },
  });
  const [showRodent, setShowRodent] = useState(true);
  const [showFeeding, setShowFeeding] = useState(true);

  useEffect(() => {
    let alive = true;
    http.get('/api/rodent-riskmap')
      .then(r => { if (alive) setState({ loading: false, error: false, ...r.data }); })
      .catch(() => { if (alive) setState(s => ({ ...s, loading: false, error: true })); });
    return () => { alive = false; };
  }, []);

  const { scaleMax, mappedCount, totalAssessments, unmappedCount, windowDays } = state;
  const rodentPoints = state.points || [];
  const feeding = state.feeding || { total: 0, mappedCount: 0, unmappedCount: 0, points: [] };
  const feedingPoints = feeding.points || [];
  const hasGeometry = rodentPoints.length > 0 || feedingPoints.length > 0;

  // fit to the boundary plus every reported point (union), so nothing is off-screen.
  // Keyed on the raw state fields so the memo is stable across renders.
  const allLatLngs = useMemo(() => {
    const rp = state.points || [];
    const fp = state.feeding?.points || [];
    return [...ESTATE_BOUNDARY, ...rp.map(p => [p.lat, p.lng]), ...fp.map(p => [p.lat, p.lng])];
  }, [state.points, state.feeding]);

  const rodentCoverage = coverageLine({
    error: state.error, total: totalAssessments, mapped: mappedCount, unmapped: unmappedCount,
    noun: 'rodent assessments', windowDays,
  });
  const feedingCoverage = coverageLine({
    error: state.error, total: feeding.total, mapped: feeding.mappedCount, unmapped: feeding.unmappedCount,
    noun: 'feeding sightings', windowDays,
  });

  return (
    <Card>
      <CardContent sx={{ p: 3 }}>
        <Typography component="h2" variant="h6" fontWeight={700} sx={{ color: BRAND.heading }}>
          Rodent Risk & Feeding Map
        </Typography>
        <Typography variant="body2" sx={{ color: BRAND.textLight, mb: 1.5 }}>
          Reported positions only, over the last {windowDays} days. Filled discs are rodent risk
          (colour = severity, size = number of reports); rings are feeding sightings. Where the two
          sit close together, that is co-occurrence worth investigating - not proof of cause.
        </Typography>

        {/* coverage statements - one per layer, kept prominent (not a footnote) */}
        {!state.loading && (
          <Box sx={{ p: 1.5, mb: 2, bgcolor: BRAND.section, borderRadius: '8px' }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', mb: 0.75 }}>
              <RodentSwatch />
              <Typography sx={{ fontSize: 13, color: BRAND.text, lineHeight: 1.5 }}>{rodentCoverage}</Typography>
            </Stack>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
              <FeedingSwatch />
              <Typography sx={{ fontSize: 13, color: BRAND.text, lineHeight: 1.5 }}>{feedingCoverage}</Typography>
            </Stack>
          </Box>
        )}

        {/* independent layer toggles */}
        {!state.loading && !state.error && (
          <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
            <LayerToggle
              active={showRodent}
              disabled={rodentPoints.length === 0}
              onClick={() => setShowRodent(v => !v)}
              swatch={<RodentSwatch />}
              label={`Rodent risk (${rodentPoints.length})`}
            />
            <LayerToggle
              active={showFeeding}
              disabled={feedingPoints.length === 0}
              onClick={() => setShowFeeding(v => !v)}
              swatch={<FeedingSwatch />}
              label={`Feeding sightings (${feedingPoints.length})`}
            />
          </Stack>
        )}

        {state.loading ? (
          <Skeleton variant="rounded" height={420} />
        ) : state.error ? (
          <Typography variant="body2" sx={{ color: BRAND.textLight, py: 6, textAlign: 'center' }}>
            Map unavailable right now.
          </Typography>
        ) : !hasGeometry ? (
          <Typography variant="body2" sx={{ color: BRAND.textLight, py: 6, textAlign: 'center' }}>
            No reported positions to map in this window.
          </Typography>
        ) : (
          <>
            <Box sx={{ height: 420, borderRadius: '10px', overflow: 'hidden', border: `1px solid ${BRAND.border}` }}>
              <MapContainer center={SG_CENTER} zoom={16} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
                {/* muted greyscale basemap - shop/POI icons on the standard OSM tiles
                    competed with the data and won; Positron recedes so the data leads */}
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                  url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                  subdomains="abcd"
                  maxZoom={20}
                />
                <FitToAll latlngs={allLatLngs} />

                {/* estate boundary - context so "no reports here" is meaningful */}
                <Polygon
                  positions={ESTATE_BOUNDARY}
                  pathOptions={{ color: BRAND.slate, weight: 1.5, opacity: 0.6, dashArray: '6 6', fill: true, fillColor: BRAND.slate, fillOpacity: 0.04 }}
                />

                {/* Layer 1: rodent risk - filled discs, ramp colour by severity, size by count */}
                {showRodent && rodentPoints.map((p, i) => (
                  <CircleMarker
                    key={`r-${p.lat},${p.lng},${i}`}
                    center={[p.lat, p.lng]}
                    radius={radiusFor(p.count)}
                    pathOptions={{ color: '#37474F', weight: 1, fillColor: rampColor(p.weightedScore, scaleMax), fillOpacity: 0.85 }}
                  >
                    {p.count > 1 && (
                      <Tooltip permanent direction="center" className="rodent-count-label">{p.count}</Tooltip>
                    )}
                    <Popup>
                      <Box sx={{ minWidth: 200 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.heading }}>
                          {p.block || 'Unlabelled block'} · {p.count} rodent report{p.count === 1 ? '' : 's'}
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: BRAND.textLight, mb: 1 }}>
                          Peak {BAND_LABEL[p.riskLevel] || p.riskLevel} · weighted {p.weightedScore}
                        </Typography>
                        <Stack spacing={0.75} sx={{ maxHeight: 180, overflowY: 'auto' }}>
                          {p.assessments.map(a => (
                            <Box key={a.id} sx={{ borderTop: `1px solid ${BRAND.border}`, pt: 0.5 }}>
                              <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 0.25 }}>
                                <Typography sx={{ fontSize: 11.5, fontWeight: 700 }}>{fmtDate(a.createdAt)}</Typography>
                                <Chip label={BAND_LABEL[a.risk_level] || a.risk_level} size="small" sx={{ height: 16, fontSize: 10 }} />
                                {a.floor_level && <Typography sx={{ fontSize: 11, color: BRAND.textLight }}>{a.floor_level}</Typography>}
                              </Stack>
                              <Typography sx={{ fontSize: 11.5, color: BRAND.text, lineHeight: 1.45 }}>{a.observations}</Typography>
                            </Box>
                          ))}
                        </Stack>
                      </Box>
                    </Popup>
                  </CircleMarker>
                ))}

                {/* Layer 2: feeding sightings - hollow rings (a different KIND of mark),
                    one category colour, faint fill so they read as a halo not a disc */}
                {showFeeding && feedingPoints.map((p, i) => (
                  <CircleMarker
                    key={`f-${p.lat},${p.lng},${i}`}
                    center={[p.lat, p.lng]}
                    radius={11}
                    pathOptions={{ color: FEEDING_INK, weight: 3, fillColor: FEEDING_INK, fillOpacity: 0.1 }}
                  >
                    {p.count > 1 && (
                      <Tooltip permanent direction="center" className="feeding-count-label">{p.count}</Tooltip>
                    )}
                    <Popup>
                      <Box sx={{ minWidth: 200 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.heading }}>
                          {p.block || 'Unlabelled block'} · {p.count} feeding sighting{p.count === 1 ? '' : 's'}
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: BRAND.textLight, mb: 1 }}>
                          {speciesSummary(p.species)}
                        </Typography>
                        <Stack spacing={0.75} sx={{ maxHeight: 180, overflowY: 'auto' }}>
                          {p.sightings.map(sg => (
                            <Box key={sg.id} sx={{ borderTop: `1px solid ${BRAND.border}`, pt: 0.5 }}>
                              <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 0.25 }}>
                                <Typography sx={{ fontSize: 11.5, fontWeight: 700 }}>{fmtDate(sg.createdAt)}</Typography>
                                {sg.species && <Chip label={SPECIES_LABEL[sg.species] || sg.species} size="small" sx={{ height: 16, fontSize: 10 }} />}
                                {sg.floor_level && <Typography sx={{ fontSize: 11, color: BRAND.textLight }}>{sg.floor_level}</Typography>}
                              </Stack>
                              {sg.notes && <Typography sx={{ fontSize: 11.5, color: BRAND.text, lineHeight: 1.45 }}>{sg.notes}</Typography>}
                            </Box>
                          ))}
                        </Stack>
                      </Box>
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            </Box>

            {/* legend: names both layers and both scales (magnitude vs category) */}
            <Stack spacing={0.75} sx={{ mt: 1.5 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
                <RodentSwatch />
                <Typography sx={{ fontSize: 11.5, color: BRAND.textLight }}>Rodent risk</Typography>
                <Typography sx={{ fontSize: 11, color: BRAND.textLight }}>less</Typography>
                <Box aria-hidden sx={{ width: 96, height: 8, borderRadius: 4, background: `linear-gradient(90deg, ${RAMP.join(',')})` }} />
                <Typography sx={{ fontSize: 11, color: BRAND.textLight }}>more severe</Typography>
                <Typography sx={{ fontSize: 11.5, color: BRAND.textLight }}>
                  · scale max = {scaleMax} (severity-weighted) · larger disc = more reports
                </Typography>
              </Stack>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
                <FeedingSwatch />
                <Typography sx={{ fontSize: 11.5, color: BRAND.textLight }}>
                  Feeding sighting (food source, one category) · number = sightings at that spot
                </Typography>
              </Stack>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Box aria-hidden sx={{ width: 12, height: 0, borderTop: `2px dashed ${BRAND.slate}`, opacity: 0.6, flexShrink: 0 }} />
                <Typography sx={{ fontSize: 11.5, color: BRAND.textLight }}>Estate boundary (demo extent)</Typography>
              </Stack>
            </Stack>
          </>
        )}
      </CardContent>
    </Card>
  );
}
