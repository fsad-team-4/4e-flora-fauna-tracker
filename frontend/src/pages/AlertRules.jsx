import { useEffect, useState } from 'react';
import {
  Box, Typography, Button, Card, CardContent, Switch,
  TextField, Select, MenuItem, FormControl, InputLabel,
  Alert, Chip, IconButton, Menu, ListItemIcon, ListItemText,
  Autocomplete, Grid, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions,
  Divider, Stack, Skeleton,
} from '@mui/material';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import SmsOutlinedIcon from '@mui/icons-material/SmsOutlined';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { useUser } from '../contexts/UserContext';
import { BRAND } from '../theme';
import http from '../http';
import ConfirmDialog from '../components/ConfirmDialog';

// page-specific neutral fill for the threshold/logic chip (not a shared token)
const LOGIC_FILL = '#F0F1F3';

// Trigger config: label, the category colour used on the trigger chip (semantic
// vs categorical split from the dashboard), whether it takes a threshold, and the
// unit shown inline so "5" reads as "5 sightings" not a bare id.
// Severity, not category, is what the chip and the accent bar encode - one
// meaning per colour. Category is carried by the trigger TEXT alone, so this
// never collides with the dashboard's categorical palette (where flora is teal
// and pigeon is purple). Red here means "urgent", not "flora".
const SEVERITY = {
  urgent: { color: '#B3261E', tint: '#FDECEA', label: 'Urgent' },
  watch:  { color: '#8A5200', tint: '#FFF4E5', label: 'Watch' },
  info:   { color: '#546e7a', tint: '#ECEFF1', label: 'Informational' },
};
const TRIGGERS = {
  flora_critical:  { label: 'Flora Critical',  full: 'Flora goes critical',  severity: 'urgent', threshold: false },
  fauna_hotspot:   { label: 'Fauna Hotspot',   full: 'New fauna hotspot',    severity: 'watch',  threshold: true, unit: 'sightings' },
  new_case_urgent: { label: 'Urgent Case',     full: 'New urgent case',      severity: 'urgent', threshold: false },
  weekly_summary:  { label: 'Weekly Summary',  full: 'Weekly summary',       severity: 'info',   threshold: false },
};
const sevOf = k => SEVERITY[TRIGGERS[k]?.severity] || SEVERITY.info;
const TRIGGER_ORDER = ['flora_critical', 'fauna_hotspot', 'new_case_urgent', 'weekly_summary'];

const CHANNEL_META = {
  email: { label: 'Email', icon: EmailOutlinedIcon },
  sms: { label: 'SMS', icon: SmsOutlinedIcon },
  both: { label: 'Email + SMS', icon: EmailOutlinedIcon },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// trigger chip: coloured by category so "what fires this" reads first
function TriggerChip({ triggerType }) {
  const t = TRIGGERS[triggerType];
  const sev = sevOf(triggerType);
  return <Chip label={t?.label || triggerType} size="small" sx={{ bgcolor: sev.tint, color: sev.color, fontWeight: 700, borderRadius: '6px' }} />;
}

// threshold chip: neutral, and shows the real condition with its unit
function ThresholdChip({ triggerType, threshold }) {
  const t = TRIGGERS[triggerType];
  if (!t?.threshold || threshold == null) return null;
  // NOTE: computeHotspots() applies no time window, so we deliberately do NOT
  // claim one here. Once a window lands in the hotspot logic, show it.
  return <Chip label={`\u2265 ${threshold} ${t.unit}`} size="small" sx={{ bgcolor: LOGIC_FILL, color: BRAND.heading, fontWeight: 600, borderRadius: '6px' }} />;
}

// status derived from the toggle - single source of truth, no "(paused)" in names
function StatusPill({ active }) {
  return (
    <Chip
      label={active ? 'Active' : 'Paused'}
      size="small"
      sx={{
        height: 20, fontSize: 11, fontWeight: 700, borderRadius: '6px',
        bgcolor: active ? '#E7F4E8' : BRAND.section,
        color: active ? '#1E6023' : BRAND.textLight,
      }}
    />
  );
}

// Channel is the least important attribute in the row, so it reads as a quiet
// neutral icon + label rather than the loudest thing on screen. This also frees
// blue back up for the categorical palette.
function ChannelChip({ channel }) {
  const meta = CHANNEL_META[channel] || CHANNEL_META.email;
  const Icon = meta.icon;
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
      <Icon sx={{ fontSize: 15, color: BRAND.textLight }} />
      <Typography sx={{ fontSize: 12.5, color: BRAND.textLight }}>{meta.label}</Typography>
    </Stack>
  );
}

