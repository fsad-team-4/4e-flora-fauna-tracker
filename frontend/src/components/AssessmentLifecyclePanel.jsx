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
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined';
import { BRAND, INTENT, ON_SURFACE } from '../theme';
import http from '../http';
import { causeLabel, signLabel } from '../rodentLabels';

// Risk chip styling matches the RodentAssessment page + Action Queue (this surface
// already uses the red/amber/green risk scale; the map is the surface that doesn't).
const RISK_META = {
  low: { label: 'Low', bg: 'var(--em-ok-bg)', color: 'var(--em-ok-ink)' },
  medium: { label: 'Medium', bg: 'var(--em-warn-bg)', color: 'var(--em-warn-ink)' },
  high: { label: 'High', bg: 'var(--em-danger-bg)', color: 'var(--em-danger-ink)' },
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
// Scheme-aware: the old flat #ED9B00 was only 2.26:1 on a white card, under the
// 3:1 a coloured dot needs to register as a graphic at all.
// `ink` colours the icon + dot border; `tint` is the dot fill. Tints come from the
// INTENT bg tokens (the inks are var() strings, so an alpha suffix like `${c}1A`
// would produce invalid CSS); the future dot is "hollow" = the card colour.
const TONE = {
  done: { ink: ON_SURFACE.ok, tint: INTENT.success.bg },
  pending: { ink: 'var(--em-prio-medium)', tint: INTENT.warning.bg },
  neutral: { ink: 'var(--em-neutral-ink)', tint: INTENT.neutral.bg },
  future: { ink: BRAND.textLight, tint: BRAND.surface },
  // A bounced resident update is its own outcome. Rendering it as `pending` amber would
  // read as "on its way", which is the opposite of what happened.
  failed: { ink: ON_SURFACE.danger, tint: INTENT.danger.bg },
};
function Stage({ label, icon, tone = 'neutral', last = false, badge, tinted = false, children }) {
  const { ink: color, tint } = TONE[tone] || TONE.neutral;
  return (
    <Box sx={{ display: 'flex', gap: 1.5 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pt: 0.25 }}>
        <Box aria-hidden sx={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: tint, border: `1.5px ${tone === 'future' ? 'dashed' : 'solid'} ${tone === 'future' ? BRAND.border : color}` }}>
          {icon}
        </Box>
        {!last && <Box aria-hidden sx={{ flexGrow: 1, width: 2, bgcolor: BRAND.border, my: 0.5, minHeight: 12 }} />}
      </Box>
      <Box sx={{ pb: last ? 0 : 2.5, flexGrow: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.75, flexWrap: 'wrap', rowGap: 0.5 }}>
          {/* title is the scannable anchor, so it takes heading ink and weight;
              the dates/coords inside Field() stay muted */}
          <Typography sx={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', color: BRAND.heading }}>{label}</Typography>
          {badge}
        </Stack>
        {/* `tinted` marks machine-generated content: an info-tinted well with its
            own hairline, so AI output never reads as something a person wrote */}
        {tinted
          ? (
            <Box sx={{ p: 1.5, borderRadius: '10px', bgcolor: INTENT.info?.bg || 'var(--em-info-bg)', border: `1px solid ${INTENT.info?.border || 'var(--em-info-border)'}` }}>
              {children}
            </Box>
          )
          : children}
      </Box>
    </Box>
  );
}
function Field({ label, children }) {
  return (
    <Box sx={{ mb: 1 }}>
      <Typography sx={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', color: BRAND.textLight, mb: 0.1 }}>{label}</Typography>
      <Typography component="div" sx={{ fontSize: 13.5, color: BRAND.text, lineHeight: 1.55 }}>{children}</Typography>
    </Box>
  );
}
const stageIcon = (Comp, tone) => <Comp sx={{ fontSize: 16, color: (TONE[tone] || TONE.neutral).ink }} />;

/**
 * Assessment lifecycle side panel: "what happened to this report?" - reported ->
 * assessed -> escalation outcome, as a vertical stepper. The outcome shows the
 * work order if one exists; otherwise it names WHICH no-work-order state is true
 * (not recommended / awaiting approval / dismissed) - those must not look alike,
 * and none of them is "resolved". A final, clearly-unbuilt "resident update" node
 * marks where the tracked lifecycle actually ends.
 */
/**
 * The lifecycle's last step: was the resident actually told?
 *
 * FIVE OUTCOMES, ALL DISTINCT, because collapsing any two of them would make this panel
 * assert something the database does not say. The one that matters most is `failed`: a
 * bounced update is worse than none, because the system believed it had informed somebody,
 * and an officer reading "no update sent" would ring the resident while an officer reading
 * "update sent" would not. It gets danger tone and states the delivery error.
 *
 * `unreachable` and `not_applicable` are also kept apart. "Nobody is linked to this order"
 * is a data gap somebody may want to fix; "the order has not reached a resident-facing
 * stage" is simply correct and needs nothing. Both would have rendered as an empty step.
 *
 * A null `update` means the lookup itself failed - the route returns the assessment anyway
 * rather than 500ing on its last field - so it says the state is unknown instead of
 * guessing, which is the only answer that cannot be wrong.
 */
function ResidentUpdateStage({ update }) {
  if (!update) {
    return (
      <Stage label="Resident update" tone="future" last icon={stageIcon(ScheduleOutlinedIcon, 'future')}>
        <Typography sx={{ fontSize: 13, color: BRAND.textLight, lineHeight: 1.55 }}>
          Delivery history could not be read, so whether the resident was told is unknown.
        </Typography>
      </Stage>
    );
  }

  const when = iso => (iso
    ? new Date(iso).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null);

  if (update.status === 'sent') {
    return (
      <Stage
        label="Resident update"
        tone="done"
        last
        icon={stageIcon(MarkEmailReadOutlinedIcon, 'done')}
        badge={<StageBadge tone="done">SENT</StageBadge>}
      >
        <Typography sx={{ fontSize: 13.5, color: BRAND.text, lineHeight: 1.55 }}>
          {update.count > 1
            ? `${update.count} updates sent, the first on ${when(update.at)}.`
            : `Update sent on ${when(update.at)}.`}
          {update.recipients?.length ? ` To ${update.recipients.join(', ')}.` : ''}
        </Typography>
        {/* A partial failure is surfaced next to the success rather than hidden by it -
            two linked residents where one bounced is not "the residents were told". */}
        {update.failedCount > 0 && (
          <Typography sx={{ fontSize: 12.5, color: ON_SURFACE.danger, fontWeight: 600, mt: 0.5, lineHeight: 1.5 }}>
            {update.failedCount} other attempt{update.failedCount === 1 ? '' : 's'} to this report failed - check the Notification Log.
          </Typography>
        )}
      </Stage>
    );
  }

  if (update.status === 'failed') {
    return (
      <Stage
        label="Resident update"
        tone="failed"
        last
        icon={stageIcon(ErrorOutlineRoundedIcon, 'failed')}
        badge={<StageBadge tone="failed">NOT DELIVERED</StageBadge>}
      >
        <Typography sx={{ fontSize: 13.5, color: BRAND.text, lineHeight: 1.55 }}>
          An update was attempted on {when(update.at)} and did not arrive.
        </Typography>
        <Typography sx={{ fontSize: 12.5, color: BRAND.textLight, mt: 0.5, lineHeight: 1.5 }}>
          {update.reason} It can be resent from the Notification Log.
        </Typography>
      </Stage>
    );
  }

  if (update.status === 'unreachable') {
    return (
      <Stage
        label="Resident update"
        tone="neutral"
        last
        icon={stageIcon(PersonOffOutlinedIcon, 'neutral')}
        badge={<StageBadge tone="neutral">NO RECIPIENT</StageBadge>}
      >
        <Typography sx={{ fontSize: 13.5, color: BRAND.text, lineHeight: 1.55 }}>{update.reason}</Typography>
      </Stage>
    );
  }

  if (update.status === 'pending') {
    return (
      <Stage
        label="Resident update"
        tone="pending"
        last
        icon={stageIcon(ScheduleOutlinedIcon, 'pending')}
        badge={<StageBadge tone="pending">DUE</StageBadge>}
      >
        <Typography sx={{ fontSize: 13.5, color: BRAND.text, lineHeight: 1.55 }}>{update.reason}</Typography>
      </Stage>
    );
  }

  // not_applicable
  return (
    <Stage label="Resident update" tone="neutral" last icon={stageIcon(ScheduleOutlinedIcon, 'neutral')}>
      <Typography sx={{ fontSize: 13.5, color: BRAND.text, lineHeight: 1.55 }}>{update.reason}</Typography>
    </Stage>
  );
}

// Shared pill for the stage badges, so five outcomes cannot each invent their own.
function StageBadge({ tone, children }) {
  const { ink, tint } = TONE[tone] || TONE.neutral;
  return (
    <Box
      component="span"
      sx={{
        fontSize: 10, fontWeight: 800, letterSpacing: '0.4px',
        px: 0.7, py: '2px', borderRadius: '5px',
        bgcolor: tint, color: ink, border: `1px solid ${ink}`, whiteSpace: 'nowrap',
      }}
    >
      {children}
    </Box>
  );
}

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
  // Number(null) is 0 and Number.isFinite(0) is true, so a report filed WITHOUT a
  // position used to render "0.00000, 0.00000" plus a live "view on risk map" link
  // pointing at the null island. Absent coordinates must read as absent.
  const num = v => (v == null || v === '' ? NaN : Number(v));
  const lat = a ? num(a.gps_lat) : NaN;
  const lng = a ? num(a.gps_lng) : NaN;
  const hasLoc = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  const actions = (a?.immediate_actions || []).map(normalizeAction);
  const risk = a ? (RISK_META[a.risk_level] || { label: a.risk_level || 'Unknown', bg: BRAND.section, color: BRAND.text }) : null;

  return (
    <Drawer anchor="right" open={open} onClose={onClose}
      slotProps={{
        paper: { sx: { width: { xs: '100%', sm: 420 }, maxWidth: '100%', display: 'flex', flexDirection: 'column' } },
        // lighter scrim so the assessments table stays visible for comparison
        backdrop: { sx: { backgroundColor: 'rgba(16,24,40,0.24)' } },
      }}>
      <Box sx={{ p: 2.5, borderBottom: `1px solid ${BRAND.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, bgcolor: BRAND.surface, zIndex: 1 }}>
        <Typography component="h2" sx={{ fontSize: 16, fontWeight: 700, color: BRAND.heading }}>Report lifecycle</Typography>
        <IconButton onClick={onClose} aria-label="Close panel" sx={{ color: BRAND.textLight }}><CloseRoundedIcon /></IconButton>
      </Box>

      {/* flex column + scrolling middle, so the footer below can pin itself */}
      <Box sx={{ p: 2.5, overflowY: 'auto', flexGrow: 1, minHeight: 0 }}>
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
                  ? <>{lat.toFixed(5)}, {lng.toFixed(5)} · <Box component={RouterLink} to="/rodent-heatmap" onClick={onClose} sx={{ color: BRAND.accent, textDecoration: 'none', fontWeight: 600, '&:hover': { textDecoration: 'underline' } }}>View on risk map →</Box></>
                  : <NotRecorded />}
              </Field>
              <Field label="Officer's observation">{orNR(a.observations)}</Field>
            </Stage>

            {/* ASSESSED - wrapped in a tinted card so the AI's output is visibly
                distinct from the officer's own reported facts above it */}
            <Stage label="Assessed by AI" tone="done" icon={stageIcon(AutoAwesomeOutlinedIcon, 'done')} tinted>
              <Box sx={{ p: 1.75, borderRadius: '10px', bgcolor: BRAND.navySoft, border: `1px solid ${BRAND.border}` }}>
              <Box sx={{ mb: 1 }}>
                <Typography sx={{ fontSize: 11, color: BRAND.textLight, mb: 0.35 }}>Risk level</Typography>
                {a.risk_level
                  ? <Chip label={risk.label} size="small" sx={{ bgcolor: risk.bg, color: risk.color, fontWeight: 700, borderRadius: '6px' }} />
                  : <NotRecorded />}
              </Box>
              {/* causeLabel is a no-op on prose, which is what this field holds by
                  contract - it only catches a token from a fixture or an older row. */}
              <Field label="Likely cause">{orNR(causeLabel(a.likely_cause))}</Field>
              <Box sx={{ mb: 1 }}>
                <Typography sx={{ fontSize: 11, color: BRAND.textLight, mb: 0.35 }}>Signs identified</Typography>
                {a.signs_identified?.length
                  ? <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                      {a.signs_identified.map((s, i) => <Chip key={i} label={signLabel(s)} size="small" sx={{ bgcolor: BRAND.section, color: BRAND.text, borderRadius: '6px' }} />)}
                    </Stack>
                  : <NotRecorded />}
              </Box>
              <Field label="Escalation recommendation">
                {a.escalate_to_contractor
                  ? <>Recommended a contractor call-out{a.escalation_reason ? ` - ${a.escalation_reason}` : ''}.</>
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
              </Box>
            </Stage>

            {/* OUTCOME - the lifecycle answer */}
            {wo ? (
              <Stage
                label="Escalated → work order"
                tone={wo.status === 'closed' ? 'done' : 'pending'}
                icon={stageIcon(LocalShippingOutlinedIcon, wo.status === 'closed' ? 'done' : 'pending')}
                badge={<Chip label={wo.status === 'closed' ? 'Closed' : 'Open'} size="small" sx={{ height: 20, fontSize: 11, fontWeight: 700, borderRadius: '6px', bgcolor: wo.status === 'closed' ? 'var(--em-ok-bg)' : 'var(--em-warn-bg)', color: wo.status === 'closed' ? 'var(--em-ok-ink)' : 'var(--em-warn-ink)' }} />}
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
                <Typography sx={{ fontSize: 13.5, color: BRAND.text, lineHeight: 1.55 }}>
                  Escalation recommended, but no officer has approved a work order yet. It's waiting in the Action Queue.
                </Typography>
                {/* the button itself now lives in the sticky footer, so it stays
                    reachable however long this panel scrolls */}
              </Stage>
            ) : (
              <Stage label="No escalation" tone="neutral" icon={stageIcon(CheckCircleOutlineRoundedIcon, 'neutral')}>
                <Typography sx={{ fontSize: 13.5, color: BRAND.text, lineHeight: 1.55 }}>
                  The AI did not recommend a call-out, so no work order was raised. This report is not marked resolved — it simply needs no contractor.
                </Typography>
              </Stage>
            )}

            {/* RESIDENT UPDATE - now a reported outcome, not a "NOT BUILT" placeholder.
                What changed is the read path, not the feature: workOrderNotify.js has always
                sent the resident a message when the order reaches a resident-facing stage,
                and logged the true result. This panel simply never asked. See
                services/residentUpdateStatus.js - every branch below maps to a status that
                service returns, and none of them is inferred from the stage alone. */}
            <ResidentUpdateStage update={a.resident_update} />
          </>
        ) : null}
      </Box>

      {/* Sticky action bar: the queue is where an awaiting-approval report is acted
          on, so the way there must not depend on scrolling to the right stage. */}
      {a && (
        <Box
          sx={{
            p: 2, borderTop: `1px solid ${BRAND.border}`, bgcolor: BRAND.surface,
            position: 'sticky', bottom: 0, flexShrink: 0,
            boxShadow: '0 -2px 8px rgba(16,24,40,.06)',
            // gradient fade above the bar: signals there is more content scrolled
            // under it, which a hard border alone does not convey
            '&::before': {
              content: '""', position: 'absolute', left: 0, right: 0, top: -24, height: 24,
              pointerEvents: 'none',
              background: `linear-gradient(to top, ${BRAND.surface}, transparent)`,
            },
          }}
        >
          <Button
            component={RouterLink}
            to="/action-queue"
            onClick={onClose}
            fullWidth
            variant={a.escalate_to_contractor && !a.work_order && a.escalation_status !== 'dismissed' ? 'contained' : 'outlined'}
            sx={
              a.escalate_to_contractor && !a.work_order && a.escalation_status !== 'dismissed'
                ? { fontWeight: 700, bgcolor: BRAND.action, '&:hover': { bgcolor: BRAND.actionHover } }
                : { fontWeight: 600, color: BRAND.text, borderColor: BRAND.border, '&:hover': { borderColor: BRAND.slate } }
            }
          >
            Open Action Queue
          </Button>
        </Box>
      )}
    </Drawer>
  );
}
