import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, Button, Card, Switch,
  TextField, Select, MenuItem, FormControl, InputLabel, InputAdornment,
  Alert, Chip, IconButton, Menu, ListItemIcon, ListItemText,
  Autocomplete, Grid, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions,
  Divider, Skeleton, Checkbox, ToggleButtonGroup, ToggleButton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import SmsOutlinedIcon from '@mui/icons-material/SmsOutlined';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import TableRowsRoundedIcon from '@mui/icons-material/TableRowsRounded';
import VerticalSplitRoundedIcon from '@mui/icons-material/VerticalSplitRounded';
import { useUser } from '../contexts/UserContext';
import { BRAND, INTENT, ON_SURFACE, KPI_TONE } from '../theme';
import http from '../http';
import ConfirmDialog from '../components/ConfirmDialog';

// Trigger config: label, the severity colour used on the trigger chip, whether it
// takes a threshold, and the unit shown inline so "5" reads as "5 sightings".
// Severity, not category, is what the chip and the accent bar encode - one
// meaning per colour. Category is carried by the trigger TEXT alone, so this
// never collides with the dashboard's categorical palette (where flora is teal
// and pigeon is purple). Red here means "urgent", not "flora".
// `ink`/`tint` come from the scheme-aware INTENT pairs; `bar` is the accent rule
// down the row's leading edge (a graphic, so it uses the --em-prio-* pairs).
const SEVERITY = {
  urgent: { ink: INTENT.danger.ink, tint: INTENT.danger.bg, bar: 'var(--em-prio-critical)', label: 'Urgent' },
  watch:  { ink: INTENT.warning.ink, tint: INTENT.warning.bg, bar: 'var(--em-prio-medium)', label: 'Watch' },
  info:   { ink: INTENT.neutral.ink, tint: INTENT.neutral.bg, bar: 'var(--em-prio-low)', label: 'Informational' },
};
const TRIGGERS = {
  flora_critical:  { label: 'Flora Critical',  full: 'Flora goes critical',  severity: 'urgent', threshold: false },
  fauna_hotspot:   { label: 'Fauna Hotspot',   full: 'New fauna hotspot',    severity: 'watch',  threshold: true, unit: 'sightings' },
  new_case_urgent: { label: 'Urgent Case',     full: 'New urgent case',      severity: 'urgent', threshold: false },
  weekly_summary:  { label: 'Weekly Summary',  full: 'Weekly summary',       severity: 'info',   threshold: false },
};
const sevOf = k => SEVERITY[TRIGGERS[k]?.severity] || SEVERITY.info;
const sevKeyOf = k => TRIGGERS[k]?.severity || 'info';
const TRIGGER_ORDER = ['flora_critical', 'fauna_hotspot', 'new_case_urgent', 'weekly_summary'];

const CHANNEL_META = {
  email: { label: 'Email', icon: EmailOutlinedIcon },
  sms: { label: 'SMS', icon: SmsOutlinedIcon },
  both: { label: 'Email + SMS', icon: EmailOutlinedIcon },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// "2h ago" style relative time for the activity column - precision a reader can
// act on beats a full timestamp they have to parse (full value on hover).
function relTime(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days < 30 ? `${days}d ago` : `${Math.floor(days / 30)}mo ago`;
}

// trigger chip: coloured by severity so "how urgent is this" reads first
function TriggerChip({ triggerType }) {
  const t = TRIGGERS[triggerType];
  const sev = sevOf(triggerType);
  return <Chip label={t?.label || triggerType} size="small" sx={{ height: 20, fontSize: 11, bgcolor: sev.tint, color: sev.ink, fontWeight: 700, borderRadius: '6px' }} />;
}

// threshold chip: neutral "code style" per the badge hierarchy - a condition is
// data, not a status, so it must not compete with the severity tag
function ThresholdChip({ triggerType, threshold }) {
  const t = TRIGGERS[triggerType];
  if (!t?.threshold || threshold == null) return null;
  // NOTE: computeHotspots() applies no time window, so we deliberately do NOT
  // claim one here. Once a window lands in the hotspot logic, show it.
  return (
    <Chip
      label={`≥ ${threshold} ${t.unit}`}
      size="small"
      variant="outlined"
      sx={{ height: 20, fontSize: 11, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: BRAND.textLight, borderColor: BRAND.border, borderRadius: '6px' }}
    />
  );
}

// status derived from the toggle - single source of truth, no "(paused)" in names
function StatusPill({ active }) {
  return (
    <Chip
      label={active ? 'Active' : 'Paused'}
      size="small"
      sx={{
        height: 20, fontSize: 11, fontWeight: 700, borderRadius: '6px',
        bgcolor: active ? INTENT.success.bg : BRAND.section,
        color: active ? INTENT.success.ink : BRAND.textLight,
      }}
    />
  );
}

// show the local-part only (estate.ops), full address on hover
function localPart(email) {
  return String(email).split('@')[0];
}
function RecipientPills({ recipients, channel }) {
  const meta = CHANNEL_META[channel] || CHANNEL_META.email;
  const Icon = meta.icon;
  const emails = (recipients || '').split(',').map(e => e.trim()).filter(Boolean);
  const shown = emails.slice(0, 2);
  const rest = emails.slice(2);
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
      <Tooltip title={meta.label} arrow>
        <Icon sx={{ fontSize: 15, color: BRAND.textLight, mr: 0.25 }} aria-label={meta.label} />
      </Tooltip>
      {shown.map((e, i) => (
        <Tooltip key={i} title={e} arrow>
          <Chip label={localPart(e)} size="small" sx={{ bgcolor: BRAND.section, color: BRAND.text, borderRadius: '6px', fontSize: 12, height: 22, cursor: 'default' }} />
        </Tooltip>
      ))}
      {rest.length > 0 && (
        <Tooltip title={rest.join(', ')} arrow>
          <Chip label={`+${rest.length}`} size="small" sx={{ bgcolor: BRAND.section, color: BRAND.textLight, borderRadius: '6px', fontSize: 12, height: 22, cursor: 'default' }} />
        </Tooltip>
      )}
    </Box>
  );
}