// show the local-part only (estate.ops), full address on hover
function localPart(email) {
  return String(email).split('@')[0];
}
function RecipientPills({ recipients }) {
  const emails = (recipients || '').split(',').map(e => e.trim()).filter(Boolean);
  if (emails.length === 0) return null;
  const shown = emails.slice(0, 3);
  const rest = emails.slice(3);
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
      <Typography sx={{ fontSize: 12, color: BRAND.textLight, mr: 0.25 }}>To:</Typography>
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

function RowMenu({ onEdit, onDelete }) {
  const [anchor, setAnchor] = useState(null);
  return (
    <>
      <IconButton onClick={e => setAnchor(e.currentTarget)} aria-label="Rule actions" sx={{ color: BRAND.textLight, width: 44, height: 44 }}>
        <MoreVertRoundedIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <MenuItem onClick={() => { setAnchor(null); onEdit(); }}>
          <ListItemIcon><EditOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { setAnchor(null); onDelete(); }} sx={{ color: BRAND.accent }}>
          <ListItemIcon><DeleteOutlineRoundedIcon fontSize="small" sx={{ color: BRAND.accent }} /></ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}

// one rule as a row in the single list card
function RuleRow({ rule, isAdmin, onToggle, onEdit, onDelete }) {
  const sev = sevOf(rule.trigger_type);
  // A paused rule still has to be READABLE - dimming the whole row to 0.65 pushes
  // body text under 4.5:1. State is already carried by the pill and the toggle,
  // so the row only desaturates its accent instead.
  const paused = !rule.is_active;
  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'center' }, gap: { xs: 1.25, sm: 2 }, px: 2.5, py: 1.75, bgcolor: paused ? BRAND.section : 'transparent' }}>
      {/* accent encodes SEVERITY, matching the chip - one meaning per colour.
          Hidden on mobile (the coloured trigger chip already carries severity). */}
      <Box sx={{ display: { xs: 'none', sm: 'block' }, width: 3, alignSelf: 'stretch', borderRadius: '2px', bgcolor: paused ? BRAND.border : sev.color, flexShrink: 0 }} />

      {/* name + status + condition chips */}
      <Box sx={{ flex: { sm: '1 1 40%' }, width: { xs: '100%', sm: 'auto' }, minWidth: 0 }}>
        <RuleNameLine name={rule.name} active={rule.is_active} />
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.75 }}>
          <TriggerChip triggerType={rule.trigger_type} />
          <ThresholdChip triggerType={rule.trigger_type} threshold={rule.threshold} />
        </Box>
      </Box>

      {/* channel + recipients */}
      <Box sx={{ flex: { sm: '1 1 40%' }, width: { xs: '100%', sm: 'auto' }, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        <Box><ChannelChip channel={rule.channel} /></Box>
        <RecipientPills recipients={rule.recipients} />
      </Box>

      {/* toggle + menu - right-aligned, and its own row on mobile */}
      {isAdmin && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0, alignSelf: { xs: 'flex-end', sm: 'auto' }, mt: { xs: -0.5, sm: 0 } }}>
          <Switch
            checked={rule.is_active}
            onChange={() => onToggle(rule)}
            size="small"
            slotProps={{ input: { 'aria-label': `${rule.is_active ? 'Pause' : 'Activate'} rule: ${rule.name}` } }}
            sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: BRAND.success }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: BRAND.success } }}
          />
          <RowMenu onEdit={() => onEdit(rule)} onDelete={() => onDelete(rule.id)} />
        </Box>
      )}
    </Box>
  );
}

