import { useEffect, useState } from 'react';
import {
  Box, Typography, Card, CardContent, Button, Chip, Stack, Checkbox, Collapse,
  CircularProgress, Alert, Divider, Tooltip, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, FormControlLabel, IconButton,
} from '@mui/material';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import SavingsOutlinedIcon from '@mui/icons-material/SavingsOutlined';
import { BRAND } from '../theme';
import http from '../http';
import UndoSnackbar from '../components/UndoSnackbar';

const RISK_META = {
  low: { label: 'Low', bg: '#E7F4E8', color: '#1E6023' },
  medium: { label: 'Medium', bg: '#FFF4E5', color: '#8A5200' },
  high: { label: 'High', bg: '#FDECEA', color: '#B3261E' },
  critical: { label: 'Critical', bg: '#B3261E', color: '#FFFFFF' },
};
function riskChip(level) {
  const m = RISK_META[level] || RISK_META.low;
  return <Chip label={m.label} size="small" sx={{ bgcolor: m.bg, color: m.color, fontWeight: 700, borderRadius: '6px' }} />;
}
const money = n => `S$${(n || 0).toLocaleString('en-SG')}`;
const shortDate = iso => new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });

// A block cluster: the officer picks which of the pending complaints belong to
// one call-out (all selected by default), then approves or dismisses. Selection
// is the "consolidation" decision the brief asks a human to make.
function ClusterCard({ cluster, onApprove, onDismiss }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(() => new Set(cluster.assessments.map(a => a.id)));
  const [approveOpen, setApproveOpen] = useState(false);
  const [dismissOpen, setDismissOpen] = useState(false);
  const [dispatch, setDispatch] = useState(true);
  const [agency, setAgency] = useState('Pest Control Contractor');
  const [notes, setNotes] = useState('');
  const [dismissNote, setDismissNote] = useState('');
  const [busy, setBusy] = useState(false);

  const ids = [...selected];
  const avoided = Math.max(0, ids.length - 1);

  const toggle = id => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  async function confirmApprove() {
    setBusy(true);
    try {
      await onApprove(ids, { dispatch, target_agency: agency, notes });
      setApproveOpen(false);
    } finally { setBusy(false); }
  }
  async function confirmDismiss() {
    setBusy(true);
    try {
      await onDismiss(ids, dismissNote);
      setDismissOpen(false);
    } finally { setBusy(false); }
  }

  const meta = RISK_META[cluster.risk_level] || RISK_META.low;

  return (
    <Card sx={{ border: `1px solid ${BRAND.border}`, borderLeft: `4px solid ${meta.color === '#FFFFFF' ? '#B3261E' : meta.color}`, borderRadius: '10px' }}>
      <CardContent sx={{ p: 2.5 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', minWidth: 0 }}>
            <PlaceOutlinedIcon sx={{ color: BRAND.primary, fontSize: 20, flexShrink: 0 }} />
            <Typography sx={{ fontSize: 17, fontWeight: 700, color: BRAND.heading, whiteSpace: 'nowrap' }}>{cluster.block}</Typography>
            {riskChip(cluster.risk_level)}
            <Chip
              label={`${cluster.count} report${cluster.count === 1 ? '' : 's'}`}
              size="small"
              sx={{ bgcolor: BRAND.section, color: BRAND.text, fontWeight: 600, borderRadius: '6px' }}
            />
          </Stack>
          {cluster.call_outs_avoided > 0 && (
            <Tooltip arrow title="Consolidating these reports into a single approved call-out avoids paying for separate visits.">
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', color: '#1E6023', cursor: 'default' }}>
                <SavingsOutlinedIcon sx={{ fontSize: 18 }} />
                <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                  {cluster.call_outs_avoided} call-out{cluster.call_outs_avoided === 1 ? '' : 's'} avoided · {money(cluster.est_savings)}
                </Typography>
              </Stack>
            </Tooltip>
          )}
        </Stack>

        <Button
          onClick={() => setOpen(o => !o)}
          size="small"
          startIcon={<ExpandMoreRoundedIcon sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />}
          sx={{ mt: 1, color: BRAND.textLight, px: 0.5 }}
        >
          {open ? 'Hide' : 'Review'} {cluster.count} report{cluster.count === 1 ? '' : 's'}
        </Button>

        <Collapse in={open} unmountOnExit>
          <Stack spacing={0} sx={{ mt: 1 }}>
            {cluster.assessments.map((a, i) => (
              <Stack
                key={a.id}
                direction="row"
                spacing={1.25}
                sx={{ alignItems: 'flex-start', py: 1.25, borderTop: i === 0 ? 'none' : `1px solid ${BRAND.section}` }}
              >
                <Checkbox
                  size="small"
                  checked={selected.has(a.id)}
                  onChange={() => toggle(a.id)}
                  sx={{ p: 0.25, mt: 0.1, color: BRAND.textLight, '&.Mui-checked': { color: BRAND.primary } }}
                />
                {a.image_url && (
                  <Box component="img" src={a.image_url} alt="" sx={{ width: 44, height: 44, borderRadius: '6px', objectFit: 'cover', border: `1px solid ${BRAND.border}`, flexShrink: 0 }} />
                )}
                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.25 }}>
                    {riskChip(a.risk_level)}
                    <Typography sx={{ fontSize: 12, color: BRAND.textLight }}>
                      {shortDate(a.createdAt)}{a.floor_level ? ` · ${a.floor_level}` : ''}
                    </Typography>
                  </Stack>
                  <Typography sx={{ fontSize: 13.5, color: BRAND.text, lineHeight: 1.5 }}>{a.observations}</Typography>
                </Box>
              </Stack>
            ))}
          </Stack>
        </Collapse>

        <Divider sx={{ my: 1.5 }} />
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
          <Button onClick={() => setDismissOpen(true)} disabled={ids.length === 0} sx={{ color: BRAND.textLight }}>
            Dismiss
          </Button>
          <Button
            variant="contained"
            onClick={() => setApproveOpen(true)}
            disabled={ids.length === 0}
            sx={{ bgcolor: BRAND.primary, '&:hover': { bgcolor: BRAND.primaryHover } }}
          >
            Approve &amp; raise work order
          </Button>
        </Stack>
      </CardContent>

      {/* Approve dialog - the explicit human sign-off before any contractor cost */}
      <Dialog open={approveOpen} onClose={() => !busy && setApproveOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Raise work order · {cluster.block}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: BRAND.text, mb: 2 }}>
            Consolidating <b>{ids.length}</b> report{ids.length === 1 ? '' : 's'} into one call-out
            {avoided > 0 && <> — avoiding <b>{avoided}</b> extra visit{avoided === 1 ? '' : 's'} ({money(avoided * (cluster.est_savings / Math.max(1, cluster.call_outs_avoided)))}).</>}
          </Typography>
          <TextField
            label="Dispatch to" value={agency} onChange={e => setAgency(e.target.value)}
            size="small" fullWidth sx={{ mb: 2 }}
          />
          <TextField
            label="Notes for the contractor (optional)" value={notes} onChange={e => setNotes(e.target.value)}
            size="small" fullWidth multiline rows={2} sx={{ mb: 1 }}
          />
          <FormControlLabel
            control={<Checkbox checked={dispatch} onChange={e => setDispatch(e.target.checked)} sx={{ '&.Mui-checked': { color: BRAND.primary } }} />}
            label={<Typography sx={{ fontSize: 14 }}>Email the contractor now</Typography>}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setApproveOpen(false)} disabled={busy} sx={{ color: BRAND.textLight }}>Cancel</Button>
          <Button onClick={confirmApprove} disabled={busy} variant="contained" sx={{ bgcolor: BRAND.primary, '&:hover': { bgcolor: BRAND.primaryHover } }}>
            {busy ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : 'Approve'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dismiss dialog - reason is stored as the decision audit */}
      <Dialog open={dismissOpen} onClose={() => !busy && setDismissOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Dismiss escalation · {cluster.block}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: BRAND.text, mb: 2 }}>
            No contractor will be engaged. This clears {ids.length} report{ids.length === 1 ? '' : 's'} from the queue and records your reason.
          </Typography>
          <TextField
            label="Reason (optional)" value={dismissNote} onChange={e => setDismissNote(e.target.value)}
            placeholder="e.g. Bins already secured, will re-inspect in 48h"
            size="small" fullWidth multiline rows={2}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDismissOpen(false)} disabled={busy} sx={{ color: BRAND.textLight }}>Cancel</Button>
          <Button onClick={confirmDismiss} disabled={busy} variant="outlined" color="inherit">
            {busy ? <CircularProgress size={16} /> : 'Dismiss'}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}

