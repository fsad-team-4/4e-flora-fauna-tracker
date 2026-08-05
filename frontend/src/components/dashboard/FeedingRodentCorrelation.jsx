import { useEffect, useMemo, useState } from 'react';
import {
  Card, CardContent, Box, Stack, Typography, Skeleton, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TableSortLabel, Tooltip, Link,
} from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useTheme } from '@mui/material/styles';
import { BRAND, INTENT, SURFACE, RADII, surfaceSx } from '../../theme';
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

// 6 rows: this card sits full-width in its own zone, and six is enough to read the top of
// any sort without the card becoming the page. The bounded scroll below handles the rest.
const VISIBLE_ROWS = 6;

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

/**
 * THE EVIDENCE STRIP - the compact summary, and the only part of this card whose size
 * does not grow with the estate.
 *
 * The table can show six rows. What it cannot show is how much of the co-occurrence set
 * is actually ACTIONABLE, and here that is the whole question: this panel exists to
 * decide whether to send a feeding advisory instead of another pest call-out, and two of
 * its three outcomes say "not yet". Forty co-occurring blocks of which three are
 * supported is a very different morning than forty of which thirty are.
 *
 * It reuses orderingFlag() and SMALL_SAMPLE - the SAME two rules the Significance column
 * applies per row - rather than defining its own. A summary that graded blocks by a
 * second rule could contradict the rows directly beneath it, which is worse than having
 * no summary at all.
 *
 * The three outcomes, in the order an officer cares about them:
 *  - SUPPORTED    enough records, and feeding was logged BEFORE the rodent reports. This
 *                 is the set a feeding advisory is defensible on.
 *  - EARLY        under SMALL_SAMPLE records. The pattern may be real; there is not yet
 *                 enough of it to act on.
 *  - ORDER        feeding was first logged AFTER the rodent reports, so it cannot be the
 *                 driver of them. Still co-occurrence, still worth knowing, but not
 *                 evidence for food waste as a cause.
 */
function classify(block) {
  if (orderingFlag(block)) return 'order';
  if ((block.sampleSize || 0) < SMALL_SAMPLE) return 'early';
  return 'supported';
}

const EVIDENCE_TIERS = [
  { id: 'supported', label: 'Supported', hint: `Feeding logged before the rodent reports, and ${SMALL_SAMPLE}+ records behind it - a feeding advisory is defensible here.` },
  { id: 'early', label: 'Too early', hint: `Fewer than ${SMALL_SAMPLE} records. The pattern may be real but there is not enough of it yet.` },
  { id: 'order', label: 'Order rules it out', hint: 'Feeding was first logged after the rodent reports, so it cannot be driving them.' },
];