// name + status pill on one line
function RuleNameLine({ name, active }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
      <Typography fontWeight={600} sx={{ color: BRAND.heading, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</Typography>
      <StatusPill active={active} />
    </Box>
  );
}

export default function AlertRules() {
  const { user } = useUser();
  const isAdmin = user?.role === 'admin';

  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const { data } = await http.get('/api/alert-rules');
      // explicit ordering: active rules first, then by name. Otherwise the list
      // order is whatever the DB felt like, which is not a rule anyone can learn.
      const sorted = [...data].sort((a, b) => {
        if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
        return (a.name || '').localeCompare(b.name || '');
      });
      setRules(sorted);
      setError(null);
    } catch (e) {
      setError(e.response?.data?.error || 'failed to load rules');
    } finally {
      setLoading(false);
    }
  }

  function openCreate() { setEditingRule(null); setSaveError(null); setFormOpen(true); }
  function openEdit(rule) { setEditingRule(rule); setSaveError(null); setFormOpen(true); }
  function closeForm() { setFormOpen(false); setEditingRule(null); setSaveError(null); }

  async function handleSave(rule) {
    setSaveError(null);
    try {
      if (editingRule) {
        await http.patch(`/api/alert-rules/${editingRule.id}`, rule);
      } else {
        await http.post('/api/alert-rules', rule);
      }
      closeForm();
      load();
    } catch (e) {
      setSaveError(e.response?.data?.error || 'save failed');
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await http.delete(`/api/alert-rules/${deleteId}`);
      setDeleteId(null);
      load();
    } catch (e) {
      setError(e.response?.data?.error || 'Could not delete the rule. Please try again.');
      setDeleteId(null);
    } finally {
      setDeleting(false);
    }
  }

  async function handleToggle(rule) {
    try {
      await http.patch(`/api/alert-rules/${rule.id}`, { is_active: !rule.is_active });
      load();
    } catch (e) {
      setError(`Could not ${rule.is_active ? 'pause' : 'activate'} "${rule.name}". Please try again.`);
    }
  }

  if (loading) return (
    <Box sx={{ p: 3 }}>
      <Skeleton variant="text" width={160} height={36} />
      <Skeleton variant="text" width={300} height={22} sx={{ mb: 3 }} />
      <Card sx={{ border: `1px solid ${BRAND.border}`, borderRadius: '12px', overflow: 'hidden' }}>
        {[0, 1, 2, 3].map(i => (
          <Box key={i} sx={{ px: 2.5, py: 1.75, borderTop: i ? `1px solid ${BRAND.border}` : 'none', display: 'flex', gap: 2, alignItems: 'center' }}>
            <Box sx={{ flex: 1 }}>
              <Skeleton variant="text" width="45%" height={24} />
              <Skeleton variant="rounded" width={110} height={22} sx={{ mt: 0.75 }} />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Skeleton variant="text" width={90} />
              <Skeleton variant="rounded" width={150} height={22} sx={{ mt: 0.5 }} />
            </Box>
            <Skeleton variant="rounded" width={34} height={20} />
          </Box>
        ))}
      </Card>
    </Box>
  );

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 3 }}>
        <div>
          <Typography variant="h5" component="h1" fontWeight={700} sx={{ color: BRAND.heading }}>Alert Rules</Typography>
          <Typography variant="body2" sx={{ color: BRAND.textLight }}>
            Configure when the system should notify staff
            {!isAdmin && <Chip label="read-only" size="small" sx={{ ml: 1 }} />}
          </Typography>
        </div>
        {isAdmin && (
          <Button
            variant="contained"
            startIcon={<AddRoundedIcon />}
            onClick={openCreate}
            sx={{ flexShrink: 0, whiteSpace: 'nowrap', bgcolor: BRAND.slate, '&:hover': { bgcolor: BRAND.slateHover }, borderRadius: '6px' }}
          >
            New Rule
          </Button>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {rules.length === 0 ? (
        <Card sx={{ border: `1px solid ${BRAND.border}`, borderRadius: '12px' }}>
          <Box sx={{ textAlign: 'center', py: 7, px: 3 }}>
            <Typography sx={{ fontWeight: 700, color: BRAND.heading, fontSize: 17, mb: 0.5 }}>
              No alert rules yet
            </Typography>
            <Typography sx={{ color: BRAND.textLight, mb: 2.5, maxWidth: 420, mx: 'auto' }}>
              Rules decide when the system notifies staff — for example, emailing estate ops the moment a plant is flagged critical.
            </Typography>
            {isAdmin && (
              <Button
                variant="contained"
                startIcon={<AddRoundedIcon />}
                onClick={openCreate}
                sx={{ bgcolor: BRAND.slate, '&:hover': { bgcolor: BRAND.slateHover } }}
              >
                Create your first rule
              </Button>
            )}
          </Box>
        </Card>
      ) : (
        // single card, rows separated by dividers (not 5 separate cards)
        <Card sx={{ border: `1px solid ${BRAND.border}`, borderRadius: '12px', overflow: 'hidden' }}>
          {rules.map((rule, i) => (
            <Box key={rule.id}>
              {i > 0 && <Divider />}
              <RuleRow
                rule={rule}
                isAdmin={isAdmin}
                onToggle={handleToggle}
                onEdit={openEdit}
                onDelete={setDeleteId}
              />
            </Box>
          ))}
        </Card>
      )}

      {/* creation/edit lives in a modal - the list is the default surface */}
      <RuleFormDialog
        open={formOpen}
        initial={editingRule}
        onSave={handleSave}
        onClose={closeForm}
        saveError={saveError}
      />

      <ConfirmDialog
        open={deleteId != null}
        title="Delete this alert rule?"
        message="The rule will be removed and will stop notifying staff. This can't be undone."
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onConfirm={confirmDelete}
        onClose={() => setDeleteId(null)}
      />
    </Box>
  );
}

