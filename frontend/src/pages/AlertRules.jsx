import { useEffect, useState } from 'react';
import {
  Box, Typography, Button, Card, CardContent, Switch,
  TextField, Select, MenuItem, FormControl, InputLabel,
  Alert, CircularProgress, Chip
} from '@mui/material';
import { useUser } from '../contexts/UserContext';
import http from '../http';

const BRAND = {
  primary: '#C1272D',
  primaryHover: '#A61D22',
  heading: '#222222',
  textLight: '#777777',
  border: '#E5E5E5',
  success: '#2E7D32',
};

const TRIGGER_TYPES = [
  { value: 'flora_critical', label: 'Flora goes critical' },
  { value: 'fauna_hotspot', label: 'New fauna hotspot' },
  { value: 'new_case_urgent', label: 'New urgent case' },
  { value: 'weekly_summary', label: 'Weekly summary' },
];

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
    if (!window.confirm('Delete this rule? (soft delete)')) return;
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
            sx={{ flexShrink: 0, whiteSpace: 'nowrap', bgcolor: BRAND.primary, '&:hover': { bgcolor: BRAND.primaryHover }, borderRadius: '4px' }}
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
        <Card key={rule.id} sx={{ mb: 1.5, opacity: rule.is_active ? 1 : 0.55, border: `1px solid ${BRAND.border}`, borderRadius: '10px' }}>
          <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography fontWeight={600} sx={{ color: BRAND.heading }}>{rule.name}</Typography>
              <Typography variant="body2" sx={{ color: BRAND.textLight }}>
                Trigger: <code>{rule.trigger_type}</code>
                {rule.threshold != null && ` · Threshold: ${rule.threshold}`}
                {' '}· {rule.channel.toUpperCase()}
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>→ {rule.recipients}</Typography>
            </Box>
            {isAdmin && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                <Switch
                  checked={rule.is_active}
                  onChange={() => handleToggle(rule)}
                  size="small"
                  sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: BRAND.success }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: BRAND.success } }}
                />
                <Button size="small" onClick={() => { setEditingRule(rule); setShowForm(true); }} sx={{ color: BRAND.heading }}>Edit</Button>
                <Button size="small" onClick={() => handleDelete(rule.id)} sx={{ color: BRAND.primary }}>Delete</Button>
              </Box>
            )}
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}

function RuleForm({ initial, onSave, onCancel, saveError }) {
  const [name, setName] = useState(initial?.name || '');
  const [triggerType, setTriggerType] = useState(initial?.trigger_type || TRIGGER_TYPES[0].value);
  const [threshold, setThreshold] = useState(initial?.threshold || '');
  const [recipients, setRecipients] = useState(initial?.recipients || '');
  const [channel, setChannel] = useState(initial?.channel || 'email');

  const B = { primary: '#C1272D', primaryHover: '#A61D22', border: '#E5E5E5', heading: '#222222' };

  function submit(e) {
    e.preventDefault();
    onSave({
      name: name.trim(),
      trigger_type: triggerType,
      threshold: threshold ? parseInt(threshold) : null,
      recipients: recipients.trim(),
      channel,
    });
  }

  return (
    <Card sx={{ mb: 3, border: `1px solid ${B.border}`, borderRadius: '10px' }}>
      <CardContent>
        <Typography variant="subtitle1" fontWeight={600} mb={2} sx={{ color: B.heading }}>{initial ? 'Edit Rule' : 'New Alert Rule'}</Typography>
        {saveError && <Alert severity="error" sx={{ mb: 2 }}>{saveError}</Alert>}
        <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField label="Rule name" value={name} onChange={e => setName(e.target.value)} required size="small" fullWidth />

          <FormControl size="small" fullWidth>
            <InputLabel>Trigger</InputLabel>
            <Select value={triggerType} onChange={e => setTriggerType(e.target.value)} label="Trigger">
              {TRIGGER_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
            </Select>
          </FormControl>

          {triggerType === 'fauna_hotspot' && (
            <TextField label="Threshold (sightings/block/week)" type="number" value={threshold} onChange={e => setThreshold(e.target.value)} size="small" fullWidth />
          )}

          <TextField label="Recipients (comma-separated)" value={recipients} onChange={e => setRecipients(e.target.value)} required size="small" fullWidth placeholder="officer@towncouncil.sg, manager@towncouncil.sg" />

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
            <Button onClick={onCancel}>Cancel</Button>
            <Button type="submit" variant="contained" sx={{ bgcolor: B.primary, '&:hover': { bgcolor: B.primaryHover } }}>{initial ? 'Save changes' : 'Create rule'}</Button>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
