import { useEffect, useState, useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, Table, TableHead, TableRow, TableCell,
  TableBody, Chip, Alert, CircularProgress, ToggleButtonGroup,
  ToggleButton, Button, Paper, Tooltip, Stack, IconButton, Drawer, Divider,
} from '@mui/material';
import ReportProblemRoundedIcon from '@mui/icons-material/ReportProblemRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import SmsOutlinedIcon from '@mui/icons-material/SmsOutlined';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import DoneRoundedIcon from '@mui/icons-material/DoneRounded';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import LaunchRoundedIcon from '@mui/icons-material/LaunchRounded';
import http from '../http';
import { BRAND, INTENT, ON_SURFACE } from '../theme';
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

/**
 * One delivery-assurance metric.
 *
 * The icon is tinted by TONE, not by metric: a green tick means "this is fine",
 * a red triangle means "this needs you". So the same card flips its glyph when
 * the number crosses into trouble, rather than carrying a decorative icon that
 * says the same thing whatever the value.
 */
/**
 * Delivery status as a pill, every state - including success.
 *
 * "Sent" used to be plain grey text while only failures got a chip, so scanning
 * the column meant reading words in one place and shapes in another. Every state
 * is now the same object with a different tone, which is what makes the column
 * sweepable. Each pill carries its word, so the colour is never the only cue.
 */
function StatusPillCell({ status, resolved }) {
  const map = {
    resolved: { label: 'Resolved', bg: INTENT.success.bg, ink: INTENT.success.ink },
    sent: { label: 'Sent', bg: INTENT.success.bg, ink: INTENT.success.ink },
    failed: { label: 'Failed', bg: INTENT.danger.bg, ink: INTENT.danger.ink },
    pending: { label: 'Pending', bg: INTENT.warning.bg, ink: INTENT.warning.ink },
  };
  const key = status === 'failed' && resolved ? 'resolved' : (map[status] ? status : 'pending');
  const m = map[key];
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-block', px: 1, py: '3px', borderRadius: '999px',
        bgcolor: m.bg, color: m.ink, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
      }}
    >
      {m.label}
    </Box>
  );
}

