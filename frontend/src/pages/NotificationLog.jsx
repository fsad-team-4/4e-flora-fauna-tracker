import { useEffect, useState, useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, Table, TableHead, TableRow, TableCell,
  TableBody, Chip, Alert, CircularProgress, ToggleButtonGroup,
  ToggleButton, Button, Paper, Tooltip, Stack, IconButton,
} from '@mui/material';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import SmsOutlinedIcon from '@mui/icons-material/SmsOutlined';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import DoneRoundedIcon from '@mui/icons-material/DoneRounded';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import LaunchRoundedIcon from '@mui/icons-material/LaunchRounded';
import http from '../http';
import { BRAND } from '../theme';
import NotificationTimeline from '../components/NotificationTimeline';
import UndoSnackbar from '../components/UndoSnackbar';

const FAILED_RED = '#B3261E';
const PAGE_SIZE = 25;

// where a dispatch links back to, so the log is a navigable audit trail
const SOURCE_LINK = {
  work_order: { to: '/action-queue', label: 'work order' },
  weekly_summary: { to: '/dashboard', label: 'weekly summary' },
};

const CHANNEL_ICON = { email: EmailOutlinedIcon, sms: SmsOutlinedIcon, both: EmailOutlinedIcon };

function StatTile({ label, value, sub, tone }) {
  const valueColor = tone === 'bad' ? FAILED_RED : tone === 'good' ? '#1E6023' : BRAND.heading;
  return (
    <Box sx={{ flex: 1, minWidth: 150, p: 2, bgcolor: BRAND.surface, border: `1px solid ${BRAND.border}`, borderRadius: '10px' }}>
      <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</Typography>
      <Typography sx={{ fontSize: 26, fontWeight: 800, color: valueColor, lineHeight: 1.15, mt: 0.25 }}>{value}</Typography>
      {sub && <Typography sx={{ fontSize: 12, color: BRAND.textLight }}>{sub}</Typography>}
    </Box>
  );
}

