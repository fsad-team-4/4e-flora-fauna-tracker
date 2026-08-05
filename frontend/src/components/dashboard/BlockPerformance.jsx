import { Card, CardContent, Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { BRAND, surfaceSx } from '../../theme';
import BlockTable from './BlockTable';

/**
 * Block Performance.
 *
 * WHY THE RISK/VOLUME TOGGLE IS GONE. Its two views were "top 5 blocks by sighting
 * volume against the threshold" and "every block ranked by sighting volume" - the same
 * field, one truncated. Merging them behind a segmented control cut the vertical cost but
 * left the redundancy: two ways to draw one number as bars.
 *
 * One sortable table does both jobs at once: it sorts by volume by default (so the worst
 * is first, as the Risk view intended), and the threshold is stated as a HOT badge rather
 * than a dashed rule the reader has to measure bars against. Sorting by any column is now
 * the "lens" the toggle used to switch between.
 *
 * The table is CAPPED, with a distribution strip above it. On a real estate the block
 * list is hundreds of rows long, which no dashboard zone can hold - so the table carries
 * the top of the current sort, the strip carries the shape of the whole set at a fixed
 * height, and the footer states how many blocks are not on screen. See BlockTable.
 */
export default function BlockPerformance({ sightingsByBlock = [], hotspots = [], topBlock = null }) {
  const mode = useTheme().palette.mode;

  return (
    <Card sx={{ ...surfaceSx(mode, 'card'), height: '100%' }}>
      <CardContent sx={{ p: 3 }}>
        {/* mb 2.5 - one header gap across every dashboard card. See RecentActivity. */}
        <Box sx={{ minWidth: 0, mb: 2.5 }}>
          <Typography component="h2" variant="h6" fontWeight={700} sx={{ color: BRAND.heading }}>
            Block Performance
          </Typography>
          <Typography variant="body2" sx={{ color: BRAND.textLight }}>
            Worst blocks by sighting volume - sort any column to change the lens
          </Typography>
        </Box>

        <BlockTable sightingsByBlock={sightingsByBlock} hotspots={hotspots} topBlock={topBlock} />
      </CardContent>
    </Card>
  );
}