function StatTile({ label, value, sub, tone, icon: Icon }) {
  const valueColor = tone === 'bad' ? ON_SURFACE.danger : tone === 'good' ? INTENT.success.ink : BRAND.heading;
  const iconInk = tone === 'bad' ? ON_SURFACE.danger : tone === 'good' ? INTENT.success.ink : BRAND.textLight;
  const iconBg = tone === 'bad' ? INTENT.danger.bg : tone === 'good' ? INTENT.success.bg : BRAND.section;
  return (
    <Box
      sx={{
        p: 2, minWidth: 0, bgcolor: BRAND.surface, borderRadius: '10px',
        border: `1px solid ${BRAND.border}`,
        // a red left edge on the one card that represents an open problem
        ...(tone === 'bad' ? { borderLeft: `4px solid ${ON_SURFACE.danger}` } : null),
        boxShadow: '0 1px 3px rgba(16,24,40,.08), 0 1px 2px rgba(16,24,40,.04)',
      }}
    >
      <Stack direction="row" sx={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.8px', lineHeight: 1.35 }}>
          {label}
        </Typography>
        {Icon && (
          <Box aria-hidden sx={{ width: 26, height: 26, borderRadius: '7px', flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: iconBg, color: iconInk }}>
            <Icon sx={{ fontSize: 16 }} />
          </Box>
        )}
      </Stack>
      <Typography sx={{ fontSize: 30, fontWeight: 900, color: valueColor, lineHeight: 1.1, mt: 0.75, letterSpacing: '-0.8px', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
      {sub && <Typography sx={{ fontSize: 12, color: BRAND.textLight, mt: 0.25 }}>{sub}</Typography>}
    </Box>
  );
}

/**
 * The detail drawer for one dispatch, or one incident run of retry attempts.
 *
 * `entry` is either a single log row or an array of them - a run of consecutive
 * failures sharing rule + recipient + channel is ONE event that was retried, and
 * the drawer states the attempt count rather than implying N separate problems.
 *
 * Everything here is a recorded fact: the reason text is whatever the mail/SMS
 * layer returned, the timestamps are the logged attempt times, and a resolved
 * incident says so. Nothing is inferred about WHY a send failed beyond the
 * reason the gateway gave.
 */
function Row({ label, children }) {
  return (
    <Box sx={{ mb: 1.75 }}>
      <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.7px', mb: 0.25 }}>
        {label}
      </Typography>
      <Typography component="div" sx={{ fontSize: 14, color: BRAND.heading, fontWeight: 600, wordBreak: 'break-word', lineHeight: 1.4 }}>
        {children}
      </Typography>
    </Box>
  );
}

function DispatchDetail({ entry, onClose, onResend, onAcknowledge, busyId, formatExact, formatTime, cleanReason, humanizeRecipient }) {
  const run = Array.isArray(entry) ? entry : [entry];
  const last = run[0];                    // logs are newest-first
  const first = run[run.length - 1];
  const failed = last.status === 'failed';
  const resolved = Boolean(last.resolved_at);
  const reason = cleanReason(last.error_reason || last.message_preview);
  const Ch = CHANNEL_ICON[last.channel] || EmailOutlinedIcon;

  return (
    <>
      <Box sx={{ px: 3, pt: 2.5, pb: 2, borderBottom: `1px solid ${BRAND.border}`, flexShrink: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
          <Box sx={{ minWidth: 0, flexGrow: 1 }}>
            <Typography component="h2" sx={{ fontSize: 17, fontWeight: 800, color: BRAND.heading, lineHeight: 1.25 }}>
              {last.rule_name || last.subject || 'Dispatch'}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.75 }}>
              <StatusPillCell status={last.status} resolved={resolved} />
              {run.length > 1 && (
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: ON_SURFACE.danger }}>
                  {run.length} attempts
                </Typography>
              )}
            </Stack>
          </Box>
          <IconButton onClick={onClose} aria-label="Close detail" size="small" sx={{ color: BRAND.textLight }}>
            <CloseRoundedIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Stack>
      </Box>

      <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 3, py: 2.5 }}>
        {/* The error, given room to be read - this is what the inline red block
            was trying to show while squeezed into a table cell. */}
        {failed && reason && (
          <Box
            sx={{
              mb: 2.5, p: 1.75, borderRadius: '10px',
              bgcolor: resolved ? BRAND.section : INTENT.danger.bg,
              border: `1px solid ${resolved ? BRAND.border : INTENT.danger.border}`,
            }}
          >
            <Typography sx={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px', color: resolved ? BRAND.textLight : INTENT.danger.ink, mb: 0.5 }}>
              {resolved ? 'Reason (since resolved)' : 'Why it failed'}
            </Typography>
            <Typography sx={{ fontSize: 13.5, lineHeight: 1.6, color: resolved ? BRAND.text : INTENT.danger.ink }}>
              {reason}
            </Typography>
          </Box>
        )}

        <Row label="Recipient">
          {humanizeRecipient(last.recipient)}
          <Typography sx={{ fontSize: 12.5, color: BRAND.textLight, fontWeight: 500 }}>{last.recipient}</Typography>
        </Row>
        <Row label="Channel">
          <Stack direction="row" spacing={0.6} sx={{ alignItems: 'center' }}>
            <Ch sx={{ fontSize: 16, color: BRAND.textLight }} />
            {last.channel === 'sms' ? 'SMS' : last.channel === 'both' ? 'Email + SMS' : 'Email'}
          </Stack>
        </Row>
        {last.subject && <Row label="Subject">{last.subject}</Row>}
        <Row label={run.length > 1 ? 'First attempt' : 'Dispatched'}>{formatExact(first.createdAt)}</Row>
        {run.length > 1 && <Row label="Last attempt">{formatExact(last.createdAt)}</Row>}
        {resolved && <Row label="Resolved">{formatExact(last.resolved_at)}</Row>}
        {last.acknowledged_at && (
          <Row label="Acknowledged">
            {formatExact(last.acknowledged_at)}
            <Typography sx={{ fontSize: 12.5, color: BRAND.textLight, fontWeight: 500 }}>
              by {last.acknowledged_by_name || 'staff'}
            </Typography>
          </Row>
        )}

        {run.length > 1 && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.7px', mb: 1 }}>
              Attempt times
            </Typography>
            {/* only the timing differs between attempts in a run, so only the
                timing is listed - the reason is stated once, above */}
            <Stack spacing={0.5}>
              {run.slice().reverse().map((r, n) => (
                <Stack key={r.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Box sx={{ width: 18, fontSize: 11.5, fontWeight: 700, color: BRAND.textLight, fontVariantNumeric: 'tabular-nums' }}>{n + 1}</Box>
                  <Typography sx={{ fontSize: 13, color: BRAND.text, fontVariantNumeric: 'tabular-nums' }}>{formatTime(r.createdAt)}</Typography>
                </Stack>
              ))}
            </Stack>
          </>
        )}
      </Box>

      {/* Sticky action shelf - the drawer's one CTA, never scrolled away. */}
      <Box sx={{ px: 3, py: 2.25, borderTop: `1px solid ${BRAND.border}`, flexShrink: 0, boxShadow: '0 -6px 20px rgba(16,24,40,.08)' }}>
        {failed && !resolved ? (
          <Button
            fullWidth
            variant="contained"
            disableElevation
            startIcon={busyId === last.id ? <CircularProgress size={15} sx={{ color: '#fff' }} /> : <ReplayRoundedIcon />}
            disabled={busyId === last.id}
            onClick={() => onResend(last.id)}
            sx={{
              bgcolor: FAILED_RED, color: '#fff', textTransform: 'none', fontWeight: 800,
              fontSize: 15, minHeight: 46, borderRadius: '8px',
              boxShadow: '0 4px 14px rgba(179,38,30,.30)',
              '&:hover': { bgcolor: '#8E1D18' },
            }}
          >
            {busyId === last.id ? 'Resending…' : run.length > 1 ? 'Resend this notification' : 'Resend'}
          </Button>
        ) : last.status === 'sent' && !last.acknowledged_at ? (
          <Button
            fullWidth
            startIcon={<CheckCircleOutlineRoundedIcon />}
            disabled={busyId === last.id}
            onClick={() => onAcknowledge(last.id)}
            sx={{ textTransform: 'none', fontWeight: 700, minHeight: 46, borderRadius: '8px', color: BRAND.text, border: `1px solid ${BRAND.border}` }}
          >
            Mark as acted on
          </Button>
        ) : (
          <Typography sx={{ fontSize: 13, color: BRAND.textLight, textAlign: 'center' }}>
            {resolved ? 'Resolved by a successful resend.' : 'Delivered - no action needed.'}
          </Typography>
        )}
      </Box>
    </>
  );
}