export default function NotificationLog() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [range, setRange] = useState(null); // { from, to } (YYYY-MM-DD) or null
  const [openIncident, setOpenIncident] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timelineLogs, setTimelineLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [toast, setToast] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [resendingAll, setResendingAll] = useState(false);
  const [undo, setUndo] = useState(null); // { id } after an acknowledge

  useEffect(() => { load(0, true); }, [statusFilter, range]);

  useEffect(() => { loadTimeline(); loadStats(); }, []);

  function loadTimeline() {
    http.get('/api/notifications?limit=1000')
      .then(({ data }) => setTimelineLogs(data.logs))
      .catch(() => { /* timeline is non-critical - table still works */ });
  }
  function loadStats() {
    http.get('/api/notifications/stats').then(({ data }) => setStats(data)).catch(() => {});
  }
  function refreshAll() { load(0, true); loadTimeline(); loadStats(); }

  async function resend(id) {
    setBusyId(id);
    try {
      const { data } = await http.post(`/api/notifications/${id}/resend`);
      const msg = data.delivered
        ? 'Sent successfully.'
        : data.escalated
          ? (data.fallback_delivered
            ? "The contact still couldn't be reached, so it was sent to the backup contact instead."
            : "Couldn't send - the messaging service may still be down. Please try again shortly.")
          : "Couldn't send right now. Please try again shortly.";
      setToast({ ok: data.delivered || data.fallback_delivered, msg });
      refreshAll();
    } catch (e) {
      setToast({ ok: false, msg: e.response?.data?.error || 'Resend failed' });
    } finally { setBusyId(null); }
  }

  async function acknowledge(id) {
    setBusyId(id);
    try {
      await http.post(`/api/notifications/${id}/acknowledge`);
      setUndo({ id });
      refreshAll();
    } catch (e) {
      setToast({ ok: false, msg: e.response?.data?.error || 'Acknowledge failed' });
    } finally { setBusyId(null); }
  }
  async function undoAcknowledge() {
    if (!undo) return;
    const id = undo.id;
    setUndo(null);
    try {
      await http.post(`/api/notifications/${id}/unacknowledge`);
      refreshAll();
    } catch (e) {
      setToast({ ok: false, msg: 'Could not undo. Please try again.' });
    }
  }

  async function resendAllFailed() {
    setResendingAll(true);
    try {
      const { data } = await http.post('/api/notifications/resend-failed');
      setToast({
        ok: data.delivered > 0 || data.escalated > 0,
        msg: `Re-sent ${data.groups} failed notification${data.groups === 1 ? '' : 's'} - ${data.delivered} delivered${data.escalated ? `, ${data.escalated} sent to the backup contact` : ''}.`,
      });
      refreshAll();
    } catch (e) {
      setToast({ ok: false, msg: e.response?.data?.error || 'Bulk resend failed' });
    } finally { setResendingAll(false); }
  }

  function exportCsv() {
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.append('status', statusFilter);
    if (range) { params.append('from', range.from); params.append('to', range.to); }
    http.get(`/api/notifications/export?${params}`, { responseType: 'blob' })
      .then(res => {
        const url = URL.createObjectURL(res.data);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'notification-log.csv';
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => setToast({ ok: false, msg: 'Export failed' }));
  }

  async function load(newOffset, replace = false) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: PAGE_SIZE, offset: newOffset });
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (range) { params.append('from', range.from); params.append('to', range.to); }
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
    // only UNRESOLVED failures - a failure that was successfully resent is no
    // longer an open problem and shouldn't keep sounding the alarm.
    const failed = timelineLogs.filter(l => l.status === 'failed' && !l.resolved_at);
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
    const recipientCount = new Set(failed.map(l => l.recipient).filter(Boolean)).size;
    return { count: failed.length, channels, chLabel, span, recipientCount };
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
    return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
  }
  const rangeLabel = r => (r.from === r.to ? prettyDate(r.from) : `${prettyDate(r.from)} – ${prettyDate(r.to)}`);

  // timeline click (single day) or drag (range). Clicking the currently-selected
  // single day again clears the filter, so the chart is a toggle.
  function handleTimelineSelect(fromMs, toMs) {
    const from = toDateKey(fromMs);
    const to = toDateKey(toMs);
    if (from === to && range && range.from === from && range.to === to) { setRange(null); return; }
    setRange({ from, to });
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, rowGap: 1.5, flexWrap: 'wrap', mb: 3 }}>
        <div>
          <Typography variant="h5" component="h1" fontWeight={700} sx={{ color: BRAND.heading }}>Notification Log</Typography>
          <Typography variant="body2" sx={{ color: BRAND.textLight }}>Every alert dispatched by the system</Typography>
        </div>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexShrink: 0 }}>
          <ToggleButtonGroup
            value={statusFilter}
            exclusive
            onChange={(_, v) => v && setStatusFilter(v)}
            size="small"
            sx={{
              '& .MuiToggleButton-root': { color: BRAND.text }, // unselected label clears AA on the section bg
              '& .Mui-selected': { bgcolor: '#37474F !important', color: 'white !important' },
              '& .Mui-selected[value="failed"]': { bgcolor: `${BRAND.primary} !important` },
            }}
          >
            <ToggleButton value="all">All</ToggleButton>
            <ToggleButton value="sent">Sent</ToggleButton>
            <ToggleButton value="failed">Failed</ToggleButton>
          </ToggleButtonGroup>
          {/* audit export for the town council's records / SharePoint */}
          <Button
            variant="outlined"
            size="small"
            startIcon={<FileDownloadOutlinedIcon />}
            onClick={exportCsv}
            sx={{ whiteSpace: 'nowrap', borderColor: BRAND.border, color: BRAND.slate, '&:hover': { borderColor: BRAND.slate } }}
          >
            Export
          </Button>
        </Stack>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {toast && <Alert severity={toast.ok ? 'success' : 'error'} sx={{ mb: 2 }} onClose={() => setToast(null)}>{toast.msg}</Alert>}

      {/* delivery-assurance strip: is the estate's comms channel actually reliable? */}
      {stats && stats.total > 0 && (
        <Stack direction="row" spacing={1.5} sx={{ mb: 2.5, flexWrap: 'wrap', rowGap: 1.5 }}>
          <StatTile label="Delivery rate" value={`${Math.round((stats.deliveryRate ?? 0) * 100)}%`} sub={`${stats.sent}/${stats.total} sent`} />
          <StatTile label="Unresolved failures" value={stats.unresolvedFailed} sub={stats.unresolvedFailed > 0 ? 'need a resend' : 'all clear'} tone={stats.unresolvedFailed > 0 ? 'bad' : 'good'} />
          <StatTile label="Acknowledged" value={`${Math.round((stats.acknowledgedRate ?? 0) * 100)}%`} sub={`${stats.acknowledged} acted on`} />
          <StatTile
            label="Backup contact"
            value={stats.fallbackConfigured ? 'On' : 'Off'}
            sub={stats.fallbackConfigured ? 'urgent alerts auto-forward' : 'none set for urgent alerts'}
            tone={stats.fallbackConfigured ? 'good' : 'muted'}
          />
        </Stack>
      )}

      {/* #1: failures pushed to the front - a persistent banner that deep-links to
          the FAILED view. Success stays quiet; failure is what the page surfaces. */}
      {failureSummary && (
        <Paper
          sx={{
            display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, mb: 2.5,
            border: `1px solid ${FAILED_RED}`, bgcolor: '#FDECEA', borderRadius: '10px', flexWrap: 'wrap',
          }}
        >
          <WarningAmberRoundedIcon sx={{ color: FAILED_RED }} />
          <Box sx={{ minWidth: 180, flexGrow: 1 }}>
            <Typography sx={{ color: FAILED_RED, fontWeight: 700, lineHeight: 1.3 }}>
              {failureSummary.count} {failureSummary.count === 1 ? 'notification' : 'notifications'} didn't reach {failureSummary.recipientCount > 1 ? `${failureSummary.recipientCount} recipients` : 'their recipient'}
              {failureSummary.span && ` · ${failureSummary.span}`}
            </Typography>
            <Typography sx={{ color: FAILED_RED, fontSize: 12, opacity: 0.9 }}>
              {failureSummary.channels.length === 1 && failureSummary.channels[0] === 'sms'
                ? "The text messages couldn't be delivered. Use Resend to try again."
                : failureSummary.channels.length === 1
                  ? "The emails couldn't be delivered - the mail service may be having trouble. Use Resend to try again."
                  : "Some messages couldn't be delivered - check the contacts, then Resend."}
              {stats && stats.fallbackConfigured && ' Urgent alerts are also backed up to a second contact automatically.'}
            </Typography>
          </Box>
          <Button
            variant="contained"
            size="small"
            startIcon={<ReplayRoundedIcon />}
            onClick={resendAllFailed}
            disabled={resendingAll}
            sx={{ bgcolor: FAILED_RED, whiteSpace: 'nowrap', flexShrink: 0, '&:hover': { bgcolor: '#8E1D18' } }}
          >
            {resendingAll ? 'Resending…' : `Resend all (${failureSummary.count})`}
          </Button>
          {statusFilter !== 'failed' && (
            <Button size="small" onClick={() => setStatusFilter('failed')} sx={{ color: FAILED_RED, whiteSpace: 'nowrap', flexShrink: 0 }}>
              View failed
            </Button>
          )}
        </Paper>
      )}

      {range && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Chip
            label={`Showing: ${rangeLabel(range)}`}
            onDelete={() => setRange(null)}
            deleteIcon={<CloseRoundedIcon aria-label={`Clear ${rangeLabel(range)} filter`} />}
            sx={{ bgcolor: BRAND.section, fontWeight: 600, borderRadius: '6px', height: 32, '& .MuiChip-deleteIcon': { width: 22, height: 22 } }}
          />
        </Box>
      )}

      {timelineLogs.length > 0 && (
        <NotificationTimeline
          logs={timelineLogs}
          onSelect={handleTimelineSelect}
          selectedRange={range}
        />
      )}

      <Paper variant="outlined" sx={{ border: `1px solid ${BRAND.border}`, borderRadius: '10px', overflow: 'hidden' }}>
        {/* scrolls inside the card on narrow screens instead of widening the page */}
        <Box tabIndex={0} role="region" aria-label="Dispatch log (scrollable)" sx={{ overflowX: 'auto', '&:focus-visible': { outline: `2px solid ${BRAND.accent}`, outlineOffset: '-2px' } }}>
        <Table size="small" sx={{ minWidth: 560 }}>
          <TableHead>
            <TableRow sx={{ bgcolor: BRAND.section }}>
              <TableCell sx={{ fontWeight: 600, color: BRAND.textLight, width: 80 }}>Time</TableCell>
              <TableCell sx={{ fontWeight: 600, color: BRAND.textLight, width: 90 }}>Channel</TableCell>
              <TableCell sx={{ fontWeight: 600, color: BRAND.textLight }}>Rule</TableCell>
              <TableCell sx={{ fontWeight: 600, color: BRAND.textLight }}>Recipient</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, color: BRAND.textLight }}>Status</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, color: BRAND.textLight, width: 130 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {logs.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 5, color: BRAND.textLight }}>
                  {statusFilter === 'failed' ? 'No failed dispatches — good!' : 'No notifications yet. Trigger the weekly summary from the dashboard.'}
                </TableCell>
              </TableRow>
            )}
            {grouped.map((item, idx) => {
              // day header row (#4)
              if (item.header) {
                return (
                  <TableRow key={`h-${item.key}`}>
                    <TableCell colSpan={6} sx={{ bgcolor: BRAND.section, py: 0.75 }}>
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
                  <TableRow key={`inc-${item.key}`} sx={{ bgcolor: last.resolved_at ? BRAND.section : '#FDECEA' }}>
                    <TableCell colSpan={6} sx={{ borderLeft: `3px solid ${last.resolved_at ? BRAND.border : BRAND.primary}`, py: 1.25 }}>
                      <Box
                        component="button"
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setOpenIncident(isOpen ? null : item.key)}
                        sx={{
                          width: '100%', minHeight: 44, textAlign: 'left', font: 'inherit',
                          border: 'none', background: 'transparent', cursor: 'pointer', p: 0,
                          display: 'flex', alignItems: 'center', gap: 1.5,
                          '&:focus-visible': { outline: `2px solid ${BRAND.accent}`, outlineOffset: 2 },
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
                        <Typography sx={{ fontSize: 12.5, color: last.resolved_at ? BRAND.textLight : FAILED_RED, mt: 0.5 }}>
                          {cleanReason(last.message_preview)}
                        </Typography>
                      )}
                      {/* resend the whole outage run (button lives outside the expand button) */}
                      <Box sx={{ mt: 0.75 }}>
                        {last.resolved_at ? (
                          <Chip icon={<DoneRoundedIcon sx={{ fontSize: 15 }} />} label="Resolved by resend" size="small" sx={{ bgcolor: '#E7F4E8', color: '#1E6023', fontWeight: 600, borderRadius: '6px' }} />
                        ) : (
                          <Button size="small" startIcon={<ReplayRoundedIcon sx={{ fontSize: 16 }} />} onClick={() => resend(last.id)} disabled={busyId === last.id} sx={{ color: BRAND.slate }}>
                            {busyId === last.id ? 'Resending…' : 'Resend'}
                          </Button>
                        )}
                      </Box>
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
                                sx={{ height: 22, fontSize: 11.5, bgcolor: BRAND.surface, border: `1px solid ${BRAND.border}`, color: BRAND.text, borderRadius: '6px' }}
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
                  <TableCell sx={{ whiteSpace: 'nowrap', borderLeft: failed ? `3px solid ${BRAND.accent}` : '3px solid transparent' }}>
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
                    {log.rule_name || (log.subject
                      ? <Box component="span">{log.subject}</Box>
                      : <Box component="span" sx={{ color: BRAND.textLight, fontStyle: 'italic' }}>rule deleted</Box>)}
                    {failed && (log.error_reason || log.message_preview) && (
                      <Typography sx={{ fontSize: 12, color: log.resolved_at ? BRAND.textLight : FAILED_RED, mt: 0.25 }}>
                        {log.error_reason || log.message_preview}
                      </Typography>
                    )}
                    {SOURCE_LINK[log.source_type] && (
                      <Typography
                        component={RouterLink}
                        to={SOURCE_LINK[log.source_type].to}
                        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, fontSize: 11.5, color: BRAND.slate, textDecoration: 'none', mt: 0.25, '&:hover': { textDecoration: 'underline' } }}
                      >
                        <LaunchRoundedIcon sx={{ fontSize: 13 }} /> {SOURCE_LINK[log.source_type].label}
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
                      log.resolved_at
                        ? <Chip label="Resolved" size="small" sx={{ bgcolor: '#E7F4E8', color: '#1E6023', fontWeight: 700, borderRadius: '6px' }} />
                        : <Chip label="Failed" size="small" sx={{ bgcolor: FAILED_RED, color: '#fff', fontWeight: 700, borderRadius: '6px' }} />
                    ) : log.status === 'pending' ? (
                      <Chip label="Pending" size="small" sx={{ bgcolor: '#FFF4E5', color: '#8A5200', fontWeight: 600, borderRadius: '6px' }} />
                    ) : (
                      <Typography component="span" sx={{ fontSize: 12.5, color: BRAND.textLight }}>Sent</Typography>
                    )}
                  </TableCell>
                  {/* Actions - resend a failure, or close the loop by acknowledging */}
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    {failed && !log.resolved_at && (
                      <Button size="small" startIcon={<ReplayRoundedIcon sx={{ fontSize: 16 }} />} onClick={() => resend(log.id)} disabled={busyId === log.id} sx={{ color: BRAND.slate, minWidth: 0 }}>
                        {busyId === log.id ? '…' : 'Resend'}
                      </Button>
                    )}
                    {log.status === 'sent' && (
                      log.acknowledged_at
                        ? <Tooltip title={`Acknowledged by ${log.acknowledged_by_name || 'staff'}`} arrow><Chip icon={<DoneRoundedIcon sx={{ fontSize: 14 }} />} label="Ack'd" size="small" sx={{ bgcolor: BRAND.section, color: BRAND.textLight, fontWeight: 600, borderRadius: '6px' }} /></Tooltip>
                        : <Tooltip title="Mark as acknowledged / acted on" arrow><IconButton size="small" onClick={() => acknowledge(log.id)} disabled={busyId === log.id} aria-label="Mark acknowledged" sx={{ color: BRAND.textLight, '&:hover': { color: '#1E6023' } }}><CheckCircleOutlineRoundedIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </Box>
      </Paper>

      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}><CircularProgress size={24} sx={{ color: BRAND.accent }} /></Box>}
      {logs.length < total && !loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          {/* neutral, not red (#7) - red is reserved for failures */}
          <Button variant="outlined" onClick={() => load(offset + PAGE_SIZE, false)} sx={{ borderColor: BRAND.border, color: BRAND.text }}>
            Load more ({total - logs.length} remaining)
          </Button>
        </Box>
      )}

      <UndoSnackbar
        open={!!undo}
        message="Marked as acknowledged"
        onUndo={undoAcknowledge}
        onClose={() => setUndo(null)}
      />
    </Box>
  );
}