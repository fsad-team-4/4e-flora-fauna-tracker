import { useEffect, useState, useMemo } from 'react';
import {
  Box, Typography, Table, TableHead, TableRow, TableCell,
  TableBody, Chip, Alert, CircularProgress, ToggleButtonGroup,
  ToggleButton, Button, Paper, Tooltip, Stack,
} from '@mui/material';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import SmsOutlinedIcon from '@mui/icons-material/SmsOutlined';
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
const FAILED_RED = '#B3261E';
const PAGE_SIZE = 25;

const CHANNEL_ICON = { email: EmailOutlinedIcon, sms: SmsOutlinedIcon, both: EmailOutlinedIcon };

export default function NotificationLog() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState(null); // 'YYYY-MM-DD' or null
  const [openIncident, setOpenIncident] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timelineLogs, setTimelineLogs] = useState([]);

  useEffect(() => { load(0, true); }, [statusFilter, dateFilter]);

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
      if (dateFilter) params.append('date', dateFilter);
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

  // failure summary across the whole log: count, which channels, and the date
  // span - so the banner says WHAT the problem is, not just that one exists.
  const failureSummary = useMemo(() => {
    const failed = timelineLogs.filter(l => l.status === 'failed');
    if (failed.length === 0) return null;
    const channels = [...new Set(failed.map(l => l.channel).filter(Boolean))];
    const times = failed.map(l => new Date(l.createdAt).getTime()).filter(n => !Number.isNaN(n));
    const fmt = ms => new Date(ms).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
    let span = '';
    if (times.length) {
      const lo = fmt(Math.min(...times));
      const hi = fmt(Math.max(...times));
      span = lo === hi ? lo : `${lo}–${hi}`;
    }
    const chLabel = channels.length === 1
      ? `all ${channels[0] === 'sms' ? 'SMS' : channels[0] === 'both' ? 'Email + SMS' : 'Email'}`
      : `${channels.length} channels`;
    return { count: failed.length, channels, chLabel, span };
  }, [timelineLogs]);

  function toDateKey(ms) {
    const d = new Date(ms);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function prettyDate(key) {
    const d = new Date(`${key}T00:00:00`);
    return d.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  // 24-hour clock: this is an ops tool, and "02:45 pm" pads a 12-hour clock with
  // a 24-hour convention. One format, applied everywhere.
  // The incident header already states the attempt count, and every attempt in a
  // run shares the same reason, so the per-attempt "(attempt N)" is duplication.
  function cleanReason(text) {
    return String(text || '').replace(/\s*\(attempt\s*\d+\)\s*/i, ' ').replace(/\s+/g, ' ').trim();
  }
  function formatTime(iso) {
    return new Date(iso).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  function formatExact(iso) {
    return new Date(iso).toLocaleString('en-SG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  }
  function humanizeRecipient(email) {
    if (!email) return '';
    const local = String(email).split('@')[0];
    return local.split(/[._-]+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  // day header label: Today / Yesterday / 13 Jul
  function dayLabel(iso) {
    const d = new Date(iso);
    const today = new Date();
    const yest = new Date(); yest.setDate(today.getDate() - 1);
    const same = (a, b) => a.toDateString() === b.toDateString();
    if (same(d, today)) return 'Today';
    if (same(d, yest)) return 'Yesterday';
    return d.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  // Group rows under day headers, AND collapse consecutive failures sharing a
  // rule + recipient + channel into one incident. Those are retry attempts of a
  // single event, not independent failures - rendering eight equal-weight red
  // rows both misstates what happened and breaks the failure treatment, which is
  // calibrated for one or two rows.
  const grouped = useMemo(() => {
    const out = [];
    let curKey = null;
    let i = 0;
    while (i < logs.length) {
      const log = logs[i];
      const key = new Date(log.createdAt).toDateString();
      if (key !== curKey) { out.push({ header: dayLabel(log.createdAt), key }); curKey = key; }

      if (log.status === 'failed') {
        const run = [log];
        let j = i + 1;
        while (
          j < logs.length &&
          logs[j].status === 'failed' &&
          logs[j].rule_name === log.rule_name &&
          logs[j].recipient === log.recipient &&
          logs[j].channel === log.channel &&
          new Date(logs[j].createdAt).toDateString() === key
        ) { run.push(logs[j]); j += 1; }
        if (run.length > 1) { out.push({ incident: run, key: log.id }); i = j; continue; }
      }
      out.push({ log });
      i += 1;
    }
    return out;
  }, [logs]);

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

      {/* #1: failures pushed to the front - a persistent banner that deep-links to
          the FAILED view. Success stays quiet; failure is what the page surfaces. */}
      {failureSummary && (
        <Paper
          onClick={() => setStatusFilter('failed')}
          sx={{
            display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, mb: 2.5,
            border: `1px solid ${FAILED_RED}`, bgcolor: '#FDECEA', borderRadius: '10px',
            cursor: 'pointer', transition: 'background .12s', '&:hover': { bgcolor: '#FBDBD7' },
          }}
        >
          <WarningAmberRoundedIcon sx={{ color: FAILED_RED }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ color: FAILED_RED, fontWeight: 700, lineHeight: 1.3 }}>
              {failureSummary.count} failed {failureSummary.count === 1 ? 'dispatch' : 'dispatches'}
              {failureSummary.channels.length === 1 && ` · ${failureSummary.chLabel}`}
              {failureSummary.span && ` · ${failureSummary.span}`}
            </Typography>
            <Typography sx={{ color: FAILED_RED, fontSize: 12, opacity: 0.85 }}>
              {failureSummary.channels.length === 1
                ? 'looks like a single-channel issue — likely a provider outage'
                : 'across multiple channels — check recipients and provider status'}
            </Typography>
          </Box>
          <Typography sx={{ color: FAILED_RED, fontSize: 13, textDecoration: 'underline', ml: 'auto', flexShrink: 0 }}>
            View failed
          </Typography>
        </Paper>
      )}

      {dateFilter && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Chip
            label={`Showing: ${prettyDate(dateFilter)}`}
            onDelete={() => setDateFilter(null)}
            deleteIcon={<CloseRoundedIcon aria-label={`Clear ${prettyDate(dateFilter)} filter`} />}
            sx={{ bgcolor: BRAND.section, fontWeight: 600, borderRadius: '6px', height: 32, '& .MuiChip-deleteIcon': { width: 22, height: 22 } }}
          />
        </Box>
      )}

      {timelineLogs.length > 0 && (
        <NotificationTimeline
          logs={timelineLogs}
          onDayClick={ms => setDateFilter(toDateKey(ms))}
          selectedDay={dateFilter}
        />
      )}

      <Paper variant="outlined" sx={{ border: `1px solid ${BRAND.border}`, borderRadius: '10px', overflow: 'hidden' }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: BRAND.section }}>
              <TableCell sx={{ fontWeight: 600, color: BRAND.textLight, width: 80 }}>Time</TableCell>
              <TableCell sx={{ fontWeight: 600, color: BRAND.textLight, width: 90 }}>Channel</TableCell>
              <TableCell sx={{ fontWeight: 600, color: BRAND.textLight }}>Rule</TableCell>
              <TableCell sx={{ fontWeight: 600, color: BRAND.textLight }}>Recipient</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, color: BRAND.textLight }}>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {logs.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 5, color: BRAND.textLight }}>
                  {statusFilter === 'failed' ? 'No failed dispatches — good!' : 'No notifications yet. Trigger the weekly summary from the dashboard.'}
                </TableCell>
              </TableRow>
            )}
            {grouped.map((item, idx) => {
              // day header row (#4)
              if (item.header) {
                return (
                  <TableRow key={`h-${item.key}`}>
                    <TableCell colSpan={5} sx={{ bgcolor: BRAND.section, py: 0.75 }}>
                      <Typography sx={{ fontSize: 12, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {item.header}
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              }
              // one incident = a run of retry attempts, rendered as a single row
              if (item.incident) {
                const run = item.incident;
                const first = run[run.length - 1]; // logs are newest-first
                const last = run[0];
                const ChI = CHANNEL_ICON[last.channel] || EmailOutlinedIcon;
                const isOpen = openIncident === item.key;
                return (
                  <TableRow key={`inc-${item.key}`} sx={{ bgcolor: '#FDECEA' }}>
                    <TableCell colSpan={5} sx={{ borderLeft: `3px solid ${BRAND.primary}`, py: 1.25 }}>
                      <Box
                        component="button"
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setOpenIncident(isOpen ? null : item.key)}
                        sx={{
                          width: '100%', minHeight: 44, textAlign: 'left', font: 'inherit',
                          border: 'none', background: 'transparent', cursor: 'pointer', p: 0,
                          display: 'flex', alignItems: 'center', gap: 1.5,
                          '&:focus-visible': { outline: `2px solid ${BRAND.primary}`, outlineOffset: 2 },
                        }}
                      >
                        <Chip label={`${run.length} failed attempts`} size="small" sx={{ bgcolor: FAILED_RED, color: '#fff', fontWeight: 700, borderRadius: '6px' }} />
                        <Typography sx={{ fontSize: 13, color: BRAND.heading, fontWeight: 600 }}>
                          {last.rule_name} → {humanizeRecipient(last.recipient)}
                        </Typography>
                        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                          <ChI sx={{ fontSize: 14, color: BRAND.textLight }} />
                          <Typography sx={{ fontSize: 12, color: BRAND.text }}>
                            {last.channel === 'sms' ? 'SMS' : last.channel === 'both' ? 'Both' : 'Email'}
                          </Typography>
                        </Stack>
                        <Typography sx={{ fontSize: 12.5, color: BRAND.textLight, ml: 'auto', whiteSpace: 'nowrap' }}>
                          {formatTime(first.createdAt)}–{formatTime(last.createdAt)}
                        </Typography>
                        <ExpandMoreRoundedIcon sx={{ fontSize: 18, color: BRAND.textLight, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                      </Box>
                      {/* one shared reason, stated once - every attempt in the run
                          carries the same one, so repeating it per line is noise */}
                      {last.message_preview && (
                        <Typography sx={{ fontSize: 12.5, color: FAILED_RED, mt: 0.5 }}>
                          {cleanReason(last.message_preview)}
                        </Typography>
                      )}
                      {isOpen && (
                        <Box sx={{ mt: 1 }}>
                          <Typography sx={{ fontSize: 11, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.75 }}>
                            Attempt times
                          </Typography>
                          {/* only the timing differs between attempts, so only the
                              timing is listed */}
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {run.slice().reverse().map((r, n) => (
                              <Chip
                                key={r.id}
                                size="small"
                                label={`${n + 1} · ${formatTime(r.createdAt)}`}
                                sx={{ height: 22, fontSize: 11.5, bgcolor: '#fff', border: `1px solid ${BRAND.border}`, color: BRAND.text, borderRadius: '6px' }}
                              />
                            ))}
                          </Box>
                        </Box>
                      )}
                    </TableCell>
                  </TableRow>
                );
              }

              const log = item.log;
              const failed = log.status === 'failed';
              const ChIcon = CHANNEL_ICON[log.channel] || EmailOutlinedIcon;
              return (
                <TableRow key={log.id} hover sx={{ bgcolor: failed ? '#FDECEA' : 'inherit' }}>
                  {/* Time only - the day is in the header (#4) */}
                  <TableCell sx={{ whiteSpace: 'nowrap', borderLeft: failed ? `3px solid ${BRAND.primary}` : '3px solid transparent' }}>
                    <Tooltip title={formatExact(log.createdAt)} arrow placement="top">
                      <Typography variant="body2" sx={{ color: BRAND.heading, cursor: 'default' }}>{formatTime(log.createdAt)}</Typography>
                    </Tooltip>
                  </TableCell>
                  {/* channel icon + label; SMS tinted so you can sweep the column */}
                  <TableCell>
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                      {/* channel is its own dimension - neutral, so it never collides
                          with the categorical palette or the failed row's red tint */}
                      <ChIcon sx={{ fontSize: 15, color: BRAND.textLight }} />
                      <Typography sx={{ fontSize: 12, fontWeight: log.channel === 'sms' ? 700 : 400, color: BRAND.text }}>
                        {log.channel === 'sms' ? 'SMS' : log.channel === 'both' ? 'Both' : 'Email'}
                      </Typography>
                    </Stack>
                  </TableCell>
                  {/* Rule, plus the failure reason - only failures carry one worth showing */}
                  <TableCell sx={{ color: BRAND.text }}>
                    {log.rule_name || <Box component="span" sx={{ color: BRAND.textLight, fontStyle: 'italic' }}>rule deleted</Box>}
                    {failed && log.message_preview && (
                      <Typography sx={{ fontSize: 12, color: FAILED_RED, mt: 0.25 }}>
                        {log.message_preview}
                      </Typography>
                    )}
                  </TableCell>
                  {/* Recipient - humanized name + truncated local part on hover-full (#7) */}
                  <TableCell>
                    <Typography variant="body2" sx={{ color: BRAND.heading, fontWeight: 600, lineHeight: 1.3 }}>
                      {humanizeRecipient(log.recipient)}
                    </Typography>
                    <Tooltip title={log.recipient} arrow>
                      <Typography variant="caption" sx={{ color: BRAND.textLight, fontFamily: 'monospace', fontSize: 11.5, cursor: 'default' }}>
                        {String(log.recipient).split('@')[0]}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  {/* Status - Sent is quiet (#6), Failed shouts */}
                  <TableCell align="right">
                    {failed ? (
                      <Chip label="Failed" size="small" sx={{ bgcolor: FAILED_RED, color: '#fff', fontWeight: 700, borderRadius: '6px' }} />
                    ) : log.status === 'pending' ? (
                      <Chip label="Pending" size="small" sx={{ bgcolor: '#FFF4E5', color: '#8A5200', fontWeight: 600, borderRadius: '6px' }} />
                    ) : (
                      <Typography component="span" sx={{ fontSize: 12.5, color: BRAND.textLight }}>Sent</Typography>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Paper>

      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}><CircularProgress size={24} sx={{ color: BRAND.primary }} /></Box>}
      {logs.length < total && !loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          {/* neutral, not red (#7) - red is reserved for failures */}
          <Button variant="outlined" onClick={() => load(offset + PAGE_SIZE, false)} sx={{ borderColor: BRAND.border, color: BRAND.text }}>
            Load more ({total - logs.length} remaining)
          </Button>
        </Box>
      )}
    </Box>
  );
}