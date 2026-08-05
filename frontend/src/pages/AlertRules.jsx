import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, Button, Card, Switch,
  TextField, Select, MenuItem, FormControl, InputLabel, InputAdornment,
  Alert, Chip, IconButton, Menu, ListItemIcon, ListItemText,
  Autocomplete, Grid, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions,
  Divider, Skeleton, Checkbox, ToggleButtonGroup, ToggleButton, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel,
  Snackbar,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import SmsOutlinedIcon from '@mui/icons-material/SmsOutlined';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import MonitorHeartOutlinedIcon from '@mui/icons-material/MonitorHeartOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
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
import SiteFooter from '../components/SiteFooter';
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
  return <Chip label={t?.label || triggerType} size="small" sx={{ height: 20, fontSize: 11, bgcolor: sev.tint, color: sev.ink, fontWeight: 600, borderRadius: '4px', px: 0.25 }} />;
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
      sx={{ height: 20, fontSize: 11, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', bgcolor: BRAND.section, color: BRAND.textLight, borderRadius: '4px', px: 0.25 }}
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
/**
 * Bar sparkline over the activity window.
 *
 * Bars, not a line: the series is a count of discrete dispatches per hour, and a
 * smoothed line between hourly counts would draw values at moments nothing was
 * sent. Quiet hours render as an empty slot at the baseline, so a gap reads as a
 * real zero rather than as missing data.
 *
 * Renders nothing at all when the window recorded no dispatches - a flat row of
 * empty bars would be decoration implying a measurement that never happened.
 */
function MiniBars({ series, colour, height = 26 }) {
  if (!series?.length) return null;
  const max = Math.max(...series);
  if (max <= 0) return null;
  return (
    <Box aria-hidden sx={{ display: 'flex', alignItems: 'flex-end', gap: '1px', height, mt: 0.5 }}>
      {series.map((v, i) => (
        <Box
          key={i}
          sx={{
            flex: 1, minWidth: 0, borderRadius: '1px',
            height: `${Math.max(v > 0 ? 12 : 2, (v / max) * 100)}%`,
            bgcolor: colour,
            opacity: v > 0 ? 0.85 : 0.18,
          }}
        />
      ))}
    </Box>
  );
}

/**
 * One cell of the metrics bar.
 *
 * These were four separate Cards with 16px padding and a 38px icon well each,
 * which spent a whole band of the page on four integers. They are now segments of
 * a single bar divided by hairlines - the same figures, roughly half the height.
 */
function StatCell({ icon: Icon, tone, label, value, sub, subInk, spark }) {
  const mode = useTheme().palette.mode;
  const t = KPI_TONE[mode][tone];
  return (
    <Box sx={{ px: 2.25, py: 1.75, minWidth: 0, flex: 1 }}>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 0.5 }}>
        <Icon sx={{ fontSize: 15, color: t.ink, flexShrink: 0 }} />
        <Typography sx={{ fontSize: 11, fontWeight: 800, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1.3 }}>
          {label}
        </Typography>
      </Stack>
      <Typography sx={{ fontSize: 30, fontWeight: 800, color: BRAND.ink, lineHeight: 1.05, letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
      {sub && (
        <Typography sx={{ fontSize: 11.5, color: subInk || BRAND.textLight, display: 'flex', alignItems: 'center', gap: 0.25, mt: 0.25 }}>
          {sub}
        </Typography>
      )}
      {spark}
    </Box>
  );
}

// ---- Option 2: split-pane master-detail --------------------------------------

// left pane: compact selectable rule list. A listbox, not a table - identity and
// severity only; everything else lives in the detail pane.
function RuleListPane({ rules, selectedId, onSelect }) {
  return (
    // tinted rail, so the SELECTED item can be the one white raised object on it
    <Card sx={{ flex: { md: '0 0 33%' }, minWidth: 0, maxHeight: { md: 'calc(100vh - 330px)' }, overflow: 'auto', borderRadius: '12px', bgcolor: BRAND.section }}>
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
                px: 1.5, py: 1.1, mx: 0.75, my: 0.35, borderRadius: '8px', cursor: 'pointer',
                borderLeft: '3px solid', borderLeftColor: paused ? BRAND.border : sev.bar,
                // selection is physical: a white card lifted off the grey rail,
                // rather than a tint that competed with the hover state
                bgcolor: selected ? BRAND.surface : 'transparent',
                boxShadow: selected ? '0 2px 8px rgba(16,24,40,.14)' : 'none',
                transition: 'background-color .12s ease, box-shadow .12s ease',
                '&:hover': { bgcolor: selected ? BRAND.surface : 'rgba(120,130,145,0.10)' },
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
/**
 * One node on the dispatch timeline.
 *
 * A dot on a connecting rail rather than a bordered row: these are chronological
 * events, and a timeline says "this then this" in a way a list of rules does not.
 * The connector is omitted on the last node so the rail terminates rather than
 * trailing into nothing.
 */
function DispatchRow({ log, last = false }) {
  const failed = log.status === 'failed';
  const dot = failed ? ON_SURFACE.danger : INTENT.success.ink;
  return (
    <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'stretch', position: 'relative' }}>
      {/* rail + node */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 12 }}>
        <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: dot, mt: '11px', flexShrink: 0, boxShadow: `0 0 0 3px ${BRAND.surface}` }} />
        {!last && <Box sx={{ width: 2, flexGrow: 1, bgcolor: BRAND.border, my: '2px' }} />}
      </Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', py: 0.9, flex: 1, minWidth: 0 }}>
      <Chip
        label={failed ? 'Failed' : 'Sent'}
        size="small"
        sx={{ height: 19, fontSize: 10.5, fontWeight: 700, borderRadius: '4px', mt: '1px', bgcolor: failed ? INTENT.danger.bg : INTENT.success.bg, color: failed ? INTENT.danger.ink : INTENT.success.ink }}
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
    // A tinted container, so the sections inside can be separate white cards
    // instead of one long scroll divided only by uppercase labels.
    <Box sx={{ flex: 1, minWidth: 0, borderRadius: '12px', p: 2, maxHeight: { md: 'calc(100vh - 330px)' }, overflow: 'auto', bgcolor: BRAND.section, border: `1px solid ${BRAND.border}` }}>
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

      {/* CARD 1 - trigger conditions, as a real code block */}
      <Card sx={{ p: 2, mt: 2, borderRadius: '10px' }}>
      <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1 }}>
        Trigger conditions
      </Typography>
      <Box sx={{ px: 1.75, py: 1.5, bgcolor: BRAND.canvas, border: `1px solid ${BRAND.border}`, borderRadius: '8px' }}>
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
            <Chip label={localPart(e)} size="small" sx={{ bgcolor: BRAND.section, color: BRAND.text, borderRadius: '4px', fontSize: 12, height: 22, cursor: 'default' }} />
          </Tooltip>
        ))}
      </Box>
      </Card>

      {/* CARD 2 - dispatch history for THIS rule, as a vertical timeline */}
      <Card sx={{ p: 2, mt: 2, borderRadius: '10px' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Recent activity log
        </Typography>
        <Button size="small" component={RouterLink} to="/notif-log" sx={{ color: ON_SURFACE.info, fontSize: 12, textTransform: 'none' }}>Open full log</Button>
      </Box>
      {!logsEntry && <Skeleton variant="rounded" height={72} />}
      {logsEntry && logsEntry.error && (
        <Typography sx={{ fontSize: 12.5, color: BRAND.textLight, py: 1 }}>Could not load dispatches for this rule.</Typography>
      )}
      {logsEntry && !logsEntry.error && logsEntry.logs.length === 0 && (
        <Typography sx={{ fontSize: 12.5, color: BRAND.textLight, py: 1 }}>No dispatches recorded for this rule yet.</Typography>
      )}
      {logsEntry && !logsEntry.error && logsEntry.logs.map((log, i, arr) => (
        <DispatchRow key={log.id} log={log} last={i === arr.length - 1} />
      ))}
      </Card>
    </Box>
  );
}

