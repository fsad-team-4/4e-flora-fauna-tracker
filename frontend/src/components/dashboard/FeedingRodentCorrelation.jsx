import { useEffect, useMemo, useState } from 'react';
import {
  Card, CardContent, Box, Stack, Typography, Skeleton, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TableSortLabel, Tooltip,
} from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useTheme } from '@mui/material/styles';
import { BRAND, INTENT } from '../../theme';
import http from '../../http';

// The feeding/rodent signal hues, per scheme. In light the inks are deepened
// (navy 10.5:1, deep crimson 8.4:1 on the zebra stripe); in dark they are
// lightened so the same digits stay well clear of AA on the dark card and stripe.
const SIGNAL_INK = {
  light: { feeding: '#1E3A5F', rodent: '#8E1038' }, // navy / deep crimson
  dark: { feeding: '#8FB8E8', rodent: '#FF8FA8' },
};

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
        bgcolor: INTENT.warning.bg, color: INTENT.warning.ink, border: `1px solid ${INTENT.warning.border}`,
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
 * The inks come from SIGNAL_INK, tuned per scheme (see that constant's note), so
 * the digits stay well clear of AA against the zebra rows in both schemes.
 * Right-aligned so digits stack.
 *
 * ================= WHY THERE IS NO LONGER A SEVERITY DOT ===================
 * This cell used to carry a dot: red at value >= 5, amber at 3-4, tooltipped
 * "High volume" / "Moderate volume". Both cutoffs were invented in this file.
 * backend/src/services/blockDiagnosis.js applies NO magnitude threshold to
 * rodent counts at all - line 116 filters on presence only
 * (`feedingCount > 0 && rodentAssessmentCount > 0`) - so "5 is high" was a claim
 * the data never made, and the tooltip stated it as fact.
 *
 * `tint` now marks the ONE boundary the backend actually defines: whether any
 * assessment at this block was rated medium/high/critical (ELEVATED_LEVELS,
 * blockDiagnosis.js:26). That is a real, sourced distinction rather than a
 * magnitude band nobody set.
 *
 * A trend arrow was considered and rejected: /api/block-diagnosis returns one
 * window only (block_number, feedingCount, rodentAssessmentCount,
 * elevatedRodentCount, firstFeedingDate, firstRodentDate, sampleSize) with no
 * prior-period figure, so any up/down arrow would have to invent its comparison.
 * ===========================================================================
 */
function NumCell({ value, color, dim = false, tint = false, tintLabel = null }) {
  const flat = dim || !value;
  const cell = (
    <TableCell
      align="right"
      // A tint is a colour-only signal, which the old dot's tooltip at least
      // partly mitigated. The label is carried on the cell as an aria-label and a
      // tooltip, so the meaning survives for screen readers and for anyone who
      // cannot separate the hues.
      aria-label={tint && tintLabel ? `${value}. ${tintLabel}` : undefined}
      sx={{
        py: 1.25,
        // Tint the whole cell rather than sitting a dot beside the digits: the dot
        // read as a bullet belonging to the number, and at 8px it was the smallest
        // mark on the densest surface of the page.
        ...(tint ? { bgcolor: INTENT.danger.tint } : null),
      }}
    >
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
  return tint && tintLabel ? <Tooltip title={tintLabel}>{cell}</Tooltip> : cell;
}

// Explicit widths summing to 100%, so the table fills its container instead of
// collapsing to content width and leaving dead space to the right.
const COLUMNS = [
  { id: 'block_number', label: 'Estate Block', align: 'left', width: '18%' },
  { id: 'feedingCount', label: 'Feed Sightings', align: 'right', width: '13%' },
  { id: 'rodentAssessmentCount', label: 'Rodent Reports', align: 'right', width: '13%' },
  { id: 'elevatedRodentCount', label: 'At-Risk Cases', align: 'right', width: '13%' },
  // the first-seen ordering used to be reachable only by expanding a row; it is the
  // single most useful sentence in the panel, so it gets a column of its own
  { id: 'firstFeedingDate', label: 'Insights', align: 'left', width: '27%' },
  { id: 'sampleSize', label: 'Significance', align: 'left', width: '16%' },
];

/**
 * One block row.
 *
 * THE EXPANDABLE SUB-ROW IS GONE, and nothing was lost with it. It restated
 * exactly three things, all of which are already on the visible row:
 *   - "Feeding first seen X · rodent reports from Y" -> the Insights column
 *     prints the same two values in the same words (and names the missing field
 *     instead of the sub-row's bare "n/a").
 *   - the ordering caveat -> character-for-character the StatusBadge tooltip,
 *     off the same `flagged` condition.
 *   - "Small sample - not statistically significant." -> a weaker version of the
 *     Significance column, which shows the record count AND the 10-record bar.
 * So the chevron, its aria-expanded plumbing, the row click handler and the
 * conditional borders bought a second copy of the row. The prose it was built to
 * hold had already been promoted into columns; only the sub-row stayed behind.
 */
function BlockRow({ block, index }) {
  const ink = SIGNAL_INK[useTheme().palette.mode] || SIGNAL_INK.light;
  const feedDate = fmtDate(block.firstFeedingDate);
  const rodentDate = fmtDate(block.firstRodentDate);
  const small = block.sampleSize < SMALL_SAMPLE;
  const flagged = orderingFlag(block);

  // Zebra striping keyed off the row index, so the eye can track a single row
  // across the columns. Kept subtle enough not to fight the hover state.
  return (
    <TableRow
      hover
      sx={{
        '& > td': { borderBottom: `1px solid ${BRAND.border}` },
        bgcolor: index % 2 === 1 ? BRAND.section : 'transparent',
        // explicit hover wins over the zebra tint, so the eye can still track a
        // row across every column on a striped table
        '&:hover': { bgcolor: BRAND.navySoft },
      }}
    >
      <TableCell sx={{ py: 1.25 }}>
        <Typography component="span" sx={{ fontSize: 14, fontWeight: 700, color: BRAND.heading }}>
          {block.block_number}
        </Typography>
      </TableCell>
      <NumCell value={block.feedingCount} color={ink.feeding} />
      <NumCell value={block.rodentAssessmentCount} color={ink.rodent} />
      <NumCell
        value={block.elevatedRodentCount}
        color={ink.rodent}
        dim={block.elevatedRodentCount === 0}
        // The one boundary the backend actually draws: at least one assessment
        // here was rated medium, high or critical.
        tint={block.elevatedRodentCount > 0}
        tintLabel={`${block.elevatedRodentCount} of ${block.rodentAssessmentCount} assessment${block.rodentAssessmentCount === 1 ? '' : 's'} at this block was rated medium, high or critical.`}
      />
      <TableCell sx={{ py: 1.25 }}>
        <Typography sx={{ fontSize: 12.5, color: BRAND.text, lineHeight: 1.45 }}>
          {feedDate ? `Feeding first seen ${feedDate}` : 'Feeding date not recorded'}
        </Typography>
        <Typography sx={{ fontSize: 11.5, color: BRAND.textLight, lineHeight: 1.45 }}>
          {rodentDate ? `rodent reports from ${rodentDate}` : 'rodent date not recorded'}
        </Typography>
      </TableCell>
      <TableCell sx={{ py: 1.25 }}>
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
    </TableRow>
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
