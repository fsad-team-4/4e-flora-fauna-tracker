import { useState, useEffect } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, Button, Chip, Alert, Stack, Divider,
  TextField, MenuItem,
} from '@mui/material';
import http from '../http';
import { useUser } from '../contexts/UserContext';

const CATEGORY_LABELS = {
  flora_health: 'Flora Health',
  community_cat: 'Community Cat',
  pigeon: 'Pigeon',
  pest: 'Pest',
  other: 'Other',
};

const STATUS_COLORS = {
  open: 'warning',
  in_progress: 'info',
  resolved: 'success',
};

const STATUS_OPTIONS = ['open', 'in_progress', 'resolved'];

export default function ReportDetail() {
  const { id } = useParams();
  const { user } = useUser();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState('');

  const loadReport = () =>
    http
      .get(`/api/reports/${id}`)
      .then((res) => {
        setReport(res.data);
        setNewStatus(res.data.status);
        setError('');
      })
      .catch((err) => {
        if (err.response?.status === 403) setError('You do not have access to this report.');
        else if (err.response?.status === 404) setError('Report not found.');
        else setError('Failed to load report.');
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleUpdateStatus = async () => {
    setUpdateError('');
    setUpdating(true);
    try {
      await http.patch(`/api/reports/${id}/status`, { status: newStatus });
      await loadReport();
    } catch (err) {
      setUpdateError(err.response?.data?.error || 'Failed to update status');
    } finally {
      setUpdating(false);
    }
  };

  const canUpdate = user && (user.role === 'staff' || user.role === 'admin');

  return (
    <Box sx={{ maxWidth: 700, mx: 'auto', mt: 4 }}>
      <Button component={RouterLink} to="/reports" sx={{ mb: 2 }}>
        &larr; Back
      </Button>

      {loading && <Typography>Loading...</Typography>}
      {!loading && error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && report && (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h5">{report.title}</Typography>
            <Chip
              label={report.status}
              color={STATUS_COLORS[report.status] || 'default'}
            />
          </Box>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {CATEGORY_LABELS[report.category] || report.category}
          </Typography>

          <Typography sx={{ mb: 2 }}>{report.description}</Typography>

          {report.block_number && <Typography>Block: {report.block_number}</Typography>}
          {report.floor_level && <Typography>Floor: {report.floor_level}</Typography>}
          {report.gps_lat != null && report.gps_lng != null && (
            <Typography>GPS: {report.gps_lat}, {report.gps_lng}</Typography>
          )}
          <Typography>Reported by: {report.reporter?.name || 'Unknown'}</Typography>
          <Typography variant="caption" color="text.secondary">
            {new Date(report.createdAt).toLocaleString()}
          </Typography>

          {report.photo_urls?.length > 0 && (
            <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap' }}>
              {report.photo_urls.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  <img
                    src={url}
                    alt="Report"
                    style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 4 }}
                  />
                </a>
              ))}
            </Stack>
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
                    <MenuItem key={s} value={s}>{s}</MenuItem>
                  ))}
                </TextField>
                <Button
                  variant="contained"
                  onClick={handleUpdateStatus}
                  disabled={updating || newStatus === report.status}
                >
                  Update Status
                </Button>
              </Stack>
            </Box>
          )}

          <Box sx={{ mt: 3 }}>
            <Divider sx={{ mb: 2 }} />
            <Typography variant="h6" sx={{ mb: 1 }}>Status History</Typography>
            {report.CaseStatusLogs?.length > 0 ? (
              <Stack spacing={1}>
                {report.CaseStatusLogs.map((log) => (
                  <Box key={log.id}>
                    <Typography variant="body2">
                      {log.old_status} &rarr; {log.new_status} by {log.changer?.name || 'Unknown'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(log.createdAt).toLocaleString()}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            ) : (
              <Typography>No status changes yet</Typography>
            )}
          </Box>
        </>
      )}
    </Box>
  );
}