function RowMenu({ onEdit, onDuplicate, onDelete }) {
  const [anchor, setAnchor] = useState(null);
  return (
    <>
      <IconButton onClick={e => setAnchor(e.currentTarget)} aria-label="Rule actions" sx={{ color: BRAND.textLight, width: 36, height: 36 }}>
        <MoreVertRoundedIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <MenuItem onClick={() => { setAnchor(null); onEdit(); }}>
          <ListItemIcon><EditOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { setAnchor(null); onDuplicate(); }}>
          <ListItemIcon><ContentCopyRoundedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Duplicate</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { setAnchor(null); onDelete(); }} sx={{ color: BRAND.accent }}>
          <ListItemIcon><DeleteOutlineRoundedIcon fontSize="small" sx={{ color: BRAND.accent }} /></ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}

// KPI hero tile: icon in a tinted well, oversized tabular figure, quiet subtext.
// Same anatomy as the dashboard KPI cards so the strip reads as one system.
function StatTile({ icon: Icon, tone, label, value, sub, subInk }) {
  const mode = useTheme().palette.mode;
  const t = KPI_TONE[mode][tone];
  return (
    <Card sx={{ p: 2, height: '100%', display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
      <Box sx={{ width: 38, height: 38, borderRadius: '8px', bgcolor: t.tint, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon sx={{ fontSize: 20, color: t.ink }} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: BRAND.textLight, lineHeight: 1.3 }}>{label}</Typography>
        <Typography sx={{ fontSize: 26, fontWeight: 800, color: BRAND.ink, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
        {sub && <Typography sx={{ fontSize: 12, color: subInk || BRAND.textLight, display: 'flex', alignItems: 'center', gap: 0.25 }}>{sub}</Typography>}
      </Box>
    </Card>
  );
}

// ---- Option 2: split-pane master-detail --------------------------------------

// left pane: compact selectable rule list. A listbox, not a table - identity and
// severity only; everything else lives in the detail pane.
function RuleListPane({ rules, selectedId, onSelect }) {
  return (
    <Card sx={{ flex: { md: '0 0 35%' }, minWidth: 0, maxHeight: { md: '62vh' }, overflow: 'auto', borderRadius: '12px' }}>
      <Box role="listbox" aria-label="Alert rules" sx={{ py: 0.5 }}>
        {rules.length === 0 && (
          <Typography sx={{ px: 2, py: 3, fontSize: 13.5, color: BRAND.textLight, textAlign: 'center' }}>
            No rules match the current filters.
          </Typography>
        )}
        {rules.map(rule => {
          const sev = sevOf(rule.trigger_type);
          const selected = rule.id === selectedId;
          const paused = !rule.is_active;
          return (
            <Box
              key={rule.id}
              id={`rule-item-${rule.id}`}
              role="option"
              aria-selected={selected}
              tabIndex={0}
              onClick={() => onSelect(rule.id)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(rule.id); } }}
              sx={{
                px: 1.5, py: 1.1, mx: 0.75, my: 0.25, borderRadius: '8px', cursor: 'pointer',
                borderLeft: '3px solid', borderLeftColor: paused ? BRAND.border : sev.bar,
                bgcolor: selected ? BRAND.navySoft : 'transparent',
                '&:hover': { bgcolor: selected ? BRAND.navySoft : BRAND.section },
                '&:focus-visible': { outline: `2px solid ${BRAND.accent}`, outlineOffset: -2 },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: BRAND.heading, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                  {rule.name}
                </Typography>
                <StatusPill active={rule.is_active} />
              </Box>
              <Typography sx={{ fontSize: 12, color: BRAND.textLight, mt: 0.25 }}>
                {TRIGGERS[rule.trigger_type]?.label || rule.trigger_type} · {(CHANNEL_META[rule.channel] || CHANNEL_META.email).label}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Card>
  );
}

// dispatch log entry inside the detail pane
function DispatchRow({ log }) {
  const failed = log.status === 'failed';
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', py: 0.9, borderTop: `1px solid ${BRAND.border}` }}>
      <Chip
        label={failed ? 'Failed' : 'Sent'}
        size="small"
        sx={{ height: 19, fontSize: 10.5, fontWeight: 700, borderRadius: '5px', mt: '1px', bgcolor: failed ? INTENT.danger.bg : INTENT.success.bg, color: failed ? INTENT.danger.ink : INTENT.success.ink }}
      />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontSize: 12.5, color: BRAND.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {log.subject || log.message_preview || 'Notification'}
          <Box component="span" sx={{ color: BRAND.textLight }}>{` → ${localPart(log.recipient)}`}</Box>
        </Typography>
        {failed && log.error_reason && (
          <Typography sx={{ fontSize: 11.5, color: ON_SURFACE.danger }}>{log.error_reason}</Typography>
        )}
      </Box>
      <Tooltip title={new Date(log.createdAt).toLocaleString()} arrow>
        <Typography sx={{ fontSize: 11.5, color: BRAND.textLight, whiteSpace: 'nowrap', cursor: 'default' }}>{relTime(log.createdAt)}</Typography>
      </Tooltip>
    </Box>
  );
}

// right pane: everything about the selected rule, including its dispatch history
function RuleDetailPane({ rule, act, isAdmin, logsEntry, onToggle, onEdit, onDuplicate, onDelete }) {
  if (!rule) {
    return (
      <Card sx={{ flex: 1, minWidth: 0, borderRadius: '12px', display: 'grid', placeItems: 'center', minHeight: 320 }}>
        <Typography sx={{ color: BRAND.textLight }}>Select a rule to see its details.</Typography>
      </Card>
    );
  }
  const t = TRIGGERS[rule.trigger_type];
  const emails = (rule.recipients || '').split(',').map(e => e.trim()).filter(Boolean);
  const monoSx = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5, color: BRAND.text, lineHeight: 1.9, whiteSpace: 'pre-wrap' };
  const kw = { color: ON_SURFACE.info, fontWeight: 700 };
  const last = relTime(act?.lastTriggeredAt);
  return (
    <Card sx={{ flex: 1, minWidth: 0, borderRadius: '12px', p: 2.5, maxHeight: { md: '62vh' }, overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, flexWrap: 'wrap' }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 17, fontWeight: 700, color: BRAND.heading }}>{rule.name}</Typography>
            <StatusPill active={rule.is_active} />
          </Box>
          <Typography sx={{ fontSize: 12.5, color: BRAND.textLight, mt: 0.25 }}>
            {act?.count > 0 ? `Triggered ${act.count}x in the last 24h` : 'No triggers in the last 24h'}
            {act?.failed > 0 && ` (${act.failed} failed)`}
            {last && ` · last fired ${last}`}
          </Typography>
        </Box>
        {isAdmin && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
            <Switch
              checked={rule.is_active}
              onChange={() => onToggle(rule)}
              size="small"
              slotProps={{ input: { 'aria-label': `${rule.is_active ? 'Pause' : 'Activate'} rule: ${rule.name}` } }}
              sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: BRAND.success }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: BRAND.success } }}
            />
            <Button size="small" startIcon={<EditOutlinedIcon sx={{ fontSize: 15 }} />} onClick={() => onEdit(rule)} sx={{ color: BRAND.text }}>Edit</Button>
            <Button size="small" startIcon={<ContentCopyRoundedIcon sx={{ fontSize: 15 }} />} onClick={() => onDuplicate(rule)} sx={{ color: BRAND.text }}>Duplicate</Button>
            <Button size="small" startIcon={<DeleteOutlineRoundedIcon sx={{ fontSize: 15 }} />} onClick={() => onDelete(rule)} sx={{ color: BRAND.accent }}>Delete</Button>
          </Box>
        )}
      </Box>

      {/* trigger conditions, stated as executable-looking facts */}
      <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.5px', mt: 2.5, mb: 0.75 }}>
        Trigger conditions
      </Typography>
      <Box sx={{ px: 1.75, py: 1.25, bgcolor: BRAND.canvas, border: `1px solid ${BRAND.border}`, borderRadius: '8px' }}>
        <Typography sx={monoSx}>
          <Box component="span" sx={kw}>IF</Box> {t?.full || rule.trigger_type}
          {t?.threshold && rule.threshold != null && <> <Box component="span" sx={kw}>AND</Box> count ≥ {rule.threshold} {t.unit}</>}
          {'\n'}
          <Box component="span" sx={kw}>SEND</Box> {(CHANNEL_META[rule.channel] || CHANNEL_META.email).label}
          {' '}<Box component="span" sx={kw}>TO</Box> {emails.map(localPart).join(', ') || 'nobody'}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1.25, alignItems: 'center' }}>
        <TriggerChip triggerType={rule.trigger_type} />
        <ThresholdChip triggerType={rule.trigger_type} threshold={rule.threshold} />
        {emails.map(e => (
          <Tooltip key={e} title={e} arrow>
            <Chip label={localPart(e)} size="small" sx={{ bgcolor: BRAND.section, color: BRAND.text, borderRadius: '6px', fontSize: 12, height: 22, cursor: 'default' }} />
          </Tooltip>
        ))}
      </Box>

      {/* recent dispatches for THIS rule, straight from the notification log */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2.5, mb: 0.5 }}>
        <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Recent activity log
        </Typography>
        <Button size="small" component={RouterLink} to="/notif-log" sx={{ color: ON_SURFACE.info, fontSize: 12 }}>Open full log</Button>
      </Box>
      {!logsEntry && <Skeleton variant="rounded" height={72} />}
      {logsEntry && logsEntry.error && (
        <Typography sx={{ fontSize: 12.5, color: BRAND.textLight, py: 1 }}>Could not load dispatches for this rule.</Typography>
      )}
      {logsEntry && !logsEntry.error && logsEntry.logs.length === 0 && (
        <Typography sx={{ fontSize: 12.5, color: BRAND.textLight, py: 1 }}>No dispatches recorded for this rule yet.</Typography>
      )}
      {logsEntry && !logsEntry.error && logsEntry.logs.map(log => <DispatchRow key={log.id} log={log} />)}
    </Card>
  );
}

