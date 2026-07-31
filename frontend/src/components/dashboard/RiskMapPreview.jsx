import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Tooltip as LeafletTooltip } from 'react-leaflet';
import L from 'leaflet';
import { Box, Stack, Typography, Button, Skeleton, GlobalStyles } from '@mui/material';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import OpenInFullRoundedIcon from '@mui/icons-material/OpenInFullRounded';
import 'leaflet/dist/leaflet.css';
import { BRAND, ON_SURFACE } from '../../theme';
import { useThemeMode } from '../../contexts/ThemeModeContext';
import { SEVERITY, SG_CENTER, BASEMAPS, TILE_ATTR } from './rodentMapTokens';
import http from '../../http';

/**
 * Small read-only preview of the rodent risk map.
 *
 * NOT a shrunken RodentRiskMap: that component is a full-page route that emits its
 * own <main>/<header>/<h1> and app-wide GlobalStyles, so embedding it would nest
 * landmarks and duplicate the page heading. This is a deliberately minimal sibling
 * that shares only the severity palette and basemap constants, so pin colours can
 * never drift from the full map.
 *
 * It reads the SAME endpoint as the full map rather than plotting the assessment
 * rows the page already holds: those rows are capped at 50, filter-scoped and
 * un-aggregated, so pins drawn from them would stack on shared coordinates, carry
 * no severity weighting, and silently redraw whenever the operator filtered.
 *
 * Interaction is disabled on purpose. Scroll-wheel zoom on a small card inside a
 * long page hijacks page scrolling; the full map is one click away.
 */

// Leaflet's default marker PNGs are not wired up for Vite anywhere in this project,
// so every map here builds pins from divIcon HTML instead.
function pinIcon(level, count) {
  const sv = SEVERITY[level] || SEVERITY.high;
  const size = count > 1 ? 22 : 16;
  return L.divIcon({
    className: 'rkp-pin',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${sv.solid};
      border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.25);color:${sv.onSolid};
      font-size:10px;font-weight:800;display:grid;place-items:center;line-height:1">${count > 1 ? count : ''}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export default function RiskMapPreview({ windowDays = 30 }) {
  const { resolvedMode } = useThemeMode();
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

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* scoped to this card's pins only - the full map ships its own chrome styles */}
      <GlobalStyles styles={{ '.rkp-pin': { background: 'transparent', border: 'none' } }} />

      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.25 }}>
        <MapOutlinedIcon sx={{ fontSize: 17, color: BRAND.textLight }} />
        <Typography component="h2" sx={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: BRAND.text, flexGrow: 1 }}>
          Risk map
        </Typography>
        <Button
          component={RouterLink}
          to="/rodent-heatmap"
          size="small"
          endIcon={<OpenInFullRoundedIcon sx={{ fontSize: 14 }} />}
          sx={{ textTransform: 'none', fontWeight: 700, fontSize: 12.5, color: ON_SURFACE.info }}
        >
          View full map
        </Button>
      </Stack>

      {state.loading ? (
        <Skeleton variant="rounded" sx={{ flexGrow: 1, minHeight: 210 }} />
      ) : state.error ? (
        <Box sx={{ flexGrow: 1, minHeight: 210, borderRadius: '10px', border: `1px solid ${BRAND.border}`, display: 'grid', placeItems: 'center' }}>
          <Typography sx={{ fontSize: 12.5, color: BRAND.textLight }}>Map preview unavailable.</Typography>
        </Box>
      ) : (
        <Box sx={{ flexGrow: 1, minHeight: 210, borderRadius: '10px', overflow: 'hidden', border: `1px solid ${BRAND.border}`, '& .leaflet-container': { bgcolor: BRAND.canvas, height: '100%', width: '100%' } }}>
          <MapContainer
            center={SG_CENTER}
            zoom={15}
            // read-only: a scroll-zooming map inside a scrolling page steals the wheel
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
            {state.points.map(p => (
              <Marker key={`${p.lat},${p.lng}`} position={[p.lat, p.lng]} icon={pinIcon(p.riskLevel, p.count)}>
                <LeafletTooltip direction="top" offset={[0, -8]}>
                  {`${p.block || 'Unlabelled'} · ${p.count} report${p.count === 1 ? '' : 's'} · peak ${p.riskLevel}`}
                </LeafletTooltip>
              </Marker>
            ))}
          </MapContainer>
        </Box>
      )}

      {/* Coverage is stated, never implied: most reports are filed without a
          position, so a handful of pins must not read as "the whole estate". */}
      {!state.loading && !state.error && (
        <Typography sx={{ fontSize: 11.5, color: BRAND.textLight, mt: 1, lineHeight: 1.5 }}>
          {state.total === 0
            ? `No reports in the last ${windowDays} days.`
            : `${hot} high-risk location${hot === 1 ? '' : 's'} · ${state.mapped} of ${state.total} report${state.total === 1 ? '' : 's'} in the last ${windowDays} days carry a position.`}
        </Typography>
      )}
    </Box>
  );
}
