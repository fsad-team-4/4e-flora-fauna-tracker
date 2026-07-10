import { Box, Typography, Card, Stack, Chip } from '@mui/material';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingFlatRoundedIcon from '@mui/icons-material/TrendingFlatRounded';
import { BRAND, HEALTH_META, TREND } from '../../theme';

// The hero is the estate's "thesis": the one number that says how the estate is
// doing right now. Its colour is driven by HEALTH_META (the same traffic-light
// the header chip uses), so healthy/watch/critical read consistently everywhere.

// For a RISK score, a fall is an improvement, so a negative delta shows the
// "good" ink and a downward arrow.
function TrendBadge({ delta }) {
  if (delta == null) return null;
  if (delta === 0) {
    return (
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', color: TREND.neutral }}>
        <TrendingFlatRoundedIcon sx={{ fontSize: 18 }} />
        <Typography variant="body2">no change since yesterday</Typography>
      </Stack>
    );
  }
  const improving = delta < 0;
  const color = improving ? TREND.good : TREND.bad;
  const Icon = improving ? TrendingDownRoundedIcon : TrendingUpRoundedIcon;
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', color }}>
      <Icon sx={{ fontSize: 18 }} />
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {improving ? '' : '+'}{delta} since yesterday
      </Typography>
    </Stack>
  );
}

export default function EstateHealthHero({ estateHealth, loading }) {
  const meta = HEALTH_META[estateHealth?.status] || HEALTH_META.watch;
  const score = estateHealth?.score ?? 0;
  const { scoreTrend, highestRiskBlock, lastIncident } = estateHealth || {};

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: '16px',
        border: `1px solid ${BRAND.border}`,
        boxShadow: '0 4px 16px rgba(0,0,0,.05)',
        overflow: 'hidden',
        mb: 2.5,
        opacity: loading ? 0.6 : 1,
        transition: 'opacity .2s',
      }}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'auto 1px 1fr' }, alignItems: 'stretch' }}>
        {/* left: the hero score, tinted by estate status */}
        <Box sx={{ p: { xs: 3, md: 4 }, bgcolor: meta.bg, minWidth: { md: 340 } }}>
          <Typography variant="overline" sx={{ color: BRAND.textLight, fontWeight: 700, letterSpacing: '0.8px' }}>
            Estate Risk Index
          </Typography>

          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-end', mt: 1 }}>
            <Typography sx={{ fontSize: 76, fontWeight: 800, lineHeight: 0.85, color: meta.color, letterSpacing: '-2px' }}>
              {score}
            </Typography>
            <Typography sx={{ color: BRAND.textLight, fontSize: 20, fontWeight: 600, pb: 1 }}>/ 100</Typography>
          </Stack>

          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mt: 2, flexWrap: 'wrap', rowGap: 1 }}>
            <Chip
              label={meta.label}
              sx={{ bgcolor: meta.color, color: '#fff', fontWeight: 700, borderRadius: '8px' }}
            />
            <TrendBadge delta={scoreTrend} />
          </Stack>
        </Box>

        <Box sx={{ display: { xs: 'none', md: 'block' }, bgcolor: BRAND.border }} />

        {/* right: what most needs attention */}
        <Box sx={{ p: { xs: 3, md: 4 }, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2.5 }}>
          <Box>
            <Typography variant="overline" sx={{ color: BRAND.textLight, fontWeight: 700, letterSpacing: '0.8px' }}>
              Highest-Risk Block
            </Typography>
            {highestRiskBlock ? (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5, flexWrap: 'wrap' }}>
                <PlaceOutlinedIcon sx={{ color: BRAND.primary, fontSize: 22 }} />
                <Typography sx={{ fontSize: 22, fontWeight: 700, color: BRAND.heading }}>{highestRiskBlock}</Typography>
                <Typography variant="body2" sx={{ color: BRAND.textLight }}>most sightings this period</Typography>
              </Stack>
            ) : (
              <Typography sx={{ mt: 0.5, color: BRAND.textLight }}>No active hotspots</Typography>
            )}
          </Box>

          <Box>
            <Typography variant="overline" sx={{ color: BRAND.textLight, fontWeight: 700, letterSpacing: '0.8px' }}>
              Latest Incident
            </Typography>
            {lastIncident ? (
              <Typography sx={{ mt: 0.5, color: BRAND.text, fontSize: 15 }}>
                <Box component="span" sx={{ fontWeight: 600, color: BRAND.heading }}>{lastIncident.title}</Box>
                {lastIncident.block_number ? ` · ${lastIncident.block_number}` : ''}
              </Typography>
            ) : (
              <Typography sx={{ mt: 0.5, color: BRAND.textLight }}>No recent incidents</Typography>
            )}
          </Box>
        </Box>
      </Box>
    </Card>
  );
}