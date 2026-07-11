import { useEffect, useState } from 'react';
import {
  Box, Typography, Button, Card, CardContent, Switch,
  TextField, Select, MenuItem, FormControl, InputLabel,
  Alert, CircularProgress, Chip, IconButton, Menu, ListItemIcon, ListItemText,
  Autocomplete, Grid, Tooltip,
} from '@mui/material';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import SmsOutlinedIcon from '@mui/icons-material/SmsOutlined';
import { useUser } from '../contexts/UserContext';
import http from '../http';

const BRAND = {
  primary: '#C1272D',
  primaryHover: '#A61D22',
  heading: '#222222',
  text: '#444444',
  textLight: '#777777',
  border: '#E5E5E5',
  section: '#F7F7F7',
  success: '#2E7D32',
  slate: '#37474F',
  slateHover: '#263238',
  commsTint: '#E8F1FB',   // pale blue for delivery/comms chips
  commsBorder: '#9EC5F4',
  logicFill: '#F0F1F3',   // light grey for logic (trigger/threshold) chips
};

const TRIGGER_TYPES = [
  { value: 'flora_critical', label: 'Flora goes critical' },
  { value: 'fauna_hotspot', label: 'New fauna hotspot' },
  { value: 'new_case_urgent', label: 'New urgent case' },
  { value: 'weekly_summary', label: 'Weekly summary' },
];

const TRIGGER_LABEL = {
  flora_critical: 'Flora Critical',
  fauna_hotspot: 'Fauna Hotspot',
  new_case_urgent: 'Urgent Case',
  weekly_summary: 'Weekly Summary',
};

const CHANNEL_META = {
  email: { label: 'Email', icon: EmailOutlinedIcon },
  sms: { label: 'SMS', icon: SmsOutlinedIcon },
  both: { label: 'Email + SMS', icon: EmailOutlinedIcon },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// logic chips (trigger + threshold): grouped with a light grey fill
function LogicChip({ label }) {
  return <Chip label={label} size="small" sx={{ bgcolor: BRAND.logicFill, color: BRAND.heading, fontWeight: 600, borderRadius: '6px' }} />;
}

// delivery chip: outlined with a pale blue tint to mark "how we tell you"
function ChannelChip({ channel }) {
  const meta = CHANNEL_META[channel] || CHANNEL_META.email;
  const Icon = meta.icon;
  return (
    <Chip
      icon={<Icon sx={{ fontSize: 15 }} />}
      label={meta.label}
      size="small"
      variant="outlined"
      sx={{ bgcolor: BRAND.commsTint, borderColor: BRAND.commsBorder, color: BRAND.heading, borderRadius: '6px', '& .MuiChip-icon': { color: '#1565C0' } }}
    />
  );
}

// recipients: soft grey pills with "+N more" truncation (expand on hover)
function RecipientPills({ recipients }) {
  const emails = (recipients || '').split(',').map(e => e.trim()).filter(Boolean);
  if (emails.length === 0) return null;
  const shown = emails.slice(0, 2);
  const rest = emails.slice(2);
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
      <Typography sx={{ fontSize: 12, color: BRAND.textLight, mr: 0.25 }}>To:</Typography>
      {shown.map((e, i) => (
        <Chip key={i} label={e} size="small" sx={{ bgcolor: BRAND.section, color: BRAND.text, borderRadius: '6px', fontSize: 12, height: 22 }} />
      ))}
      {rest.length > 0 && (
        <Tooltip title={rest.join(', ')} arrow>
          <Chip label={`+${rest.length} more`} size="small" sx={{ bgcolor: BRAND.section, color: BRAND.textLight, borderRadius: '6px', fontSize: 12, height: 22, cursor: 'default' }} />
        </Tooltip>
      )}
    </Box>
  );
}

