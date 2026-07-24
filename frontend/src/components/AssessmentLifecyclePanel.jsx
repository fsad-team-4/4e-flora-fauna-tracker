import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Drawer, Box, Stack, Typography, Chip, IconButton, Skeleton, Button, Alert } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import HourglassEmptyRoundedIcon from '@mui/icons-material/HourglassEmptyRounded';
import DoNotDisturbAltOutlinedIcon from '@mui/icons-material/DoNotDisturbAltOutlined';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import { BRAND } from '../theme';
import http from '../http';

// Risk chip styling matches the RodentAssessment page + Action Queue (this surface
// already uses the red/amber/green risk scale; the map is the surface that doesn't).
const RISK_META = {
  low: { label: 'Low', bg: '#E7F4E8', color: '#1E6023' },
  medium: { label: 'Medium', bg: '#FFF4E5', color: '#8A5200' },
  high: { label: 'High', bg: '#FDECEA', color: '#B3261E' },
  critical: { label: 'Critical', bg: '#B3261E', color: '#FFFFFF' },
};

function fmtDateTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
const NotRecorded = () => <Box component="span" sx={{ color: BRAND.textLight, fontStyle: 'italic' }}>not recorded</Box>;
// Empty fields must read "not recorded", never blank or zero (honesty constraint).
function orNR(v) {
  if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return <NotRecorded />;
  return v;
}
function normalizeAction(a) {
  if (a && typeof a === 'object') return { title: a.title || '', detail: a.detail || a.text || '' };
  return { title: '', detail: String(a) };
}

// Stage tone drives the dot + icon colour. Status semantics (not severity):
// done = green (a completed step), pending = amber (in progress), neutral = slate,
// future = hollow dashed (explicitly unbuilt). Kept off the risk red so a "done"
// step never reads as "critical".
const TONE = {
  done: '#2E7D32',
  pending: '#ED9B00',
  neutral: BRAND.slate,
  future: BRAND.textLight,
};
function Stage({ label, icon, tone = 'neutral', last = false, badge, children }) {
  const color = TONE[tone] || TONE.neutral;
  return (
    <Box sx={{ display: 'flex', gap: 1.5 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pt: 0.25 }}>
        <Box aria-hidden sx={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: tone === 'future' ? '#fff' : `${color}1A`, border: `1.5px ${tone === 'future' ? 'dashed' : 'solid'} ${tone === 'future' ? BRAND.border : color}` }}>
          {icon}
        </Box>
        {!last && <Box aria-hidden sx={{ flexGrow: 1, width: 2, bgcolor: BRAND.border, my: 0.5, minHeight: 12 }} />}
      </Box>
      <Box sx={{ pb: last ? 0 : 2.5, flexGrow: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.75, flexWrap: 'wrap', rowGap: 0.5 }}>
          <Typography sx={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: BRAND.textLight }}>{label}</Typography>
          {badge}
        </Stack>
        {children}
      </Box>
    </Box>
  );
}
function Field({ label, children }) {
  return (
    <Box sx={{ mb: 1 }}>
      <Typography sx={{ fontSize: 11, color: BRAND.textLight, mb: 0.1 }}>{label}</Typography>
      <Typography component="div" sx={{ fontSize: 13.5, color: BRAND.text, lineHeight: 1.55 }}>{children}</Typography>
    </Box>
  );
}
const stageIcon = (Comp, tone) => <Comp sx={{ fontSize: 16, color: TONE[tone] || TONE.neutral }} />;

/**
 * Assessment lifecycle side panel: "what happened to this report?" - reported ->
 * assessed -> escalation outcome, as a vertical stepper. The outcome shows the
 * work order if one exists; otherwise it names WHICH no-work-order state is true
 * (not recommended / awaiting approval / dismissed) - those must not look alike,
 * and none of them is "resolved". A final, clearly-unbuilt "resident update" node
 * marks where the tracked lifecycle actually ends.
 */
