import { useState, useEffect } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, Button, Chip, Alert, Stack, Divider,
  TextField, MenuItem, Link,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
} from '@mui/material';
import PetsIcon from '@mui/icons-material/Pets';
import FlutterDashIcon from '@mui/icons-material/FlutterDash';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import http from '../http';
import { useUser } from '../contexts/UserContext';
import { STATUS_OPTIONS } from '../constants';
import { severityFor, statusLabel, speciesLabel, formatBlock, TOKEN_SX, tokenVariant } from '../faunaDisplay';

// Species -> MUI icon element. Birds get a bird icon, cats a paw, anything else a
// neutral marker. Spreads props so it works in chips and larger headers alike.
function SpeciesIcon({ species, ...props }) {
  if (species === 'cat') return <PetsIcon {...props} />;
  if (species === 'other') return <HelpOutlineRoundedIcon {...props} />;
  return <FlutterDashIcon {...props} />; // pigeon, crow, mynah
}

// 5 decimal places is roughly 1 metre - enough for a pin, without showing the
// raw float precision. Display only; the stored value is untouched.
const formatCoord = (n) => n.toFixed(5);

// Which agency handles each species (mirrors the backend AGENCY_MAP).
const AGENCY_MAP = {
  cat: 'Cat Welfare Society / SPCA',
  pigeon: 'ACRES',
  crow: 'ACRES',
  mynah: 'ACRES',
  other: 'Town Council to assess',
};

