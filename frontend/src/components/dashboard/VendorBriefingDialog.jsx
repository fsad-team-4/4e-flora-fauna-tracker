import { useEffect, useState } from 'react';
import {
  Drawer, Box, Stack, Typography,
  TextField, Button, Chip, Alert, CircularProgress, IconButton, Tooltip,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import { BRAND, INTENT } from '../../theme';
import http from '../../http';
import { useThemeMode } from '../../contexts/ThemeModeContext';

/**
 * Vendor briefing review panel.
 *
 * HUMAN IN THE LOOP - the whole point of this component.
 * The AI drafts; a person reads, edits and decides. Nothing is dispatched on
 * open, on draft, or on any timer. The only things that leave this dialog are
 * what the officer explicitly clicks: send the text they approved, or raise a
 * work order (which is admin-only, because it commits money).
 *
 * The textarea holds the EDITED text and that exact string is what gets sent -
 * the server never regenerates on send, so what was reviewed is what goes out.
 *
 * Three draft states, deliberately distinguishable:
 *   AI draft        - a model wrote it
 *   Factual summary - no API key configured; a template, labelled as one
 *   AI unavailable  - the call failed. No text is supplied. The officer writes
 *                     it. We do not hand over a template dressed as an AI draft.
 */
export default function VendorBriefingDialog({ open, onClose, assessmentIds, block, onRaiseWorkOrder, canRaise }) {
  // the AI banner's gradient needs literal colours per scheme, so it reads the
  // resolved mode the same way the rest of the map surface does
  const { resolvedMode: mode } = useThemeMode();
  // keyed off the request that is in flight, so no synchronous reset is needed
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [meta, setMeta] = useState(null);       // { stubbed, risk_level, feeding }
  const [aiError, setAiError] = useState(null); // AI failed -> officer writes it
  const [quotaHit, setQuotaHit] = useState(false); // 429: resets daily, worth saying
  const [sendState, setSendState] = useState(null); // { delivered, status, sent_at, error_reason }
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || !assessmentIds?.length) return undefined;
    let alive = true;
    // State is set from the request callbacks, not synchronously in the effect
    // body, which would trigger a cascading render.
    http.post('/api/work-orders/briefing/draft', { assessment_ids: assessmentIds })
      .then(r => {
        if (!alive) return;
        setText(r.data.draft || '');
        setMeta(r.data);
        setAiError(null);
        setQuotaHit(false);
        setSendState(null);
        setLoading(false);
      })
      .catch(e => {
        if (!alive) return;
        const d = e.response?.data;
        // A failed AI call is reported, not papered over with a template.
        setAiError(d?.error || 'Could not reach the AI service.');
        setQuotaHit(Boolean(d?.quota_exhausted));
        setMeta(d?.context ? { ...d.context, ai_failed: true } : { ai_failed: true });
        setText('');
        setSendState(null);
        setLoading(false);
      });
    return () => { alive = false; };
  }, [open, assessmentIds]);

  async function send() {
    setSending(true);
    try {
      const { data } = await http.post('/api/work-orders/briefing/send', {
        body: text,
        block: block || null,
        risk_level: meta?.risk_level || null,
        assessment_ids: assessmentIds,
      });
      setSendState(data);
    } catch (e) {
      setSendState({ delivered: false, status: 'failed', error_reason: e.response?.data?.error || 'send failed' });
    } finally {
      setSending(false);
    }
  }

  const tooShort = text.trim().length < 20;

  return (
    /* A RIGHT-DOCKED DRAWER, not a centre-screen modal.
       The briefing describes one specific cluster, and a centred dialog covered
       the very thing it was describing - an officer could not check "is this
       really Block 128's cluster?" without dismissing the draft. Docked right,
       the map stays visible beside it.
       It deliberately still dims and blurs the page: sending text to a paid
       contractor is a considered act, and the drawer must not make it feel like
       an incidental side panel. */
    <Drawer
      anchor="right"
      open={open}
      onClose={sending ? undefined : onClose}
      slotProps={{
        paper: {
          sx: {
            width: { xs: '100%', sm: 520, lg: 580 },
            // overlays the map-controls sidebar rather than fighting it for the
            // same edge - two docked right panels would stack awkwardly
            bgcolor: BRAND.surface,
            boxShadow: '-16px 0 48px rgba(16,24,40,.24)',
            display: 'flex', flexDirection: 'column',
          },
        },
        backdrop: { sx: { backdropFilter: 'blur(4px)', bgcolor: 'rgba(16,24,40,.45)' } },
      }}
    >
      {/* AI-framed header: a gradient hairline along the top edge plus the sparkle
          mark, so the panel announces what wrote the draft before the text is read. */}
      <Box sx={{ height: 3, background: `linear-gradient(90deg, ${BRAND.action}, #7C3AED 45%, ${BRAND.accent})`, flexShrink: 0 }} aria-hidden />
      <Box sx={{ px: 3, pt: 2.25, pb: 1.75, borderBottom: `1px solid ${BRAND.border}`, flexShrink: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Box
            aria-hidden
            sx={{
              width: 30, height: 30, borderRadius: '8px', flexShrink: 0,
              display: 'grid', placeItems: 'center', color: '#fff',
              background: `linear-gradient(135deg, ${BRAND.action}, #7C3AED)`,
            }}
          >
            <AutoAwesomeOutlinedIcon sx={{ fontSize: 17 }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h2" sx={{ fontSize: 17, fontWeight: 800, color: BRAND.heading, lineHeight: 1.2 }}>
              Vendor briefing
            </Typography>
            <Typography sx={{ fontSize: 12, color: BRAND.textLight }}>AI-drafted · you review and send</Typography>
          </Box>
          {block && <Chip label={block} size="small" sx={{ height: 22, fontSize: 12, bgcolor: BRAND.section, color: BRAND.text, flexShrink: 0 }} />}
          <Box sx={{ flexGrow: 1 }} />
          <IconButton onClick={onClose} disabled={sending} aria-label="Close" sx={{ color: BRAND.textLight }}>
            <CloseRoundedIcon />
          </IconButton>
        </Stack>
      </Box>

      <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 3, py: 2.5 }}>
        {loading ? (
          <Stack spacing={1.5} sx={{ alignItems: 'center', py: 5 }}>
            <CircularProgress size={24} sx={{ color: BRAND.accent }} />
            <Typography sx={{ fontSize: 13.5, color: BRAND.textLight }}>Drafting from the reports at this location…</Typography>
          </Stack>
        ) : (
          <>
            {/* Provenance of the words in the box. Never ambiguous. */}
            {aiError ? (
              <Alert severity="warning" sx={{ mb: 2 }}>
                <strong>AI unavailable - write the briefing yourself.</strong> {aiError} No draft has been
                generated, and nothing has been substituted for one.
                {quotaHit && ' The daily allowance resets at midnight Pacific; the briefing you write here still sends normally.'}
              </Alert>
            ) : meta?.stubbed ? (
              <Alert severity="info" sx={{ mb: 2 }}>
                <strong>Factual summary, not an AI draft.</strong> No AI service is configured, so this is a
                plain restatement of the recorded reports. Edit it before sending.
              </Alert>
            ) : (
              // Gradient panel rather than a stock info Alert: machine-written text
              // must not look like a system notice. The indigo-to-pale-blue wash and
              // the sparkle mark say "a model wrote this" at a glance, while the
              // wording keeps the responsibility with the person sending it.
              <Stack
                direction="row"
                spacing={1.25}
                sx={{
                  mb: 2, p: 1.5, borderRadius: '10px', alignItems: 'flex-start',
                  background: mode === 'dark'
                    ? 'linear-gradient(120deg, rgba(124,58,237,.20), rgba(29,78,216,.16))'
                    : 'linear-gradient(120deg, #EDE9FE, #E8F1FB)',
                  border: `1px solid ${mode === 'dark' ? 'rgba(147,120,255,.32)' : '#D9D6FE'}`,
                }}
              >
                <AutoAwesomeOutlinedIcon sx={{ fontSize: 18, color: mode === 'dark' ? '#C4B5FD' : '#5B21B6', flexShrink: 0, mt: '1px' }} />
                <Typography sx={{ fontSize: 13, lineHeight: 1.55, color: BRAND.heading }}>
                  <Box component="strong" sx={{ fontWeight: 800 }}>AI draft - review before sending.</Box>{' '}
                  Generated from the reports at this location. Check it for accuracy; you are the one sending it.
                </Typography>
              </Stack>
            )}

            {/* Co-occurrence, stated as co-occurrence */}
            {meta?.feeding?.sightings > 0 && (
              <Box sx={{ mb: 2, p: 1.25, borderRadius: '8px', bgcolor: INTENT.warning.bg, border: `1px solid ${INTENT.warning.border}` }}>
                <Typography sx={{ fontSize: 12.5, color: INTENT.warning.ink, lineHeight: 1.5 }}>
                  {meta.feeding.sightings} feeding sighting{meta.feeding.sightings === 1 ? '' : 's'} recorded at this
                  block in the same period{meta.feeding.species ? ` (${meta.feeding.species})` : ''}. Co-occurrence
                  worth investigating - not an established cause.
                </Typography>
              </Box>
            )}

            <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.75 }}>
              Briefing to the contractor {aiError ? '(write below)' : '(editable)'}
            </Typography>
            <TextField
              value={text}
              onChange={e => setText(e.target.value)}
              multiline
              minRows={12}
              fullWidth
              disabled={sending || Boolean(sendState?.delivered)}
              placeholder={aiError ? 'Describe the site, what was observed, and the severity…' : ''}
              slotProps={{ htmlInput: { 'aria-label': 'Vendor briefing text' } }}
              // Prose, not code: a monospace face made a human-readable briefing
              // look like a config file. Generous leading and a focus ring make it
              // read as a document you are editing.
              sx={{
                '& .MuiInputBase-root': { bgcolor: BRAND.surface, borderRadius: '10px', p: 1.5 },
                '& .MuiInputBase-input': { fontSize: 14, lineHeight: 1.75, color: BRAND.heading },
                '& .MuiOutlinedInput-notchedOutline': { borderColor: BRAND.border },
                '&:focus-within .MuiOutlinedInput-notchedOutline': { borderColor: BRAND.action, borderWidth: 2 },
              }}
            />

            {/* Outcome reflects the real send result, never an assumption */}
            {sendState && (
              <Alert severity={sendState.delivered ? 'success' : 'error'} sx={{ mt: 2 }}>
                {sendState.delivered
                  ? `Sent to ${sendState.recipient} at ${new Date(sendState.sent_at).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })}. Logged in the notification log.`
                  : `Not sent - ${sendState.error_reason || 'the send failed'}. Logged as failed; you can resend from the notification log.`}
              </Alert>
            )}
          </>
        )}
      </Box>

      {/* Caption on its own line, buttons on theirs. Sharing one row worked at
          modal width but not in a 520px drawer - the caption took flex space and
          wrapped "Raise work order" onto three lines. */}
      <Box
        sx={{
          px: 3, py: 2.25, flexShrink: 0,
          borderTop: `1px solid ${BRAND.border}`, bgcolor: BRAND.surface,
          boxShadow: '0 -6px 20px rgba(16,24,40,.08)',
        }}
      >
        <Typography sx={{ fontSize: 11.5, color: BRAND.textLight, mb: 1.25 }}>
          Nothing is sent until you press send.
        </Typography>
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', alignItems: 'center' }}>
        {/* Ghost, so the three actions read as increasing commitment
            left to right: ghost -> outline -> solid. */}
        <Button
          onClick={onClose}
          disabled={sending}
          sx={{
            textTransform: 'none', fontWeight: 600, borderRadius: '8px',
            color: BRAND.textLight,
            '&:hover': { bgcolor: BRAND.section, color: BRAND.heading },
          }}
        >
          {sendState?.delivered ? 'Close' : 'Cancel'}
        </Button>

        {/* Raising the work order commits money, so it stays admin-only - the
            server enforces it too; this only hides an action that would 403. */}
        {canRaise && !sendState?.delivered && (
          <Tooltip arrow title="Raise a work order pre-filled with these reports">
            <span>
              {/* Secondary, and visibly so: it was a bare text button sitting
                  next to the filled primary, which is a misclick waiting to
                  happen when one of the two commits money. */}
              <Button
                variant="outlined"
                onClick={() => onRaiseWorkOrder?.(assessmentIds, block)}
                disabled={sending || loading}
                startIcon={<BuildOutlinedIcon />}
                sx={{
                  textTransform: 'none', fontWeight: 700, borderRadius: '8px', whiteSpace: 'nowrap',
                  color: BRAND.text, borderColor: BRAND.border,
                  '&:hover': { borderColor: BRAND.textLight, bgcolor: BRAND.section },
                }}
              >
                Raise work order
              </Button>
            </span>
          </Tooltip>
        )}

        <Button
          variant="contained"
          onClick={send}
          disabled={sending || loading || tooShort || Boolean(sendState?.delivered)}
          startIcon={sending ? <CircularProgress size={15} sx={{ color: '#fff' }} /> : <SendRoundedIcon />}
          sx={{
            textTransform: 'none', fontWeight: 800, fontSize: 14.5, borderRadius: '8px', whiteSpace: 'nowrap',
            px: 2.5, py: 1.1, color: '#fff', bgcolor: BRAND.action,
            boxShadow: '0 6px 18px rgba(29,78,216,.35)',
            '&:hover': { bgcolor: BRAND.actionHover, boxShadow: '0 8px 22px rgba(29,78,216,.45)' },
          }}
        >
          {sending ? 'Sending…' : 'Send to contractor'}
        </Button>
        </Stack>
      </Box>
    </Drawer>
  );
}