export default function NotificationLog() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [range, setRange] = useState(null); // { from, to } (YYYY-MM-DD) or null
  // the row (or incident run) shown in the detail drawer, or null
  const [detail, setDetail] = useState(null);
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
    } catch {
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
  const selectedId = Array.isArray(detail) ? detail[0]?.id : detail?.id;

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
    /* Fills the viewport.
       The page was a 1536px-capped, centred Container that scrolled with the
       document, so a wide screen left margins either side AND the browser
       scrollbar moved the whole console - header, banner and all - off the top.
       It is now a full-height flex column: the title row is fixed and everything
       below it scrolls in its own region, with the table's own header pinned to
       the top of that region. */
    <Box
      component="section"
      sx={{
        width: '100%', height: '100%', minHeight: 0,
        display: 'flex', flexDirection: 'column', bgcolor: BRAND.canvas,
      }}
    >
      <Box
        sx={{
          flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
          gap: 2, rowGap: 1.5, flexWrap: 'wrap',
          px: { xs: 2, md: 3 }, pt: 2.5, pb: 2,
          bgcolor: BRAND.surface, borderBottom: `1px solid ${BRAND.border}`,
        }}
      >
        <Box>
          <Typography component="h1" sx={{ fontSize: { xs: 22, md: 26 }, fontWeight: 800, color: BRAND.ink, letterSpacing: '-0.5px', lineHeight: 1.2 }}>
            Notification Log
          </Typography>
          <Typography sx={{ fontSize: 13.5, color: BRAND.textLight, mt: 0.25 }}>Every alert dispatched by the system</Typography>
        </Box>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexShrink: 0 }}>
          {/* Segmented control: one trough, a raised white chip for the active
              state. The old outlined group read as three separate buttons, so
              picking a filter looked like firing an action rather than switching
              a view. `failed` keeps a red chip - it is the one state that is a
              problem, not just a filter. */}
          <ToggleButtonGroup
            value={statusFilter}
            exclusive
            onChange={(_, v) => { if (v) { setLoading(true); setStatusFilter(v); } }}
            size="small"
            aria-label="Filter by delivery status"
            sx={{
              bgcolor: BRAND.section, borderRadius: '8px', p: '3px', gap: '2px',
              '& .MuiToggleButtonGroup-grouped': {
                border: 0, marginLeft: 0, px: 1.75, py: 0.45, borderRadius: '6px !important',
                textTransform: 'none', fontSize: 13, fontWeight: 600, color: BRAND.text,
                '&:hover': { bgcolor: 'rgba(120,130,145,0.12)' },
                '&.Mui-selected': {
                  bgcolor: BRAND.surface, color: BRAND.heading, fontWeight: 700,
                  boxShadow: '0 1px 3px rgba(16,24,40,.18)',
                  '&:hover': { bgcolor: BRAND.surface },
                },
              },
            }}
          >
            <ToggleButton value="all">All</ToggleButton>
            <ToggleButton value="sent">Sent</ToggleButton>
            <ToggleButton value="failed" sx={{ '&.Mui-selected': { color: `${ON_SURFACE.danger} !important` } }}>Failed</ToggleButton>
          </ToggleButtonGroup>
          {/* audit export for the town council's records / SharePoint - demoted to
              a ghost button so it never competes with Resend all */}
          <Button
            size="small"
            startIcon={<FileDownloadOutlinedIcon sx={{ fontSize: 17 }} />}
            onClick={exportCsv}
            sx={{
              whiteSpace: 'nowrap', textTransform: 'none', fontWeight: 600,
              borderRadius: '8px', px: 1.5, py: 0.6,
              color: BRAND.textLight, border: `1px solid ${BRAND.border}`,
              '&:hover': { borderColor: BRAND.textLight, color: BRAND.heading, bgcolor: BRAND.section },
            }}
          >
            Export
          </Button>
        </Stack>
      </Box>

      {/* everything below the title band scrolls together */}
      {/* Owns BOTH scroll axes. The table's stickyHeader pins to the top of THIS
          box, so the column labels stay visible while the log scrolls beneath
          the fixed title band. */}
      <Box tabIndex={-1} sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto', px: { xs: 2, md: 3 }, py: 2.5 }}>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {toast && <Alert severity={toast.ok ? 'success' : 'error'} sx={{ mb: 2 }} onClose={() => setToast(null)}>{toast.msg}</Alert>}

      {/* THE HOOK, above everything else.
          This sat between the KPI strip and the chart, so the single most urgent
          fact on the page - N alerts never reached anyone - was the third thing
          read. Unresolved failures outrank every summary statistic, so the banner
          now comes first and carries the page's heaviest action. */}
      {failureSummary && (
        <Paper
          elevation={0}
          sx={{
            display: 'flex', alignItems: 'center', gap: 2, px: 2.5, py: 2, mb: 2.5,
            border: `1px solid ${INTENT.danger.border}`, bgcolor: INTENT.danger.bg,
            borderRadius: '12px', flexWrap: 'wrap',
            boxShadow: '0 1px 3px rgba(16,24,40,.06)',
          }}
        >
          <Box
            aria-hidden
            sx={{
              width: 38, height: 38, borderRadius: '10px', flexShrink: 0,
              display: 'grid', placeItems: 'center',
              bgcolor: FAILED_RED, color: '#fff',
            }}
          >
            <ReportProblemRoundedIcon sx={{ fontSize: 21 }} />
          </Box>
          <Box sx={{ minWidth: 200, flexGrow: 1 }}>
            <Typography sx={{ color: INTENT.danger.ink, fontWeight: 800, fontSize: 16, lineHeight: 1.3 }}>
              {failureSummary.count} {failureSummary.count === 1 ? 'notification' : 'notifications'} didn't reach {failureSummary.recipientCount > 1 ? `${failureSummary.recipientCount} recipients` : 'their recipient'}
              {failureSummary.span && ` · ${failureSummary.span}`}
            </Typography>
            <Typography sx={{ color: INTENT.danger.ink, fontSize: 12.5, opacity: 0.92, mt: 0.25 }}>
              {failureSummary.channels.length === 1 && failureSummary.channels[0] === 'sms'
                ? "The text messages couldn't be delivered. Use Resend to try again."
                : failureSummary.channels.length === 1
                  ? "The emails couldn't be delivered - the mail service may be having trouble. Use Resend to try again."
                  : "Some messages couldn't be delivered - check the contacts, then Resend."}
              {stats && stats.fallbackConfigured && ' Urgent alerts are also backed up to a second contact automatically.'}
            </Typography>
          </Box>
          {statusFilter !== 'failed' && (
            <Button
              size="small"
              onClick={() => { setLoading(true); setStatusFilter('failed'); }}
              sx={{ color: INTENT.danger.ink, textTransform: 'none', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              View failed
            </Button>
          )}
          {/* the page's heaviest element, and it lives with the problem it solves */}
          <Button
            variant="contained"
            disableElevation
            startIcon={resendingAll ? <CircularProgress size={15} sx={{ color: '#fff' }} /> : <ReplayRoundedIcon />}
            onClick={resendAllFailed}
            disabled={resendingAll}
            sx={{
              bgcolor: FAILED_RED, color: '#fff', whiteSpace: 'nowrap', flexShrink: 0,
              textTransform: 'none', fontWeight: 800, fontSize: 14.5, px: 2.5, py: 1.1, borderRadius: '8px',
              boxShadow: '0 4px 14px rgba(179,38,30,.32)',
              '&:hover': { bgcolor: '#8E1D18', boxShadow: '0 6px 18px rgba(179,38,30,.44)' },
            }}
          >
            {resendingAll ? 'Resending…' : `Resend all (${failureSummary.count})`}
          </Button>
        </Paper>
      )}

      {stats && stats.total > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 2, mb: 2.5 }}>
          <StatTile
            label="Delivery rate"
            value={`${Math.round((stats.deliveryRate ?? 0) * 100)}%`}
            sub={`${stats.sent}/${stats.total} sent`}
            icon={CheckCircleOutlineRoundedIcon}
            tone={stats.deliveryRate >= 0.95 ? 'good' : 'muted'}
          />
          <StatTile
            label="Unresolved failures"
            value={stats.unresolvedFailed}
            sub={stats.unresolvedFailed > 0 ? 'need a resend' : 'all clear'}
            tone={stats.unresolvedFailed > 0 ? 'bad' : 'good'}
            icon={stats.unresolvedFailed > 0 ? WarningAmberRoundedIcon : CheckCircleOutlineRoundedIcon}
          />
          <StatTile
            label="Acknowledged"
            value={`${Math.round((stats.acknowledgedRate ?? 0) * 100)}%`}
            sub={`${stats.acknowledged} acted on`}
            icon={DoneRoundedIcon}
          />
          <StatTile
            label="Backup contact"
            value={stats.fallbackConfigured ? 'On' : 'Off'}
            sub={stats.fallbackConfigured ? 'urgent alerts auto-forward' : 'none set for urgent alerts'}
            tone={stats.fallbackConfigured ? 'good' : 'muted'}
            icon={ShieldOutlinedIcon}
          />
        </Box>
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

      <Paper variant="outlined" sx={{ border: `1px solid ${BRAND.border}`, borderRadius: '10px', overflowX: 'clip' }}>
        {/* scrolls inside the card on narrow screens instead of widening the page */}
        <Box role="region" aria-label="Dispatch log" sx={{ '&:focus-visible': { outline: `2px solid ${BRAND.accent}`, outlineOffset: '-2px' } }}>
        {/* stickyHeader pins the column labels to the top of the page's scroll
            region, so they stay readable however far down the log you are */}
        <Table size="small" stickyHeader sx={{ minWidth: 560 }}>
          <TableHead>
            {/* stickyHeader needs an OPAQUE cell background - the default is
                transparent, so rows would show through the pinned header */}
            <TableRow>
              {[
                ['Time', 'left', 92],
                ['Channel', 'left', 100],
                ['Rule', 'left', undefined],
                ['Recipient', 'left', undefined],
                ['Status', 'right', 110],
                ['Actions', 'right', 130],
              ].map(([label, align, width]) => (
                <TableCell
                  key={label}
                  align={align}
                  sx={{
                    width, bgcolor: BRAND.section, color: BRAND.text,
                    fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.7px',
                    borderBottom: `1px solid ${BRAND.border}`, py: 1.25,
                  }}
                >
                  {label}
                </TableCell>
              ))}
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
            {grouped.map(item => {
              // day header row (#4)
              if (item.header) {
                return (
                  <TableRow key={`h-${item.key}`}>
                    <TableCell colSpan={6} sx={{ bgcolor: BRAND.canvas, py: 0.75, borderBottom: `1px solid ${BRAND.border}` }}>
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
                const first = run[run.length - 1];   // logs are newest-first
                const last = run[0];
                const ChI = CHANNEL_ICON[last.channel] || EmailOutlinedIcon;
                const done = Boolean(last.resolved_at);
                // A retry run is ONE event, so it stays one row. Its attempt list
                // and shared reason live in the drawer now - inline they turned a
                // single outage into a block of red taller than the day's traffic.
                return (
                  <TableRow
                    key={`inc-${item.key}`}
                    hover
                    onClick={() => setDetail(run)}
                    sx={{
                      cursor: 'pointer',
                      bgcolor: selectedId === last.id ? BRAND.navySoft : 'inherit',
                      '&:hover .nl-row-actions': { opacity: 1 },
                    }}
                  >
                    <TableCell sx={{ whiteSpace: 'nowrap', borderLeft: done ? '3px solid transparent' : `3px solid ${FAILED_RED}` }}>
                      <Typography sx={{ fontSize: 13, color: BRAND.heading }}>
                        {formatTime(first.createdAt)}
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: BRAND.textLight }}>
                        to {formatTime(last.createdAt)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                        <ChI sx={{ fontSize: 15, color: BRAND.textLight }} />
                        <Typography sx={{ fontSize: 12, color: BRAND.text }}>
                          {last.channel === 'sms' ? 'SMS' : last.channel === 'both' ? 'Both' : 'Email'}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: BRAND.heading, lineHeight: 1.35 }}>
                        {last.rule_name || last.subject || 'Dispatch'}
                      </Typography>
                      <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: done ? BRAND.textLight : ON_SURFACE.danger }}>
                        {run.length} failed attempts
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: BRAND.heading, lineHeight: 1.35 }}>
                        {humanizeRecipient(last.recipient)}
                      </Typography>
                      <Tooltip title={last.recipient} arrow>
                        <Typography sx={{ fontSize: 11.5, color: BRAND.textLight, cursor: 'default', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                          {last.recipient}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="right">
                      <StatusPillCell status="failed" resolved={done} />
                    </TableCell>
                    <TableCell
                      align="right"
                      className="nl-row-actions"
                      onClick={e => e.stopPropagation()}
                      sx={{
                        whiteSpace: 'nowrap',
                        '@media (hover: hover)': {
                          opacity: 0, transition: 'opacity .12s ease',
                          'tr:focus-within &': { opacity: 1 },
                        },
                      }}
                    >
                      {!done && (
                        <Tooltip title="Resend this notification" arrow>
                          <Button size="small" startIcon={<ReplayRoundedIcon sx={{ fontSize: 16 }} />} onClick={() => resend(last.id)} disabled={busyId === last.id} sx={{ color: BRAND.slate, minWidth: 0, textTransform: 'none', fontWeight: 600 }}>
                            {busyId === last.id ? '…' : 'Resend'}
                          </Button>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                );
              }

              const log = item.log;
              const failed = log.status === 'failed';
              const ChIcon = CHANNEL_ICON[log.channel] || EmailOutlinedIcon;
              return (
                // The whole row opens the drawer. The failed-row tint is now a thin
                // left edge instead of a full red wash: with the reason moved into
                // the drawer there is nothing on the row that needs a red backdrop,
                // and washed rows made the status pills harder to read.
                <TableRow
                  key={log.id}
                  hover
                  onClick={() => setDetail(log)}
                  sx={{
                    cursor: 'pointer',
                    bgcolor: selectedId === log.id ? BRAND.navySoft : 'inherit',
                    '&:hover .nl-row-actions': { opacity: 1 },
                  }}
                >
                  {/* Time only - the day is in the header (#4) */}
                  <TableCell sx={{ whiteSpace: 'nowrap', borderLeft: failed && !log.resolved_at ? `3px solid ${FAILED_RED}` : '3px solid transparent' }}>
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
                  {/* Primary line bold and dark, supporting line small and grey.
                      The failure reason is NOT printed here any more - it lives in
                      the detail drawer, so a bad day no longer turns the table into
                      a wall of red prose. */}
                  <TableCell>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: BRAND.heading, lineHeight: 1.35 }}>
                      {log.rule_name || log.subject || (
                        <Box component="span" sx={{ color: BRAND.textLight, fontStyle: 'italic', fontWeight: 500 }}>rule deleted</Box>
                      )}
                    </Typography>
                    {SOURCE_LINK[log.source_type] && (
                      <Typography
                        component={RouterLink}
                        to={SOURCE_LINK[log.source_type].to}
                        onClick={e => e.stopPropagation()}
                        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, fontSize: 11.5, color: BRAND.textLight, textDecoration: 'none', '&:hover': { textDecoration: 'underline', color: BRAND.slate } }}
                      >
                        <LaunchRoundedIcon sx={{ fontSize: 12 }} /> {SOURCE_LINK[log.source_type].label}
                      </Typography>
                    )}
                  </TableCell>
                  {/* Recipient - humanized name + truncated local part on hover-full (#7) */}
                  <TableCell>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: BRAND.heading, lineHeight: 1.35 }}>
                      {humanizeRecipient(log.recipient)}
                    </Typography>
                    <Tooltip title={log.recipient} arrow>
                      <Typography sx={{ fontSize: 11.5, color: BRAND.textLight, cursor: 'default', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                        {log.recipient}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  {/* Status - Sent is quiet (#6), Failed shouts */}
                  <TableCell align="right">
                    <StatusPillCell status={log.status} resolved={Boolean(log.resolved_at)} />
                  </TableCell>
                  {/* Actions - resend a failure, or close the loop by acknowledging */}
                  {/* Micro-actions stay out of the way until the row is engaged.
                      focus-within keeps them reachable by keyboard, and the
                      hover-hiding is gated to pointer devices so touch always
                      shows them. */}
                  <TableCell
                    align="right"
                    className="nl-row-actions"
                    onClick={e => e.stopPropagation()}
                    sx={{
                      whiteSpace: 'nowrap',
                      '@media (hover: hover)': {
                        opacity: 0, transition: 'opacity .12s ease',
                        'tr:focus-within &': { opacity: 1 },
                      },
                    }}
                  >
                    {failed && !log.resolved_at && (
                      <Tooltip title="Resend this notification" arrow>
                        <Button size="small" startIcon={<ReplayRoundedIcon sx={{ fontSize: 16 }} />} onClick={() => resend(log.id)} disabled={busyId === log.id} sx={{ color: BRAND.slate, minWidth: 0, textTransform: 'none', fontWeight: 600 }}>
                          {busyId === log.id ? '…' : 'Resend'}
                        </Button>
                      </Tooltip>
                    )}
                    {log.status === 'sent' && (
                      log.acknowledged_at
                        ? <Tooltip title={`Acknowledged by ${log.acknowledged_by_name || 'staff'}`} arrow><Chip icon={<DoneRoundedIcon sx={{ fontSize: 14 }} />} label="Ack'd" size="small" sx={{ bgcolor: BRAND.section, color: BRAND.textLight, fontWeight: 600, borderRadius: '6px' }} /></Tooltip>
                        : <Tooltip title="Mark as acknowledged / acted on" arrow><IconButton size="small" onClick={() => acknowledge(log.id)} disabled={busyId === log.id} aria-label="Mark acknowledged" sx={{ color: BRAND.textLight, '&:hover': { color: ON_SURFACE.ok } }}><CheckCircleOutlineRoundedIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
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

      </Box>

      {/* MASTER-DETAIL DRAWER.
          Failure detail used to expand inline, which pushed every row below it
          down the page and, on a bad day, turned the table into stacked red
          blocks. A drawer keeps the table's row positions fixed - the reader's
          mental map survives - and gives the error room to be read properly. */}
      <Drawer
        anchor="right"
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        slotProps={{
          paper: { sx: { width: { xs: '100%', sm: 460 }, bgcolor: BRAND.surface, display: 'flex', flexDirection: 'column' } },
        }}
      >
        {detail && <DispatchDetail
          entry={detail}
          onClose={() => setDetail(null)}
          onResend={resend}
          onAcknowledge={acknowledge}
          busyId={busyId}
          formatExact={formatExact}
          formatTime={formatTime}
          cleanReason={cleanReason}
          humanizeRecipient={humanizeRecipient}
        />}
      </Drawer>

      <UndoSnackbar
        open={!!undo}
        message="Marked as acknowledged"
        onUndo={undoAcknowledge}
        onClose={() => setUndo(null)}
      />
    </Box>
  );
}