export default function FaunaSightingDetail() {
  const { id } = useParams();
  const { user } = useUser();
  const [sighting, setSighting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState('');

  // Setting a blockless sighting's block, or correcting one that is already
  // recorded. `editingBlock` reveals the input; `confirmOpen` gates the actual
  // PATCH behind a confirmation, because re-attributing a sighting moves it
  // between block summaries - it leaves the old block's totals and joins the
  // new one's, changing the risk level both blocks report.
  const [editingBlock, setEditingBlock] = useState(false);
  const [blockValue, setBlockValue] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [savingBlock, setSavingBlock] = useState(false);
  const [blockError, setBlockError] = useState('');

  const loadSighting = () =>
    http
      .get(`/api/fauna/${id}`)
      .then((res) => {
        setSighting(res.data);
        setNewStatus(res.data.status);
        setError('');
      })
      .catch((err) => {
        if (err.response?.status === 403) setError('You do not have access to this sighting.');
        else if (err.response?.status === 404) setError('Sighting not found.');
        else setError('Failed to load sighting.');
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    loadSighting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleUpdateStatus = async () => {
    setUpdateError('');
    setUpdating(true);
    try {
      await http.patch(`/api/fauna/${id}/status`, { status: newStatus });
      await loadSighting();
    } catch (err) {
      setUpdateError(err.response?.data?.error || 'Failed to update status');
    } finally {
      setUpdating(false);
    }
  };

  const handleSetBlock = async () => {
    setBlockError('');
    setSavingBlock(true);
    try {
      await http.patch(`/api/fauna/${id}/block`, { block_number: blockValue.trim() });
      setConfirmOpen(false);
      setEditingBlock(false);
      setBlockValue('');
      await loadSighting();
    } catch (err) {
      const messages = err.response?.data?.error;
      setConfirmOpen(false);
      setBlockError(Array.isArray(messages) ? messages.join(', ') : messages || 'Failed to set block number');
    } finally {
      setSavingBlock(false);
    }
  };

  const canUpdate = user && (user.role === 'field_officer' || user.role === 'manager');
  // Offered whether or not a block is already recorded: GPS puts a sighting near
  // a boundary often enough that a recorded block may need correcting too.
  const canSetBlock = canUpdate && sighting;
  const currentBlock = sighting?.block_number || '';
  const severity = severityFor(sighting?.behaviour_tags);

  return (
    <Box sx={{ maxWidth: 700, mx: 'auto', mt: 4 }}>
      <Button component={RouterLink} to="/fauna" sx={{ mb: 2 }}>
        &larr; Back
      </Button>

      {loading && <Typography>Loading...</Typography>}
      {!loading && error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && sighting && (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <SpeciesIcon species={sighting.species} color="action" />
              <Typography variant="h5">{speciesLabel(sighting.species)}</Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center">
              {/* neutral by design - colour here belongs to the severity badge alone */}
              <Chip label={statusLabel(sighting.status)} size="small" variant="outlined" sx={TOKEN_SX} />
              <Chip
                label={severity.label}
                color={severity.color}
                size="small"
                variant={tokenVariant(severity.color)}
                sx={TOKEN_SX}
              />
            </Stack>
          </Box>

          <Alert severity="info" sx={{ my: 2 }}>
            Recommended agency: {AGENCY_MAP[sighting.species] || 'Town Council to assess'}
          </Alert>

          {sighting.block_number && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <LocationOnIcon fontSize="small" color="action" />
              <Typography>{formatBlock(sighting.block_number)}</Typography>
            </Box>
          )}

          {canSetBlock && (
            <Box sx={{ mt: 1 }}>
              {!currentBlock && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <LocationOnIcon fontSize="small" color="action" />
                  <Typography color="text.secondary">No block number recorded</Typography>
                </Box>
              )}

              {!editingBlock && (
                <Button
                  size="small"
                  sx={{ mt: 0.5 }}
                  // Pre-fill with the current block so a correction starts from a
                  // known value instead of an empty field.
                  onClick={() => { setBlockValue(currentBlock); setEditingBlock(true); }}
                >
                  {currentBlock ? 'Change block number' : 'Set block number'}
                </Button>
              )}

              {editingBlock && (
                <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mt: 1 }}>
                  <TextField
                    label="Block number"
                    size="small"
                    autoFocus
                    value={blockValue}
                    onChange={(e) => setBlockValue(e.target.value)}
                    sx={{ minWidth: 200 }}
                  />
                  <Button
                    variant="contained"
                    size="small"
                    // Unchanged value is a no-op - same guard the status button uses.
                    disabled={!blockValue.trim() || blockValue.trim() === currentBlock || savingBlock}
                    onClick={() => setConfirmOpen(true)}
                  >
                    Save
                  </Button>
                  <Button
                    size="small"
                    disabled={savingBlock}
                    onClick={() => { setEditingBlock(false); setBlockValue(''); setBlockError(''); }}
                  >
                    Cancel
                  </Button>
                </Stack>
              )}

              {blockError && <Alert severity="error" sx={{ mt: 1 }}>{blockError}</Alert>}
            </Box>
          )}

          <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
            <DialogTitle>{currentBlock ? 'Change block number' : 'Set block number'}</DialogTitle>
            <DialogContent>
              <DialogContentText>
                {currentBlock ? (
                  <>
                    Change block number from &quot;{currentBlock}&quot; to
                    &quot;{blockValue.trim()}&quot;? This will move the sighting into that
                    block&apos;s summary.
                  </>
                ) : (
                  <>
                    Set block number to &quot;{blockValue.trim()}&quot;? This will attribute the
                    sighting to that block&apos;s summary.
                  </>
                )}
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirmOpen(false)} disabled={savingBlock}>Cancel</Button>
              <Button variant="contained" onClick={handleSetBlock} disabled={savingBlock}>
                {savingBlock ? 'Saving...' : 'Confirm'}
              </Button>
            </DialogActions>
          </Dialog>
          {sighting.floor_level && <Typography>Floor: {sighting.floor_level}</Typography>}
          {sighting.gps_lat != null && sighting.gps_lng != null && (
            <>
              <Typography>
                GPS: {formatCoord(sighting.gps_lat)}, {formatCoord(sighting.gps_lng)}
              </Typography>
              <Link
                href={`https://www.google.com/maps?q=${formatCoord(sighting.gps_lat)},${formatCoord(sighting.gps_lng)}`}
                target="_blank"
                rel="noopener noreferrer"
                variant="body2"
              >
                View on Google Maps
              </Link>
            </>
          )}
          <Typography>Reported by: {sighting.reporter?.name || 'Unknown'}</Typography>
          <Typography variant="caption" color="text.secondary">
            {new Date(sighting.createdAt).toLocaleString()}
          </Typography>

          {sighting.behaviour_tags?.length > 0 && (
            <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap' }}>
              {sighting.behaviour_tags.map((tag) => (
                <Chip key={tag} label={tag} size="small" variant="outlined" sx={TOKEN_SX} />
              ))}
            </Stack>
          )}

          {sighting.notes && <Typography sx={{ mt: 2 }}>{sighting.notes}</Typography>}

          {sighting.photo_url && (
            <Box sx={{ mt: 2 }}>
              <a href={sighting.photo_url} target="_blank" rel="noreferrer">
                <img
                  src={sighting.photo_url}
                  alt="Sighting"
                  style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 4 }}
                />
              </a>
            </Box>
          )}

          {canUpdate && (
            <Box sx={{ mt: 3 }}>
              <Divider sx={{ mb: 2 }} />
              <Typography variant="h6" sx={{ mb: 1 }}>Update Status</Typography>
              {updateError && <Alert severity="error" sx={{ mb: 1 }}>{updateError}</Alert>}
              <Stack direction="row" spacing={2} alignItems="center">
                <TextField
                  select
                  label="Status"
                  size="small"
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  sx={{ minWidth: 160 }}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <MenuItem key={s} value={s}>{statusLabel(s)}</MenuItem>
                  ))}
                </TextField>
                <Button
                  variant="contained"
                  onClick={handleUpdateStatus}
                  disabled={updating || newStatus === sighting.status}
                >
                  Update Status
                </Button>
              </Stack>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
