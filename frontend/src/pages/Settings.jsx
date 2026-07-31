import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Card, CardContent, Typography, Stack, Button, Divider, Alert, Collapse, Chip,
  CircularProgress,
} from '@mui/material';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { BRAND } from '../theme';
import http from '../http';
import { useUser } from '../contexts/UserContext';
import AppearanceSetting from '../components/AppearanceSetting';

// Real destinations only - each of these is an existing, working admin surface.
const CONFIG_LINKS = [
  { to: '/alert-rules', label: 'Alert rules', blurb: 'Thresholds that trigger automated notifications.' },
  { to: '/notif-log', label: 'Notification log', blurb: 'Every alert the system has dispatched.' },
  { to: '/action-queue', label: 'Action queue', blurb: 'AI-flagged rodent risks awaiting approval.' },
  { to: '/prevention', label: 'Prevention scorecard', blurb: 'Call-outs avoided and measured savings.' },
];

// Read `exp` straight off the JWT - UserContext deliberately strips it from the
// decoded user, but it is real information worth surfacing to an admin.
function sessionExpiry() {
  try {
    const token = localStorage.getItem('accessToken');
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.exp ? new Date(payload.exp * 1000) : null;
  } catch {
    return null;
  }
}

function SectionCard({ icon: Icon, title, subtitle, children }) {
  return (
    <Card>
      <CardContent sx={{ p: 3 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Box
            aria-hidden
            sx={{
              width: 34, height: 34, borderRadius: '8px', bgcolor: BRAND.section,
              display: 'grid', placeItems: 'center', flexShrink: 0,
            }}
          >
            <Icon sx={{ fontSize: 19, color: BRAND.accent }} />
          </Box>
          <Typography component="h2" sx={{ fontSize: 17, fontWeight: 700, color: BRAND.heading }}>
            {title}
          </Typography>
        </Stack>
        {subtitle && (
          <Typography sx={{ fontSize: 13.5, color: BRAND.textLight, mt: 0.25, mb: 2, ml: 6.25 }}>
            {subtitle}
          </Typography>
        )}
        <Box sx={{ mt: subtitle ? 0 : 2 }}>{children}</Box>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, children }) {
  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{ justifyContent: 'space-between', alignItems: 'baseline', py: 1, flexWrap: 'wrap', rowGap: 0.5 }}
    >
      <Typography sx={{ fontSize: 13.5, color: BRAND.textLight }}>{label}</Typography>
      <Typography sx={{ fontSize: 13.5, color: BRAND.heading, fontWeight: 600, wordBreak: 'break-all', textAlign: 'right' }}>
        {children}
      </Typography>
    </Stack>
  );
}

/**
 * Estate settings - admin only (route-guarded in App.jsx as well, so this page is
 * never the sole gate).
 *
 * Every control here is backed by something real: the appearance picker writes a
 * local preference, the summary button hits the live trigger endpoint, and the
 * configuration links go to existing pages. Nothing is a placeholder switch.
 */
export default function Settings() {
  const { user } = useUser();
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const expiry = sessionExpiry();

  async function triggerSummary() {
    setSending(true);
    setResult(null);
    try {
      const { data } = await http.post('/api/dashboard/trigger-summary');
      setResult({ ok: true, ...data });
    } catch (e) {
      setResult({ ok: false, error: e.response?.data?.error || e.message });
    } finally {
      setSending(false);
    }
  }

  return (
    <Box component="main" sx={{ maxWidth: 760, mx: 'auto', py: 4 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
        <Typography component="h1" sx={{ fontSize: { xs: 24, md: 28 }, fontWeight: 800, color: BRAND.heading, letterSpacing: '-0.6px' }}>
          Estate Settings
        </Typography>
        <Chip label="Admin only" size="small" sx={{ bgcolor: BRAND.navySoft, color: BRAND.heading, fontWeight: 700, fontSize: 12 }} />
      </Stack>
      <Typography sx={{ fontSize: 14.5, color: BRAND.textLight, mt: 0.5, mb: 3 }}>
        Estate-wide configuration and administrative actions.
      </Typography>

      <Stack spacing={2.5}>
        <SectionCard
          icon={PaletteOutlinedIcon}
          title="Appearance"
          subtitle="Light or dark colour scheme, or follow your device setting."
        >
          <AppearanceSetting />
        </SectionCard>

        <SectionCard
          icon={MarkEmailReadOutlinedIcon}
          title="Weekly summary"
          subtitle="Send the estate summary email to all configured recipients now, outside the Monday schedule."
        >
          <Button variant="contained" onClick={triggerSummary} disabled={sending}>
            {sending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Send weekly summary now'}
          </Button>
          {result && (
            <Box sx={{ mt: 2 }} role="status" aria-live="polite">
              <Alert severity={result.ok ? 'success' : 'error'}>
                {result.ok ? (
                  <Box>
                    <Typography variant="body2" fontWeight={600}>
                      Sent to {result.recipientCount} recipient(s) · {result.generatedBy}
                    </Typography>
                    {result.preview && (
                      <>
                        <Button size="small" onClick={() => setShowPreview(p => !p)} sx={{ mt: 0.5, p: 0, color: BRAND.accent }}>
                          {showPreview ? 'Hide preview' : 'Show preview'}
                        </Button>
                        <Collapse in={showPreview}>
                          <Box
                            component="pre"
                            sx={{
                              mt: 1.5, p: 2, fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                              bgcolor: BRAND.section, borderRadius: '8px', fontFamily: 'inherit', color: BRAND.text,
                            }}
                          >
                            {result.preview}
                          </Box>
                        </Collapse>
                      </>
                    )}
                  </Box>
                ) : result.error}
              </Alert>
            </Box>
          )}
        </SectionCard>

        <SectionCard
          icon={TuneRoundedIcon}
          title="Configuration"
          subtitle="Alerting and operational settings live on their own pages."
        >
          <Stack divider={<Divider flexItem />}>
            {CONFIG_LINKS.map(l => (
              <Stack
                key={l.to}
                direction="row"
                spacing={2}
                sx={{ py: 1.5, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 1 }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 14.5, fontWeight: 600, color: BRAND.heading }}>{l.label}</Typography>
                  <Typography sx={{ fontSize: 13, color: BRAND.textLight }}>{l.blurb}</Typography>
                </Box>
                <Button
                  component={RouterLink}
                  to={l.to}
                  variant="outlined"
                  size="small"
                  endIcon={<ArrowForwardRoundedIcon sx={{ fontSize: 16 }} />}
                  sx={{ flexShrink: 0, borderColor: BRAND.border, color: BRAND.text, '&:hover': { borderColor: BRAND.textLight } }}
                >
                  Open
                </Button>
              </Stack>
            ))}
          </Stack>
        </SectionCard>

        <SectionCard icon={InfoOutlinedIcon} title="System">
          <Stack divider={<Divider flexItem />}>
            <InfoRow label="Signed in as">{user?.name} ({user?.role})</InfoRow>
            <InfoRow label="API endpoint">{import.meta.env.VITE_API_URL || 'same origin'}</InfoRow>
            <InfoRow label="Session expires">
              {expiry ? expiry.toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'unknown'}
            </InfoRow>
          </Stack>
          <Typography sx={{ fontSize: 12.5, color: BRAND.textLight, mt: 1.5 }}>
            This is a proof-of-concept build. Estate data comes from the seeded demo dataset.
          </Typography>
        </SectionCard>
      </Stack>
    </Box>
  );
}
