import { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Grid, Button, Alert, Collapse, Stack, IconButton, Skeleton, Card, CardContent,
} from '@mui/material';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import LocalFloristOutlinedIcon from '@mui/icons-material/LocalFloristOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { useUser } from '../contexts/UserContext';
import { useDashboardMetrics } from '../hooks/useDashboardMetrics';
import { BRAND, HEALTH_META } from '../theme';
import http from '../http';
import KpiCard from '../components/dashboard/KpiCard';
import ActivityChart from '../components/dashboard/ActivityChart';
import CategoryDonut from '../components/dashboard/CategoryDonut';
import BlocksRanked from '../components/dashboard/BlocksRanked';

function buildKpis(m) {
  const t = m?.trends || {};
  return [
    {
      label: 'Open Cases', value: m?.openCases ?? 0, color: '#8A5200', tint: '#FFF4E5',
      icon: <FolderOpenOutlinedIcon />,
      trend: m ? { delta: t.open_cases?.sinceLastWeek ?? null, improve: 'down' } : null,
    },
    {
      label: 'Critical Flora', value: m?.criticalFlora ?? 0, color: BRAND.primary, tint: '#FDECEA',
      icon: <LocalFloristOutlinedIcon />,
      trend: m ? { delta: t.critical_flora?.sinceLastWeek ?? null, improve: 'down' } : null,
    },
    {
      label: 'Active Hotspots', value: m?.activeHotspots ?? 0, color: '#1565C0', tint: '#E8F1FB',
      icon: <PlaceOutlinedIcon />,
      trend: m ? { delta: t.active_hotspots?.sinceLastWeek ?? null, improve: 'down' } : null,
    },
    {
      label: 'Alerts Sent (7d)', value: m?.notificationsLast7Days ?? 0, color: '#2E7D32', tint: '#E7F4E8',
      icon: <MarkEmailReadOutlinedIcon />,
      // neutral: more alerts is not inherently good or bad
      trend: m ? { delta: (m.notificationsLast7Days ?? 0) - (m.notificationsPrev7Days ?? 0), improve: null } : null,
      trendLabel: 'vs prev 7 days',
    },
  ];
}

// "12s ago" style relative label that ticks so the live indicator feels current.
// The clock read happens inside the effect (not during render) so it stays pure.
function useSyncedAgo(updatedAt) {
  const [label, setLabel] = useState(null);
  useEffect(() => {
    if (!updatedAt) return undefined;
    const tick = () => {
      const secs = Math.max(0, Math.round((Date.now() - updatedAt.getTime()) / 1000));
      setLabel(secs < 60 ? `${secs}s ago` : secs < 3600 ? `${Math.floor(secs / 60)}m ago` : `${Math.floor(secs / 3600)}h ago`);
    };
    const first = setTimeout(tick, 0); // async so we don't setState in the effect body
    const id = setInterval(tick, 5000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [updatedAt]);
  return label;
}

function HealthChip({ status }) {
  const meta = HEALTH_META[status];
  if (!meta) return null;
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', bgcolor: meta.bg, color: meta.color, borderRadius: '999px', px: 1.25, py: 0.4 }}>
      <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: meta.dot, flexShrink: 0 }} />
      <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>{meta.label}</Typography>
    </Stack>
  );
}

