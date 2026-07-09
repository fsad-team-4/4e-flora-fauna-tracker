import { Box, Table, TableHead, TableRow, TableCell, TableBody, Typography } from '@mui/material';
import { visuallyHidden } from '@mui/utils';
import { BRAND } from '../../theme';
import { CATEGORY_LABELS } from '../../constants';
import SectionCard from './SectionCard';
import StatusPill from '../StatusPill';

const headCellSx = {
  color: BRAND.textLight,
  fontWeight: 700,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

function formatDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

/**
 * Recent cases as an accessible table. Horizontally scrolls on narrow
 * viewports rather than overflowing the page.
 */
export default function RecentCasesTable({ cases = [] }) {
  return (
    <SectionCard
      title="Recent Cases"
      subtitle="Latest reports across the estate"
      headingId="recent-cases-heading"
    >
      {cases.length === 0 ? (
        <Typography variant="body2" sx={{ color: BRAND.textLight, py: 6, textAlign: 'center' }}>
          No recent cases.
        </Typography>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" aria-labelledby="recent-cases-heading">
            <caption style={visuallyHidden}>Most recent cases with category and status</caption>
            <TableHead>
              <TableRow>
                <TableCell scope="col" sx={headCellSx}>Case</TableCell>
                <TableCell scope="col" sx={headCellSx}>Category</TableCell>
                <TableCell scope="col" align="right" sx={headCellSx}>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cases.map(c => (
                <TableRow key={c.id} sx={{ '&:last-child td': { border: 0 }, '&:hover': { bgcolor: BRAND.section } }}>
                  <TableCell sx={{ py: 1.5 }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 600, color: BRAND.heading, lineHeight: 1.3 }}>
                      {c.title}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: BRAND.textLight, mt: 0.25 }}>
                      {c.block_number} · {formatDate(c.createdAt)}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ fontSize: 13, color: BRAND.text }}>
                    {CATEGORY_LABELS[c.category] || c.category}
                  </TableCell>
                  <TableCell align="right">
                    <StatusPill status={c.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </SectionCard>
  );
}
