import { useState } from 'react';
import { Card, CardContent, Box, Stack, Typography, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { BRAND } from '../../theme';
import TopRiskBlocks from './TopRiskBlocks';
import BlocksRanked from './BlocksRanked';

const VIEWS = {
  risk: {
    label: 'Risk',
    blurb: 'Top 5 blocks by sighting volume against the hotspot threshold',
  },
  volume: {
    label: 'Volume',
    blurb: 'Every block ranked by sighting volume, with the animals seen there',
  },
};

/**
 * Block Performance. "Risk by Block" and "Activity by Block" were two horizontal bar
 * lists reading off the SAME field (sightings per block) stacked one above the other -
 * visually redundant and twice the vertical cost.
 *
 * They are merged behind a segmented control: Risk is the top-5 thresholded view for
 * triage, Volume is the full ranked list for browsing. One widget, one column, and
 * the user picks the lens instead of scrolling past the one they did not want.
 */
export default function BlockPerformance({ sightingsByBlock = [], hotspots = [], topBlock = null }) {
  const [view, setView] = useState('risk');

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 3 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          sx={{ justifyContent: 'space-between', alignItems: { sm: 'flex-start' }, mb: 2 }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h2" variant="h6" fontWeight={700} sx={{ color: BRAND.heading }}>
              Block Performance
            </Typography>
            <Typography variant="body2" sx={{ color: BRAND.textLight }}>
              {VIEWS[view].blurb}
            </Typography>
          </Box>

          <ToggleButtonGroup
            value={view}
            exclusive
            onChange={(_e, v) => v && setView(v)}
            size="small"
            aria-label="Block performance view"
            sx={{
              flexShrink: 0, bgcolor: BRAND.section, borderRadius: '999px', p: '3px', gap: '2px',
              '& .MuiToggleButtonGroup-grouped': {
                border: 0, marginLeft: 0, px: 1.75, py: 0.4, borderRadius: '999px !important',
                textTransform: 'none', fontSize: 13, fontWeight: 600, color: BRAND.text,
                '&:hover': { bgcolor: 'rgba(120,130,145,0.12)' },
                '&.Mui-selected': { bgcolor: BRAND.surface, color: BRAND.heading, boxShadow: '0 1px 3px rgba(0,0,0,0.12)', '&:hover': { bgcolor: BRAND.surface } },
              },
            }}
          >
            {Object.entries(VIEWS).map(([k, v]) => (
              <ToggleButton key={k} value={k}>{v.label}</ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Stack>

        {view === 'risk'
          ? <TopRiskBlocks sightingsByBlock={sightingsByBlock} topBlock={topBlock} embedded />
          : <BlocksRanked sightingsByBlock={sightingsByBlock} hotspots={hotspots} embedded />}
      </CardContent>
    </Card>
  );
}