const HEAD_CELL_SX = {
  fontSize: 11.5, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase',
  letterSpacing: '0.5px', whiteSpace: 'nowrap', bgcolor: BRAND.surface, borderBottom: `1px solid ${BRAND.border}`,
};

export default function AlertRules() {
  const { user } = useUser();
  const isAdmin = user?.role === 'admin';

  const [rules, setRules] = useState([]);
  const [activity, setActivity] = useState(null); // null = unavailable, keep the page usable without it
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formInitial, setFormInitial] = useState(null); // prefill (edit target or duplicate source)
  const [editingId, setEditingId] = useState(null);     // non-null = PATCH, null = POST
  const [formNonce, setFormNonce] = useState(0);        // remounts the dialog per open, resetting its fields
  const [saveError, setSaveError] = useState(null);
  const [deleteIds, setDeleteIds] = useState(null);     // array -> confirm dialog open
  const [deleting, setDeleting] = useState(false);
  const [busyBulk, setBusyBulk] = useState(false);

  // faceted controls
  const [q, setQ] = useState('');
  const [fltSeverity, setFltSeverity] = useState('all');
  const [fltStatus, setFltStatus] = useState('all');
  const [fltChannel, setFltChannel] = useState('all');
  const [sort, setSort] = useState({ key: 'last', dir: 'desc' });
  const [selected, setSelected] = useState(new Set());

  // Option 1 (dense table) vs Option 2 (split master-detail); choice persists
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('alertRulesView') === 'split' ? 'split' : 'table'; }
    catch { return 'table'; }
  });
  function switchView(next) {
    if (!next) return; // ToggleButtonGroup fires null when re-clicking the active option
    setView(next);
    try { localStorage.setItem('alertRulesView', next); } catch { /* preference just won't persist */ }
  }
  const [detailId, setDetailId] = useState(null);
  const [ruleLogs, setRuleLogs] = useState({}); // rule id -> { logs } | { error }

  useEffect(() => { load(); }, []);

  async function load() {
    const [rulesRes, actRes] = await Promise.allSettled([
      http.get('/api/alert-rules'),
      http.get('/api/alert-rules/activity'),
    ]);
    if (rulesRes.status === 'fulfilled') {
      setRules(rulesRes.value.data);
      setError(null);
    } else {
      setError(rulesRes.reason?.response?.data?.error || 'failed to load rules');
    }
    // activity is enrichment - the table must not break if the endpoint does
    setActivity(actRes.status === 'fulfilled' ? actRes.value.data : null);
    setSelected(new Set());
    setRuleLogs({}); // refetch dispatch histories against the fresh data
    setLoading(false);
  }

  function openCreate() { setFormInitial(null); setEditingId(null); setSaveError(null); setFormNonce(n => n + 1); setFormOpen(true); }
  function openEdit(rule) { setFormInitial(rule); setEditingId(rule.id); setSaveError(null); setFormNonce(n => n + 1); setFormOpen(true); }
  function openDuplicate(rule) {
    setFormInitial({ ...rule, name: `${rule.name} (copy)` });
    setEditingId(null); // duplicate saves as a NEW rule
    setSaveError(null);
    setFormNonce(n => n + 1);
    setFormOpen(true);
  }
  function closeForm() { setFormOpen(false); setFormInitial(null); setEditingId(null); setSaveError(null); }

  async function handleSave(rule) {
    setSaveError(null);
    try {
      if (editingId != null) await http.patch(`/api/alert-rules/${editingId}`, rule);
      else await http.post('/api/alert-rules', rule);
      closeForm();
      load();
    } catch (e) {
      setSaveError(e.response?.data?.error || 'save failed');
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    const ids = deleteIds || [];
    const failed = [];
    for (const id of ids) {
      try { await http.delete(`/api/alert-rules/${id}`); }
      catch { failed.push(id); }
    }
    setDeleting(false);
    setDeleteIds(null);
    if (failed.length) setError(`Could not delete ${failed.length} rule${failed.length > 1 ? 's' : ''}. Please try again.`);
    load();
  }

  async function handleToggle(rule) {
    try {
      await http.patch(`/api/alert-rules/${rule.id}`, { is_active: !rule.is_active });
      load();
    } catch {
      setError(`Could not ${rule.is_active ? 'pause' : 'activate'} "${rule.name}". Please try again.`);
    }
  }

  async function bulkSetActive(active) {
    setBusyBulk(true);
    const failed = [];
    for (const id of selected) {
      const rule = rules.find(r => r.id === id);
      if (!rule || rule.is_active === active) continue;
      try { await http.patch(`/api/alert-rules/${id}`, { is_active: active }); }
      catch { failed.push(id); }
    }
    setBusyBulk(false);
    if (failed.length) setError(`Could not update ${failed.length} rule${failed.length > 1 ? 's' : ''}.`);
    load();
  }

  // ---- derived: KPI strip ---------------------------------------------------
  const activeCount = rules.filter(r => r.is_active).length;
  const pausedCount = rules.length - activeCount;
  const channelSet = new Set(
    rules.filter(r => r.is_active).flatMap(r => (r.channel === 'both' ? ['email', 'sms'] : [r.channel || 'email']))
  );
  const trendPct = activity && activity.prevTotal > 0
    ? Math.round(((activity.total - activity.prevTotal) / activity.prevTotal) * 100)
    : null;
  const healthPct = activity && activity.total > 0
    ? Math.round(((activity.total - activity.failed) / activity.total) * 1000) / 10
    : null;

  // ---- derived: filter + sort ----------------------------------------------
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const actOf = id => activity?.rules?.[id] || null;
    const rows = rules.filter(r => {
      if (fltSeverity !== 'all' && sevKeyOf(r.trigger_type) !== fltSeverity) return false;
      if (fltStatus !== 'all' && (fltStatus === 'active') !== Boolean(r.is_active)) return false;
      if (fltChannel !== 'all' && (r.channel || 'email') !== fltChannel) return false;
      if (!needle) return true;
      const hay = `${r.name} ${TRIGGERS[r.trigger_type]?.label || ''} ${TRIGGERS[r.trigger_type]?.full || ''} ${r.recipients || ''}`.toLowerCase();
      return hay.includes(needle);
    });
    // comparators are written ascending; dir flips them, so the header arrow
    // always tells the truth
    const cmp = {
      name: (a, b) => (a.name || '').localeCompare(b.name || ''),
      count: (a, b) => (actOf(a.id)?.count || 0) - (actOf(b.id)?.count || 0),
      last: (a, b) => new Date(actOf(a.id)?.lastTriggeredAt || 0) - new Date(actOf(b.id)?.lastTriggeredAt || 0),
      status: (a, b) => Number(a.is_active) - Number(b.is_active),
    }[sort.key] || (() => 0);
    const dir = sort.dir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => dir * cmp(a, b));
  }, [rules, activity, q, fltSeverity, fltStatus, fltChannel, sort]);

  function toggleSort(key) {
    setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));
  }
  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  const visibleSelected = visible.filter(r => selected.has(r.id));
  const allVisibleChecked = visible.length > 0 && visibleSelected.length === visible.length;

  // split view selection: derived fallback (never an effect) - if the chosen rule
  // is filtered out, the first visible rule is shown instead
  const detailRule = visible.find(r => r.id === detailId) || visible[0] || null;
  const detailLogsEntry = detailRule ? ruleLogs[detailRule.id] : null;

  // fetch the selected rule's dispatch history once per rule per load
  useEffect(() => {
    if (view !== 'split' || !detailRule || ruleLogs[detailRule.id]) return;
    let cancelled = false;
    http.get(`/api/notifications?rule_id=${detailRule.id}&limit=8`)
      .then(({ data }) => { if (!cancelled) setRuleLogs(prev => ({ ...prev, [detailRule.id]: { logs: data.logs } })); })
      .catch(() => { if (!cancelled) setRuleLogs(prev => ({ ...prev, [detailRule.id]: { error: true, logs: [] } })); });
    return () => { cancelled = true; };
  }, [view, detailRule, ruleLogs]);

  // J/K (and arrow) navigation through the left pane, Linear-style. Inactive
  // while typing or while a dialog is open.
  useEffect(() => {
    if (view !== 'split') return undefined;
    function onKey(e) {
      if (formOpen || deleteIds != null) return;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
      const down = e.key === 'j' || e.key === 'ArrowDown';
      const up = e.key === 'k' || e.key === 'ArrowUp';
      if (!down && !up) return;
      if (visible.length === 0) return;
      e.preventDefault();
      const idx = Math.max(0, visible.findIndex(r => r.id === (detailRule?.id ?? -1)));
      const next = visible[Math.min(visible.length - 1, Math.max(0, idx + (down ? 1 : -1)))];
      if (next) {
        setDetailId(next.id);
        document.getElementById(`rule-item-${next.id}`)?.scrollIntoView({ block: 'nearest' });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, visible, detailRule, formOpen, deleteIds]);

  const sortLabel = (key, label) => (
    <TableSortLabel active={sort.key === key} direction={sort.key === key ? sort.dir : 'desc'} onClick={() => toggleSort(key)}>
      {label}
    </TableSortLabel>
  );

  if (loading) return (
    <Box sx={{ p: 3 }}>
      <Skeleton variant="text" width={160} height={36} />
      <Skeleton variant="text" width={300} height={22} sx={{ mb: 2.5 }} />
      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        {[0, 1, 2, 3].map(i => <Grid key={i} size={{ xs: 6, md: 3 }}><Skeleton variant="rounded" height={86} /></Grid>)}
      </Grid>
      <Skeleton variant="rounded" height={48} sx={{ mb: 1.5 }} />
      <Skeleton variant="rounded" height={280} />
    </Box>
  );

  return (
    <Box sx={{ p: 3 }}>
      {/* -- header ------------------------------------------------------- */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 2.5 }}>
        <div>
          <Typography variant="h5" component="h1" fontWeight={800} sx={{ color: BRAND.ink, letterSpacing: '-0.4px' }}>Alert Rules</Typography>
          <Typography variant="body2" sx={{ color: BRAND.textLight, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            Configure when the system should notify staff
            {activity && (
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1, py: '1px', borderRadius: '999px', bgcolor: activity.failed > 0 ? INTENT.warning.bg : INTENT.success.bg, color: activity.failed > 0 ? INTENT.warning.ink : INTENT.success.ink, fontSize: 12, fontWeight: 600 }}>
                <Box component="span" aria-hidden sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'currentColor' }} />
                {activity.failed > 0 ? `${activity.failed} failed dispatch${activity.failed > 1 ? 'es' : ''} in ${activity.windowHours}h` : 'All rule triggers functioning normally'}
              </Box>
            )}
            {!isAdmin && <Chip label="read-only" size="small" sx={{ height: 20 }} />}
          </Typography>
        </div>
        {isAdmin && (
          <Button
            variant="contained"
            startIcon={<AddRoundedIcon />}
            onClick={openCreate}
            sx={{ flexShrink: 0, whiteSpace: 'nowrap', bgcolor: BRAND.action, '&:hover': { bgcolor: BRAND.actionHover }, borderRadius: '6px' }}
          >
            New Rule
          </Button>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* -- KPI hero strip ------------------------------------------------ */}
      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatTile icon={FactCheckOutlinedIcon} tone="info" label="Total rules" value={rules.length}
            sub={`${activeCount} active, ${pausedCount} paused`} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatTile icon={BoltOutlinedIcon} tone="warn" label={`Triggers (${activity?.windowHours ?? 24}h)`}
            value={activity ? activity.total : '-'}
            sub={trendPct != null ? (
              <>
                {trendPct >= 0
                  ? <ArrowUpwardRoundedIcon sx={{ fontSize: 13 }} aria-hidden />
                  : <ArrowDownwardRoundedIcon sx={{ fontSize: 13 }} aria-hidden />}
                {`${trendPct >= 0 ? '+' : ''}${trendPct}% vs prior ${activity.windowHours}h`}
              </>
            ) : activity ? 'no prior-window baseline' : 'activity unavailable'} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatTile icon={MarkEmailReadOutlinedIcon} tone={healthPct != null && healthPct < 100 ? 'warn' : 'ok'} label="Delivery health"
            value={healthPct != null ? `${healthPct}%` : '-'}
            sub={activity ? (activity.total > 0 ? `${activity.total - activity.failed} of ${activity.total} dispatches sent` : 'no dispatches in window') : 'activity unavailable'}
            subInk={healthPct != null && healthPct < 100 ? ON_SURFACE.warn : undefined} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatTile icon={ForumOutlinedIcon} tone="info" label="Active channels" value={channelSet.size}
            sub={channelSet.size ? [...channelSet].map(c => CHANNEL_META[c]?.label || c).join(' · ') : 'no active rules'} />
        </Grid>
      </Grid>

      {/* -- filter & operations bar --------------------------------------- */}
      <Card sx={{ mb: 2, px: 2, py: 1.25, display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
        <TextField
          value={q}
          onChange={e => setQ(e.target.value)}
          size="small"
          placeholder="Search rules or recipients…"
          sx={{ flex: '1 1 220px', minWidth: 180 }}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ fontSize: 18, color: BRAND.textLight }} /></InputAdornment> },
            htmlInput: { 'aria-label': 'Search rules or recipients' },
          }}
        />
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Severity</InputLabel>
          <Select value={fltSeverity} label="Severity" onChange={e => setFltSeverity(e.target.value)}>
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="urgent">Urgent</MenuItem>
            <MenuItem value="watch">Watch</MenuItem>
            <MenuItem value="info">Informational</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 110 }}>
          <InputLabel>Status</InputLabel>
          <Select value={fltStatus} label="Status" onChange={e => setFltStatus(e.target.value)}>
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="paused">Paused</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Channel</InputLabel>
          <Select value={fltChannel} label="Channel" onChange={e => setFltChannel(e.target.value)}>
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="email">Email</MenuItem>
            <MenuItem value="sms">SMS</MenuItem>
            <MenuItem value="both">Email + SMS</MenuItem>
          </Select>
        </FormControl>
        <Box sx={{ flex: 1 }} />
        <Typography sx={{ fontSize: 12.5, color: BRAND.textLight, whiteSpace: 'nowrap' }}>
          {visible.length} of {rules.length} rule{rules.length === 1 ? '' : 's'}
        </Typography>
        <ToggleButtonGroup
          value={view}
          exclusive
          onChange={(_, next) => switchView(next)}
          size="small"
          aria-label="Layout"
          sx={{ '& .MuiToggleButton-root': { px: 1.25, py: 0.5, textTransform: 'none', fontSize: 12.5, color: BRAND.textLight, borderColor: BRAND.border, '&.Mui-selected': { bgcolor: BRAND.slate, color: '#fff', '&:hover': { bgcolor: BRAND.slateHover } } } }}
        >
          <ToggleButton value="table" aria-label="Table view">
            <TableRowsRoundedIcon sx={{ fontSize: 15, mr: 0.5 }} /> Table
          </ToggleButton>
          <ToggleButton value="split" aria-label="Split view">
            <VerticalSplitRoundedIcon sx={{ fontSize: 15, mr: 0.5 }} /> Split
          </ToggleButton>
        </ToggleButtonGroup>
      </Card>

      {/* -- bulk action bar (table view only - split has per-rule actions) -- */}
      {isAdmin && view === 'table' && visibleSelected.length > 0 && (
        <Card sx={{ mb: 2, px: 2, py: 1, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', bgcolor: BRAND.navySoft }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: BRAND.heading, mr: 1 }}>
            {visibleSelected.length} selected
          </Typography>
          <Button size="small" disabled={busyBulk} onClick={() => bulkSetActive(true)} sx={{ color: ON_SURFACE.ok, fontWeight: 600 }}>Activate</Button>
          <Button size="small" disabled={busyBulk} onClick={() => bulkSetActive(false)} sx={{ color: BRAND.text, fontWeight: 600 }}>Pause</Button>
          <Button size="small" disabled={busyBulk} onClick={() => setDeleteIds(visibleSelected.map(r => r.id))} sx={{ color: BRAND.accent, fontWeight: 600 }}>Delete</Button>
          <Box sx={{ flex: 1 }} />
          <Button size="small" onClick={() => setSelected(new Set())} sx={{ color: BRAND.textLight }}>Clear</Button>
        </Card>
      )}

      {/* -- dense data table ------------------------------------------------ */}
      {rules.length === 0 ? (
        <Card sx={{ borderRadius: '12px' }}>
          <Box sx={{ textAlign: 'center', py: 7, px: 3 }}>
            <Typography sx={{ fontWeight: 700, color: BRAND.heading, fontSize: 17, mb: 0.5 }}>
              No alert rules yet
            </Typography>
            <Typography sx={{ color: BRAND.textLight, mb: 2.5, maxWidth: 420, mx: 'auto' }}>
              Rules decide when the system notifies staff - for example, emailing estate ops the moment a plant is flagged critical.
            </Typography>
            {isAdmin && (
              <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={openCreate}
                sx={{ bgcolor: BRAND.action, '&:hover': { bgcolor: BRAND.actionHover } }}>
                Create your first rule
              </Button>
            )}
          </Box>
        </Card>
      ) : view === 'split' ? (
        /* Option 2: master-detail. List keeps identity light; the detail pane
           carries conditions, recipients and the rule's own dispatch history. */
        <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', md: 'row' }, alignItems: 'stretch' }}>
          <RuleListPane rules={visible} selectedId={detailRule?.id ?? null} onSelect={setDetailId} />
          <RuleDetailPane
            rule={detailRule}
            act={detailRule ? activity?.rules?.[detailRule.id] : null}
            isAdmin={isAdmin}
            logsEntry={detailLogsEntry}
            onToggle={handleToggle}
            onEdit={openEdit}
            onDuplicate={openDuplicate}
            onDelete={r => setDeleteIds([r.id])}
          />
        </Box>
      ) : (
        <Card sx={{ borderRadius: '12px', overflow: 'hidden' }}>
          <TableContainer sx={{ maxHeight: '62vh' }}>
            <Table stickyHeader size="small" aria-label="Alert rules">
              <TableHead>
                <TableRow>
                  {isAdmin && (
                    <TableCell padding="checkbox" sx={HEAD_CELL_SX}>
                      <Checkbox
                        size="small"
                        checked={allVisibleChecked}
                        indeterminate={visibleSelected.length > 0 && !allVisibleChecked}
                        onChange={() => setSelected(allVisibleChecked ? new Set() : new Set(visible.map(r => r.id)))}
                        slotProps={{ input: { 'aria-label': 'Select all visible rules' } }}
                        sx={{ '&.Mui-checked, &.MuiCheckbox-indeterminate': { color: ON_SURFACE.info } }}
                      />
                    </TableCell>
                  )}
                  <TableCell sx={HEAD_CELL_SX}>{sortLabel('name', 'Rule')}</TableCell>
                  <TableCell sx={HEAD_CELL_SX}>Trigger condition</TableCell>
                  <TableCell sx={HEAD_CELL_SX}>{sortLabel('count', `Activity (${activity?.windowHours ?? 24}h)`)}</TableCell>
                  <TableCell sx={HEAD_CELL_SX}>Recipients</TableCell>
                  <TableCell sx={HEAD_CELL_SX}>{sortLabel('status', 'Status')}</TableCell>
                  {isAdmin && <TableCell sx={{ ...HEAD_CELL_SX, width: 48 }} align="right"><Box component="span" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Actions</Box></TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {visible.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 7 : 5} sx={{ py: 5, textAlign: 'center', color: BRAND.textLight, borderBottom: 'none' }}>
                      No rules match the current filters.
                      <Button size="small" onClick={() => { setQ(''); setFltSeverity('all'); setFltStatus('all'); setFltChannel('all'); }} sx={{ ml: 1, color: ON_SURFACE.info }}>
                        Clear filters
                      </Button>
                    </TableCell>
                  </TableRow>
                )}
                {visible.map(rule => {
                  const sev = sevOf(rule.trigger_type);
                  const act = activity?.rules?.[rule.id];
                  const last = relTime(act?.lastTriggeredAt);
                  const paused = !rule.is_active;
                  return (
                    <TableRow
                      key={rule.id}
                      hover
                      selected={selected.has(rule.id)}
                      sx={{ bgcolor: paused ? BRAND.section : 'transparent', '& td': { borderColor: BRAND.border } }}
                    >
                      {isAdmin && (
                        <TableCell padding="checkbox">
                          <Checkbox
                            size="small"
                            checked={selected.has(rule.id)}
                            onChange={() => toggleSelect(rule.id)}
                            slotProps={{ input: { 'aria-label': `Select rule: ${rule.name}` } }}
                            sx={{ '&.Mui-checked': { color: ON_SURFACE.info } }}
                          />
                        </TableCell>
                      )}
                      {/* severity accent bar anchors the row; paused rows desaturate the
                          accent only - dimming whole rows pushes text under 4.5:1 */}
                      <TableCell sx={{ py: 1.25, borderLeft: '3px solid', borderLeftColor: paused ? BRAND.border : sev.bar, maxWidth: 260 }}>
                        <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: BRAND.heading, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {rule.name}
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                          <TriggerChip triggerType={rule.trigger_type} />
                          <ThresholdChip triggerType={rule.trigger_type} threshold={rule.threshold} />
                        </Box>
                      </TableCell>
                      <TableCell sx={{ color: BRAND.text, fontSize: 13, whiteSpace: 'nowrap' }}>
                        {TRIGGERS[rule.trigger_type]?.full || rule.trigger_type}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {act ? (
                          <>
                            <Typography sx={{ fontSize: 13, color: BRAND.text, fontVariantNumeric: 'tabular-nums' }}>
                              {act.count > 0 ? `Triggered ${act.count}x` : 'No triggers'}
                              {act.failed > 0 && (
                                <Box component="span" sx={{ color: ON_SURFACE.danger, fontWeight: 700 }}>{` · ${act.failed} failed`}</Box>
                              )}
                            </Typography>
                            {last && (
                              <Tooltip title={new Date(act.lastTriggeredAt).toLocaleString()} arrow>
                                <Typography sx={{ fontSize: 12, color: BRAND.textLight, cursor: 'default' }}>last fired {last}</Typography>
                              </Tooltip>
                            )}
                          </>
                        ) : (
                          <Typography sx={{ fontSize: 12.5, color: BRAND.textLight }}>
                            {activity ? 'never fired' : '-'}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell><RecipientPills recipients={rule.recipients} channel={rule.channel} /></TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          {isAdmin && (
                            <Switch
                              checked={rule.is_active}
                              onChange={() => handleToggle(rule)}
                              size="small"
                              slotProps={{ input: { 'aria-label': `${rule.is_active ? 'Pause' : 'Activate'} rule: ${rule.name}` } }}
                              sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: BRAND.success }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: BRAND.success } }}
                            />
                          )}
                          <StatusPill active={rule.is_active} />
                        </Box>
                      </TableCell>
                      {isAdmin && (
                        <TableCell align="right" sx={{ pr: 1 }}>
                          <RowMenu onEdit={() => openEdit(rule)} onDuplicate={() => openDuplicate(rule)} onDelete={() => setDeleteIds([rule.id])} />
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {/* creation/edit lives in a modal - the table is the default surface */}
      <RuleFormDialog
        key={formNonce}
        open={formOpen}
        initial={formInitial}
        isEdit={editingId != null}
        onSave={handleSave}
        onClose={closeForm}
        saveError={saveError}
      />

      <ConfirmDialog
        open={deleteIds != null}
        title={deleteIds?.length > 1 ? `Delete ${deleteIds.length} alert rules?` : 'Delete this alert rule?'}
        message={`The rule${deleteIds?.length > 1 ? 's' : ''} will be removed and will stop notifying staff. This can't be undone.`}
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onConfirm={confirmDelete}
        onClose={() => setDeleteIds(null)}
      />
    </Box>
  );
}

// Plain-english statement of what the rule will do. Reads from live form state,
// so it also catches a rule NAME that has drifted from the rule's actual behaviour.
// Returns the parts separately so the preview banner can highlight them.
function previewParts({ triggerType, threshold, channel, recipients, inputValue }) {
  const t = TRIGGERS[triggerType];
  const all = [...recipients];
  const pending = (inputValue || '').trim();
  if (pending && !all.includes(pending)) all.push(pending);
  const who = all.length === 0
    ? 'nobody yet'
    : all.length <= 2
      ? all.map(e => e.split('@')[0]).join(' and ')
      : `${all.slice(0, 2).map(e => e.split('@')[0]).join(', ')} and ${all.length - 2} more`;
  const how = channel === 'sms' ? 'SMS' : channel === 'both' ? 'email and SMS' : 'email';
  let when;
  if (triggerType === 'weekly_summary') {
    when = 'the weekly summary is sent';
  } else if (t?.threshold && threshold !== '') {
    when = `a block reaches ${threshold} ${t.unit}`;
  } else {
    when = (t?.full || triggerType).toLowerCase();
  }
  return { when, how, who };
}

// explicit form sections with divider lines, replacing floating legends mixed
// into the field grid - each section is scannable as its own block. Hoisted to
// module scope: defining it inside the dialog would remount it (and drop input
// focus) on every keystroke.
function Section({ n, title, children, last }) {
  return (
    <Box sx={{ pb: last ? 0 : 2.5, mb: last ? 0 : 2.5, borderBottom: last ? 'none' : `1px solid ${BRAND.border}` }}>
      <Typography sx={{ fontSize: 12, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1.5 }}>
        <Box component="span" sx={{ color: BRAND.accent, mr: 0.75 }}>{n}</Box>{title}
      </Typography>
      {children}
    </Box>
  );
}

function RuleFormDialog({ open, initial, isEdit, onSave, onClose, saveError }) {
  // the parent remounts this dialog (key) on every open, so plain initializers
  // replace the old reset-on-open effect
  const [name, setName] = useState(initial?.name || '');
  const [triggerType, setTriggerType] = useState(initial?.trigger_type || 'flora_critical');
  const [threshold, setThreshold] = useState(initial?.threshold ?? '');
  const [recipients, setRecipients] = useState(
    initial?.recipients ? initial.recipients.split(',').map(e => e.trim()).filter(Boolean) : []
  );
  const [inputValue, setInputValue] = useState('');
  const [emailError, setEmailError] = useState('');
  const [channel, setChannel] = useState(initial?.channel || 'email');

  const usesThreshold = TRIGGERS[triggerType]?.threshold;

  function submit(e) {
    e.preventDefault();
    let finalRecipients = recipients;
    const pending = inputValue.trim();
    if (pending) {
      if (!EMAIL_RE.test(pending)) {
        setEmailError(`"${pending}" is not a valid email`);
        return;
      }
      if (!finalRecipients.includes(pending)) finalRecipients = [...finalRecipients, pending];
      setRecipients(finalRecipients);
      setInputValue('');
    }
    if (finalRecipients.length === 0) {
      setEmailError('Add at least one recipient email.');
      return;
    }
    onSave({
      name: name.trim(),
      trigger_type: triggerType,
      threshold: usesThreshold && threshold !== '' ? parseInt(threshold) : null,
      recipients: finalRecipients.join(', '),
      channel,
    });
  }

  const parts = previewParts({ triggerType, threshold, channel, recipients, inputValue });
  const hl = { fontWeight: 700, color: BRAND.heading, bgcolor: BRAND.navySoft, borderRadius: '4px', px: 0.5, py: '1px' };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: '14px' } } }}>
      <DialogTitle sx={{ fontWeight: 700, color: BRAND.heading }}>{isEdit ? 'Edit Rule' : 'New Alert Rule'}</DialogTitle>
      <Box component="form" onSubmit={submit}>
        <DialogContent sx={{ pt: 1 }}>
          {saveError && <Alert severity="error" sx={{ mb: 2 }}>{saveError}</Alert>}

          <Section n="1" title="General">
            <TextField label="Rule name" value={name} onChange={e => setName(e.target.value)} required size="small" fullWidth />
          </Section>

          <Section n="2" title="Trigger conditions">
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: usesThreshold ? 7 : 12 }}>
                <FormControl size="small" fullWidth required>
                  <InputLabel>Trigger</InputLabel>
                  <Select value={triggerType} onChange={e => setTriggerType(e.target.value)} label="Trigger">
                    {TRIGGER_ORDER.map(k => <MenuItem key={k} value={k}>{TRIGGERS[k].full}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              {/* threshold appears ONLY for triggers that use one, with its unit inline */}
              {usesThreshold && (
                <Grid size={{ xs: 12, sm: 5 }}>
                  <TextField
                    label="Threshold"
                    type="number"
                    value={threshold}
                    onChange={e => setThreshold(e.target.value)}
                    size="small"
                    fullWidth
                    slotProps={{ input: { endAdornment: <Typography sx={{ fontSize: 13, color: BRAND.textLight, whiteSpace: 'nowrap', ml: 0.5 }}>{TRIGGERS[triggerType].unit}</Typography> } }}
                    helperText="per block"
                  />
                </Grid>
              )}
            </Grid>
          </Section>

          <Section n="3" title="Actions &amp; notifications" last>
            <FormControl size="small" fullWidth required sx={{ mb: 2 }}>
              <InputLabel>Delivery channel</InputLabel>
              <Select value={channel} onChange={e => setChannel(e.target.value)} label="Delivery channel">
                <MenuItem value="email">Email</MenuItem>
                <MenuItem value="sms">SMS</MenuItem>
                <MenuItem value="both">Email + SMS</MenuItem>
              </Select>
            </FormControl>

            <Autocomplete
              multiple
              freeSolo
              options={[]}
              value={recipients}
              inputValue={inputValue}
              onInputChange={(_, v) => { setInputValue(v); if (emailError) setEmailError(''); }}
              onChange={(_, newValue) => {
                const cleaned = [];
                let bad = '';
                newValue.forEach(v => {
                  const email = String(v).trim();
                  if (EMAIL_RE.test(email)) { if (!cleaned.includes(email)) cleaned.push(email); }
                  else if (email) bad = email;
                });
                setRecipients(cleaned);
                setEmailError(bad ? `"${bad}" is not a valid email` : '');
              }}
              renderValue={(value, getItemProps) =>
                value.map((option, index) => {
                  const { key, ...itemProps } = getItemProps({ index });
                  return <Chip label={option} size="small" key={key ?? option} {...itemProps} sx={{ bgcolor: BRAND.section, borderRadius: '6px' }} />;
                })
              }
              renderInput={params => (
                <TextField
                  {...params}
                  label="Recipients"
                  size="small"
                  required={recipients.length === 0}
                  error={Boolean(emailError)}
                  helperText={emailError || 'Type an email and press Enter or comma'}
                  placeholder={recipients.length === 0 ? 'officer@towncouncil.sg' : ''}
                />
              )}
            />
          </Section>
        </DialogContent>

        {/* live preview banner: When [trigger] -> Send [channel] to [recipients],
            with the dynamic parts highlighted so drift is impossible to miss */}
        <Box sx={{ mx: 3, mb: 1, px: 2, py: 1.25, bgcolor: BRAND.section, borderRadius: '8px', border: `1px solid ${BRAND.border}` }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>
            Preview
          </Typography>
          <Typography sx={{ fontSize: 13.5, color: BRAND.text, lineHeight: 1.9 }}>
            When <Box component="span" sx={hl}>{parts.when}</Box>
            {' → send '}<Box component="span" sx={hl}>{parts.how}</Box>
            {' to '}<Box component="span" sx={hl}>{parts.who}</Box>
          </Typography>
        </Box>

        <Divider />
        {/* sticky-footer hierarchy: ghost cancel beside the one primary action */}
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} sx={{ color: BRAND.textLight }}>Cancel</Button>
          <Button type="submit" variant="contained" sx={{ bgcolor: BRAND.action, '&:hover': { bgcolor: BRAND.actionHover } }}>
            {isEdit ? 'Save changes' : 'Create alert rule'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
