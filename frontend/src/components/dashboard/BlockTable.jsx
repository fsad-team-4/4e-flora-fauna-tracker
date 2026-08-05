import { Fragment, useMemo, useState } from 'react';
import {
  Box, Stack, Typography, Table, TableHead, TableBody, TableRow, TableCell,
  TableContainer, TableSortLabel, Collapse, IconButton, Tooltip, Link,
} from '@mui/material';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import { useTheme } from '@mui/material/styles';
import { BRAND, INTENT, RADII, ON_SURFACE } from '../../theme';

const HOTSPOT_MIN = 3;

// 8 rows: enough for the top of any sort to be more than a podium, few enough to sit
// beside Recent Activity without either card driving the row's height.
const VISIBLE_ROWS = 8;
// Cap on the expanded list too. Show all must not be able to make the page taller than
// the viewport, or it just reintroduces the endless scroll one click deeper.
const EXPANDED_MAX_H = 360;

/**
 * THE DISTRIBUTION STRIP - the summary visual, and the one thing here that does not
 * change size with the estate.
 *
 * The table can only ever show the worst few. What it cannot show is SHAPE: eight hot
 * blocks read identically whether they are eight out of twelve or eight out of four
 * hundred, and those two estates need completely different responses. This answers that
 * in one line - how the blocks are spread across sighting volume, with the threshold
 * marked - and it is the same height at any scale.
 *
 * Buckets, not a continuous axis, and the SAME breaks the rodent map's density legend
 * prints. Two different bucketings of "how many sightings" across one product would be a
 * quiet way to make two screens disagree.
 */
const BUCKETS = [
  { label: '1', test: n => n === 1 },
  { label: '2', test: n => n === 2 },
  { label: '3-4', test: n => n >= 3 && n <= 4 },
  { label: '5-8', test: n => n >= 5 && n <= 8 },
  { label: '9+', test: n => n >= 9 },
];

