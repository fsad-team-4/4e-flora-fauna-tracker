import { useEffect, useMemo, useState } from 'react';
import {
  Card, CardContent, Box, Stack, Typography, Skeleton, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TableSortLabel, IconButton, Collapse, Tooltip,
} from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import { BRAND } from '../../theme';
import http from '../../http';

// Deepened variants of the feeding/rodent signal hues. The categorical set is tuned
// for fills on white; these digits sit on a tinted zebra row, so they need the extra
// depth to stay well clear of AA (10.5:1 and 8.4:1 respectively).
const FEEDING_INK = '#1E3A5F'; // navy - the feeding (food-source) signal
const RODENT_INK = '#8E1038';  // deep crimson - the rodent signal

// Below this many records the pattern is not statistically meaningful; the table
// says so in its own column rather than burying it in prose.
const SMALL_SAMPLE = 10;

function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
}

// Ordering honesty: feeding logged AFTER the rodent reports cannot support feeding
// as a driver. Computed per block so the table can flag it in the status column.
function orderingFlag(block) {
  const feedTime = new Date(block.firstFeedingDate).getTime();
  const rodentTime = new Date(block.firstRodentDate).getTime();
  return !Number.isNaN(feedTime) && !Number.isNaN(rodentTime) && feedTime > rodentTime;
}

// A pill is reserved for genuine STATUS. The ordering caveat is one (it changes how
// the row must be interpreted); a record count is not, so that renders as plain
// styled text below rather than looking like a button that cannot be pressed.
function StatusBadge({ children, title }) {
  const badge = (
    <Box
      component="span"
      sx={{
        display: 'inline-block', px: 0.85, py: '2px', borderRadius: '6px',
        bgcolor: '#FFF8EC', color: '#7C4A03', border: '1px solid #F0E2C4',
        fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
      }}
    >
      {children}
    </Box>
  );
  return title ? <Tooltip title={title}>{badge}</Tooltip> : badge;
}

/**
 * Count cell. Semantic colour applied directly to a heavily weighted figure - no
 * background block behind it, which read as disconnected from the number.
 *
 * The inks are deliberately DEEPER than the signal hues used elsewhere, because
 * these digits sit on a tinted zebra row: navy #1E3A5F measures 10.5:1 and deep
 * crimson #8E1038 measures 8.4:1 against the striped background, where the original
 * mid-blue/magenta pair was only ~5.4:1. Right-aligned so digits stack.
 */