// Plain-english statement of what the rule will do. Reads from live form state,
// so it also catches a rule NAME that has drifted from the rule's actual behaviour.
function previewText({ triggerType, threshold, channel, recipients, inputValue }) {
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
    when = 'When the weekly summary is sent';
  } else if (t?.threshold && threshold !== '') {
    when = `When a block reaches ${threshold} ${t.unit}`;
  } else {
    when = `When ${(t?.full || triggerType).toLowerCase()}`;
  }
  return `${when}, ${how} ${who}.`;
}

function RuleFormDialog({ open, initial, onSave, onClose, saveError }) {
  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState('flora_critical');
  const [threshold, setThreshold] = useState('');
  const [recipients, setRecipients] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [emailError, setEmailError] = useState('');
  const [channel, setChannel] = useState('email');

  // reset fields whenever the dialog opens (for create) or the rule changes (edit)
  useEffect(() => {
    if (!open) return;
    setName(initial?.name || '');
    setTriggerType(initial?.trigger_type || 'flora_critical');
    setThreshold(initial?.threshold ?? '');
    setRecipients(initial?.recipients ? initial.recipients.split(',').map(e => e.trim()).filter(Boolean) : []);
    setInputValue('');
    setEmailError('');
    setChannel(initial?.channel || 'email');
  }, [open, initial]);

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

  const groupLabelSx = { fontSize: 12, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1.5 };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '14px' } }}>
      <DialogTitle sx={{ fontWeight: 700, color: BRAND.heading }}>{initial ? 'Edit Rule' : 'New Alert Rule'}</DialogTitle>
      <Box component="form" onSubmit={submit}>
        <DialogContent sx={{ pt: 1 }}>
          {saveError && <Alert severity="error" sx={{ mb: 2 }}>{saveError}</Alert>}

          <TextField label="Rule name" value={name} onChange={e => setName(e.target.value)} required size="small" fullWidth sx={{ mb: 3 }} />

          {/* group 1: WHEN THIS HAPPENS (trigger + threshold) */}
          <Typography sx={groupLabelSx}>When this happens</Typography>
          <Grid container spacing={2} sx={{ mb: 3 }}>
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
                  InputProps={{ endAdornment: <Typography sx={{ fontSize: 13, color: BRAND.textLight, whiteSpace: 'nowrap', ml: 0.5 }}>{TRIGGERS[triggerType].unit}</Typography> }}
                  helperText="per block"
                />
              </Grid>
            )}
          </Grid>

          {/* group 2: NOTIFY (channel + recipients) */}
          <Typography sx={groupLabelSx}>Notify</Typography>
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
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip label={option} size="small" {...getTagProps({ index })} key={option} sx={{ bgcolor: BRAND.section, borderRadius: '6px' }} />
              ))
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
        </DialogContent>
        {/* live preview: states what the rule will actually do, in plain english */}
        <Box sx={{ mx: 3, mb: 1, px: 2, py: 1.25, bgcolor: BRAND.section, borderRadius: '8px', border: `1px solid ${BRAND.border}` }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.25 }}>
            Preview
          </Typography>
          <Typography sx={{ fontSize: 13.5, color: BRAND.heading }}>
            {previewText({ triggerType, threshold, channel, recipients, inputValue })}
          </Typography>
        </Box>

        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={onClose} sx={{ color: BRAND.textLight }}>Cancel</Button>
          <Button type="submit" variant="contained" sx={{ bgcolor: BRAND.slate, '&:hover': { bgcolor: BRAND.slateHover } }}>
            {initial ? 'Save changes' : 'Create rule'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}