function DistributionStrip({ rows }) {
  const buckets = BUCKETS.map(b => ({
    ...b,
    n: rows.filter(r => b.test(r.count)).length,
    // a bucket is "over" when everything in it breaches - which is exactly the buckets
    // at or above HOTSPOT_MIN, so the colour break and the HOT badge cannot disagree
    over: b.test(HOTSPOT_MIN) || (b.label === '5-8' || b.label === '9+'),
  }));
  return (
    <Box sx={{ mb: 2 }}>
      <Box
        role="img"
        aria-label={buckets.map(b => `${b.n} block${b.n === 1 ? '' : 's'} with ${b.label} sightings`).join(', ')}
        sx={{ display: 'flex', gap: '2px', height: 10, borderRadius: `${RADII.chip}px`, overflow: 'hidden' }}
      >
        {buckets.filter(b => b.n > 0).map(b => (
          <Tooltip key={b.label} arrow title={`${b.n} block${b.n === 1 ? '' : 's'} with ${b.label} sighting${b.label === '1' ? '' : 's'}`}>
            <Box sx={{ flexGrow: b.n, flexBasis: 0, bgcolor: b.over ? INTENT.danger.ink : BRAND.border, minWidth: 3 }} />
          </Tooltip>
        ))}
      </Box>
      {/* The scale is printed rather than left to the colour: a reader should not have to
          hover five segments to find out what the widths mean. */}
      <Stack direction="row" sx={{ mt: 0.6, justifyContent: 'space-between' }}>
        {buckets.map(b => (
          <Typography key={b.label} sx={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.3px', color: b.over ? INTENT.danger.ink : BRAND.textLight }}>
            {b.label}
            <Box component="span" sx={{ fontWeight: 500, color: BRAND.textLight }}>{` · ${b.n}`}</Box>
          </Typography>
        ))}
      </Stack>
      <Typography sx={{ fontSize: 11, color: BRAND.textLight, mt: 0.5 }}>
        Blocks by sightings in this period. {HOTSPOT_MIN}+ is a hotspot.
      </Typography>
    </Box>
  );
}

/**
 * BLOCK PERFORMANCE AS A TABLE. NO BARS.
 *
 * This replaces two horizontal bar lists that read off the SAME field - sightings per
 * block - one showing the top five against a threshold line, the other every block
 * ranked. They were already merged behind a Risk/Volume toggle, which halved the
 * vertical cost but not the redundancy: both drew the same numbers as bars.
 *
 * And the numbers are 4, 3, 3, 3, 1. A bar spanning most of a card to depict "3" spends
 * a large amount of screen on one digit, and to answer the actual question - is this
 * block over the hotspot threshold - you had to compare a bar's length against a dashed
 * rule. The table answers it directly: the figure is the figure, and a breach is a word.
 *
 * CONDITIONAL FORMATTING instead of a chart. The sightings cell gets a faint danger wash
 * when the block is at or over the threshold. Deliberately on the CELL, not the row: a
 * tinted row reads as "this record is broken", where the claim is only "this number
 * crossed a line". The wash is never the only cue either - a HOT badge carries it in
 * text, so it survives for anyone who cannot separate the hues, which is the same reason
 * the bar version wrote "over"/"under" beside its colour.
 *
 * Sortable, and expandable per row: the animals seen and the last sighting were only
 * visible in the old Volume view's accordion, so they come along rather than being lost.
 *
 * IT NO LONGER LISTS EVERY BLOCK, and that is the point.
 *
 * It used to, which was fine at 15 blocks and wrong at 300: an estate with a thousand
 * cases would have rendered a table taller than the page, inside a dashboard zone that
 * has to sit beside Recent Activity. A dashboard answers "where do I go first"; a
 * register answers "what do we have". This is the dashboard, so it shows the top rows by
 * whatever column is sorted and states plainly how many it is not showing.
 *
 * Nothing is hidden, in two senses. The count of omitted blocks is printed - a silent
 * truncation would read as "this is the whole estate" when it is not - and Show all
 * expands to the full list inside a bounded scroll area, so the page height stays fixed
 * either way. Re-sorting changes WHICH rows the cut keeps, which is what makes the cut a
 * lens rather than an arbitrary slice.
 */

const COLUMNS = [
  { id: 'block', label: 'Block', align: 'left', sortable: true },
  { id: 'count', label: 'Sightings', align: 'right', sortable: true },
  { id: 'risk', label: 'Risk', align: 'left', sortable: true },
  { id: 'animals', label: 'Animals seen', align: 'left', sortable: false },
  { id: 'lastSeen', label: 'Last seen', align: 'right', sortable: true },
];

const SPECIES_LABEL = { cat: 'Cat', pigeon: 'Pigeon', crow: 'Crow', mynah: 'Mynah', other: 'Other' };

function fmtWhen(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
}

/**
 * HOT AND OK ARE DELIBERATELY UNEQUAL IN WEIGHT.
 *
 * Both used to be tinted pills off the INTENT pairs - danger for HOT, neutral for OK - which
 * gave them the same construction, the same size and the same visual weight, differing only
 * in hue. In a column of twelve rows that meant twelve pills of equal loudness and the
 * breaches did not stand out; you had to read each one.
 *
 * A breach is an ANOMALY, so it gets the solid fill and white text, and OK recedes to a
 * muted grey tint. Now the exceptions are the only saturated marks in the column and the
 * eye finds them without reading. This is also why the badge is not simply omitted on OK
 * rows: an empty cell reads as missing data, where "OK" is a measured result.
 *
 * The WORD carries the state either way, which is what keeps this off colour alone - it
 * survives greyscale, and a solid-vs-tint difference survives it too.
 */
function RiskBadge({ over }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-block', px: 0.85, py: '2px', borderRadius: `${RADII.chip}px`,
        bgcolor: over ? INTENT.danger.solid : INTENT.neutral.bg,
        color: over ? '#fff' : INTENT.neutral.ink,
        border: `1px solid ${over ? INTENT.danger.solid : INTENT.neutral.border}`,
        fontSize: 10.5, fontWeight: 800, letterSpacing: '0.5px',
      }}
    >
      {over ? 'HOT' : 'OK'}
    </Box>
  );
}

