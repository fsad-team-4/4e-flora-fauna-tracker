import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Box, Stack, Typography, Skeleton, GlobalStyles } from '@mui/material';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import OpenInFullRoundedIcon from '@mui/icons-material/OpenInFullRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import 'leaflet/dist/leaflet.css';
import { BRAND, ON_SURFACE } from '../../theme';
import { useThemeMode } from '../../contexts/ThemeModeContext';
import { SEVERITY, SG_CENTER, BASEMAPS, TILE_ATTR } from './rodentMapTokens';
import http from '../../http';

/**
 * Small read-only preview of the rodent risk map. The whole card is one big link.
 *
 * NOT a shrunken RodentRiskMap: that component is a full-page route that emits its own
 * <main>/<header>/<h1> and app-wide GlobalStyles, so embedding it would nest landmarks and
 * duplicate the page heading. This is a deliberately minimal sibling that shares only the
 * severity palette and basemap constants, so pin colours can never drift from the full map.
 *
 * It reads the SAME endpoint as the full map rather than plotting the assessment rows the
 * page already holds: those rows are capped at 50, filter-scoped and un-aggregated, so pins
 * drawn from them would stack on shared coordinates, carry no severity weighting, and
 * silently redraw whenever the operator filtered.
 *
 * Interaction is disabled on purpose - every handler below is off. A scroll-zooming map
 * inside a long page steals the wheel, and a preview that can be panned invites the reader
 * to explore a 210px window instead of opening the real thing.
 */

/**
 * FRAME THE DATA, NOT A FIXED POINT. This is a correctness fix, not a styling one.
 *
 * The preview opened at `center={SG_CENTER} zoom={15}`, which is a roughly 1km view of Ang
 * Mo Kio - and the estate's reports run from Toa Payoh to Sembawang. Measured against the
 * live payload: 26 locations returned, 11 inside that frame. Fifteen were off-screen while
 * the caption underneath announced "17 high-risk locations", so the card asserted a total it
 * was visibly not showing, which is the one thing this map's coverage caveat exists to
 * prevent.
 *
 * Fits once per data change with padding, and never on user interaction, because there is
 * none. `maxZoom` caps how far in it will go: with a single location, fitBounds would
 * otherwise zoom to street level and the preview would read as one building rather than as
 * an estate.
 */
function FitPoints({ latlngs }) {
  const map = useMap();
  useEffect(() => {
    if (!latlngs.length) return;
    map.fitBounds(L.latLngBounds(latlngs), { padding: [24, 24], maxZoom: 14, animate: false });
  }, [map, latlngs]);
  return null;
}

/**
 * Coarse geographic binning, so the preview shows DENSITY rather than scattered pins.
 *
 * Two reasons, and the second is the important one:
 *
 * At this size individual pins overlap - 26 locations across the island in a 210px-tall card
 * puts several on top of each other, so the count on whichever draws underneath is
 * unreadable. Binning replaces them with one bubble carrying the summed total.
 *
 * And a scattered pin with a tooltip ADVERTISES that it can be clicked, on a card where
 * nothing can be. That mismatch is the whole reason the tooltips are gone and the markers
 * are `interactive={false}`: the card has exactly one action - open the full map - and every
 * pixel of it should point at that rather than offering a per-pin interaction it will not
 * honour.
 *
 * ~0.02 degrees is about 2.2km, which at preview zoom is roughly a marker's own width. Bins
 * take the WORST severity of their members, not an average: a bubble containing one critical
 * report must not be softened by the four low ones beside it.
 */
const BIN_DEG = 0.02;
const BAND_RANK = { low: 0, medium: 1, high: 2, critical: 3 };

function binPoints(points) {
  const bins = new Map();
  points.forEach(p => {
    const key = `${Math.round(p.lat / BIN_DEG)},${Math.round(p.lng / BIN_DEG)}`;
    const b = bins.get(key) || { latSum: 0, lngSum: 0, w: 0, count: 0, level: 'low' };
    // count-weighted centre, so the bubble sits nearer where most reports actually are
    b.latSum += p.lat * p.count;
    b.lngSum += p.lng * p.count;
    b.w += p.count;
    b.count += p.count;
    if ((BAND_RANK[p.riskLevel] ?? 0) > BAND_RANK[b.level]) b.level = p.riskLevel;
    bins.set(key, b);
  });
  return [...bins.values()].map(b => ({
    lat: b.latSum / b.w,
    lng: b.lngSum / b.w,
    count: b.count,
    level: b.level,
  }));
}