function RowMenu({ onEdit, onDelete }) {
  const [anchor, setAnchor] = useState(null);
  const open = Boolean(anchor);
  return (
    <>
      <IconButton size="small" onClick={e => setAnchor(e.currentTarget)} aria-label="Rule actions" sx={{ color: BRAND.textLight }}>
        <MoreVertRoundedIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={open} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <MenuItem onClick={() => { setAnchor(null); onEdit(); }}>
          <ListItemIcon><EditOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { setAnchor(null); onDelete(); }} sx={{ color: BRAND.primary }}>
          <ListItemIcon><DeleteOutlineRoundedIcon fontSize="small" sx={{ color: BRAND.primary }} /></ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}

export default function AlertRules() {
  const { user } = useUser();
  const isAdmin = user?.role === 'admin';

  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const { data } = await http.get('/api/alert-rules');
      setRules(data);
      setError(null);
    } catch (e) {
      setError(e.response?.data?.error || 'failed to load rules');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(rule) {
    setSaveError(null);
    try {
      if (editingRule) {
        await http.patch(`/api/alert-rules/${editingRule.id}`, rule);
      } else {
        await http.post('/api/alert-rules', rule);
      }
      setShowForm(false);
      setEditingRule(null);
      load();
    } catch (e) {
      setSaveError(e.response?.data?.error || 'save failed');
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this rule?')) return;
    try {
      await http.delete(`/api/alert-rules/${id}`);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'delete failed');
    }
  }

  async function handleToggle(rule) {
    try {
      await http.patch(`/api/alert-rules/${rule.id}`, { is_active: !rule.is_active });
      load();
    } catch (e) {
      alert('toggle failed');
    }
  }

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress sx={{ color: BRAND.primary }} /></Box>;

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 3 }}>
        <div>
          <Typography variant="h5" fontWeight={700} sx={{ color: BRAND.heading }}>Alert Rules</Typography>
          <Typography variant="body2" sx={{ color: BRAND.textLight }}>
            Configure when the system should notify staff
            {!isAdmin && <Chip label="read-only" size="small" sx={{ ml: 1 }} />}
          </Typography>
        </div>
        {isAdmin && !showForm && (
          <Button
            variant="contained"
            onClick={() => { setEditingRule(null); setShowForm(true); }}
            sx={{ flexShrink: 0, whiteSpace: 'nowrap', bgcolor: BRAND.slate, '&:hover': { bgcolor: BRAND.slateHover }, borderRadius: '6px' }}
          >
            + New Rule
          </Button>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {showForm && (
        <RuleForm
          initial={editingRule}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditingRule(null); setSaveError(null); }}
          saveError={saveError}
        />
      )}

      {rules.length === 0 && !loading && (
        <Typography sx={{ color: BRAND.textLight }} textAlign="center" mt={4}>No alert rules yet.</Typography>
      )}

      {rules.map(rule => (
        <Card key={rule.id} sx={{ mb: 1.5, opacity: rule.is_active ? 1 : 0.6, border: `1px solid ${BRAND.border}`, borderRadius: '10px' }}>
          <CardContent sx={{ py: 1.75, '&:last-child': { pb: 1.75 } }}>
            <Grid container spacing={2} sx={{ alignItems: 'center' }}>
              {/* Column 1: title + logic chips */}
              <Grid size={{ xs: 12, md: 4 }}>
                <Typography fontWeight={600} sx={{ color: BRAND.heading, mb: 0.75 }}>{rule.name}</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  <LogicChip label={TRIGGER_LABEL[rule.trigger_type] || rule.trigger_type} />
                  {rule.threshold != null && <LogicChip label={`Threshold ${rule.threshold}`} />}
                </Box>
              </Grid>

              {/* Column 2: delivery + recipients */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  <Box><ChannelChip channel={rule.channel} /></Box>
                  <RecipientPills recipients={rule.recipients} />
                </Box>
              </Grid>

              {/* Column 3: toggle + menu */}
              {isAdmin && (
                <Grid size={{ xs: 12, md: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: { xs: 'flex-start', md: 'flex-end' }, gap: 0.5 }}>
                    <Switch
                      checked={rule.is_active}
                      onChange={() => handleToggle(rule)}
                      size="small"
                      sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: BRAND.success }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: BRAND.success } }}
                    />
                    <RowMenu
                      onEdit={() => { setEditingRule(rule); setShowForm(true); }}
                      onDelete={() => handleDelete(rule.id)}
                    />
                  </Box>
                </Grid>
              )}
            </Grid>
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}