export default function BlockTable({ sightingsByBlock = [], hotspots = [], topBlock = null }) {
  const mode = useTheme().palette.mode;
  const [orderBy, setOrderBy] = useState('count');
  const [order, setOrder] = useState('desc');
  const [openRow, setOpenRow] = useState(null);

  // Joined once, not per render of every row.
  const rows = useMemo(() => {
    const byBlock = Object.fromEntries(hotspots.map(h => [h.block_number, h]));
    return sightingsByBlock
      .filter(b => b.count > 0)
      .map(b => {
        const detail = byBlock[b.block_number];
        return {
          block: b.block_number,
          count: b.count,
          over: b.count >= HOTSPOT_MIN,
          animals: detail?.animals || [],
          lastSeen: detail?.lastSeen || null,
        };
      });
  }, [sightingsByBlock, hotspots]);

  const sorted = useMemo(() => {
    const dir = order === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (orderBy) {
        case 'block':
          // numeric-aware, so Block 9 sorts before Block 10 rather than after it
          return dir * String(a.block).localeCompare(String(b.block), 'en', { numeric: true });
        case 'risk':
          return dir * ((a.over ? 1 : 0) - (b.over ? 1 : 0) || a.count - b.count);
        case 'lastSeen': {
          // blocks with no recorded sighting time sort last in either direction, rather
          // than jumping to the top as epoch zero
          const at = a.lastSeen ? new Date(a.lastSeen).getTime() : null;
          const bt = b.lastSeen ? new Date(b.lastSeen).getTime() : null;
          if (at === null && bt === null) return 0;
          if (at === null) return 1;
          if (bt === null) return -1;
          return dir * (at - bt);
        }
        default:
          return dir * (a.count - b.count);
      }
    });
  }, [rows, orderBy, order]);

  const [showAll, setShowAll] = useState(false);

  const sortBy = (id) => {
    if (orderBy === id) { setOrder(o => (o === 'asc' ? 'desc' : 'asc')); return; }
    setOrderBy(id);
    // volume and recency are most useful worst/newest-first; a label reads better A-Z
    setOrder(id === 'block' ? 'asc' : 'desc');
  };

  if (rows.length === 0) {
    return (
      <Typography sx={{ fontSize: 13, color: BRAND.textLight, py: 4, textAlign: 'center' }}>
        No sightings logged in this period.
      </Typography>
    );
  }

  const overCount = rows.filter(r => r.over).length;
  const visible = showAll ? sorted : sorted.slice(0, VISIBLE_ROWS);
  const hidden = rows.length - visible.length;

  // CONCENTRATION, the figure that decides whether triage is even the right strategy.
  // "6 blocks over threshold" is not actionable on its own - 6 blocks holding 71% of all
  // sightings means fixing six places fixes the estate, and 6 blocks holding 9% means the
  // problem is everywhere and a per-block response is the wrong tool. Same two counts,
  // opposite conclusions, so the share is stated rather than left to be inferred.
  const totalSightings = rows.reduce((sum, r) => sum + r.count, 0);
  const overSightings = rows.filter(r => r.over).reduce((sum, r) => sum + r.count, 0);
  const concentration = totalSightings ? Math.round((overSightings / totalSightings) * 100) : 0;

  return (
    <>
      <DistributionStrip rows={rows} />

      <TableContainer sx={{ overflowX: 'auto', ...(showAll ? { maxHeight: EXPANDED_MAX_H, overflowY: 'auto' } : null) }}>
        <Table size="small" sx={{ minWidth: 520 }}>
          <TableHead>
            <TableRow>
              {COLUMNS.map(c => (
                <TableCell
                  key={c.id}
                  align={c.align}
                  sortDirection={orderBy === c.id ? order : false}
                  sx={{
                    py: 1, bgcolor: 'transparent',
                    borderBottom: `1px solid ${mode === 'dark' ? 'rgba(255,255,255,0.10)' : BRAND.border}`,
                  }}
                >
                  {c.sortable ? (
                    <TableSortLabel
                      active={orderBy === c.id}
                      direction={orderBy === c.id ? order : 'asc'}
                      onClick={() => sortBy(c.id)}
                      sx={{
                        fontSize: 11, fontWeight: 800, textTransform: 'uppercase',
                        letterSpacing: '0.8px', color: BRAND.text,
                        '&.Mui-active': { color: BRAND.heading },
                      }}
                    >
                      {c.label}
                    </TableSortLabel>
                  ) : (
                    <Box component="span" sx={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: BRAND.text }}>
                      {c.label}
                    </Box>
                  )}
                </TableCell>
              ))}
              {/* expander rail - deliberately unlabelled */}
              <TableCell sx={{ width: 40, borderBottom: `1px solid ${mode === 'dark' ? 'rgba(255,255,255,0.10)' : BRAND.border}` }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.map((r, idx) => {
              const isOpen = openRow === r.block;
              const when = fmtWhen(r.lastSeen);
              return (
                // Key on the Fragment, not on the rows inside it: a keyless fragment in a
                // list makes React treat the pair as unkeyed and warn, and it loses row
                // identity across a re-sort - which would carry the expanded row over to
                // whichever block landed in that position.
                <Fragment key={r.block}>
                  {/* Zebra striping, then hover on top of it. `hover` alone was invisible
                      on alternate rows because MUI's wash and the stripe are the same
                      weight, so the stripe is a hair lighter and the hover is stated
                      explicitly to win over it. Striping is keyed to the SORTED index, so
                      the banding stays regular after re-sorting rather than travelling
                      with the rows. */}
                  <TableRow
                    sx={{
                      bgcolor: idx % 2 === 1
                        ? (mode === 'dark' ? 'rgba(255,255,255,0.022)' : 'rgba(16,24,40,0.016)')
                        : 'transparent',
                      transition: 'background-color .12s ease',
                      '&:hover': { bgcolor: mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(16,24,40,0.04)' },
                      '& > td': { borderBottom: isOpen ? 'none' : undefined },
                    }}
                  >
                    <TableCell sx={{ py: 1.1 }}>
                      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                        <Typography component="span" sx={{ fontSize: 13.5, fontWeight: 700, color: BRAND.heading }}>
                          {r.block}
                        </Typography>
                        {topBlock != null && r.block === topBlock && (
                          <Tooltip title="Highest sighting volume on the estate">
                            <Box component="span" sx={{ fontSize: 10, fontWeight: 700, color: BRAND.textLight, letterSpacing: '0.4px' }}>
                              HIGHEST
                            </Box>
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>

                    {/* NO CELL FILL. The tinted cell was added last round and taken back
                        out: a washed block behind a right-aligned figure read as a
                        highlighter stripe down the column rather than as a property of the
                        number, and it fought the zebra striping for the same pixels. The
                        state now lives in the figure's own ink plus the HOT badge beside
                        it, which is two cues without a third surface. */}
                    <TableCell align="right" sx={{ py: 1.1, fontVariantNumeric: 'tabular-nums' }}>
                      <Typography component="span" sx={{ fontSize: 14, fontWeight: 700, color: r.over ? INTENT.danger.ink : BRAND.heading }}>
                        {r.count}
                      </Typography>
                    </TableCell>

                    <TableCell sx={{ py: 1.1 }}><RiskBadge over={r.over} /></TableCell>

                    <TableCell sx={{ py: 1.1 }}>
                      <Typography sx={{ fontSize: 12.5, color: BRAND.text }}>
                        {r.animals.length
                          ? r.animals.map(a => SPECIES_LABEL[a] || a).join(', ')
                          : <Box component="span" sx={{ color: BRAND.textLight }}>—</Box>}
                      </Typography>
                    </TableCell>

                    <TableCell align="right" sx={{ py: 1.1 }}>
                      <Typography sx={{ fontSize: 12.5, color: when ? BRAND.text : BRAND.textLight, whiteSpace: 'nowrap' }}>
                        {when || 'not recorded'}
                      </Typography>
                    </TableCell>

                    <TableCell align="right" sx={{ py: 1.1 }}>
                      <IconButton
                        size="small"
                        onClick={() => setOpenRow(isOpen ? null : r.block)}
                        aria-label={`${isOpen ? 'Hide' : 'Show'} detail for ${r.block}`}
                        aria-expanded={isOpen}
                        sx={{ color: BRAND.textLight }}
                      >
                        <KeyboardArrowDownRoundedIcon
                          sx={{ fontSize: 19, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .18s ease' }}
                        />
                      </IconButton>
                    </TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell colSpan={COLUMNS.length + 1} sx={{ py: 0, borderBottom: isOpen ? undefined : 'none' }}>
                      <Collapse in={isOpen} unmountOnExit>
                        <Box sx={{ py: 1.5, px: 0.5 }}>
                          <Stack direction="row" spacing={3} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                            <Box>
                              <Typography sx={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: BRAND.textLight }}>
                                Against threshold
                              </Typography>
                              <Typography sx={{ fontSize: 13, color: BRAND.text, mt: 0.25 }}>
                                {r.count} of {HOTSPOT_MIN} needed to flag as a hotspot
                                {r.over ? ` - over by ${r.count - HOTSPOT_MIN}` : ` - ${HOTSPOT_MIN - r.count} below`}
                              </Typography>
                            </Box>
                            <Box>
                              <Typography sx={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: BRAND.textLight }}>
                                Species recorded
                              </Typography>
                              <Typography sx={{ fontSize: 13, color: BRAND.text, mt: 0.25 }}>
                                {r.animals.length ? r.animals.map(a => SPECIES_LABEL[a] || a).join(', ') : 'None recorded'}
                              </Typography>
                            </Box>
                          </Stack>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* WHAT IS NOT ON SCREEN IS STATED, always. A truncated table with no count reads
          as the complete estate, which is the one reading that would make an officer
          stop looking. */}
      <Stack
        direction="row"
        sx={{ mt: 1.5, gap: 1.5, alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap' }}
      >
        <Typography sx={{ fontSize: 11.5, color: BRAND.textLight }}>
          {hidden > 0
            ? `Top ${visible.length} of ${rows.length} blocks by ${orderBy === 'count' ? 'sightings' : COLUMNS.find(c => c.id === orderBy)?.label.toLowerCase()}`
            : `All ${rows.length} block${rows.length === 1 ? '' : 's'} with activity`}
        </Typography>
        {(hidden > 0 || showAll) && (
          <Link
            component="button"
            type="button"
            onClick={() => setShowAll(v => !v)}
            sx={{ fontSize: 11.5, fontWeight: 700, color: ON_SURFACE.info, textDecorationColor: 'currentColor' }}
          >
            {showAll ? `Show top ${VISIBLE_ROWS}` : `Show all ${rows.length}`}
          </Link>
        )}
      </Stack>

      {/* States the threshold once, in words, instead of drawing it as a dashed rule
          across every row - and pairs it with the SHARE, because the count alone does
          not say whether acting on these blocks would move the estate. */}
      <Typography sx={{ fontSize: 11.5, color: BRAND.textLight, mt: 0.75 }}>
        HOT marks a block at or over the hotspot threshold of {HOTSPOT_MIN} sightings
        {overCount > 0
          ? ` - ${overCount} of ${rows.length} block${rows.length === 1 ? '' : 's'} over, carrying ${concentration}% of all sightings.`
          : ' - none currently over.'}
      </Typography>
    </>
  );
}