function NumCell({ value, color, dim = false }) {
  const flat = dim || !value;
  return (
    <TableCell align="right" sx={{ py: 1.25 }}>
      <Typography
        component="span"
        sx={{
          fontSize: 15.5, fontWeight: 800,
          color: flat ? BRAND.textLight : color,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </Typography>
    </TableCell>
  );
}

// Explicit widths summing to 100%, so the table fills its container instead of
// collapsing to content width and leaving dead space to the right.
const COLUMNS = [
  { id: 'block_number', label: 'Estate Block', align: 'left', width: '24%' },
  { id: 'feedingCount', label: 'Feed Sightings', align: 'right', width: '15%' },
  { id: 'rodentAssessmentCount', label: 'Rodent Reports', align: 'right', width: '15%' },
  { id: 'elevatedRodentCount', label: 'At-Risk Cases', align: 'right', width: '15%' },
  { id: 'sampleSize', label: 'Significance', align: 'left', width: '25%' },
];
// trailing expand column - not sortable, so it is not part of COLUMNS
const EXPAND_COL_WIDTH = '6%';
const COL_COUNT = COLUMNS.length + 1;

function BlockRow({ block, index }) {
  const [open, setOpen] = useState(false);
  const feedDate = fmtDate(block.firstFeedingDate);
  const rodentDate = fmtDate(block.firstRodentDate);
  const small = block.sampleSize < SMALL_SAMPLE;
  const flagged = orderingFlag(block);

  return (
    <>
      {/* Zebra striping keyed off the row index, so the eye can track a single row
          across five columns. Kept subtle enough not to fight the hover state. */}
      <TableRow
        hover
        sx={{
          '& > td': { borderBottom: open ? 'none' : `1px solid ${BRAND.border}` },
          cursor: 'pointer',
          bgcolor: index % 2 === 1 ? BRAND.section : 'transparent',
          // explicit hover wins over the zebra tint, so the eye can still track a
          // row across all five columns on a striped table
          '&:hover': { bgcolor: BRAND.navySoft },
        }}
        onClick={() => setOpen(o => !o)}
      >
        <TableCell sx={{ py: 1.25 }}>
          <Typography component="span" sx={{ fontSize: 14, fontWeight: 700, color: BRAND.heading }}>
            {block.block_number}
          </Typography>
        </TableCell>
        <NumCell value={block.feedingCount} color={FEEDING_INK} />
        <NumCell value={block.rodentAssessmentCount} color={RODENT_INK} />
        <NumCell value={block.elevatedRodentCount} color={RODENT_INK} dim={block.elevatedRodentCount === 0} />
        <TableCell sx={{ py: 1.25, borderBottom: open ? 'none' : `1px solid ${BRAND.border}` }}>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
            <Tooltip
              title={small
                ? `Only ${block.sampleSize} record${block.sampleSize === 1 ? '' : 's'} - below the ${SMALL_SAMPLE}-record bar for a meaningful pattern.`
                : `${block.sampleSize} records - large enough to be worth acting on.`}
            >
              <Typography
                component="span"
                sx={{ fontSize: 12.5, fontWeight: small ? 500 : 600, color: small ? BRAND.textLight : BRAND.text, fontStyle: small ? 'italic' : 'normal', whiteSpace: 'nowrap', cursor: 'help' }}
              >
                {small ? `Small sample · ${block.sampleSize}` : `${block.sampleSize} records`}
              </Typography>
            </Tooltip>
            {flagged && (
              <StatusBadge title="Feeding was first logged after the rodent reports here, so the ordering does not support feeding as a driver - treat as co-occurrence only.">
                Ordering caveat
              </StatusBadge>
            )}
          </Stack>
        </TableCell>
        {/* Expand control at the END of the row: the eye scans Block -> counts ->
            significance -> action, so the interaction belongs where that journey
            finishes, not before it starts. */}
        <TableCell align="right" sx={{ py: 1.25, borderBottom: open ? 'none' : `1px solid ${BRAND.border}` }}>
          <IconButton
            size="small"
            aria-label={open ? `Hide detail for ${block.block_number}` : `Show detail for ${block.block_number}`}
            aria-expanded={open}
            onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
            sx={{
              p: 0.5, color: open ? BRAND.heading : BRAND.text,
              bgcolor: open ? BRAND.navySoft : 'transparent',
              '&:hover': { bgcolor: BRAND.navySoft },
            }}
          >
            <KeyboardArrowDownRoundedIcon sx={{ fontSize: 20, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
          </IconButton>
        </TableCell>
      </TableRow>

      {/* Expandable detail: the prose that used to crowd the card lives here. */}
      <TableRow>
        <TableCell colSpan={COL_COUNT} sx={{ py: 0, borderBottom: `1px solid ${BRAND.border}` }}>
          <Collapse in={open} unmountOnExit>
            <Box sx={{ py: 1.5, pl: 1, pr: 1 }}>
              <Typography sx={{ fontSize: 12.5, color: BRAND.textLight, lineHeight: 1.6 }}>
                Feeding first seen {feedDate || 'n/a'} · rodent reports from {rodentDate || 'n/a'}
              </Typography>
              {flagged && (
                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'flex-start', mt: 0.75 }}>
                  <WarningAmberRoundedIcon sx={{ fontSize: 16, color: '#8A5200', mt: '1px', flexShrink: 0 }} />
                  <Typography sx={{ fontSize: 12.5, color: '#8A5200', lineHeight: 1.6 }}>
                    Feeding was first logged after the rodent reports here, so the ordering does not
                    support feeding as a driver - treat as co-occurrence only.
                  </Typography>
                </Stack>
              )}
              {block.sampleSize < SMALL_SAMPLE && (
                <Typography sx={{ fontSize: 12.5, color: BRAND.textLight, mt: 0.75, fontStyle: 'italic' }}>
                  Small sample - not statistically significant.
                </Typography>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

/**
 * Behavioural Diagnosis. Blocks where feeding activity co-occurs with rodent risk -
 * the cross-domain pattern that hints at food waste as a root cause.
 *
 * Presented as a sortable table so blocks are directly comparable; the honesty
 * guarantees are unchanged, just relocated. It still says "co-occurs with" (never
 * "causes"), shows the raw counts as the evidence (no synthesised confidence
 * score), flags small samples and signal ordering in the Significance column, and
 * keeps the standing caveat under the table.
 */
export default function FeedingRodentCorrelation() {
  const [state, setState] = useState({ loading: true, error: false, windowDays: 30, blocks: [] });
  const [orderBy, setOrderBy] = useState('rodentAssessmentCount');
  const [order, setOrder] = useState('desc');

  useEffect(() => {
    let alive = true;
    http.get('/api/block-diagnosis')
      .then(r => { if (alive) setState({ loading: false, error: false, windowDays: r.data.windowDays, blocks: r.data.blocks || [] }); })
      .catch(() => { if (alive) setState(s => ({ ...s, loading: false, error: true })); });
    return () => { alive = false; };
  }, []);

  const sorted = useMemo(() => {
    const dir = order === 'asc' ? 1 : -1;
    return [...state.blocks].sort((a, b) => {
      const av = a[orderBy], bv = b[orderBy];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir;
    });
  }, [state.blocks, orderBy, order]);

  const sortBy = id => {
    if (orderBy === id) setOrder(o => (o === 'asc' ? 'desc' : 'asc'));
    else { setOrderBy(id); setOrder(id === 'block_number' ? 'asc' : 'desc'); }
  };

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 3 }}>
        {/* The standing "association, not proof" caveat used to be a grey box nested
            under the table. It is now an (i) beside the title: same guarantee, none
            of the vertical cost, and it reads before the data rather than after it. */}
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
          <Typography component="h2" variant="h6" fontWeight={700} sx={{ color: BRAND.heading }}>
            Behavioural Diagnosis
          </Typography>
          <Tooltip
            arrow
            title="These blocks show feeding and rodent signals together; that is co-occurrence, not proven cause. The counts are the raw evidence - confirm on the ground before acting, and prefer a feeding advisory over another pest call-out where food waste is plausible."
          >
            <InfoOutlinedIcon sx={{ fontSize: 16, color: BRAND.textLight, cursor: 'help' }} />
          </Tooltip>
        </Stack>
        <Typography variant="body2" sx={{ color: BRAND.textLight, mb: 2 }}>
          Blocks where feeding activity co-occurs with rodent risk over the last {state.windowDays} days -
          worth investigating for food waste as a root cause
        </Typography>

        {state.loading ? (
          <Stack spacing={1.5}>
            <Skeleton variant="rounded" height={40} />
            <Skeleton variant="rounded" height={40} />
            <Skeleton variant="rounded" height={40} />
          </Stack>
        ) : state.error ? (
          <Typography variant="body2" sx={{ color: BRAND.textLight, py: 4, textAlign: 'center' }}>
            Diagnosis unavailable right now.
          </Typography>
        ) : state.blocks.length === 0 ? (
          <Typography variant="body2" sx={{ color: BRAND.textLight, py: 6, textAlign: 'center' }}>
            No blocks show both feeding and rodent signals in this window.
          </Typography>
        ) : (
          <>
            {/* Wide table scrolls inside its own container - the page never does.
                width 100% + explicit column widths stop it collapsing to content
                width and leaving dead space on the right. */}
            {/* capped height + stickyHeader: the column labels stay put while long
                block lists scroll, so context is never lost mid-table */}
            <TableContainer sx={{ overflowX: 'auto', maxHeight: 460 }}>
              <Table stickyHeader size="small" sx={{ minWidth: 560, width: '100%', tableLayout: 'fixed' }}>
                <TableHead>
                  <TableRow>
                    {COLUMNS.map(c => (
                      <TableCell
                        key={c.id}
                        align={c.align}
                        width={c.width}
                        sortDirection={orderBy === c.id ? order : false}
                        sx={{ py: 1, borderBottom: `2px solid ${BRAND.border}`, bgcolor: BRAND.section }}
                      >
                        <TableSortLabel
                          active={orderBy === c.id}
                          direction={orderBy === c.id ? order : 'asc'}
                          onClick={() => sortBy(c.id)}
                          // bolder + wider tracking, and BRAND.text not textLight, so
                          // the header row clearly outranks the data beneath it
                          sx={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: BRAND.text, '&.Mui-active': { color: BRAND.heading } }}
                        >
                          {c.label}
                        </TableSortLabel>
                      </TableCell>
                    ))}
                    <TableCell width={EXPAND_COL_WIDTH} sx={{ borderBottom: `2px solid ${BRAND.border}`, bgcolor: BRAND.section }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sorted.map((b, i) => <BlockRow key={b.block_number} block={b} index={i} />)}
                </TableBody>
              </Table>
            </TableContainer>

          </>
        )}
      </CardContent>
    </Card>
  );
}
