import { useEffect, useState } from 'react';
import {
  Box, Typography, Card, CardContent, Stack, Chip, CircularProgress, Alert,
  IconButton, Tooltip, Table, TableHead, TableRow, TableCell, TableBody, Paper, Button,
} from '@mui/material';
import { LineChart, Line, XAxis, Tooltip as RTooltip, ResponsiveContainer } from 'recharts';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import ArrowRightAltRoundedIcon from '@mui/icons-material/ArrowRightAltRounded';
import { BRAND, TREND, CHART } from '../theme';
import http from '../http';

const pct = n => (n == null ? '—' : `${Math.round(n * 100)}%`);
const money = n => `S$${(n || 0).toLocaleString('en-SG')}`;
const shortDate = iso => new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });

const OUTCOME_META = {
  prevented: { label: 'Prevented', bg: '#E7F4E8', color: '#1E6023' },
  recurred: { label: 'Recurred', bg: '#FDECEA', color: '#B3261E' },
  monitoring: { label: 'Monitoring', bg: '#FFF4E5', color: '#8A5200' },
  unmeasurable: { label: 'No block', bg: BRAND.section, color: BRAND.textLight },
};

// Impact-completion ring: closed vs total work orders, as a lightweight SVG donut
// (matches the deck's completion gauge without pulling in a chart lib for one number).
function Donut({ value, size = 132, stroke = 14, color = BRAND.primary }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = value == null ? 0 : Math.max(0, Math.min(1, value));
  return (
    <Box sx={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={BRAND.section} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${c * frac} ${c}`} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
        <Typography sx={{ fontSize: 26, fontWeight: 800, color: BRAND.heading }}>{pct(value)}</Typography>
      </Box>
    </Box>
  );
}

// The hero metric: how much repeat rodent activity fell after interventions.
function HeadlineReduction({ value }) {
  const known = value != null;
  const improved = known && value > 0; // reports fell -> good
  const color = !known ? BRAND.textLight : improved ? TREND.good : value < 0 ? TREND.bad : BRAND.textLight;
  const Icon = improved ? TrendingDownRoundedIcon : TrendingUpRoundedIcon;
  return (
    <Card sx={{ borderRadius: '14px', border: `1px solid ${BRAND.border}`, bgcolor: improved ? '#F2FAF3' : '#fff' }}>
      <CardContent sx={{ p: 3 }}>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Typography variant="overline" sx={{ color: BRAND.textLight, fontWeight: 700, letterSpacing: '0.8px' }}>
            Repeat-risk reduction
          </Typography>
          <Tooltip arrow title="Rodent reports at each block in the 14 days after an approved work order, compared with the 14 days before. Higher means recurrence fell.">
            <HelpOutlineRoundedIcon sx={{ fontSize: 14, color: BRAND.textLight, cursor: 'help' }} />
          </Tooltip>
        </Stack>
        {known ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', mt: 0.5 }}>
            {known && value !== 0 && <Icon sx={{ color, fontSize: 34, alignSelf: 'center' }} />}
            <Typography sx={{ fontSize: 56, fontWeight: 800, lineHeight: 1, color, letterSpacing: '-2px' }}>
              {pct(Math.abs(value))}
            </Typography>
            <Typography sx={{ color: BRAND.textLight, fontSize: 16, fontWeight: 600 }}>
              {improved ? 'fewer repeat reports' : value < 0 ? 'more reports' : 'no change'}
            </Typography>
          </Stack>
        ) : (
          <Typography sx={{ fontSize: 30, fontWeight: 800, color: BRAND.textLight, mt: 1 }}>Not enough data yet</Typography>
        )}
      </CardContent>
    </Card>
  );
}

function StatTile({ label, value, sub, tip }) {
  return (
    <Box sx={{ flex: 1, minWidth: 150, p: 2, bgcolor: BRAND.surface, border: `1px solid ${BRAND.border}`, borderRadius: '12px' }}>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
        <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</Typography>
        {tip && (
          <Tooltip arrow title={tip}>
            <HelpOutlineRoundedIcon sx={{ fontSize: 13, color: BRAND.textLight, cursor: 'help' }} />
          </Tooltip>
        )}
      </Stack>
      <Typography sx={{ fontSize: 30, fontWeight: 800, color: BRAND.heading, lineHeight: 1.1, mt: 0.25 }}>{value}</Typography>
      {sub && <Typography sx={{ fontSize: 12, color: BRAND.textLight }}>{sub}</Typography>}
    </Box>
  );
}

function TrendChart({ trend }) {
  const data = (trend || []).map(w => ({ label: shortDate(w.weekStart), reports: w.reports }));
  const total = data.reduce((s, d) => s + d.reports, 0);
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 3 }}>
        <Typography component="h2" variant="h6" fontWeight={700} sx={{ color: BRAND.heading }}>Rodent reports per week</Typography>
        <Typography variant="body2" sx={{ color: BRAND.textLight, mb: 2 }}>
          Estate-wide volume over the last {data.length} weeks
        </Typography>
        {total === 0 ? (
          <Typography variant="body2" sx={{ color: BRAND.textLight, py: 6, textAlign: 'center' }}>No rodent reports in this period.</Typography>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: CHART.axis }} axisLine={{ stroke: BRAND.border }} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
              <RTooltip
                cursor={{ stroke: BRAND.border }}
                contentStyle={{ borderRadius: 10, border: `1px solid ${BRAND.border}`, fontSize: 13 }}
                formatter={v => [`${v} report${v === 1 ? '' : 's'}`, 'Reports']}
              />
              <Line type="monotone" dataKey="reports" stroke="#2E67B5" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export default function PreventionScorecard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await http.get('/api/scorecard');
      setData(res.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load the prevention scorecard');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const s = data?.summary;

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
        <Typography variant="h5" component="h1" fontWeight={700} sx={{ color: BRAND.heading }}>Prevention Scorecard</Typography>
        <IconButton onClick={load} disabled={loading} aria-label="Refresh" sx={{ color: BRAND.textLight, '&:hover': { color: BRAND.accent } }}>
          <RefreshRoundedIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Stack>
      <Typography variant="body2" sx={{ color: BRAND.textLight, mb: 2.5 }}>
        Did our interventions actually work? Each approved work order is measured on whether rodent reports at that block dropped in the {data?.params?.windowDays ?? 14} days after action - outcomes, not activity volume.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={load}>Retry</Button>}>{error}</Alert>}

      {loading ? (
        <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress sx={{ color: BRAND.accent }} /></Box>
      ) : !s ? null : (
        <>
          {/* headline row */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.4fr 1fr 1fr 1fr' }, gap: 2, mb: 2.5 }}>
            <HeadlineReduction value={s.repeat_risk_reduction} />
            <StatTile label="Prevention rate" value={pct(s.prevention_rate)} sub={`${s.prevented}/${s.measured} held, no repeat`} tip="Share of measured interventions with zero repeat reports in the follow-up window." />
            <StatTile label="Avg time to close" value={s.avg_time_to_close_days == null ? '—' : `${s.avg_time_to_close_days}d`} sub={`${s.closed_work_orders} closed`} />
            <StatTile label="Saved by consolidating" value={money(s.est_savings)} sub={`${s.call_outs_avoided} call-out${s.call_outs_avoided === 1 ? '' : 's'} avoided`} tip="Cumulative saving from merging multiple complaints into single call-outs in the Action Queue." />
          </Box>

          {/* completion + trend */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 2fr' }, gap: 2.5, mb: 3 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent sx={{ p: 3, textAlign: 'center' }}>
                <Typography component="h2" variant="h6" fontWeight={700} sx={{ color: BRAND.heading, mb: 0.5 }}>Impact completion</Typography>
                <Typography variant="body2" sx={{ color: BRAND.textLight, mb: 2 }}>Work orders closed off</Typography>
                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                  <Donut value={s.impact_completion} />
                </Box>
                <Typography sx={{ fontSize: 13, color: BRAND.textLight, mt: 2 }}>
                  {s.closed_work_orders} of {s.total_work_orders} closed · {s.open_work_orders} open
                  {s.monitoring > 0 && ` · ${s.monitoring} still monitoring`}
                </Typography>
              </CardContent>
            </Card>
            <TrendChart trend={data.trend} />
          </Box>

          {/* per-intervention transparency */}
          <Typography variant="h6" fontWeight={600} sx={{ color: BRAND.heading, mb: 1.5 }}>Interventions</Typography>
          {data.interventions.length === 0 ? (
            <Card sx={{ border: `1px dashed ${BRAND.border}`, borderRadius: '10px', bgcolor: BRAND.section }}>
              <CardContent sx={{ py: 5, textAlign: 'center' }}>
                <Typography sx={{ color: BRAND.textLight }}>
                  No work orders raised yet. Approve escalations in the Action Queue and their prevention outcomes will appear here.
                </Typography>
              </CardContent>
            </Card>
          ) : (
            <Paper variant="outlined" sx={{ border: `1px solid ${BRAND.border}`, borderRadius: '10px', overflow: 'hidden' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: BRAND.section }}>
                    <TableCell sx={{ fontWeight: 600, color: BRAND.textLight }}>Block</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: BRAND.textLight }}>Approved</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600, color: BRAND.textLight }}>Reports before → after</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600, color: BRAND.textLight }}>Outcome</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600, color: BRAND.textLight }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.interventions.map((i, idx) => {
                    const m = OUTCOME_META[i.outcome] || OUTCOME_META.monitoring;
                    return (
                      <TableRow key={i.id} sx={{ bgcolor: idx % 2 ? BRAND.section : 'inherit' }}>
                        <TableCell sx={{ color: BRAND.heading, fontWeight: 600, whiteSpace: 'nowrap' }}>{i.block || '(No block)'}</TableCell>
                        <TableCell sx={{ color: BRAND.text, whiteSpace: 'nowrap' }}>{shortDate(i.date)}</TableCell>
                        <TableCell align="center">
                          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', justifyContent: 'center', color: BRAND.text }}>
                            <Box component="span" sx={{ fontWeight: 700 }}>{i.before}</Box>
                            <ArrowRightAltRoundedIcon sx={{ fontSize: 18, color: BRAND.textLight }} />
                            <Box component="span" sx={{ fontWeight: 700, color: i.outcome === 'recurred' ? '#B3261E' : i.outcome === 'prevented' ? '#1E6023' : BRAND.text }}>
                              {i.outcome === 'monitoring' ? '—' : i.after}
                            </Box>
                          </Stack>
                        </TableCell>
                        <TableCell align="center">
                          <Chip label={m.label} size="small" sx={{ bgcolor: m.bg, color: m.color, fontWeight: 700, borderRadius: '6px' }} />
                        </TableCell>
                        <TableCell align="center">
                          <Chip label={i.status === 'closed' ? 'Closed' : 'Open'} size="small" sx={{ bgcolor: i.status === 'closed' ? BRAND.section : '#E8F1FB', color: i.status === 'closed' ? BRAND.textLight : '#1565C0', fontWeight: 600, borderRadius: '6px' }} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Paper>
          )}
        </>
      )}
    </Box>
  );
}