export default function AssessmentLifecyclePanel({ assessmentId, open, onClose }) {
  // Keyed on assessmentId (not synchronous setState in the effect): loading/error
  // are derived from whether the fetched id matches the requested one.
  const [fetched, setFetched] = useState({ id: null, data: null, error: false });

  useEffect(() => {
    if (!open || !assessmentId) return undefined;
    let alive = true;
    http.get(`/api/rodent-assessments/${assessmentId}`)
      .then(r => { if (alive) setFetched({ id: assessmentId, data: r.data, error: false }); })
      .catch(() => { if (alive) setFetched({ id: assessmentId, data: null, error: true }); });
    return () => { alive = false; };
  }, [open, assessmentId]);

  const ready = fetched.id === assessmentId;
  const loading = open && !ready;
  const error = ready && fetched.error;
  const a = ready && !fetched.error ? fetched.data : null;

  const wo = a?.work_order || null;
  const lat = a ? Number(a.gps_lat) : NaN;
  const lng = a ? Number(a.gps_lng) : NaN;
  const hasLoc = Number.isFinite(lat) && Number.isFinite(lng);
  const actions = (a?.immediate_actions || []).map(normalizeAction);
  const risk = a ? (RISK_META[a.risk_level] || { label: a.risk_level || 'Unknown', bg: BRAND.section, color: BRAND.text }) : null;

  return (
    <Drawer anchor="right" open={open} onClose={onClose}
      slotProps={{
        paper: { sx: { width: { xs: '100%', sm: 420 }, maxWidth: '100%' } },
        // lighter scrim so the assessments table stays visible for comparison
        backdrop: { sx: { backgroundColor: 'rgba(16,24,40,0.24)' } },
      }}>
      <Box sx={{ p: 2.5, borderBottom: `1px solid ${BRAND.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, bgcolor: '#fff', zIndex: 1 }}>
        <Typography component="h2" sx={{ fontSize: 16, fontWeight: 700, color: BRAND.heading }}>Report lifecycle</Typography>
        <IconButton onClick={onClose} aria-label="Close panel" sx={{ color: BRAND.textLight }}><CloseRoundedIcon /></IconButton>
      </Box>

      <Box sx={{ p: 2.5, overflowY: 'auto' }}>
        {loading ? (
          <Stack spacing={2}>
            <Skeleton variant="rounded" height={90} />
            <Skeleton variant="rounded" height={120} />
            <Skeleton variant="rounded" height={90} />
          </Stack>
        ) : error ? (
          <Alert severity="error">Could not load this report's lifecycle.</Alert>
        ) : a ? (
          <>
            {/* REPORTED */}
            <Stage label="Reported" tone="done" icon={stageIcon(DescriptionOutlinedIcon, 'done')}>
              <Field label="Date">{orNR(fmtDateTime(a.createdAt))}</Field>
              <Field label="Block">{orNR(a.block_number)}</Field>
              <Field label="Floor / area">{orNR(a.floor_level)}</Field>
              <Field label="Location">
                {hasLoc
                  ? <>{lat.toFixed(5)}, {lng.toFixed(5)} · <Box component={RouterLink} to="/rodent-heatmap" onClick={onClose} sx={{ color: BRAND.primary, textDecoration: 'none', fontWeight: 600, '&:hover': { textDecoration: 'underline' } }}>View on risk map →</Box></>
                  : <NotRecorded />}
              </Field>
              <Field label="Officer's observation">{orNR(a.observations)}</Field>
            </Stage>

            {/* ASSESSED */}
            <Stage label="Assessed by AI" tone="done" icon={stageIcon(AutoAwesomeOutlinedIcon, 'done')}>
              <Box sx={{ mb: 1 }}>
                <Typography sx={{ fontSize: 11, color: BRAND.textLight, mb: 0.35 }}>Risk level</Typography>
                {a.risk_level
                  ? <Chip label={risk.label} size="small" sx={{ bgcolor: risk.bg, color: risk.color, fontWeight: 700, borderRadius: '6px' }} />
                  : <NotRecorded />}
              </Box>
              <Field label="Likely cause">{orNR(a.likely_cause)}</Field>
              <Box sx={{ mb: 1 }}>
                <Typography sx={{ fontSize: 11, color: BRAND.textLight, mb: 0.35 }}>Signs identified</Typography>
                {a.signs_identified?.length
                  ? <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                      {a.signs_identified.map((s, i) => <Chip key={i} label={s} size="small" sx={{ bgcolor: BRAND.section, color: BRAND.text, borderRadius: '6px' }} />)}
                    </Stack>
                  : <NotRecorded />}
              </Box>
              <Field label="Escalation recommendation">
                {a.escalate_to_contractor
                  ? <>Recommended a contractor call-out{a.escalation_reason ? ` — ${a.escalation_reason}` : ''}.</>
                  : 'The AI did not recommend a contractor call-out.'}
              </Field>
              {a.image_url && (
                <Box sx={{ mt: 0.5 }}>
                  <Typography sx={{ fontSize: 11, color: BRAND.textLight, mb: 0.5 }}>Field photo</Typography>
                  <Box component="img" src={a.image_url} alt="field photo" sx={{ maxWidth: '100%', maxHeight: 200, borderRadius: '8px', border: `1px solid ${BRAND.border}`, display: 'block' }} />
                </Box>
              )}
              {actions.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  <Typography sx={{ fontSize: 11, color: BRAND.textLight, mb: 0.35 }}>Recommended actions</Typography>
                  <Stack component="ul" sx={{ m: 0, pl: 2.25 }} spacing={0.4}>
                    {actions.map((act, i) => (
                      <Typography key={i} component="li" sx={{ fontSize: 13, color: BRAND.text, lineHeight: 1.5 }}>
                        {act.title ? <b>{act.title}: </b> : null}{act.detail}
                      </Typography>
                    ))}
                  </Stack>
                  <Typography sx={{ fontSize: 11, color: BRAND.textLight, fontStyle: 'italic', mt: 0.5 }}>
                    Recommendations only — completion isn't tracked here yet.
                  </Typography>
                </Box>
              )}
            </Stage>

            {/* OUTCOME - the lifecycle answer */}
            {wo ? (
              <Stage
                label="Escalated → work order"
                tone={wo.status === 'closed' ? 'done' : 'pending'}
                icon={stageIcon(LocalShippingOutlinedIcon, wo.status === 'closed' ? 'done' : 'pending')}
                badge={<Chip label={wo.status === 'closed' ? 'Closed' : 'Open'} size="small" sx={{ height: 20, fontSize: 11, fontWeight: 700, borderRadius: '6px', bgcolor: wo.status === 'closed' ? '#E7F4E8' : '#FFF4E5', color: wo.status === 'closed' ? '#1E6023' : '#8A5200' }} />}
              >
                <Field label="Target agency">{orNR(wo.target_agency)}</Field>
                <Field label="Approved by">
                  {orNR(wo.approved_by_name)}{fmtDateTime(wo.createdAt) ? ` · ${fmtDateTime(wo.createdAt)}` : ''}
                </Field>
                <Field label="Consolidation">
                  {wo.consolidated_count > 1
                    ? `Merged with ${wo.consolidated_count - 1} other report${wo.consolidated_count - 1 === 1 ? '' : 's'} into one call-out.`
                    : 'Raised on its own (not merged with other reports).'}
                </Field>
                <Field label="Dispatch">
                  {wo.dispatched_at
                    ? <>Sent to {orNR(wo.dispatched_to)} on {fmtDateTime(wo.dispatched_at)} · email {wo.email_status === 'sent' ? 'delivered' : wo.email_status === 'failed' ? 'failed to send' : orNR(wo.email_status)}.</>
                    : 'Not dispatched to the contractor yet.'}
                </Field>
                <Field label="Completion">
                  {wo.closed_at
                    ? <>Closed{wo.closed_by_name ? ` by ${wo.closed_by_name}` : ''} on {fmtDateTime(wo.closed_at)}.</>
                    : 'Open — the contractor has not closed this yet.'}
                </Field>
              </Stage>
            ) : a.escalation_status === 'dismissed' ? (
              <Stage label="Reviewed → dismissed" tone="neutral" icon={stageIcon(DoNotDisturbAltOutlinedIcon, 'neutral')}>
                <Typography sx={{ fontSize: 13.5, color: BRAND.text, lineHeight: 1.55, mb: 1 }}>
                  An officer reviewed the escalation and decided not to raise a contractor call-out.
                </Typography>
                <Field label="Reason">{orNR(a.escalation_note)}</Field>
                {fmtDateTime(a.escalation_decided_at) && <Field label="Decided">{fmtDateTime(a.escalation_decided_at)}</Field>}
              </Stage>
            ) : a.escalate_to_contractor ? (
              <Stage label="Awaiting approval" tone="pending" icon={stageIcon(HourglassEmptyRoundedIcon, 'pending')}>
                <Typography sx={{ fontSize: 13.5, color: BRAND.text, lineHeight: 1.55, mb: 1 }}>
                  Escalation recommended, but no officer has approved a work order yet. It's waiting in the Action Queue.
                </Typography>
                <Button component={RouterLink} to="/action-queue" size="small" variant="outlined" onClick={onClose}
                  sx={{ textTransform: 'none', color: BRAND.slate, borderColor: BRAND.border, '&:hover': { borderColor: BRAND.slate } }}>
                  Open Action Queue
                </Button>
              </Stage>
            ) : (
              <Stage label="No escalation" tone="neutral" icon={stageIcon(CheckCircleOutlineRoundedIcon, 'neutral')}>
                <Typography sx={{ fontSize: 13.5, color: BRAND.text, lineHeight: 1.55 }}>
                  The AI did not recommend a call-out, so no work order was raised. This report is not marked resolved — it simply needs no contractor.
                </Typography>
              </Stage>
            )}

            {/* FUTURE - explicitly unbuilt; not a status this system tracks */}
            <Stage label="Resident update" tone="future" last icon={stageIcon(ScheduleOutlinedIcon, 'future')}
              badge={<Box component="span" sx={{ fontSize: 10, fontWeight: 700, px: 0.7, py: '1px', borderRadius: '5px', bgcolor: BRAND.section, color: BRAND.textLight, border: `1px dashed ${BRAND.border}` }}>NOT BUILT</Box>}>
              <Typography sx={{ fontSize: 13, color: BRAND.textLight, lineHeight: 1.55 }}>
                Notifying the resident of the outcome isn't part of this module yet. It's shown here to mark where the tracked lifecycle ends — the system does not record whether a resident was told.
              </Typography>
            </Stage>
          </>
        ) : null}
      </Box>
    </Drawer>
  );
}
