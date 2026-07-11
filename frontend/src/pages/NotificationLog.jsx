import { useEffect, useState } from 'react';
import {
  Box, Typography, Table, TableHead, TableRow, TableCell,
  TableBody, Chip, Alert, CircularProgress, ToggleButtonGroup,
  ToggleButton, Button, Paper, Tooltip,
} from '@mui/material';
import http from '../http';
import NotificationTimeline from '../components/NotificationTimeline';

const BRAND = {
  primary: '#C1272D',
  heading: '#222222',
  text: '#444444',
  textLight: '#777777',
  border: '#E5E5E5',
  section: '#F7F7F7',
};
const PAGE_SIZE = 25;

export default function NotificationLog() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timelineLogs, setTimelineLogs] = useState([]);

  useEffect(() => { load(0, true); }, [statusFilter]);

  useEffect(() => {
    let active = true;
    http.get('/api/notifications?limit=1000')
      .then(({ data }) => { if (active) setTimelineLogs(data.logs); })
      .catch(() => { /* timeline is non-critical - table still works */ });
    return () => { active = false; };
  }, []);

  async function load(newOffset, replace = false) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: PAGE_SIZE, offset: newOffset });
      if (statusFilter !== 'all') params.append('status', statusFilter);
      const { data } = await http.get(`/api/notifications?${params}`);
      setLogs(prev => replace ? data.logs : [...prev, ...data.logs]);
      setTotal(data.total);
      setOffset(newOffset);
      setError(null);
    } catch (e) {
      setError(e.response?.data?.error || 'failed to load');
    } finally {
      setLoading(false);
    }
  }

  const statusColor = { sent: 'success', failed: 'error', pending: 'warning' };

  function formatRelative(iso) {
    const seconds = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }
  function formatExact(iso) {
    return new Date(iso).toLocaleString('en-SG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  // primary "When" label: absolute time for audit cross-referencing
  function formatStamp(iso) {
    return new Date(iso).toLocaleString('en-SG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  // derive a human-readable name from an email's local part
  // duty.officer@... -> "Duty Officer";  pest_control@... -> "Pest Control"
  function humanizeRecipient(email) {
    if (!email) return '';
    const local = String(email).split('@')[0];
    return local
      .split(/[._-]+/)
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 3 }}>
        <div>
          <Typography variant="h5" fontWeight={700} sx={{ color: BRAND.heading }}>Notification Log</Typography>
          <Typography variant="body2" sx={{ color: BRAND.textLight }}>Every alert dispatched by the system</Typography>
        </div>
        <ToggleButtonGroup
          value={statusFilter}
          exclusive
          onChange={(_, v) => v && setStatusFilter(v)}
          size="small"
          sx={{
            flexShrink: 0,
            // neutral slate for the safe states; red is earned only by the Failed filter
            '& .Mui-selected': { bgcolor: '#37474F !important', color: 'white !important' },
            '& .Mui-selected[value="failed"]': { bgcolor: `${BRAND.primary} !important` },
          }}
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="sent">Sent</ToggleButton>
          <ToggleButton value="failed">Failed</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {timelineLogs.length > 0 && <NotificationTimeline logs={timelineLogs} />}

      <Paper variant="outlined" sx={{ border: `1px solid ${BRAND.border}`, borderRadius: '10px', overflow: 'hidden' }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: BRAND.section }}>
              <TableCell sx={{ fontWeight: 600, color: BRAND.textLight }}>When</TableCell>
              <TableCell sx={{ fontWeight: 600, color: BRAND.textLight }}>Rule</TableCell>
              <TableCell sx={{ fontWeight: 600, color: BRAND.textLight }}>Recipient</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, color: BRAND.textLight }}>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {logs.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ py: 5, color: BRAND.textLight }}>
                  {statusFilter === 'failed' ? 'No failed dispatches — good!' : 'No notifications yet. Trigger the weekly summary from the dashboard.'}
                </TableCell>
              </TableRow>
            )}
            {logs.map(log => (
              <TableRow
                key={log.id}
                hover
                sx={{ bgcolor: log.status === 'failed' ? '#FDECEA' : 'inherit' }}
              >
                {/* When: one value, exact time on hover */}
                <TableCell sx={{ whiteSpace: 'nowrap', borderLeft: log.status === 'failed' ? `3px solid ${BRAND.primary}` : '3px solid transparent' }}>
                  <Tooltip title={formatExact(log.createdAt)} arrow placement="top">
                    <Box sx={{ cursor: 'default' }}>
                      {/* absolute time primary (maps to server logs), relative secondary */}
                      <Typography variant="body2" sx={{ color: BRAND.heading, fontWeight: 600, lineHeight: 1.3 }}>
                        {formatStamp(log.createdAt)}
                      </Typography>
                      <Typography variant="caption" sx={{ color: BRAND.textLight }}>
                        {formatRelative(log.createdAt)}
                      </Typography>
                    </Box>
                  </Tooltip>
                </TableCell>

                {/* Rule: single line */}
                <TableCell sx={{ color: BRAND.text }}>
                  {log.rule_name || <Box component="span" sx={{ color: BRAND.textLight, fontStyle: 'italic' }}>rule deleted</Box>}
                </TableCell>

                {/* Recipient */}
                <TableCell>
                  <Typography variant="body2" sx={{ color: BRAND.heading, fontWeight: 600, lineHeight: 1.3 }}>
                    {humanizeRecipient(log.recipient)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: BRAND.textLight, fontFamily: 'monospace', fontSize: 11.5 }}>
                    {log.recipient}
                  </Typography>
                </TableCell>

                {/* Status */}
                <TableCell align="right">
                  <Chip label={log.status} size="small" color={statusColor[log.status] || 'default'} sx={{ textTransform: 'capitalize' }} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}><CircularProgress size={24} sx={{ color: BRAND.primary }} /></Box>}

      {logs.length < total && !loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          <Button variant="outlined" onClick={() => load(offset + PAGE_SIZE, false)} sx={{ borderColor: BRAND.primary, color: BRAND.primary }}>
            Load more ({total - logs.length} remaining)
          </Button>
        </Box>
      )}
    </Box>
  );
}