function StatTile({ label, value, sub }) {
  return (
    <Box sx={{ flex: 1, minWidth: 130, p: 2, bgcolor: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: '10px' }}>
      <Typography sx={{ fontSize: 12, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</Typography>
      <Typography sx={{ fontSize: 28, fontWeight: 800, color: BRAND.heading, lineHeight: 1.1, mt: 0.25 }}>{value}</Typography>
      {sub && <Typography sx={{ fontSize: 12, color: BRAND.textLight }}>{sub}</Typography>}
    </Box>
  );
}

function WorkOrderRow({ wo, onClose }) {
  const [busy, setBusy] = useState(false);
  const closed = wo.status === 'closed';
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, borderTop: `1px solid ${BRAND.section}`, flexWrap: 'wrap' }}>
      <Chip
        label={closed ? 'Closed' : 'Open'}
        size="small"
        sx={{ bgcolor: closed ? BRAND.section : '#E8F1FB', color: closed ? BRAND.textLight : '#1565C0', fontWeight: 700, borderRadius: '6px' }}
      />
      <Typography sx={{ fontWeight: 700, color: BRAND.heading }}>{wo.block_number || '(No block)'}</Typography>
      {riskChip(wo.risk_level)}
      <Typography sx={{ fontSize: 13, color: BRAND.textLight }}>
        {wo.consolidated_count} report{wo.consolidated_count === 1 ? '' : 's'} · {wo.target_agency}
      </Typography>
      {wo.email_status && (
        <Chip
          label={wo.email_status === 'sent' ? 'Dispatched' : 'Dispatch failed'}
          size="small"
          sx={{ bgcolor: wo.email_status === 'sent' ? '#E7F4E8' : '#FDECEA', color: wo.email_status === 'sent' ? '#1E6023' : '#B3261E', fontWeight: 600, borderRadius: '6px' }}
        />
      )}
      <Box sx={{ flexGrow: 1 }} />
      <Typography sx={{ fontSize: 12, color: BRAND.textLight }}>
        {closed ? `Closed by ${wo.closed_by_name || '-'}` : `Approved by ${wo.approved_by_name || '-'}`} · {shortDate(wo.createdAt)}
      </Typography>
      {!closed && (
        <Button
          size="small"
          onClick={async () => { setBusy(true); try { await onClose(wo.id); } finally { setBusy(false); } }}
          disabled={busy}
          sx={{ color: BRAND.slate || '#37474F' }}
        >
          {busy ? <CircularProgress size={14} /> : 'Mark done'}
        </Button>
      )}
    </Box>
  );
}