const HEAD_CELL_SX = {
  fontSize: 11.5, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase',
  letterSpacing: '0.5px', whiteSpace: 'nowrap', bgcolor: BRAND.surface, borderBottom: `1px solid ${BRAND.border}`,
};

export default function AlertRules() {
  const { user } = useUser();
  // Driven by the page's own scroll region, not the window: with a full-height
  // layout the document never scrolls, so useScrollTrigger would never fire.
  const [scrolled, setScrolled] = useState(false);
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
  // Success feedback. This page had `error` and `saveError` only, so every
  // successful create, edit, delete, pause and activate completed in silence.
  const [toast, setToast] = useState(null);
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
    const wasEdit = editingId != null;
    try {
      if (wasEdit) await http.patch(`/api/alert-rules/${editingId}`, rule);
      else await http.post('/api/alert-rules', rule);
      closeForm();
      // A saved rule used to close the dialog and refresh in silence, so the only
      // evidence anything happened was spotting the row yourself. Say what was
      // saved AND what it will now do - a rule that fires automatically is not
      // self-evidently "on" from a list row.
      setToast({
        ok: true,
        msg: `Rule "${rule.name}" ${wasEdit ? 'updated' : 'created'}.${rule.is_active === false
          ? ' It is paused and will not fire until you activate it.'
          : ' It is active - matching conditions will dispatch alerts, and every send appears in the notification log.'}`,
      });
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
    const deleted = ids.length - failed.length;
    if (deleted > 0) {
      // States the retention rule, because "deleted" could reasonably be read as
      // taking the alert history with it. It does not.
      setToast({
        ok: true,
        msg: `Deleted ${deleted} rule${deleted === 1 ? '' : 's'}. Alerts already sent stay in the notification log.`,
      });
    }
    load();
  }

  async function handleToggle(rule) {
    try {
      await http.patch(`/api/alert-rules/${rule.id}`, { is_active: !rule.is_active });
      setToast({
        ok: true,
        msg: rule.is_active
          ? `"${rule.name}" paused - it will not fire until you activate it again.`
          : `"${rule.name}" is active - matching conditions will dispatch alerts from now on.`,
      });
      load();
    } catch {
      setError(`Could not ${rule.is_active ? 'pause' : 'activate'} "${rule.name}". Please try again.`);
    }
  }

  async function bulkSetActive(active) {
    setBusyBulk(true);
    const failed = [];
    let changed = 0;
    for (const id of selected) {
      const rule = rules.find(r => r.id === id);
      if (!rule || rule.is_active === active) continue;
      try { await http.patch(`/api/alert-rules/${id}`, { is_active: active }); changed++; }
      catch { failed.push(id); }
    }
    setBusyBulk(false);
    if (failed.length) setError(`Could not update ${failed.length} rule${failed.length > 1 ? 's' : ''}.`);
    // Counts only what actually changed. Rules already in the target state are
    // skipped above, so reporting selected.size would overstate the result.
    if (changed > 0) {
      setToast({
        ok: true,
        msg: `${changed} rule${changed === 1 ? '' : 's'} ${active ? 'activated' : 'paused'}.`,
      });
    }
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
    /* Fills the viewport, like the notification log: the header and status bands
       are fixed and everything below them scrolls in its own region, so the
       primary action is permanently on screen rather than merely sticky. */
    <Box sx={{ width: '100%', height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', bgcolor: BRAND.canvas }}>
      {/* -- header band: outside the scroll region, so always visible ------ */}
      <Box
        sx={{
          flexShrink: 0, zIndex: 20,
          px: 3, pt: 2.5, pb: 2,
          bgcolor: BRAND.surface, borderBottom: `1px solid ${BRAND.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 2, flexWrap: 'wrap',
          boxShadow: scrolled ? '0 4px 12px rgba(16,24,40,.07)' : 'none',
          transition: 'box-shadow .2s ease',
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          {/* breadcrumbs ground the page in the app's hierarchy */}
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mb: 0.35 }}>
            <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: BRAND.textLight }}>Settings</Typography>
            <ChevronRightRoundedIcon sx={{ fontSize: 13, color: BRAND.textLight }} aria-hidden />
            <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: BRAND.textLight }}>Alerts</Typography>
            <ChevronRightRoundedIcon sx={{ fontSize: 13, color: BRAND.textLight }} aria-hidden />
            <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: BRAND.text }}>Rules</Typography>
          </Stack>
          {/* title and subtitle sit tight together as one block - the status
              badge that used to run inline with the subtitle now has its own
              band below, so this line is only ever one thing */}
          <Typography component="h1" sx={{ fontSize: { xs: 22, md: 26 }, fontWeight: 800, color: BRAND.ink, letterSpacing: '-0.5px', lineHeight: 1.2 }}>
            Alert Rules
          </Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.25 }}>
            <Typography sx={{ fontSize: 13.5, color: BRAND.textLight }}>
              Configure when the system should notify staff
            </Typography>
            {!isAdmin && <Chip label="read-only" size="small" sx={{ height: 20, fontSize: 11 }} />}
          </Stack>
        </Box>
        {isAdmin && (
          <Button
            variant="contained"
            startIcon={<AddRoundedIcon />}
            onClick={openCreate}
            sx={{
              flexShrink: 0, whiteSpace: 'nowrap', textTransform: 'none',
              fontWeight: 700, fontSize: 14.5, px: 2.25, py: 1, borderRadius: '8px',
              bgcolor: BRAND.action, color: '#fff',
              boxShadow: '0 2px 8px rgba(29,78,216,.28)',
              transition: 'background-color .15s ease, box-shadow .15s ease, transform .15s ease',
              '&:hover': { bgcolor: BRAND.actionHover, boxShadow: '0 6px 18px rgba(29,78,216,.42)', transform: 'translateY(-1px)' },
              '&:active': { transform: 'translateY(0)', boxShadow: '0 2px 6px rgba(29,78,216,.32)' },
              '&:focus-visible': { outline: `2px solid ${BRAND.action}`, outlineOffset: 2 },
            }}
          >
            New Rule
          </Button>
        )}
      </Box>

      {/* system status as its own band directly under the header */}
      {activity && (
        <Stack
          direction="row"
          spacing={1}
          role="status"
          sx={{
            flexShrink: 0, px: 3, py: 1, alignItems: 'center',
            bgcolor: activity.failed > 0 ? INTENT.warning.bg : INTENT.success.bg,
            borderBottom: `1px solid ${activity.failed > 0 ? INTENT.warning.border : INTENT.success.border}`,
          }}
        >
          <Box aria-hidden sx={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, bgcolor: activity.failed > 0 ? INTENT.warning.ink : INTENT.success.ink }} />
          <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: activity.failed > 0 ? INTENT.warning.ink : INTENT.success.ink }}>
            {activity.failed > 0
              ? `${activity.failed} failed dispatch${activity.failed > 1 ? 'es' : ''} in the last ${activity.windowHours}h`
              : 'All rule triggers functioning normally'}
          </Typography>
        </Stack>
      )}

      {/* everything below the fixed bands scrolls together; the table's own
          sticky header pins to the top of THIS box */}
      <Box
        onScroll={e => setScrolled(e.currentTarget.scrollTop > 8)}
        sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto' }}
      >
      {/* The content block is at least a full region tall, so the footer that
          follows begins at or below the bottom edge - off screen until you
          scroll past the content.
          NOT flexGrow: flex only shares out FREE space, and this footer is 330px
          tall, so the content merely grew into whatever was left and ~330px of
          footer stayed on screen. minHeight forces the content past the fold. */}
      <Box sx={{ minHeight: '100%', px: 3, py: 2.5, boxSizing: 'border-box' }}>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* -- KPI hero strip ------------------------------------------------ */}
      {/* One bar, four segments, hairline dividers - replaces four floating
          cards that spent a whole band of the page on four integers. */}
      <Card
        sx={{
          mb: 2, display: 'flex', flexWrap: { xs: 'wrap', md: 'nowrap' }, alignItems: 'stretch',
          '& > *:not(:first-of-type)': {
            borderLeft: { md: `1px solid ${BRAND.border}` },
            borderTop: { xs: `1px solid ${BRAND.border}`, md: 'none' },
          },
        }}
      >
        <StatCell icon={FactCheckOutlinedIcon} tone="info" label="Total rules" value={rules.length}
          sub={`${activeCount} active, ${pausedCount} paused`} />
        <StatCell icon={BoltOutlinedIcon} tone="warn" label={`Triggers (${activity?.windowHours ?? 24}h)`}
          value={activity ? activity.total : '-'}
          sub={trendPct != null ? (
            <>
              {trendPct >= 0
                ? <ArrowUpwardRoundedIcon sx={{ fontSize: 13 }} aria-hidden />
                : <ArrowDownwardRoundedIcon sx={{ fontSize: 13 }} aria-hidden />}
              {`${trendPct >= 0 ? '+' : ''}${trendPct}% vs prior ${activity.windowHours}h`}
            </>
          ) : activity ? 'no prior-window baseline' : 'activity unavailable'}
          spark={<MiniBars series={activity?.series?.map(b => b.total)} colour={ON_SURFACE.info} />} />
        <StatCell icon={MarkEmailReadOutlinedIcon} tone={healthPct != null && healthPct < 100 ? 'warn' : 'ok'} label="Delivery health"
          value={healthPct != null ? `${healthPct}%` : '-'}
          sub={activity ? (activity.total > 0 ? `${activity.total - activity.failed} of ${activity.total} dispatches sent` : 'no dispatches in window') : 'activity unavailable'}
          subInk={healthPct != null && healthPct < 100 ? ON_SURFACE.warn : undefined}
          /* plots FAILURES, not the health percentage: the shape worth seeing is
             when things broke, and a near-flat 100% line says nothing */
          spark={<MiniBars series={activity?.series?.map(b => b.failed)} colour={ON_SURFACE.danger} />} />
        <StatCell icon={ForumOutlinedIcon} tone="info" label="Active channels" value={channelSet.size}
          sub={channelSet.size ? [...channelSet].map(c => CHANNEL_META[c]?.label || c).join(' · ') : 'no active rules'} />
      </Card>

      {/* -- filter & operations bar --------------------------------------- */}
      {/* One tinted container so search, filters and the view switch read as a
          single control surface rather than four objects on the page field. */}
      <Card sx={{ mb: 2, px: 2, py: 1.5, display: 'flex', flexWrap: 'wrap', gap: 1.25, alignItems: 'center', bgcolor: BRAND.section, boxShadow: 'none', border: `1px solid ${BRAND.border}` }}>
        <TextField
          value={q}
          onChange={e => setQ(e.target.value)}
          size="small"
          placeholder="Search rules or recipients…"
          sx={{ flex: '1 1 220px', minWidth: 180, bgcolor: BRAND.surface, borderRadius: '8px' }}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ fontSize: 18, color: BRAND.textLight }} /></InputAdornment> },
            htmlInput: { 'aria-label': 'Search rules or recipients' },
          }}
        />
        <FormControl size="small" sx={{ minWidth: 155, bgcolor: BRAND.surface, borderRadius: '8px' }}>
          <InputLabel>Severity</InputLabel>
          <Select
            value={fltSeverity}
            label="Severity"
            onChange={e => setFltSeverity(e.target.value)}
            startAdornment={<InputAdornment position="start"><ShieldOutlinedIcon sx={{ fontSize: 16, color: BRAND.textLight }} /></InputAdornment>}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="urgent">Urgent</MenuItem>
            <MenuItem value="watch">Watch</MenuItem>
            <MenuItem value="info">Informational</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 145, bgcolor: BRAND.surface, borderRadius: '8px' }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={fltStatus}
            label="Status"
            onChange={e => setFltStatus(e.target.value)}
            startAdornment={<InputAdornment position="start"><MonitorHeartOutlinedIcon sx={{ fontSize: 16, color: BRAND.textLight }} /></InputAdornment>}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="paused">Paused</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 150, bgcolor: BRAND.surface, borderRadius: '8px' }}>
          <InputLabel>Channel</InputLabel>
          <Select
            value={fltChannel}
            label="Channel"
            onChange={e => setFltChannel(e.target.value)}
            startAdornment={<InputAdornment position="start"><ForumOutlinedIcon sx={{ fontSize: 16, color: BRAND.textLight }} /></InputAdornment>}
          >
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
          sx={{
            bgcolor: BRAND.surface, borderRadius: '8px', p: '3px', gap: '2px', border: `1px solid ${BRAND.border}`,
            '& .MuiToggleButtonGroup-grouped': {
              border: 0, marginLeft: 0, px: 1.25, py: 0.4, borderRadius: '6px !important',
              textTransform: 'none', fontSize: 12.5, fontWeight: 600, color: BRAND.textLight,
              '&.Mui-selected': { bgcolor: BRAND.navySoft, color: BRAND.heading, fontWeight: 700, '&:hover': { bgcolor: BRAND.navySoft } },
            },
          }}
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
        // overflowX clip, NOT overflow hidden: `hidden` creates a containing
        // block that clips position:sticky, which is what stops the pinned
        // header rendering. The TableContainer no longer caps its own height
        // either - the page's scroll region owns the Y axis, so there is one
        // scrollbar rather than two.
        <Card sx={{ borderRadius: '12px', overflowX: 'clip' }}>
          <TableContainer>
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
                  {/* numeric + timestamp column, so it right-aligns */}
                  <TableCell align="right" sx={HEAD_CELL_SX}>{sortLabel('count', `Activity (${activity?.windowHours ?? 24}h)`)}</TableCell>
                  <TableCell sx={HEAD_CELL_SX}>Recipients</TableCell>
                  {/* an absolute state indicator, so it centres */}
                  <TableCell align="center" sx={HEAD_CELL_SX}>{sortLabel('status', 'Status')}</TableCell>
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
                      // the whole row is the affordance, not just the edit button:
                      // clicking anywhere opens that rule in the split view
                      onClick={() => { setDetailId(rule.id); switchView('split'); }}
                      sx={{
                        cursor: 'pointer',
                        bgcolor: paused ? BRAND.section : 'transparent',
                        '& td': { borderColor: BRAND.border },
                        '&:hover': { bgcolor: BRAND.section },
                      }}
                    >
                      {isAdmin && (
                        <TableCell padding="checkbox" onClick={e => e.stopPropagation()}>
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
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
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
                      <TableCell align="center" onClick={e => e.stopPropagation()} sx={{ whiteSpace: 'nowrap' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75 }}>
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
                        <TableCell align="right" onClick={e => e.stopPropagation()} sx={{ pr: 1 }}>
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
      </Box>
      {/* The shell skips its own footer on full-height routes (the document never
          scrolls, so it would be unreachable), so it rides this page's scroll
          region instead - reached by scrolling past the content, never pinned.
          It is a SIBLING of the growing content block, not a child of it: nested
          inside, it sat at the natural end of the content and the block grew
          beneath it, which is what left it showing at rest. */}
      <SiteFooter />
      </Box>

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

      {/* At the component root, after the dialogs, matching ActionQueue,
          NotificationLog and the map. Inline would not do: the save and delete
          confirmations fire from inside the dialogs above, which portal over the
          page, and the page body is its own overflow:auto scroller. */}
      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={toast?.ok ? 5000 : null}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={toast?.ok ? 'success' : 'error'}
          variant="filled"
          onClose={() => setToast(null)}
          role="status"
          aria-live="polite"
          sx={{ width: '100%', maxWidth: 560 }}
        >
          {toast?.msg}
        </Alert>
      </Snackbar>
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
/**
 * One step of the rule form.
 *
 * The red 1/2/3 counters are gone: brand red is the app's alarm colour, and
 * spending it on ordinals put three small alerts inside a routine form. The
 * order is already carried by the vertical sequence, so the heading just needs
 * to be a heading - bolder, darker, and a size up.
 */
function Section({ title, children, last }) {
  return (
    <Box sx={{ pb: last ? 0 : 2.5, mb: last ? 0 : 2.5, borderBottom: last ? 'none' : `1px solid ${BRAND.border}` }}>
      <Typography sx={{ fontSize: 14.5, fontWeight: 700, color: BRAND.heading, mb: 1.5, letterSpacing: '-0.1px' }}>
        {title}
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
  // literal colours: the preview card is dark in BOTH schemes, so its highlight
  // cannot ride the scheme-aware tokens
  const darkHl = { fontWeight: 700, color: '#F1F5F9', bgcolor: 'rgba(148,163,184,.18)', borderRadius: '4px', px: 0.5, py: '1px' };

  return (
    <Dialog
      // one focus treatment for every input in the form: a thicker ring in the
      // action blue, so keyboard position is never ambiguous
      sx={{
        '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
          borderColor: BRAND.action, borderWidth: 2,
        },
        '& .MuiOutlinedInput-root.Mui-focused': { boxShadow: `0 0 0 3px rgba(29,78,216,.18)` },
      }}
      open={open} onClose={onClose} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: '14px' } } }}>
      <DialogTitle sx={{ fontWeight: 700, color: BRAND.heading }}>{isEdit ? 'Edit Rule' : 'New Alert Rule'}</DialogTitle>
      <Box component="form" onSubmit={submit}>
        <DialogContent sx={{ pt: 1 }}>
          {saveError && <Alert severity="error" sx={{ mb: 2 }}>{saveError}</Alert>}

          <Section title="General">
            <TextField label="Rule name" value={name} onChange={e => setName(e.target.value)} required size="small" fullWidth />
          </Section>

          <Section title="Trigger conditions">
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

          <Section title="Actions &amp; notifications" last>
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
        {/* Dark card: the configuration above is what you are EDITING, this is
            what it will DO. Inverting the surface separates the two completely,
            so the preview reads as a result rather than another form field. It is
            the same dark in both schemes - it is a console, not a themed panel. */}
        <Box sx={{ mx: 3, mb: 1.5, px: 2, py: 1.5, bgcolor: '#0F172A', borderRadius: '10px' }}>
          <Typography sx={{ fontSize: 10.5, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 0.75 }}>
            Preview
          </Typography>
          <Typography sx={{ fontSize: 13.5, color: '#E2E8F0', lineHeight: 1.85, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', whiteSpace: 'pre-wrap' }}>
            <Box component="span" sx={{ color: '#7DD3FC', fontWeight: 700 }}>WHEN</Box>{' '}
            <Box component="span" sx={darkHl}>{parts.when}</Box>
            {'\n'}
            <Box component="span" sx={{ color: '#7DD3FC', fontWeight: 700 }}>SEND</Box>{' '}
            <Box component="span" sx={darkHl}>{parts.how}</Box>{' '}
            <Box component="span" sx={{ color: '#7DD3FC', fontWeight: 700 }}>TO</Box>{' '}
            <Box component="span" sx={darkHl}>{parts.who}</Box>
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