export default function Dashboard() {
  const { user } = useUser();
  const { metrics, loading, error, updatedAt, reload } = useDashboardMetrics();
  const syncedAgo = useSyncedAgo(updatedAt);

  const [summaryResult, setSummaryResult] = useState(null);
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const kpis = useMemo(() => buildKpis(metrics), [metrics]);

  async function triggerSummary() {
    setSending(true);
    setSummaryResult(null);
    try {
      const { data } = await http.post('/api/dashboard/trigger-summary');
      setSummaryResult({ ok: true, ...data });
      reload();
    } catch (e) {
      setSummaryResult({ ok: false, error: e.response?.data?.error || e.message });
    } finally {
      setSending(false);
    }
  }

  // Hard error only when we have nothing to show; background poll failures keep stale data.
  if (error && !metrics) {
    return (
      <Box sx={{ maxWidth: 640, mx: 'auto', px: 3, py: 8, textAlign: 'center' }}>
        <Alert
          severity="error"
          action={<Button color="inherit" size="small" onClick={reload}>Retry</Button>}
          sx={{ justifyContent: 'center' }}
        >
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <Box component="main" sx={{ width: '100%', px: { xs: 0, md: 1 }, py: 4 }} aria-busy={loading}>
      {/* header */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, mb: 4 }}
      >
        <Box>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="h4" component="h1" sx={{ color: BRAND.heading }}>
              Command Centre
            </Typography>
            {metrics?.estateHealth?.status && <HealthChip status={metrics.estateHealth.status} />}
          </Stack>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.75 }}>
            <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#0ca30c', boxShadow: '0 0 0 3px rgba(12,163,12,.18)', flexShrink: 0 }} />
            <Typography variant="body2" sx={{ color: BRAND.textLight }} aria-live="polite">
              Live estate feed{syncedAgo && ` · synced ${syncedAgo}`}
            </Typography>
            <IconButton
              onClick={reload}
              disabled={loading}
              size="small"
              aria-label="Refresh metrics"
              sx={{ color: BRAND.textLight, '&:hover': { color: BRAND.primary } }}
            >
              <RefreshRoundedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Stack>
        </Box>
        {user?.role === 'admin' && (
          <Button
            variant="contained"
            onClick={triggerSummary}
            disabled={sending}
            startIcon={<EmailOutlinedIcon />}
            sx={{ py: 1.25, fontSize: 15, whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {sending ? 'Sending…' : 'Send Weekly Summary'}
          </Button>
        )}
      </Stack>

      {/* result of the manual weekly-summary trigger */}
      <Box role="status" aria-live="polite">
        {summaryResult && (
          <Alert severity={summaryResult.ok ? 'success' : 'error'} sx={{ mb: 3, borderRadius: '10px' }}>
            {summaryResult.ok ? (
              <Box>
                <Typography variant="body2" fontWeight={600}>
                  Summary sent to {summaryResult.recipientCount} recipient(s) · generated by {summaryResult.generatedBy}
                </Typography>
                <Button size="small" onClick={() => setShowPreview(p => !p)} sx={{ mt: 0.5, p: 0, color: BRAND.primary }}>
                  {showPreview ? 'Hide preview' : 'Show preview'}
                </Button>
                <Collapse in={showPreview}>
                  <Box component="pre" sx={{ mt: 1.5, p: 2, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', bgcolor: 'rgba(255,255,255,0.6)', borderRadius: '8px', fontFamily: 'inherit', color: BRAND.text }}>
                    {summaryResult.preview}
                  </Box>
                </Collapse>
              </Box>
            ) : summaryResult.error}
          </Alert>
        )}
      </Box>

      {/* KPI cards */}
      <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
        {kpis.map(kpi => (
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={kpi.label}>
            <KpiCard {...kpi} loading={loading} />
          </Grid>
        ))}
      </Grid>

      {loading ? (
        <>
          <Card sx={{ mb: 2.5 }}>
            <CardContent sx={{ p: 3 }}>
              <Skeleton variant="text" width={180} height={28} />
              <Skeleton variant="text" width={260} sx={{ mb: 2 }} />
              <Skeleton variant="rounded" height={320} />
            </CardContent>
          </Card>
          <Grid container spacing={2.5}>
            {[7, 5].map(cols => (
              <Grid size={{ xs: 12, md: cols }} key={cols}>
                <Card sx={{ height: '100%' }}>
                  <CardContent sx={{ p: 3 }}>
                    <Skeleton variant="text" width={160} height={28} />
                    <Skeleton variant="text" width={220} sx={{ mb: 2 }} />
                    <Skeleton variant="rounded" height={200} />
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </>
      ) : (
        <>
          <ActivityChart history={metrics.history} />
          <Grid container spacing={2.5}>
            <Grid size={{ xs: 12, md: 7 }}>
              <CategoryDonut casesByCategory={metrics.casesByCategory} />
            </Grid>
            <Grid size={{ xs: 12, md: 5 }}>
              <BlocksRanked sightingsByBlock={metrics.sightingsByBlock} />
            </Grid>
          </Grid>
        </>
      )}
    </Box>
  );
}