export default function ActionQueue() {
  const [queue, setQueue] = useState(null);
  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [undo, setUndo] = useState(null); // { ids, count } after a dismiss

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [q, w] = await Promise.all([
        http.get('/api/work-orders/queue'),
        http.get('/api/work-orders'),
      ]);
      setQueue(q.data);
      setWorkOrders(w.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load the action queue');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function approve(ids, opts) {
    const { data } = await http.post('/api/work-orders', { assessment_ids: ids, ...opts });
    setToast({ ok: true, msg: `Work order raised for ${data.block_number || 'the selected reports'}${data.email_status === 'sent' ? ' and dispatched' : ''}.` });
    await load();
  }
  async function dismiss(ids, note) {
    await http.post('/api/work-orders/dismiss', { assessment_ids: ids, note });
    setUndo({ ids: [...ids], count: ids.length });
    await load();
  }
  async function undoDismiss() {
    if (!undo) return;
    const ids = undo.ids;
    setUndo(null);
    try {
      await http.post('/api/work-orders/undismiss', { assessment_ids: ids });
      await load();
    } catch (e) {
      setToast({ ok: false, msg: 'Could not undo - the reports may have already been actioned.' });
    }
  }
  async function closeWo(id) {
    await http.patch(`/api/work-orders/${id}/close`);
    setToast({ ok: true, msg: 'Work order marked done.' });
    await load();
  }

  const totals = queue?.totals;

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
        <Typography variant="h5" component="h1" fontWeight={700} sx={{ color: BRAND.heading }}>Action Queue</Typography>
        <IconButton onClick={load} disabled={loading} aria-label="Refresh" sx={{ color: BRAND.textLight, '&:hover': { color: BRAND.primary } }}>
          <RefreshRoundedIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Stack>
      <Typography variant="body2" sx={{ color: BRAND.textLight, mb: 2.5 }}>
        The AI recommends escalations; a call-out is only ever raised after an officer reviews and approves here. Consolidate reports at the same block to avoid paying for repeat visits.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={load}>Retry</Button>}>{error}</Alert>}
      {toast && <Alert severity={toast.ok ? 'success' : 'error'} sx={{ mb: 2 }} onClose={() => setToast(null)}>{toast.msg}</Alert>}

      {loading ? (
        <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress sx={{ color: BRAND.primary }} /></Box>
      ) : (
        <>
          {/* consolidation impact strip */}
          {totals && (
            <Stack direction="row" spacing={1.5} sx={{ mb: 3, flexWrap: 'wrap', rowGap: 1.5 }}>
              <StatTile label="Awaiting review" value={totals.pending} sub={`across ${totals.blocks} block${totals.blocks === 1 ? '' : 's'}`} />
              <StatTile label="Call-outs avoidable" value={totals.call_outs_avoidable} sub="by consolidating" />
              <StatTile label="Est. saving" value={money(totals.est_savings)} sub={`@ ${money(totals.callout_cost)}/visit (assumed)`} />
              <StatTile label="Open work orders" value={workOrders.filter(w => w.status === 'open').length} sub={`${workOrders.length} total`} />
            </Stack>
          )}

          <Typography variant="h6" fontWeight={600} sx={{ color: BRAND.heading, mb: 1.5 }}>
            Pending Escalations
          </Typography>
          {queue?.clusters?.length ? (
            <Stack spacing={2} sx={{ mb: 4 }}>
              {queue.clusters.map(c => (
                <ClusterCard key={c.block} cluster={c} onApprove={approve} onDismiss={dismiss} />
              ))}
            </Stack>
          ) : (
            <Card sx={{ mb: 4, border: `1px dashed ${BRAND.border}`, borderRadius: '10px', bgcolor: BRAND.section }}>
              <CardContent sx={{ py: 5, textAlign: 'center' }}>
                <ReportProblemOutlinedIcon sx={{ color: BRAND.textLight, fontSize: 28, mb: 1 }} />
                <Typography sx={{ color: BRAND.textLight }}>No escalations awaiting review. New AI-flagged rodent risks will appear here.</Typography>
              </CardContent>
            </Card>
          )}

          <Typography variant="h6" fontWeight={600} sx={{ color: BRAND.heading, mb: 1.5 }}>
            Work Orders
          </Typography>
          {workOrders.length ? (
            <Card sx={{ border: `1px solid ${BRAND.border}`, borderRadius: '10px', overflow: 'hidden' }}>
              {workOrders.map(w => <WorkOrderRow key={w.id} wo={w} onClose={closeWo} />)}
            </Card>
          ) : (
            <Typography sx={{ color: BRAND.textLight }}>No work orders raised yet.</Typography>
          )}
        </>
      )}

      <UndoSnackbar
        open={!!undo}
        message={undo ? `Dismissed ${undo.count} report${undo.count === 1 ? '' : 's'}` : ''}
        onUndo={undoDismiss}
        onClose={() => setUndo(null)}
      />
    </Box>
  );
}