function RuleForm({ initial, onSave, onCancel, saveError }) {
  const [name, setName] = useState(initial?.name || '');
  const [triggerType, setTriggerType] = useState(initial?.trigger_type || TRIGGER_TYPES[0].value);
  const [threshold, setThreshold] = useState(initial?.threshold ?? '');
  // recipients held as an array of emails (tokenised); converted to/from the
  // comma-separated string the backend expects.
  const [recipients, setRecipients] = useState(
    initial?.recipients ? initial.recipients.split(',').map(e => e.trim()).filter(Boolean) : []
  );
  // what the user has typed but not yet committed with Enter/comma
  const [inputValue, setInputValue] = useState('');
  const [emailError, setEmailError] = useState('');
  const [channel, setChannel] = useState(initial?.channel || 'email');

  function submit(e) {
    e.preventDefault();
    // fold any email still sitting in the input (typed but not committed with Enter)
    let finalRecipients = recipients;
    const pending = inputValue.trim();
    if (pending) {
      if (!EMAIL_RE.test(pending)) {
        setEmailError(`"${pending}" is not a valid email`);
        return;
      }
      if (!finalRecipients.includes(pending)) {
        finalRecipients = [...finalRecipients, pending];
      }
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
      threshold: threshold !== '' ? parseInt(threshold) : null,
      recipients: finalRecipients.join(', '),
      channel,
    });
  }

  return (
    <Card sx={{ mb: 3, border: `1px solid ${BRAND.border}`, borderRadius: '10px' }}>
      <CardContent>
        <Typography variant="subtitle1" fontWeight={600} mb={2} sx={{ color: BRAND.heading }}>{initial ? 'Edit Rule' : 'New Alert Rule'}</Typography>
        {saveError && <Alert severity="error" sx={{ mb: 2 }}>{saveError}</Alert>}
        <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* unified floating label on every field */}
          <TextField label="Rule name" value={name} onChange={e => setName(e.target.value)} required size="small" fullWidth />

          {/* Trigger + Threshold side by side: "If [Trigger] reaches [Threshold]" */}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 8 }}>
              <FormControl size="small" fullWidth>
                <InputLabel>Trigger</InputLabel>
                <Select value={triggerType} onChange={e => setTriggerType(e.target.value)} label="Trigger">
                  {TRIGGER_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label="Threshold"
                type="number"
                value={threshold}
                onChange={e => setThreshold(e.target.value)}
                size="small"
                fullWidth
                helperText={triggerType === 'fauna_hotspot' ? 'sightings / block / week' : 'optional'}
              />
            </Grid>
          </Grid>

          <FormControl size="small" fullWidth>
            <InputLabel>Delivery channel</InputLabel>
            <Select value={channel} onChange={e => setChannel(e.target.value)} label="Delivery channel">
              <MenuItem value="email">Email</MenuItem>
              <MenuItem value="sms">SMS</MenuItem>
              <MenuItem value="both">Email + SMS</MenuItem>
            </Select>
          </FormControl>

          {/* tokenised recipients: type an email, Enter/comma commits it as a chip */}
          <Autocomplete
            multiple
            freeSolo
            options={[]}
            value={recipients}
            inputValue={inputValue}
            onInputChange={(_, newInput) => { setInputValue(newInput); if (emailError) setEmailError(''); }}
            onChange={(_, newValue) => {
              // validate each newly-added token; reject invalid emails
              const cleaned = [];
              let bad = '';
              newValue.forEach(v => {
                const email = String(v).trim();
                if (EMAIL_RE.test(email)) {
                  if (!cleaned.includes(email)) cleaned.push(email);
                } else if (email) {
                  bad = email;
                }
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

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
            <Button onClick={onCancel} sx={{ color: BRAND.textLight }}>Cancel</Button>
            <Button type="submit" variant="contained" sx={{ bgcolor: BRAND.slate, '&:hover': { bgcolor: BRAND.slateHover } }}>{initial ? 'Save changes' : 'Create rule'}</Button>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}