function EvidenceStrip({ blocks, mode }) {
  const counts = EVIDENCE_TIERS.map(t => ({ ...t, n: blocks.filter(b => classify(b) === t.id).length }));
  // Only `supported` gets a semantic colour. Tinting all three would imply three
  // severities where there is one conclusion and two kinds of "we do not know yet".
  const inkFor = id => (id === 'supported' ? SIGNAL_INK[mode].rodent : BRAND.textLight);

  return (
    <Box sx={{ mb: 2 }}>
      <Box
        role="img"
        aria-label={counts.map(c => `${c.n} ${c.label}`).join(', ')}
        sx={{ display: 'flex', gap: '2px', height: 10, borderRadius: `${RADII.chip}px`, overflow: 'hidden' }}
      >
        {counts.filter(c => c.n > 0).map(c => (
          <Tooltip key={c.id} arrow title={`${c.n} block${c.n === 1 ? '' : 's'} - ${c.hint}`}>
            <Box sx={{ flexGrow: c.n, flexBasis: 0, bgcolor: c.id === 'supported' ? SIGNAL_INK[mode].rodent : BRAND.border, minWidth: 3 }} />
          </Tooltip>
        ))}
      </Box>
      <Stack direction="row" sx={{ mt: 0.6, gap: 2, flexWrap: 'wrap' }}>
        {counts.map(c => (
          <Tooltip key={c.id} arrow title={c.hint}>
            <Typography sx={{ fontSize: 11, color: BRAND.textLight, cursor: 'help' }}>
              <Box component="span" sx={{ fontWeight: 800, color: inkFor(c.id) }}>{c.n}</Box>
              {` ${c.label.toLowerCase()}`}
            </Typography>
          </Tooltip>
        ))}
      </Stack>
    </Box>
  );
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
      // The label rides on the cell as an aria-label and a tooltip, so the meaning
      // survives for screen readers and for anyone who cannot separate the hues.
      aria-label={tint && tintLabel ? `${value}. ${tintLabel}` : undefined}
      sx={{ py: 1.25 }}
    >
      {/* A BADGE ON THE NUMBER, NOT A FILLED COLUMN.
          A solid tint across the whole cell drew a red block down the table and broke
          every horizontal line in it - and because the tint had to survive the zebra
          stripe and the row hover as well as the card, it needed its own separately
          measured colour just to stay visible. Wrapping the digits instead keeps the
          emphasis exactly where the data is: the eye goes to the figure, and the table's
          rules stay unbroken.

          `display: inline-flex` with a min-width means a flagged 8 and an unflagged 2
          still share the same right-hand rail, so the column of digits stays aligned. */}
      <Box
        component="span"
        sx={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end',
          minWidth: 30, px: tint ? 0.85 : 0, py: tint ? 0.25 : 0,
          borderRadius: `${RADII.chip}px`,
          bgcolor: tint ? INTENT.danger.bg : 'transparent',
        }}
      >
        <Typography
          component="span"
          sx={{
            fontSize: 15, fontWeight: 700,
            // flagged figures take the danger ink, so the number itself is the signal
            color: flat ? BRAND.textLight : (tint ? INTENT.danger.ink : color),
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value}
        </Typography>
      </Box>
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
function BlockRow({ block }) {
  const mode = useTheme().palette.mode;
  const ink = SIGNAL_INK[mode] || SIGNAL_INK.light;
  const s = SURFACE[mode] || SURFACE.dark;
  const dividerInk = mode === 'dark' ? 'rgba(255,255,255,0.06)' : BRAND.border;
  const rowHover = s.inset;
  const feedDate = fmtDate(block.firstFeedingDate);
  const rodentDate = fmtDate(block.firstRodentDate);
  const small = block.sampleSize < SMALL_SAMPLE;
  const flagged = orderingFlag(block);

  /**
   * MINIMALIST ROWS. The zebra fill is gone: alternating tinted rows are a heavy way to
   * do what a single hairline divider and a hover wash already do, and on a dark card the
   * stripe needed its own separately-measured tint to stay visible against three
   * different backdrops. One divider, one hover state, no vertical rules anywhere.
   */
  return (
    <TableRow
      hover
      sx={{
        '& > td': { borderBottom: `1px solid ${dividerInk}`, borderRight: 'none' },
        '&:last-of-type > td': { borderBottom: 'none' },
        '&:hover': { bgcolor: rowHover },
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
  const mode = useTheme().palette.mode;
  const [state, setState] = useState({ loading: true, error: false, windowDays: 30, blocks: [] });
  const [orderBy, setOrderBy] = useState('rodentAssessmentCount');
  const [order, setOrder] = useState('desc');
  /**
   * THE BUBBLE-CHART VIEW HAS BEEN REMOVED, and not for stylistic reasons.
   *
   * A scatter needs spread on both axes to show a relationship. This dataset cannot
   * provide it: blockDiagnosis counts a feeding signal only where a sighting's
   * `behaviour === 'feeding'`, the fauna source holds exactly TWO such sightings (Block
   * 456 and Block 789), and the panel then keeps only blocks carrying both signals. So
   * the chart could plot at most two bubbles, each with feedingCount = 1 - both sitting
   * on the same vertical line at x = 1, with no horizontal spread to read.
   *
   * No amount of styling fixes a two-point scatter. The table renders two rows or two
   * hundred equally well, and it is the view that carries the per-block caveats an
   * officer needs before acting. If the feeding signal ever becomes plentiful, the
   * scatter is worth revisiting - the shape question is real, the data volume is not.
   */

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

  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? sorted : sorted.slice(0, VISIBLE_ROWS);
  const hidden = sorted.length - visible.length;

  const sortBy = id => {
    if (orderBy === id) setOrder(o => (o === 'asc' ? 'desc' : 'asc'));
    else { setOrderBy(id); setOrder(id === 'block_number' ? 'asc' : 'desc'); }
  };

  return (
    <Card sx={{ ...surfaceSx(mode, 'card'), height: '100%' }}>
      <CardContent sx={{ p: { xs: 2.25, md: 3 }, '&:last-child': { pb: { xs: 2.25, md: 3 } } }}>
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
        {/* mb 2.5 - one header gap across every dashboard card. See RecentActivity. */}
        <Stack sx={{ mb: 2.5 }}>
          <Typography variant="body2" sx={{ color: BRAND.textLight, minWidth: 0 }}>
            Blocks where feeding activity co-occurs with rodent risk over the last {state.windowDays} days -
            worth investigating for food waste as a root cause
          </Typography>
        </Stack>

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
            <EvidenceStrip blocks={state.blocks} mode={mode} />

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
                        sx={{
                          py: 1.25, bgcolor: 'transparent', borderRight: 'none',
                          borderBottom: `1px solid ${mode === 'dark' ? 'rgba(255,255,255,0.10)' : BRAND.border}`,
                        }}
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
                  {visible.map(b => <BlockRow key={b.block_number} block={b} />)}
                </TableBody>
              </Table>
            </TableContainer>

            {/* The omitted count is printed rather than implied. A table cut at six rows
                with nothing said about it reads as "six blocks co-occur", which is a
                different and much more reassuring claim than the truth. */}
            <Stack direction="row" sx={{ mt: 1.5, gap: 1.5, alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <Typography sx={{ fontSize: 11.5, color: BRAND.textLight }}>
                {hidden > 0
                  ? `Top ${visible.length} of ${sorted.length} co-occurring blocks`
                  : `All ${sorted.length} co-occurring block${sorted.length === 1 ? '' : 's'}`}
              </Typography>
              {(hidden > 0 || showAll) && (
                <Link
                  component="button"
                  type="button"
                  onClick={() => setShowAll(v => !v)}
                  sx={{ fontSize: 11.5, fontWeight: 700, color: SIGNAL_INK[mode].feeding, textDecorationColor: 'currentColor' }}
                >
                  {showAll ? `Show top ${VISIBLE_ROWS}` : `Show all ${sorted.length}`}
                </Link>
              )}
            </Stack>
          </>
        )}
      </CardContent>
    </Card>
  );
}