// Leaflet's default marker PNGs are not wired up for Vite anywhere in this project,
// so every map here builds pins from divIcon HTML instead.
function pinIcon(level, count) {
  const sv = SEVERITY[level] || SEVERITY.high;
  // scaled by volume, capped so one busy bin cannot swallow the card
  const size = Math.min(34, 18 + String(count).length * 5 + Math.min(8, count));
  return L.divIcon({
    className: 'rkp-pin',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${sv.solid};
      border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.25);color:${sv.onSolid};
      font-size:11px;font-weight:800;display:grid;place-items:center;line-height:1">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export default function RiskMapPreview({ windowDays = 30 }) {
  const { resolvedMode } = useThemeMode();
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, error: false, points: [], mapped: 0, total: 0 });

  useEffect(() => {
    let alive = true;
    http.get('/api/rodent-riskmap', { params: { windowDays } })
      .then(r => {
        if (!alive) return;
        setState({
          loading: false, error: false,
          points: r.data.points || [],
          mapped: r.data.mappedCount || 0,
          total: r.data.totalAssessments || 0,
        });
      })
      .catch(() => { if (alive) setState(s => ({ ...s, loading: false, error: true })); });
    return () => { alive = false; };
  }, [windowDays]);

  const basemap = resolvedMode === 'dark' ? BASEMAPS.dark : BASEMAPS.muted;
  const hot = useMemo(
    () => state.points.filter(p => p.riskLevel === 'high' || p.riskLevel === 'critical').length,
    [state.points],
  );
  const bins = useMemo(() => binPoints(state.points), [state.points]);
  const latlngs = useMemo(() => state.points.map(p => [p.lat, p.lng]), [state.points]);

  const open = () => navigate('/rodent-heatmap');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* scoped to this card's pins only - the full map ships its own chrome styles */}
      <GlobalStyles styles={{ '.rkp-pin': { background: 'transparent', border: 'none' } }} />

      {/* The "View full map" text link that used to sit here is gone. The whole card is
          the target now, so a small link competing for the same action just gave the reader
          two things to aim at, one of them 90px wide. */}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.25 }}>
        <MapOutlinedIcon sx={{ fontSize: 17, color: BRAND.textLight }} />
        <Typography component="h2" sx={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: BRAND.text, flexGrow: 1 }}>
          Risk map
        </Typography>
      </Stack>

      {state.loading ? (
        <Skeleton variant="rounded" sx={{ flexGrow: 1, minHeight: 210 }} />
      ) : state.error ? (
        <Box sx={{ flexGrow: 1, minHeight: 210, borderRadius: '10px', border: `1px solid ${BRAND.border}`, display: 'grid', placeItems: 'center' }}>
          <Typography sx={{ fontSize: 12.5, color: BRAND.textLight }}>Map preview unavailable.</Typography>
        </Box>
      ) : (
        /* THE ENTIRE MAP IS THE BUTTON.
         *
         * A <button>, not a RouterLink wrapper, and that is not a stylistic choice: Leaflet
         * renders its attribution as an <a>, and an anchor inside an anchor is invalid HTML
         * that browsers silently un-nest - which would have broken the very click target
         * this is meant to enlarge. A button can legally contain the anchor, and navigation
         * goes through useNavigate instead.
         *
         * The overlay pill below is the visible affordance and it is inside this button, so
         * there is one focus stop and one action rather than a card and a link that both do
         * the same thing.
         */
        <Box
          component="button"
          type="button"
          onClick={open}
          aria-label="Open the full rodent risk map"
          sx={{
            position: 'relative', display: 'block', p: 0, font: 'inherit', textAlign: 'left',
            flexGrow: 1, minHeight: 210, width: '100%', cursor: 'pointer',
            borderRadius: '10px', overflow: 'hidden', border: `1px solid ${BRAND.border}`,
            transition: 'box-shadow .2s ease, border-color .2s ease',
            '& .leaflet-container': { bgcolor: BRAND.canvas, height: '100%', width: '100%' },
            // The map itself is NOT scaled on hover. transform on the container forces
            // Leaflet to re-raster its tiles and the pins visibly lag the basemap; the
            // veil and the lift carry the same "this is a gateway" cue without touching
            // the map's own geometry.
            '&:hover': { boxShadow: '0 8px 20px -6px rgba(16,24,40,.22)', borderColor: ON_SURFACE.info },
            '&:hover .rkp-veil, &:focus-visible .rkp-veil': { opacity: 1 },
            '&:focus-visible': { outline: `2px solid ${BRAND.action}`, outlineOffset: 2 },
          }}
        >
          <MapContainer
            center={SG_CENTER}
            zoom={12}
            // read-only: every interaction is off. See the note at the top of the file.
            dragging={false}
            scrollWheelZoom={false}
            doubleClickZoom={false}
            touchZoom={false}
            boxZoom={false}
            keyboard={false}
            zoomControl={false}
            attributionControl
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer url={basemap.url} attribution={TILE_ATTR} subdomains="abcd" maxZoom={20} />
            <FitPoints latlngs={latlngs} />
            {bins.map(b => (
              <Marker
                key={`${b.lat},${b.lng}`}
                position={[b.lat, b.lng]}
                icon={pinIcon(b.level, b.count)}
                // no tooltip, no popup, not focusable: the card is the only interaction
                interactive={false}
                keyboard={false}
              />
            ))}
          </MapContainer>

          {/* Glass CTA, centred, over a veil that only appears on engagement.
              Always-visible chrome over a 210px map would cover the data it is advertising;
              at rest the pins are the content, and the invitation arrives when the pointer
              (or keyboard focus) does. backdrop-filter so it stays legible over whatever
              tiles and pins happen to be underneath it. */}
          <Box
            className="rkp-veil"
            aria-hidden
            sx={{
              position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
              bgcolor: 'rgba(16,24,40,.28)', opacity: 0,
              transition: 'opacity .2s ease', pointerEvents: 'none',
            }}
          >
            <Stack
              direction="row"
              spacing={0.75}
              sx={{
                alignItems: 'center', px: 1.75, py: 1,
                borderRadius: '999px',
                bgcolor: 'rgba(255,255,255,.86)',
                backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
                boxShadow: '0 6px 18px -4px rgba(16,24,40,.4)',
                color: '#0F172A',
              }}
            >
              <OpenInFullRoundedIcon sx={{ fontSize: 15 }} />
              <Typography sx={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap' }}>
                Explore full map
              </Typography>
            </Stack>
          </Box>
        </Box>
      )}

      {/* COVERAGE AS A STYLED FOOTER, tinted by what it is reporting.
          Coverage is stated, never implied: most reports are filed without a position, so a
          handful of pins must not read as "the whole estate".
          It was 11.5px textLight prose, which put the count of high-risk locations - the
          reason to open the map at all - in the quietest type on the card. The count is now
          the loudest thing in the footer, and the tint is conditional: danger only when
          there ARE high-risk locations, neutral otherwise, so the colour reports the state
          rather than decorating the panel. */}
      {!state.loading && !state.error && (
        <Stack
          direction="row"
          spacing={0.75}
          sx={{
            alignItems: 'center', mt: 1.25, px: 1.25, py: 0.85, borderRadius: '8px',
            bgcolor: hot > 0 ? 'var(--em-danger-bg)' : 'var(--em-neutral-bg)',
            border: `1px solid ${hot > 0 ? 'var(--em-danger-border)' : 'var(--em-neutral-border)'}`,
          }}
        >
          {hot > 0 && (
            <WarningAmberRoundedIcon aria-hidden sx={{ fontSize: 16, color: ON_SURFACE.danger, flexShrink: 0 }} />
          )}
          <Typography sx={{ fontSize: 12, color: BRAND.text, lineHeight: 1.45 }}>
            {state.total === 0 ? (
              `No reports in the last ${windowDays} days.`
            ) : (
              <>
                <Box component="span" sx={{ fontWeight: 800, color: hot > 0 ? ON_SURFACE.danger : BRAND.heading }}>
                  {hot} high-risk location{hot === 1 ? '' : 's'}
                </Box>
                {` · ${state.mapped} of ${state.total} report${state.total === 1 ? '' : 's'} in the last ${windowDays} days carry a position.`}
              </>
            )}
          </Typography>
        </Stack>
      )}
    </Box>
  );
}
