import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Typography, Button, Chip, Stack, Checkbox, CircularProgress, Alert,
  Tooltip, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  FormControlLabel, IconButton, Breadcrumbs, Link, InputAdornment,
  Select, MenuItem, Table, TableBody, TableCell, TableHead, TableRow,
  TableContainer, TableSortLabel, Drawer, Skeleton, LinearProgress,
  ToggleButton, ToggleButtonGroup, Paper,
} from '@mui/material';
import { visuallyHidden } from '@mui/utils';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import CalendarTodayRoundedIcon from '@mui/icons-material/CalendarTodayRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import DoneAllRoundedIcon from '@mui/icons-material/DoneAllRounded';
import PhotoLibraryOutlinedIcon from '@mui/icons-material/PhotoLibraryOutlined';
import ViewKanbanOutlinedIcon from '@mui/icons-material/ViewKanbanOutlined';
import TableRowsRoundedIcon from '@mui/icons-material/TableRowsRounded';
import { BRAND, INTENT, ON_SURFACE } from '../theme';
import http from '../http';
import UndoSnackbar from '../components/UndoSnackbar';

/* ------------------------------------------------------------------ tokens -- */

// Priority is expressed twice: a chip for the value, and a 3px left rule on the
// row so urgency is scannable down the edge of the table without flooding whole
// rows with colour. `rank` drives sorting; `accent` is the rule.
const PRIORITY = {
  critical: { label: 'Critical', bg: 'var(--em-danger-bg)', ink: 'var(--em-danger-ink)', accent: 'var(--em-prio-critical)', rank: 3 },
  high: { label: 'High', bg: 'var(--em-danger-bg)', ink: 'var(--em-danger-ink)', accent: 'var(--em-prio-high)', rank: 2 },
  medium: { label: 'Medium', bg: 'var(--em-warn-bg)', ink: 'var(--em-warn-ink)', accent: 'var(--em-prio-medium)', rank: 1 },
  low: { label: 'Low', bg: 'var(--em-neutral-bg)', ink: 'var(--em-neutral-ink)', accent: 'var(--em-prio-low)', rank: 0 },
};
const prio = level => PRIORITY[level] || PRIORITY.low;
const URGENT = new Set(['high', 'critical']);

// Pipeline stages, mirroring backend/src/services/workOrderStages.js. `rank` is
// the position used by the pipeline indicator; 'open' is kept as a legacy alias
// so rows raised before the pipeline existed still render.
const ORDER_STATUS = {
  raised: { label: 'Raised', bg: 'var(--em-neutral-bg)', ink: 'var(--em-neutral-ink)', rank: 0 },
  dispatched: { label: 'Dispatched', bg: 'var(--em-info-bg)', ink: 'var(--em-info-ink)', rank: 1 },
  scheduled: { label: 'Scheduled', bg: 'var(--em-info-bg)', ink: 'var(--em-info-ink)', rank: 2 },
  in_progress: { label: 'On site', bg: 'var(--em-warn-bg)', ink: 'var(--em-warn-ink)', rank: 3 },
  resolved: { label: 'Completed', bg: 'var(--em-ok-bg)', ink: 'var(--em-ok-ink)', rank: 4 },
  closed: { label: 'Closed', bg: 'var(--em-ok-bg)', ink: 'var(--em-ok-ink)', rank: 5 },
  open: { label: 'Open', bg: 'var(--em-info-bg)', ink: 'var(--em-info-ink)', rank: 0 },
};
const STAGE_SEQUENCE = ['raised', 'dispatched', 'scheduled', 'in_progress', 'resolved', 'closed'];

/**
 * Pipeline indicator - six segments, one per stage.
 *
 * A segment is filled ONLY when the backend says that stage was actually
 * reached (its own event with a timestamp and actor). Skipping straight to
 * "resolved" leaves "scheduled" hollow forever; it is never back-filled, because
 * a tracker that fills in stages nobody performed is the theatre the brief
 * rules out. Tooltip carries the real time and actor, or "not yet".
 */
function PipelineBar({ pipeline, status }) {
  // rows predating the event log have no pipeline array - fall back to the
  // current stage alone rather than inventing history for them
  const stages = pipeline?.length
    ? pipeline
    : STAGE_SEQUENCE.map(st => ({
      stage: st,
      label: ORDER_STATUS[st]?.label || st,
      reached: st === 'raised' && Boolean(status),
      at: null,
      actor_name: null,
    }));
  return (
    <Stack direction="row" spacing={0.4} sx={{ alignItems: 'center' }} aria-hidden={false}>
      {stages.map(s => (
        <Tooltip
          key={s.stage}
          arrow
          title={s.reached
            ? `${s.label} - ${new Date(s.at).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${s.actor_name ? ` by ${s.actor_name}` : ''}`
            : `${s.label} - not yet`}
        >
          <Box
            sx={{
              width: 16, height: 5, borderRadius: '3px', flexShrink: 0,
              bgcolor: s.reached ? ON_SURFACE.info : BRAND.border,
              opacity: s.reached ? 1 : 0.55,
            }}
          />
        </Tooltip>
      ))}
    </Stack>
  );
}

const money = n => `S$${(n || 0).toLocaleString('en-SG')}`;
const shortDate = iso => (iso ? new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' }) : '-');

function relativeTime(from) {
  const secs = Math.round((Date.now() - from) / 1000);
  if (secs < 45) return 'just now';
  if (secs < 90) return '1 min ago';
  if (secs < 3600) return `${Math.round(secs / 60)} min ago`;
  return `${Math.round(secs / 3600)} h ago`;
}


// One footer metadatum: a 13px glyph and recessive ink, so every card's footer
// reads as the same kind of information at the same weight.
function CardMeta({ icon: Icon, children, strong = false }) {
  return (
    <Stack direction="row" spacing={0.4} sx={{ alignItems: 'center', minWidth: 0 }}>
      <Icon sx={{ fontSize: 13, color: BRAND.textLight, flexShrink: 0 }} aria-hidden />
      <Typography
        sx={{
          fontSize: 11.5, whiteSpace: 'nowrap',
          fontWeight: strong ? 700 : 500,
          color: strong ? BRAND.text : BRAND.textLight,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {children}
      </Typography>
    </Stack>
  );
}

function PriorityChip({ level, size = 'small' }) {
  const m = prio(level);
  return (
    <Chip
      label={m.label}
      size={size}
      sx={{ bgcolor: m.bg, color: m.ink, fontWeight: 700, borderRadius: '6px', height: 22, fontSize: 12 }}
    />
  );
}

/* ------------------------------------------------------ command centre hero -- */

// One field style for every control in the toolbar, so search, both selects and the
// sort dropdown share an exact height and border. They were only loosely aligned
// before - MUI gives a TextField and a Select slightly different intrinsic heights
// at size="small", which read as a ragged row.
const FIELD_H = 38;
/**
 * Ghost control: a grey fill with NO resting border, outlined only on hover and
 * focus. Five bordered boxes in a row read as five objects competing with the
 * grid below them; the fill alone is enough to say "this is an input".
 * The focus outline is deliberately the full 2px action blue - a ghost field
 * must not become a field with no visible focus state.
 */
const FIELD_SX = {
  minWidth: 132,
  bgcolor: BRAND.section,
  borderRadius: '8px',
  '& .MuiOutlinedInput-root': { height: FIELD_H, borderRadius: '8px' },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'transparent' },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: BRAND.border },
  '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: BRAND.action, borderWidth: 2 },
  '& .MuiSelect-select, & .MuiInputBase-input': { fontSize: 14, fontWeight: 500 },
};

/**
 * The board's columns, one per REAL pipeline stage.
 *
 * `stage` is the value sent to PATCH /:id/stage. Dropping on "Completed" records
 * `resolved` (work done, staff may report it) - CLOSING an order is the separate
 * administrative act and stays on the panel's own admin-gated button.
 *
 * BOARD_RANK drives forward-only drag validation and mirrors the backend's STAGES
 * order, so the UI never offers a drop the server will reject.
 */
const BOARD_COLUMNS = [
  { col: 'pending', title: 'Requires action', accent: 'var(--em-prio-critical)', hint: 'Reports awaiting approval' },
  { col: 'raised', title: 'Raised', stage: 'raised', accent: 'var(--em-prio-high)', hint: 'Approved, not yet dispatched' },
  { col: 'dispatched', title: 'Dispatched', stage: 'dispatched', accent: 'var(--em-info-ink)', hint: 'With the contractor' },
  { col: 'scheduled', title: 'Scheduled', stage: 'scheduled', accent: 'var(--em-info-ink)', hint: 'Attendance date confirmed' },
  { col: 'in_progress', title: 'On site', stage: 'in_progress', accent: 'var(--em-warn-strong)', hint: 'Contractor attending' },
  { col: 'done', title: 'Completed', stage: 'resolved', accent: 'var(--em-ok-strong)', hint: 'Work finished or closed' },
];
const STAGE_FOR_COLUMN = Object.fromEntries(BOARD_COLUMNS.filter(c => c.stage).map(c => [c.col, c.stage]));
// 'open' is the legacy pre-pipeline status and ranks with 'raised'
const BOARD_RANK = { open: 0, raised: 0, dispatched: 1, scheduled: 2, in_progress: 3, resolved: 4, closed: 4 };

const RANGES = [
  { value: 0, label: 'Any date' },
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
];

/**
 * The utilitarian hero: who you are, what is on fire, and the one action to take.
 *
 * WHAT WAS REMOVED, AND WHERE IT WENT:
 * Four KPI tiles (blocks affected / call-outs avoidable / est. saved / orders in
 * progress) used to sit under the CTA. They put four numbers nobody acts on in the
 * one place reserved for the thing you must act on, and they competed with both the
 * greeting and the queue. Counts still live in the tab labels, where they belong to
 * the navigation; the consolidation value story (call-outs avoided, est. savings)
 * is on the Dashboard hero, which is the reporting surface. Nothing was lost.
 *
 * The CSV export moved out of the CTA cluster and into the toolbar. A download
 * glyph immediately beside the primary button read as a second action of equal
 * rank - and a downward arrow is the wrong signal next to "review urgent".
 */
/**
 * The three summary cards, as filters.
 *
 * `value` reads live counts rather than caching them, so a card can never state
 * a figure the queue below has already moved past. Each `apply` sets the tab and
 * priority the card claims to represent - pressing "7 Urgent" must actually show
 * seven rows, or the card is lying.
 */
const KPI_CARDS = [
  {
    key: 'urgent',
    label: 'Urgent',
    ink: 'var(--em-prio-critical)',
    value: ({ urgentCount }) => urgentCount,
  },
  {
    key: 'action',
    label: 'Requires action',
    ink: 'var(--em-prio-high)',
    value: ({ pending }) => pending,
  },
  {
    key: 'done',
    label: 'Completed',
    ink: 'var(--em-ok-strong)',
    value: ({ orders }) => (orders?.done?.length ?? 0),
  },
];

function CommandCentre({
  urgentCount, q, setQ, priority, setPriority,
  range, setRange, sort, setSort, sortOptions, primary, onExport, view, onView,
  kpiFilter, applyKpiFilter, boardPending, boardOrders,
}) {
  return (
    <>
      {/* Functional page title, not a headline. The greeting was 32px of prime
          vertical space carrying no operational value; it survives as a single
          line of supporting text and the title now names the page. */}
      {/* Header AND toolbar stick as one unit, so the primary action and the
          filters both survive a scroll through a long queue. */}
      <Box sx={{ position: 'sticky', top: 0, zIndex: 20, bgcolor: BRAND.surface, px: { xs: 2, md: 3 }, pt: 2.25, pb: 1.5 }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 1.5 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h1" sx={{ fontSize: { xs: 19, md: 21 }, fontWeight: 800, color: BRAND.ink, letterSpacing: '-0.3px', lineHeight: 1.25 }}>
              Action Queue
            </Typography>

            {/* INLINE INSIGHT STRIP.
                These were three bordered cards eating a band of the viewport to
                show three integers. Same figures, same click-to-filter, as a
                borderless row of pills - the queue itself starts ~15% higher up.
                The dot is a graphic, so the count and label carry the meaning too. */}
            <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: 'wrap', rowGap: 0.75 }}>
              {KPI_CARDS.map(card => {
                const active = kpiFilter === card.key;
                const value = card.value({ urgentCount, pending: boardPending.length, orders: boardOrders });
                return (
                  <Stack
                    key={card.key}
                    component="button"
                    type="button"
                    direction="row"
                    spacing={0.75}
                    aria-pressed={active}
                    onClick={() => applyKpiFilter(card.key)}
                    sx={{
                      alignItems: 'center', font: 'inherit', cursor: 'pointer',
                      px: 1.25, py: 0.5, borderRadius: '999px', border: 0,
                      bgcolor: active ? BRAND.navySoft : 'transparent',
                      '&:hover': { bgcolor: active ? BRAND.navySoft : BRAND.section },
                      '&:focus-visible': { outline: `2px solid ${BRAND.action}`, outlineOffset: 2 },
                    }}
                  >
                    <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: card.ink, flexShrink: 0 }} />
                    <Typography component="span" sx={{ fontSize: 14, fontWeight: 800, color: BRAND.heading, fontVariantNumeric: 'tabular-nums' }}>
                      {value}
                    </Typography>
                    <Typography component="span" sx={{ fontSize: 13, color: BRAND.text, fontWeight: active ? 700 : 500 }}>
                      {card.label}
                    </Typography>
                  </Stack>
                );
              })}
              {kpiFilter && (
                <Button size="small" onClick={() => applyKpiFilter(kpiFilter)} sx={{ textTransform: 'none', color: BRAND.textLight, fontSize: 12.5, minWidth: 0 }}>
                  Clear
                </Button>
              )}
            </Stack>
          </Box>

          {/* the one global action, level with the title */}
          <Button
            variant="contained"
            disableElevation
            onClick={primary.onClick}
            disabled={primary.disabled}
            sx={{
              flexShrink: 0, bgcolor: BRAND.action, color: '#fff', fontWeight: 700, fontSize: 14.5,
              px: 2.25, py: 1, borderRadius: '8px', whiteSpace: 'nowrap', textTransform: 'none',
              boxShadow: '0 4px 14px rgba(29,78,216,.34)',
              '&:hover': { bgcolor: BRAND.actionHover, boxShadow: '0 6px 18px rgba(29,78,216,.45)' },
            }}
          >
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
              {primary.label}
              {primary.count > 0 && (
                /* the count as a badge INSIDE the button, replacing the warning
                   triangle - a caution glyph on the primary action read as a
                   hazard rather than an invitation */
                <Box
                  component="span"
                  aria-hidden
                  sx={{
                    minWidth: 22, height: 22, px: 0.5, borderRadius: '999px',
                    bgcolor: 'rgba(255,255,255,.22)', color: '#fff',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {primary.count}
                </Box>
              )}
            </Box>
          </Button>
        </Stack>
      </Box>

      {/* ── Unified toolbar ────────────────────────────────────────────────
          One full-width bar with its own bottom rule, separating the controls
          from the board. Inputs cluster left, view controls sit hard right. */}
      <Stack
        direction="row"
        spacing={1}
        sx={{
          position: 'sticky', top: 84, zIndex: 19,
          px: { xs: 2, md: 3 }, py: 1.25,
          bgcolor: BRAND.surface,
          flexWrap: 'wrap', rowGap: 1.25, alignItems: 'center',
          // the lower rule is what separates the control bar from the data grid
          boxShadow: `inset 0 -1px 0 ${BRAND.border}`,
        }}
      >
        <TextField
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search block, observation or contractor"
          size="small"
          sx={{ ...FIELD_SX, minWidth: { xs: '100%', sm: 300 }, maxWidth: 380 }}
          slotProps={{
            input: {
              'aria-label': 'Search the queue',
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon sx={{ fontSize: 19, color: BRAND.textLight }} />
                </InputAdornment>
              ),
            },
          }}
        />
        <Select
          value={priority}
          onChange={e => setPriority(e.target.value)}
          size="small"
          sx={FIELD_SX}
          slotProps={{ input: { 'aria-label': 'Filter by priority' } }}
        >
          <MenuItem value="all">All priorities</MenuItem>
          {['critical', 'high', 'medium', 'low'].map(k => (
            <MenuItem key={k} value={k}>{PRIORITY[k].label}</MenuItem>
          ))}
        </Select>
        <Select
          value={range}
          onChange={e => setRange(e.target.value)}
          size="small"
          sx={FIELD_SX}
          slotProps={{ input: { 'aria-label': 'Filter by date range' } }}
        >
          {RANGES.map(r => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
        </Select>

        <Box sx={{ flexGrow: 1 }} />

        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
          <Typography sx={{ fontSize: 13, color: BRAND.textLight, fontWeight: 600, display: { xs: 'none', md: 'block' } }}>Sort by</Typography>
          <Select
            value={sort.key}
            onChange={e => setSort({ key: e.target.value, dir: 'desc' })}
            size="small"
            sx={FIELD_SX}
            slotProps={{ input: { 'aria-label': 'Sort by' } }}
          >
            {sortOptions.map(o => <MenuItem key={o.key} value={o.key}>{o.label}</MenuItem>)}
          </Select>
          <Tooltip arrow title={sort.dir === 'desc' ? 'Descending - click for ascending' : 'Ascending - click for descending'}>
            <IconButton
              onClick={() => setSort(s => ({ ...s, dir: s.dir === 'desc' ? 'asc' : 'desc' }))}
              aria-label={`Sort direction: ${sort.dir === 'desc' ? 'descending' : 'ascending'}`}
              sx={{ width: FIELD_H, height: FIELD_H, borderRadius: '8px', border: `1px solid ${BRAND.border}`, bgcolor: BRAND.surface, color: BRAND.textLight, fontSize: 13, fontWeight: 700 }}
            >
              {sort.dir === 'desc' ? '↓' : '↑'}
            </IconButton>
          </Tooltip>

          {/* Connected segmented control, filled-selected rather than outlined, so
              it reads as one switch with two positions instead of two buttons. */}
          <ToggleButtonGroup
            value={view}
            exclusive
            onChange={(_, v) => v && onView(v)}
            size="small"
            aria-label="Layout"
            sx={{
              ml: 0.5, flexShrink: 0, bgcolor: BRAND.section, borderRadius: '8px', p: '3px', gap: '2px',
              '& .MuiToggleButtonGroup-grouped': {
                border: 0, marginLeft: 0, height: FIELD_H - 8, px: 1.25,
                borderRadius: '6px !important', textTransform: 'none',
                fontSize: 12.5, fontWeight: 700, color: BRAND.textLight,
                '&:hover': { bgcolor: 'rgba(120,130,145,0.12)' },
                '&.Mui-selected': {
                  bgcolor: BRAND.surface, color: BRAND.heading,
                  boxShadow: '0 1px 3px rgba(16,24,40,.16)',
                  '&:hover': { bgcolor: BRAND.surface },
                },
              },
            }}
          >
            <ToggleButton value="board" aria-label="Board view">
              <ViewKanbanOutlinedIcon sx={{ fontSize: 16, mr: 0.5 }} /> Board
            </ToggleButton>
            <ToggleButton value="list" aria-label="List view">
              <TableRowsRoundedIcon sx={{ fontSize: 15, mr: 0.5 }} /> List
            </ToggleButton>
          </ToggleButtonGroup>

          <Tooltip arrow title="Download the current view as CSV">
            <IconButton
              onClick={onExport}
              aria-label="Export current view to CSV"
              sx={{ width: FIELD_H, height: FIELD_H, borderRadius: '8px', border: `1px solid ${BRAND.border}`, color: BRAND.textLight, bgcolor: BRAND.surface }}
            >
              <FileDownloadOutlinedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>
    </>
  );
}

/* ------------------------------------------------------------------ kanban -- */

/**
 * Task card - the board's unit, and the list's row replacement.
 *
 * Block is the dominant header with the priority badge immediately beside it, so
 * "which building, how urgent" is one fixation. The observation is clamped to two
 * lines; a card is a summary, and an un-clamped observation pushed the metrics
 * out of alignment across cards.
 */
function TaskCard({
  title, subtitle, level, observation, meta, selected, checked, onToggle,
  onOpen, draggable, onDragStart, onDragEnd, dragging, action,
}) {
  return (
    <Box
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(); } }}
      sx={{
        position: 'relative',
        // Solid surface, never a tint - a pale priority wash behind the whole card
        // dropped the contrast of every glyph on it, and a column of pink cards
        // turned the priority signal into wallpaper.
        // The 4px priority edge is gone too: the Critical/High pill already states
        // urgency in words, so the bar was the same fact a second time and left
        // every card looking bracketed.
        p: 1.5, borderRadius: '10px', cursor: draggable ? 'grab' : 'pointer',
        bgcolor: BRAND.surface,
        border: `1px solid ${selected ? ON_SURFACE.info : BRAND.border}`,
        boxShadow: selected ? `0 0 0 1px ${ON_SURFACE.info}` : '0 1px 3px rgba(0,0,0,0.1)',
        opacity: dragging ? 0.45 : 1,
        transition: 'box-shadow .15s ease, transform .15s ease',
        '&:hover': { boxShadow: '0 4px 10px rgba(16,24,40,.13)', transform: 'translateY(-1px)' },
        '&:focus-visible': { outline: `2px solid ${BRAND.accent}`, outlineOffset: 2 },
        // reveal the selection control on engagement, never at rest
        '&:hover .aq-card-check, &:focus-within .aq-card-check': { opacity: 1 },
      }}
    >
      {/* Selection control, in a RESERVED gutter.
          It is absolutely positioned so revealing it never reflows the card, but
          the top row keeps a permanent left inset the same width - otherwise the
          checkbox landed straight on top of the block number the moment you
          hovered, which is the one thing on the card you need to read.
          Reserving the space costs a few pixels at rest and guarantees no overlap
          and no jump. It shows on hover, on keyboard focus, or once selected;
          focus-within is load-bearing, or a keyboard user could tab to a control
          sitting at opacity 0. */}
      {onToggle && (
        <Checkbox
          className="aq-card-check"
          size="small"
          checked={checked}
          onChange={onToggle}
          onClick={e => e.stopPropagation()}
          slotProps={{ input: { 'aria-label': `Select ${title}` } }}
          sx={{
            position: 'absolute', top: 8, left: 6, p: 0.25, zIndex: 1,
            opacity: checked ? 1 : 0,
            transition: 'opacity .12s ease',
            '&.Mui-checked': { color: ON_SURFACE.info },
            '&:hover': { bgcolor: BRAND.surface },
          }}
        />
      )}

      {/* TOP ROW: identity left, priority right. `pl` reserves the checkbox
          gutter so the two never occupy the same pixels. */}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', justifyContent: 'space-between', pl: onToggle ? '26px' : 0 }}>
        <Box sx={{ minWidth: 0 }}>
          {/* smaller than it was, same weight: it stays the anchor without
              out-shouting the observation underneath it */}
          <Typography sx={{ fontSize: 14, fontWeight: 800, color: BRAND.heading, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </Typography>
          {subtitle && <Typography sx={{ fontSize: 12, color: BRAND.textLight, mt: 0.25 }}>{subtitle}</Typography>}
        </Box>
        {level && <Box sx={{ flexShrink: 0 }}><PriorityChip level={level} /></Box>}
      </Stack>

      {/* MIDDLE ROW: the summary, clamped to two lines. */}
      {observation && (
        <Typography
          sx={{
            fontSize: 13, color: BRAND.text, mt: 0.75, lineHeight: 1.5,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}
        >
          {observation}
        </Typography>
      )}

      {/* BOTTOM ROW: a distinct metadata footer, separated by a hairline so it
          reads as the card's chrome rather than as another line of content.
          Action buttons no longer live on the card - see the board's drag notes. */}
      {meta && (
        <Stack
          direction="row"
          spacing={1.25}
          sx={{
            mt: 1.25, pt: 1, borderTop: `1px solid ${BRAND.section}`,
            flexWrap: 'wrap', rowGap: 0.5, alignItems: 'center',
          }}
        >
          {meta}
        </Stack>
      )}
      {action && <Box sx={{ mt: 1.25 }}>{action}</Box>}
    </Box>
  );
}

/**
 * Board column. Columns are LIFECYCLE stages, not priorities.
 *
 * Priority columns would make a drag meaningless - a block's risk level is what
 * the AI assessed, not something an officer reassigns by dropping a card. Stages
 * are the transitions that map to real operations ("approve & raise" and "close"),
 * so dragging a card actually does the thing the board implies. Priority is still
 * the primary visual: it tints every card, badges it, and orders the column.
 */
function BoardColumn({ id, title, count, hint, accent, children, dropActive, canDrop, onDragOver, onDrop, onDragLeave, empty = false }) {
  // one source of truth - the width, the header layout and the body visibility
  // all keyed off the same flag so they can never disagree mid-transition
  const collapsed = empty && !dropActive;
  return (
    <Box
      onDragOver={canDrop ? onDragOver : undefined}
      onDrop={canDrop ? onDrop : undefined}
      onDragLeave={canDrop ? onDragLeave : undefined}
      sx={{
        // An EMPTY column collapses to a narrow strip rather than holding a
        // full-width "Nothing at this stage" placeholder - with six stages, most
        // are empty most of the time, and they were spending the width of the
        // board on nothing. It expands on hover, on keyboard focus, and whenever
        // a card is dragged over it, so it is never a dead end.
        flex: collapsed ? '0 0 auto' : '1 1 0',
        width: collapsed ? 56 : 'auto',
        minWidth: collapsed ? 56 : 200,
        // NO max width on an expanded column. A 300px cap was sized for six
        // columns all expanded; the moment two collapse to 56px strips the other
        // four cannot absorb the width they freed, and the board stops short with
        // a band of dead space on the right. flex: 1 1 0 shares out whatever is
        // actually there, so the board fills at any mix of collapsed/expanded.
        maxWidth: collapsed ? 56 : 'none',
        display: 'flex', flexDirection: 'column',
        // white surface with a 2px status-coloured cap, replacing the grey fill
        bgcolor: dropActive ? `color-mix(in srgb, ${ON_SURFACE.info} 8%, ${BRAND.surface})` : BRAND.surface,
        border: `1px solid ${dropActive ? ON_SURFACE.info : BRAND.border}`,
        borderTop: `2px solid ${accent}`,
        borderRadius: '10px', minHeight: 0, overflow: 'hidden',
        transition: 'flex .18s ease, width .18s ease, min-width .18s ease, max-width .18s ease, background-color .15s ease',
        '&:hover, &:focus-within': {
          flex: '1 1 0', width: 'auto', minWidth: 200, maxWidth: 300,
        },
      }}
    >
      {collapsed ? (
        /* COLLAPSED: a column, not a rotated row.
           writingMode was previously set on the whole flex row, which turned the
           count pill and the status dot on their sides along with the label - the
           badge rendered sideways and the dot's flow direction flipped. Only the
           TITLE should rotate; the dot is round and the number must stay upright
           to be read at a glance. */
        <Stack
          spacing={1}
          sx={{ alignItems: 'center', px: 0.75, py: 1.5, height: '100%', minHeight: 0 }}
        >
          <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: accent, flexShrink: 0 }} />
          <Typography
            sx={{
              writingMode: 'vertical-rl', transform: 'rotate(180deg)',
              fontSize: 12, fontWeight: 900, color: BRAND.heading,
              textTransform: 'uppercase', letterSpacing: '0.7px', whiteSpace: 'nowrap',
              flexGrow: 1, minHeight: 0, overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            {title}
          </Typography>
          <Box
            component="span"
            sx={{
              fontSize: 11.5, fontWeight: 800, lineHeight: '18px', minWidth: 20, textAlign: 'center',
              px: 0.7, borderRadius: '999px', bgcolor: BRAND.slate, color: '#fff',
              fontVariantNumeric: 'tabular-nums', flexShrink: 0,
            }}
          >
            {count}
          </Box>
        </Stack>
      ) : (
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: 'center', px: 1.75, py: 1.25, borderBottom: `1px solid ${BRAND.border}` }}
        >
          <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: accent, flexShrink: 0 }} />
          <Typography sx={{ fontSize: 12.5, fontWeight: 900, color: BRAND.heading, textTransform: 'uppercase', letterSpacing: '0.7px', whiteSpace: 'nowrap' }}>
            {title}
          </Typography>
          {/* Solid slate pill with white text. The outlined pale badge blended into
              the column header's own background and read as part of the title. */}
          <Box
            component="span"
            sx={{
              fontSize: 11.5, fontWeight: 800, lineHeight: '18px', minWidth: 20, textAlign: 'center',
              px: 0.7, borderRadius: '999px', bgcolor: BRAND.slate, color: '#fff',
              fontVariantNumeric: 'tabular-nums', flexShrink: 0,
            }}
          >
            {count}
          </Box>
        </Stack>
      )}
      {hint && !collapsed && (
        <Typography sx={{ fontSize: 11.5, color: BRAND.textLight, px: 1.75, pt: 1 }}>{hint}</Typography>
      )}
      {/* the body is dropped entirely while collapsed - no placeholder text */}
      {!collapsed && (
        <Stack spacing={1.25} id={id} sx={{ p: 1.5, overflowY: 'auto', flexGrow: 1, minHeight: 120 }}>
          {children}
        </Stack>
      )}
    </Box>
  );
}

/* ------------------------------------------------------------------- table -- */

const HEAD_SX = {
  fontSize: 12, fontWeight: 600, color: BRAND.textLight, textTransform: 'uppercase',
  letterSpacing: '0.05em', bgcolor: BRAND.section, borderBottom: `1px solid ${BRAND.border}`,
  py: 1.25, whiteSpace: 'nowrap',
};

/**
 * Alignment by DATA TYPE, not by position.
 *   left   - identifiers and prose (block, observation, contractor)
 *   center - state badges, which otherwise float in the middle of a wide column
 *   right  - quantities and dates, so magnitudes and digits stack for scanning
 * A column declares `align`; `numeric` still implies right for existing defs.
 */
const alignOf = c => c.align || (c.numeric ? 'right' : 'left');
const CELL_SX = { borderBottom: `1px solid ${BRAND.border}`, py: 1.5, fontSize: 14, color: BRAND.text };

// Micro-CTAs stay out of the way until the row is engaged, but a keyboard user
// must never be able to focus an invisible control - hence focus-within and the
// selected state both force them visible, and the hover-only hiding is gated to
// pointer devices so touch always shows them.
const ROW_ACTIONS_SX = {
  display: 'flex', gap: 0.5, justifyContent: 'flex-end',
  '@media (hover: hover)': {
    opacity: 0,
    transition: 'opacity .12s ease',
    'tr:hover &, tr:focus-within &, tr[aria-selected="true"] &': { opacity: 1 },
  },
};

function GhostButton({ children, onClick, ...rest }) {
  return (
    <Button
      size="small"
      onClick={e => { e.stopPropagation(); onClick(e); }}
      sx={{
        minWidth: 0, px: 1.25, fontSize: 13, fontWeight: 700, borderRadius: '6px',
        color: BRAND.textLight, border: `1px solid ${BRAND.border}`, bgcolor: BRAND.surface,
        '&:hover': { borderColor: ON_SURFACE.info, color: ON_SURFACE.info, bgcolor: BRAND.surface },
      }}
      {...rest}
    >
      {children}
    </Button>
  );
}

/**
 * The queue as an enterprise data grid. Text is left-aligned; every status,
 * count, money figure and date is right-aligned so the metadata forms one
 * scannable vertical axis at the end of each row.
 *
 * `compact` is what reconciles "use a data grid" with "use a 40/60 master-detail
 * split": the grid IS the master, and it sheds its middle columns when a detail
 * panel opens rather than trying to squeeze eight columns into 40% of the width.
 */
function QueueTable({ columns, rows, sort, onSort, selectedKey, onSelect, checked, onToggle, onToggleAll, compact }) {
  const cols = compact ? columns.filter(c => c.compact) : columns;
  const allChecked = rows.length > 0 && rows.every(r => checked.has(r.key));
  const someChecked = rows.some(r => checked.has(r.key));

  return (
    <TableContainer sx={{ bgcolor: BRAND.surface }}>
      <Table stickyHeader size="small" sx={{ '& td, & th': { borderColor: BRAND.border } }}>
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox" sx={{ ...HEAD_SX, pl: 1 }}>
              <Checkbox
                size="small"
                checked={allChecked}
                indeterminate={!allChecked && someChecked}
                onChange={e => onToggleAll(e.target.checked)}
                slotProps={{ input: { 'aria-label': 'Select all rows in view' } }}
                sx={{ p: 0.5, color: BRAND.textLight, '&.Mui-checked, &.MuiCheckbox-indeterminate': { color: ON_SURFACE.info } }}
              />
            </TableCell>
            {cols.map(c => (
              <TableCell
                key={c.key}
                align={alignOf(c)}
                sx={{ ...HEAD_SX, width: c.width }}
                sortDirection={sort.key === c.key ? sort.dir : false}
              >
                {c.sortable === false ? c.label : (
                  <TableSortLabel
                    active={sort.key === c.key}
                    direction={sort.key === c.key ? sort.dir : 'desc'}
                    onClick={() => onSort(c.key)}
                    sx={{ color: 'inherit !important', '& .MuiTableSortLabel-icon': { color: 'inherit !important' } }}
                  >
                    {c.label}
                  </TableSortLabel>
                )}
              </TableCell>
            ))}
            <TableCell align="right" sx={{ ...HEAD_SX, width: 100 }}><Box component="span" sx={visuallyHidden}>Actions</Box></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map(row => {
            const selected = row.key === selectedKey;
            return (
              <TableRow
                key={row.key}
                hover
                aria-selected={selected}
                tabIndex={0}
                onClick={() => onSelect(row.key)}
                onKeyDown={e => {
                  // only act on the row itself - descendants (checkbox, Done
                  // button) keep their own Space/Enter behaviour
                  if (e.target !== e.currentTarget) return;
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(row.key); }
                }}
                sx={{
                  cursor: 'pointer',
                  bgcolor: selected ? BRAND.navySoft : 'transparent',
                  '&:hover': { bgcolor: selected ? BRAND.navySoft : BRAND.section },
                  // priority as a rule down the row's leading edge
                  '& > td:first-of-type': { boxShadow: `inset 3px 0 0 ${prio(row.priority).accent}` },
                  '&:focus-visible': { outline: `2px solid ${BRAND.action}`, outlineOffset: '-2px' },
                }}
              >
                <TableCell padding="checkbox" sx={{ ...CELL_SX, pl: 1 }}>
                  <Checkbox
                    size="small"
                    checked={checked.has(row.key)}
                    onClick={e => e.stopPropagation()}
                    onChange={() => onToggle(row.key)}
                    slotProps={{ input: { 'aria-label': `Select ${row.selectLabel}` } }}
                    sx={{ p: 0.5, color: BRAND.textLight, '&.Mui-checked': { color: ON_SURFACE.info } }}
                  />
                </TableCell>
                {cols.map(c => (
                  <TableCell key={c.key} align={alignOf(c)} sx={CELL_SX}>
                    {c.render(row)}
                  </TableCell>
                ))}
                <TableCell align="right" sx={{ ...CELL_SX, pr: 1.5 }}>
                  <Box sx={ROW_ACTIONS_SX}>{row.actions}</Box>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/* ------------------------------------------------------------ detail panels -- */

function PanelShell({ title, subtitle, chips, onClose, children, footer }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: BRAND.surface }}>
      <Box sx={{ px: 2.5, pt: 2.5, pb: 2, borderBottom: `1px solid ${BRAND.border}` }}>
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h2" sx={{ fontSize: 20, fontWeight: 800, color: BRAND.heading, lineHeight: 1.2 }}>{title}</Typography>
            {subtitle && <Typography sx={{ fontSize: 13.5, color: BRAND.textLight, mt: 0.25 }}>{subtitle}</Typography>}
          </Box>
          <IconButton onClick={onClose} aria-label="Close detail panel" size="small" sx={{ color: BRAND.textLight }}>
            <CloseRoundedIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Stack>
        {chips && <Stack direction="row" spacing={0.75} sx={{ mt: 1.25, flexWrap: 'wrap', rowGap: 0.75 }}>{chips}</Stack>}
      </Box>
      <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 3, py: 2.5 }}>{children}</Box>
      {footer && (
        // Elevated action shelf: an upward shadow lifts it off the scrolling content
        // so the CTA reads as pinned rather than as the last item in the list, and
        // the 24px gutter matches the body so the button lines up with the content
        // above it instead of being inset differently.
        <Box
          sx={{
            px: 3, py: 2.5, borderTop: `1px solid ${BRAND.border}`, bgcolor: BRAND.surface,
            boxShadow: '0 -6px 20px rgba(16,24,40,.10), 0 -1px 3px rgba(16,24,40,.05)',
            flexShrink: 0, zIndex: 1,
          }}
        >
          {footer}
        </Box>
      )}
    </Box>
  );
}

/**
 * One cell of the detail grid: a small uppercase label over a solid value.
 *
 * Replaces the label-left / value-right split rows. Those put a long value hard
 * against the panel's right edge and a short one adrift in the middle, so nothing
 * shared a rail; stacking the pair means every value starts on the same left edge.
 */
function MetaCell({ label, children, span = 1 }) {
  return (
    <Box sx={{ minWidth: 0, gridColumn: span === 2 ? { xs: 'span 1', sm: 'span 2' } : 'span 1' }}>
      <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.6px', mb: 0.25 }}>
        {label}
      </Typography>
      <Typography component="div" sx={{ fontSize: 14, color: BRAND.heading, fontWeight: 600, lineHeight: 1.4, wordBreak: 'break-word' }}>
        {children}
      </Typography>
    </Box>
  );
}

const NOT_RECORDED = <Box component="span" sx={{ color: BRAND.textLight, fontStyle: 'italic', fontWeight: 500 }}>not recorded</Box>;

/**
 * Compact horizontal stepper across the top of the order panel.
 *
 * The vertical list this replaces gave each of six stages its own two-line row plus
 * a rule - roughly 250px of the panel's most valuable space to answer "where are
 * we?". Horizontally it answers the same question in one band.
 *
 * The honesty contract is unchanged and is the reason this is not a plain MUI
 * Stepper with an activeStep index: a step is filled ONLY where the backend logged
 * that stage with a timestamp and an actor. A skipped stage stays hollow forever
 * and is never back-filled, so the connector into a reached stage is only solid
 * when that stage itself was reached - the bar can legitimately show gaps.
 */
// Short forms of the pipeline labels, matched to the board's column titles so the
// stepper names a stage the same way the column the officer dragged from did.
const STEP_LABEL = {
  raised: 'Raised',
  dispatched: 'Dispatched',
  scheduled: 'Scheduled',
  in_progress: 'On site',
  resolved: 'Completed',
  closed: 'Closed',
};

function StageStepper({ stages }) {
  if (!stages?.length) return null;
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2.5 }}>
      {stages.map((s, i) => (
        <Box key={s.stage} sx={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            {/* half-width connectors either side of the dot, blanked at the ends,
                so the track reads continuous without overhanging */}
            <Box sx={{ flex: 1, height: 2, bgcolor: i === 0 ? 'transparent' : (s.reached ? ON_SURFACE.info : BRAND.border) }} />
            <Tooltip
              arrow
              title={s.reached
                ? `${s.label} - ${new Date(s.at).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${s.actor_name ? ` by ${s.actor_name}` : ''}`
                : `${s.label} - not yet`}
            >
              <Box
                sx={{
                  width: 12, height: 12, borderRadius: '50%', flexShrink: 0, cursor: 'help',
                  bgcolor: s.reached ? ON_SURFACE.info : BRAND.surface,
                  border: s.reached ? 'none' : `1.5px dashed ${BRAND.border}`,
                  boxShadow: s.reached ? `0 0 0 3px color-mix(in srgb, ${ON_SURFACE.info} 18%, transparent)` : 'none',
                }}
              />
            </Tooltip>
            <Box sx={{ flex: 1, height: 2, bgcolor: i === stages.length - 1 ? 'transparent' : (stages[i + 1]?.reached ? ON_SURFACE.info : BRAND.border) }} />
          </Box>
          <Typography
            sx={{
              mt: 0.75, fontSize: 10, lineHeight: 1.25, textAlign: 'center',
              fontWeight: s.reached ? 800 : 500,
              color: s.reached ? BRAND.heading : BRAND.textLight,
              textTransform: 'uppercase', letterSpacing: '0.3px',
            }}
          >
            {STEP_LABEL[s.stage] || s.label}
          </Typography>
          {/* the date is the evidence the stage happened, so a reached step keeps
              it visible; an unreached one stays blank rather than showing a dash
              that could read as a value */}
          <Typography sx={{ fontSize: 9.5, color: BRAND.textLight, textAlign: 'center', lineHeight: 1.2 }}>
            {s.reached ? shortDate(s.at) : ''}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

/** Neutral empty state - a placeholder that looks designed, not broken. */
function EmptyNote({ icon: Icon, children }) {
  return (
    <Stack
      spacing={0.75}
      sx={{
        alignItems: 'center', textAlign: 'center', py: 3, px: 2,
        borderRadius: '10px', bgcolor: BRAND.section, border: `1px dashed ${BRAND.border}`,
      }}
    >
      <Icon sx={{ fontSize: 22, color: BRAND.textLight }} aria-hidden />
      <Typography sx={{ fontSize: 13, color: BRAND.textLight, lineHeight: 1.5, maxWidth: 280 }}>{children}</Typography>
    </Stack>
  );
}

/**
 * Pending cluster detail. The per-report checkboxes are the consolidation
 * decision the brief asks a human to make, so they get the full width of the
 * panel here instead of hiding inside a collapsed card.
 */
function ClusterDetail({ cluster, onClose, onApprove, onDismiss }) {
  // every report starts ticked: consolidating is the default, un-ticking is the
  // deliberate act. Remounted per block by the `key` at the call site, so the
  // choice resets cleanly when a different cluster is opened.
  const [selected, setSelected] = useState(() => new Set(cluster.assessments.map(a => a.id)));
  const [approveOpen, setApproveOpen] = useState(false);
  const [dismissOpen, setDismissOpen] = useState(false);

  // Refresh can replace `assessments` without remounting (the key is only the
  // block), so reconcile: drop ids that no longer exist, and tick genuinely new
  // ids by default - every report starts ticked.
  const seenIds = useRef(new Set(cluster.assessments.map(a => a.id)));
  useEffect(() => {
    const ids = cluster.assessments.map(a => a.id);
    setSelected(prev => new Set(ids.filter(id => !seenIds.current.has(id) || prev.has(id))));
    seenIds.current = new Set(ids);
  }, [cluster.assessments]);

  const ids = [...selected];
  const perVisit = cluster.call_outs_avoided > 0 ? cluster.est_savings / cluster.call_outs_avoided : 0;
  const avoided = Math.max(0, ids.length - 1);

  const toggle = id => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <>
      <PanelShell
        title={cluster.block}
        subtitle={`${cluster.count} pending report${cluster.count === 1 ? '' : 's'} at this block`}
        onClose={onClose}
        chips={
          <>
            <PriorityChip level={cluster.risk_level} />
            {avoided > 0 && (
              <Chip
                label={`${avoided} call-out${avoided === 1 ? '' : 's'} avoided · ${money(Math.round(avoided * perVisit))}`}
                size="small"
                sx={{ bgcolor: INTENT.success.bg, color: INTENT.success.ink, fontWeight: 700, borderRadius: '6px', height: 22, fontSize: 12 }}
              />
            )}
          </>
        }
        footer={
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography sx={{ fontSize: 13, color: BRAND.textLight }}>
              {ids.length} of {cluster.count} selected
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button onClick={() => setDismissOpen(true)} disabled={ids.length === 0} sx={{ color: BRAND.textLight, fontWeight: 600 }}>
                Dismiss
              </Button>
              <Button
                variant="contained"
                disableElevation
                onClick={() => setApproveOpen(true)}
                disabled={ids.length === 0}
                sx={{ bgcolor: BRAND.action, fontWeight: 700, borderRadius: '8px', '&:hover': { bgcolor: BRAND.actionHover } }}
              >
                Approve &amp; raise work order
              </Button>
            </Stack>
          </Stack>
        }
      >
        <Typography sx={{ fontSize: 13, color: BRAND.textLight, mb: 1.5 }}>
          Untick any report that does not belong to this call-out. Everything left ticked is
          consolidated into a single contractor visit.
        </Typography>
        <Stack spacing={0}>
          {cluster.assessments.map((a, i) => (
            <Stack
              key={a.id}
              direction="row"
              spacing={1.25}
              sx={{ alignItems: 'flex-start', py: 1.5, borderTop: i === 0 ? 'none' : `1px solid ${BRAND.section}` }}
            >
              <Checkbox
                size="small"
                checked={selected.has(a.id)}
                onChange={() => toggle(a.id)}
                slotProps={{ input: { 'aria-label': `Include report from ${shortDate(a.createdAt)}` } }}
                sx={{ p: 0.25, mt: 0.1, color: BRAND.textLight, '&.Mui-checked': { color: ON_SURFACE.info } }}
              />
              {a.image_url && (
                <Box
                  component="img"
                  src={a.image_url}
                  alt=""
                  sx={{ width: 52, height: 52, borderRadius: '6px', objectFit: 'cover', border: `1px solid ${BRAND.border}`, flexShrink: 0 }}
                />
              )}
              <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.35, flexWrap: 'wrap', rowGap: 0.5 }}>
                  <PriorityChip level={a.risk_level} />
                  <Typography sx={{ fontSize: 12, color: BRAND.textLight }}>
                    {shortDate(a.createdAt)}{a.floor_level ? ` · ${a.floor_level}` : ''}
                  </Typography>
                </Stack>
                <Typography sx={{ fontSize: 13.5, color: BRAND.text, lineHeight: 1.55 }}>{a.observations}</Typography>
                {a.likely_cause && (
                  <Typography sx={{ fontSize: 12.5, color: BRAND.textLight, mt: 0.5, fontStyle: 'italic' }}>
                    Likely cause: {a.likely_cause}
                  </Typography>
                )}
              </Box>
            </Stack>
          ))}
        </Stack>
      </PanelShell>

      <ApproveDialog
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        title={`Raise work order · ${cluster.block}`}
        count={ids.length}
        avoided={avoided}
        savings={Math.round(avoided * perVisit)}
        onConfirm={opts => onApprove([{ block: cluster.block, ids }], opts)}
      />
      <DismissDialog
        open={dismissOpen}
        onClose={() => setDismissOpen(false)}
        block={cluster.block}
        count={ids.length}
        onConfirm={note => onDismiss(ids, note)}
      />
    </>
  );
}

function OrderDetail({ order, detail, loading, onClose, onCloseOrder }) {
  const [busy, setBusy] = useState(false);
  const st = ORDER_STATUS[order.status] || ORDER_STATUS.open;
  const isOpen = order.status !== 'closed';

  return (
    <PanelShell
      title={`Work order #${order.id}`}
      subtitle={order.block_number || '(No block specified)'}
      onClose={onClose}
      chips={
        <>
          <Chip label={st.label} size="small" sx={{ bgcolor: st.bg, color: st.ink, fontWeight: 700, borderRadius: '6px', height: 22, fontSize: 12 }} />
          <PriorityChip level={order.risk_level} />
          {/* This describes the contractor EMAIL outcome, not the pipeline stage.
              Labelling it "Dispatched" made it contradict the Progress list on
              rows whose email predates the stage log - the email really was
              sent, but no dispatched stage was ever recorded. */}
          {order.email_status && (
            <Chip
              label={order.email_status === 'sent' ? 'Email sent' : 'Email failed'}
              size="small"
              sx={{
                bgcolor: order.email_status === 'sent' ? INTENT.success.bg : INTENT.danger.bg,
                color: order.email_status === 'sent' ? INTENT.success.ink : INTENT.danger.ink,
                fontWeight: 700, borderRadius: '6px', height: 22, fontSize: 12,
              }}
            />
          )}
        </>
      }
      footer={isOpen ? (
        /* Terminal action bottom-RIGHT, secondary to its left: the Z-pattern
           puts the committing action where the eye finishes. A 100%-wide primary
           on a 560px drawer read as a banner, not a button, and gave the one
           irreversible action on this panel no visual weight relative to it. */
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', alignItems: 'center' }}>
          <Button
            onClick={onClose}
            disabled={busy}
            sx={{ textTransform: 'none', fontWeight: 600, color: BRAND.textLight, '&:hover': { bgcolor: BRAND.section } }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            disableElevation
            startIcon={busy ? <CircularProgress size={15} sx={{ color: '#fff' }} /> : <CheckRoundedIcon />}
            disabled={busy}
            onClick={async () => { setBusy(true); try { await onCloseOrder(order.id); } finally { setBusy(false); } }}
            sx={{
              bgcolor: BRAND.action, fontWeight: 800, fontSize: 14.5, minHeight: 44,
              px: 2.5, borderRadius: '8px', textTransform: 'none', whiteSpace: 'nowrap',
              boxShadow: '0 4px 14px rgba(29,78,216,.32)',
              '&:hover': { bgcolor: BRAND.actionHover, boxShadow: '0 6px 18px rgba(29,78,216,.42)' },
            }}
          >
            Mark done
          </Button>
        </Stack>
      ) : (
        <Typography sx={{ fontSize: 13, color: BRAND.textLight, textAlign: 'center' }}>
          Closed by {order.closed_by_name || 'an officer'} on {shortDate(order.closed_at)}.
        </Typography>
      )}
    >
      {/* The tracked pipeline as a horizontal stepper at the very top: "where are
          we" answered before any scrolling. Each step is a real logged event or an
          explicit blank - the panel never fills a stage nobody performed. */}
      <StageStepper stages={detail?.pipeline || order.pipeline || []} />

      {/* Strict 2-column grid. Notes and any long single value take the full width
          so they never squeeze a neighbour. */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
          columnGap: 2.5, rowGap: 2,
          pt: 2, borderTop: `1px solid ${BRAND.border}`,
        }}
      >
        <MetaCell label="Town council">{order.town_council || NOT_RECORDED}</MetaCell>
        <MetaCell label="Scheduled attendance">
          {order.scheduled_for
            ? shortDate(order.scheduled_for)
            : <Box component="span" sx={{ color: BRAND.textLight, fontStyle: 'italic', fontWeight: 500 }}>date not yet confirmed</Box>}
        </MetaCell>
        <MetaCell label="Contractor">{order.target_agency || NOT_RECORDED}</MetaCell>
        <MetaCell label="Reported by">
          {(detail?.reporters?.length ? detail.reporters.join(', ') : order.reporter_name) || NOT_RECORDED}
        </MetaCell>
        <MetaCell label="Reports consolidated">{order.consolidated_count}</MetaCell>
        <MetaCell label="Call-outs avoided">{order.call_outs_avoided} · {money(order.est_savings)}</MetaCell>
        <MetaCell label="Approved by">{order.approved_by_name || '-'} · {shortDate(order.createdAt)}</MetaCell>
        {order.dispatched_to && <MetaCell label="Dispatched to">{order.dispatched_to}</MetaCell>}
      </Box>
      {order.notes && (
        <Box sx={{ mt: 2 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>
            Officer notes
          </Typography>
          <Typography sx={{ fontSize: 13.5, color: BRAND.text, lineHeight: 1.55, p: 1.5, bgcolor: BRAND.section, borderRadius: '8px' }}>
            {order.notes}
          </Typography>
        </Box>
      )}

      <Typography sx={{ fontSize: 12, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.5px', mt: 2.5, mb: 1 }}>
        Consolidated reports
      </Typography>
      {loading ? (
        <Stack spacing={1}>{[0, 1].map(i => <Skeleton key={i} variant="rounded" height={58} />)}</Stack>
      ) : detail?.assessments?.length ? (
        <Stack spacing={0}>
          {detail.assessments.map((a, i) => (
            <Box key={a.id} sx={{ py: 1.5, borderTop: i === 0 ? 'none' : `1px solid ${BRAND.border}` }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.35 }}>
                <PriorityChip level={a.risk_level} />
                <Typography sx={{ fontSize: 12, color: BRAND.textLight }}>
                  {shortDate(a.createdAt)}{a.floor_level ? ` · ${a.floor_level}` : ''}
                </Typography>
              </Stack>
              <Typography sx={{ fontSize: 13.5, color: BRAND.text, lineHeight: 1.55 }}>{a.observations}</Typography>
            </Box>
          ))}
        </Stack>
      ) : detail === null ? (
        // A FAILED FETCH and an order with no linked reports are different facts and
        // used to share one sentence. `detail` is null only when the request errored,
        // so the two states are now told apart honestly.
        <EmptyNote icon={CloudOffOutlinedIcon}>
          The linked reports could not be loaded. They exist on the order - this is a
          connection problem, not an empty order. Try refreshing the queue.
        </EmptyNote>
      ) : (
        <EmptyNote icon={DescriptionOutlinedIcon}>
          No reports are linked to this work order.
        </EmptyNote>
      )}
    </PanelShell>
  );
}

/* ----------------------------------------------------------------- dialogs -- */

function ApproveDialog({ open, onClose, title, count, avoided, savings, onConfirm, blocks }) {
  const [agency, setAgency] = useState('Pest Control Contractor');
  const [notes, setNotes] = useState('');
  const [dispatch, setDispatch] = useState(true);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm({ dispatch, target_agency: agency, notes });
      onClose();
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>{title}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: BRAND.text, mb: 2 }}>
          {blocks > 1
            ? <>Raising <b>{blocks}</b> separate work orders - one per block - covering <b>{count}</b> report{count === 1 ? '' : 's'}.</>
            : <>Consolidating <b>{count}</b> report{count === 1 ? '' : 's'} into one call-out</>}
          {avoided > 0 && <> - avoiding <b>{avoided}</b> extra visit{avoided === 1 ? '' : 's'} ({money(savings)}).</>}
        </Typography>
        <TextField
          label="Dispatch to" value={agency} onChange={e => setAgency(e.target.value)}
          size="small" fullWidth sx={{ mb: 2 }}
        />
        <TextField
          label="Notes for the contractor (optional)" value={notes} onChange={e => setNotes(e.target.value)}
          size="small" fullWidth multiline rows={2} sx={{ mb: 1 }}
        />
        <FormControlLabel
          control={<Checkbox checked={dispatch} onChange={e => setDispatch(e.target.checked)} sx={{ '&.Mui-checked': { color: ON_SURFACE.info } }} />}
          label={<Typography sx={{ fontSize: 14 }}>Email the contractor now</Typography>}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy} sx={{ color: BRAND.textLight }}>Cancel</Button>
        <Button
          onClick={confirm} disabled={busy} variant="contained" disableElevation
          sx={{ bgcolor: BRAND.action, fontWeight: 700, '&:hover': { bgcolor: BRAND.actionHover } }}
        >
          {busy ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : 'Approve'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Attendance date prompt, shown when a card is dropped on Scheduled.
 *
 * There is deliberately no default value and no suggestion. The backend refuses
 * `scheduled` without a date and the pipeline contract forbids inventing one, so
 * this asks rather than guessing - an officer types the date the contractor
 * actually gave them, or cancels and the order stays where it was.
 */
function ScheduleDialog({ open, onClose, onConfirm }) {
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 800, color: BRAND.heading }}>Confirm attendance date</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 13.5, color: BRAND.text, mb: 2 }}>
          Enter the date the contractor confirmed. A work order is only marked scheduled
          against a real date - nothing is estimated on your behalf.
        </Typography>
        <TextField
          type="date"
          fullWidth
          value={date}
          onChange={e => setDate(e.target.value)}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'aria-label': 'Confirmed attendance date' } }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} disabled={busy} sx={{ textTransform: 'none', color: BRAND.textLight }}>Cancel</Button>
        <Button
          variant="contained"
          disableElevation
          disabled={!date || busy}
          onClick={async () => { setBusy(true); try { await onConfirm(date); } finally { setBusy(false); } }}
          sx={{ textTransform: 'none', fontWeight: 700, bgcolor: BRAND.action, '&:hover': { bgcolor: BRAND.actionHover } }}
        >
          {busy ? 'Saving…' : 'Mark scheduled'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function DismissDialog({ open, onClose, block, count, onConfirm }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Dismiss escalation{block ? ` · ${block}` : ''}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: BRAND.text, mb: 2 }}>
          No contractor will be engaged. This clears {count} report{count === 1 ? '' : 's'} from the queue and records your reason.
        </Typography>
        <TextField
          label="Reason (optional)" value={note} onChange={e => setNote(e.target.value)}
          placeholder="e.g. Bins already secured, will re-inspect in 48h"
          size="small" fullWidth multiline rows={2}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy} sx={{ color: BRAND.textLight }}>Cancel</Button>
        <Button
          onClick={async () => { setBusy(true); try { await onConfirm(note); onClose(); } finally { setBusy(false); } }}
          disabled={busy} variant="outlined" color="inherit"
        >
          {busy ? <CircularProgress size={16} /> : 'Dismiss'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/* -------------------------------------------------------------------- page -- */

const PENDING_SORTS = [
  { key: 'priority', label: 'Priority' },
  { key: 'count', label: 'Reports' },
  { key: 'savings', label: 'Est. saving' },
  { key: 'oldest', label: 'Age' },
  { key: 'block', label: 'Block' },
];
const ORDER_SORTS = [
  { key: 'raised', label: 'Date raised' },
  { key: 'priority', label: 'Priority' },
  { key: 'count', label: 'Reports' },
  { key: 'block', label: 'Block' },
];

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function ActionQueue() {

  const [queue, setQueue] = useState(null);
  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [undo, setUndo] = useState(null);
  const [syncedAt, setSyncedAt] = useState(() => Date.now());
  const [, forceTick] = useState(0);

  const [tab, setTab] = useState('pending');
  const [q, setQ] = useState('');
  const [priority, setPriority] = useState('all');
  const [range, setRange] = useState(0);
  const [sort, setSort] = useState({ key: 'priority', dir: 'desc' });
  const [selectedKey, setSelectedKey] = useState(null);
  const [checked, setChecked] = useState(() => new Set());
  const [bulkApprove, setBulkApprove] = useState(false);
  // { id } while a drop onto Scheduled is waiting for a REAL attendance date
  const [scheduleFor, setScheduleFor] = useState(null);
  const [orderDetail, setOrderDetail] = useState({ id: null, data: null });
  const [busyBulk, setBusyBulk] = useState(false);
  const [busyRow, setBusyRow] = useState(null);
  // list | board. The DATA GRID is the default: with six pipeline stages, most
  // columns are empty most of the time, so the board spent the width of the
  // screen on whitespace while the rows it did have needed vertical scanning.
  // The board stays one click away - it is still the only place a stage can be
  // advanced by dragging, and that writes real backend transitions.
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('actionQueueView') === 'board' ? 'board' : 'list'; }
    catch { return 'list'; }
  });
  function switchView(next) {
    if (!next) return;
    setView(next);
    try { localStorage.setItem('actionQueueView', next); } catch { /* preference just won't persist */ }
  }
  // dragRef is the authoritative payload: drop handlers must read it synchronously,
  // and a React state value can still be the pre-dragstart one when drop fires.
  // `drag` mirrors it purely so the columns and cards can re-render their hints.
  const dragRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const [dropCol, setDropCol] = useState(null);
  const [boardSelKind, setBoardSelKind] = useState('pending');

  // `fetchQueue` is deliberately state-free so the mount effect below can write
  // state only inside promise callbacks - a synchronous setState in an effect body
  // is what triggers cascading renders.
  const applyQueue = useCallback((qr, w) => {
    setQueue(qr);
    setWorkOrders(w);
    setSyncedAt(Date.now());
    setError(null);
    setLoading(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [qr, w] = await Promise.all([
        http.get('/api/work-orders/queue'),
        http.get('/api/work-orders'),
      ]);
      applyQueue(qr.data, w.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load the action queue');
      setLoading(false);
    }
  }, [applyQueue]);

  useEffect(() => {
    let live = true;
    Promise.all([http.get('/api/work-orders/queue'), http.get('/api/work-orders')])
      .then(([qr, w]) => { if (live) applyQueue(qr.data, w.data); })
      .catch(e => {
        if (!live) return;
        setError(e.response?.data?.error || 'Failed to load the action queue');
        setLoading(false);
      });
    return () => { live = false; };
  }, [applyQueue]);
  // keep the "synced" stamp honest without re-fetching
  useEffect(() => {
    const t = setInterval(() => forceTick(n => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const clusters = useMemo(() => queue?.clusters || [], [queue]);
  const urgentCount = clusters.filter(c => URGENT.has(c.risk_level)).length;

  /**
   * Which summary card is engaged, or null.
   *
   * The card does not own a private filter - it drives the SAME tab and priority
   * controls the toolbar uses, so the toolbar always reflects what is actually
   * being shown. Pressing the active card again clears it.
   */
  const [kpiFilter, setKpiFilter] = useState(null);
  function applyKpiFilter(key) {
    const next = kpiFilter === key ? null : key;
    setKpiFilter(next);
    setSelectedKey(null);
    if (next === 'urgent') { setTab('pending'); setPriority('critical'); }
    else if (next === 'action') { setTab('pending'); setPriority('all'); }
    else if (next === 'done') { setTab('closed'); setPriority('all'); }
    else { setPriority('all'); }
  }

  /* ---- filtering + sorting ------------------------------------------------ */

  const cutoff = range ? Date.now() - range * 86400000 : null;
  const needle = q.trim().toLowerCase();

  const pendingRows = useMemo(() => {
    const rows = clusters
      .map(c => {
        const oldest = c.assessments.reduce(
          (min, a) => (min == null || new Date(a.createdAt) < min ? new Date(a.createdAt) : min),
          null,
        );
        return { cluster: c, oldest };
      })
      .filter(({ cluster: c, oldest }) => {
        // the Urgent card spans high AND critical - the priority select holds one
        // value, so that band is applied here rather than faked in the dropdown
        if (kpiFilter === 'urgent') { if (!URGENT.has(c.risk_level)) return false; }
        else if (priority !== 'all' && c.risk_level !== priority) return false;
        if (cutoff && oldest && oldest.getTime() < cutoff) return false;
        if (needle) {
          const hay = `${c.block} ${c.assessments.map(a => a.observations).join(' ')}`.toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      });
    const dir = sort.dir === 'desc' ? -1 : 1;
    const cmp = {
      priority: (a, b) => prio(a.cluster.risk_level).rank - prio(b.cluster.risk_level).rank || a.cluster.count - b.cluster.count,
      count: (a, b) => a.cluster.count - b.cluster.count,
      savings: (a, b) => a.cluster.est_savings - b.cluster.est_savings,
      oldest: (a, b) => (a.oldest?.getTime() || 0) - (b.oldest?.getTime() || 0),
      block: (a, b) => a.cluster.block.localeCompare(b.cluster.block, 'en', { numeric: true }),
    }[sort.key] || (() => 0);
    return [...rows].sort((a, b) => cmp(a, b) * dir);
  }, [clusters, priority, cutoff, needle, sort, kpiFilter]);

  const orderRows = useMemo(() => {
    const wantClosed = tab === 'closed';
    const rows = workOrders.filter(w => {
      if ((w.status === 'closed') !== wantClosed) return false;
      if (priority !== 'all' && w.risk_level !== priority) return false;
      if (cutoff && new Date(w.createdAt).getTime() < cutoff) return false;
      if (needle) {
        const hay = `${w.block_number || ''} ${w.target_agency || ''} ${w.notes || ''} #${w.id}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    const dir = sort.dir === 'desc' ? -1 : 1;
    const cmp = {
      raised: (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
      priority: (a, b) => prio(a.risk_level).rank - prio(b.risk_level).rank,
      count: (a, b) => a.consolidated_count - b.consolidated_count,
      block: (a, b) => String(a.block_number || '').localeCompare(String(b.block_number || ''), 'en', { numeric: true }),
    }[sort.key] || (() => 0);
    return [...rows].sort((a, b) => cmp(a, b) * dir);
  }, [workOrders, tab, priority, cutoff, needle, sort]);

  // Board shows all three stages at once, so its order lists cannot key off the
  // active tab the way orderRows does. Same filters, status supplied explicitly.
  const boardOrders = useMemo(() => {
    const pass = w => {
      if (priority !== 'all' && w.risk_level !== priority) return false;
      if (cutoff && new Date(w.createdAt).getTime() < cutoff) return false;
      if (needle) {
        const hay = `${w.block_number || ''} ${w.target_agency || ''} ${w.notes || ''} #${w.id}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    };
    // newest first within a stage, and priority always leads the sort so the
    // column reads as a triage list top-down
    const byPriority = (a, b) => prio(b.risk_level).rank - prio(a.risk_level).rank || new Date(b.createdAt) - new Date(a.createdAt);
    const at = (...statuses) => workOrders.filter(w => statuses.includes(w.status) && pass(w)).sort(byPriority);
    // One bucket per REAL pipeline stage. "Open orders" previously merged raised,
    // dispatched, scheduled and in_progress into a single column, which threw away
    // stage information the backend records per order - in the live data that
    // column was hiding the difference between an order nobody has dispatched and
    // one with a confirmed attendance date.
    return {
      raised: at('raised', 'open'),        // 'open' is the pre-pipeline legacy value
      dispatched: at('dispatched'),
      scheduled: at('scheduled'),
      in_progress: at('in_progress'),
      // resolved and closed are the only merge: both are terminal, and each card
      // states which one it is, so nothing is concealed by pairing them.
      done: at('resolved', 'closed'),
    };
  }, [workOrders, priority, cutoff, needle]);

  // pending column always sorts by priority regardless of the list-view sort
  const boardPending = useMemo(
    () => [...pendingRows].sort(
      (a, b) => prio(b.cluster.risk_level).rank - prio(a.cluster.risk_level).rank || b.cluster.count - a.cluster.count,
    ),
    [pendingRows],
  );

  /* ---- mutations --------------------------------------------------------- */

  async function approveGroups(groups, opts) {
    // one work order per block: the backend consolidates a single set of
    // assessments, so N blocks means N calls. Failures are counted, not hidden.
    let ok = 0;
    const failed = [];
    const done = [];
    for (const g of groups) {
      try {
        await http.post('/api/work-orders', { assessment_ids: g.ids, ...opts });
        ok++;
        done.push(g.block);
      } catch {
        failed.push(g.block);
      }
    }
    // drop only the actioned blocks - `checked` may still hold blocks the current
    // filters hide, and those must not be silently cleared
    setChecked(prev => {
      const next = new Set(prev);
      done.forEach(b => next.delete(b));
      return next;
    });
    setSelectedKey(null);
    setToast(
      failed.length
        ? { ok: false, msg: `Raised ${ok} work order${ok === 1 ? '' : 's'}; ${failed.length} failed (${failed.join(', ')}).` }
        : { ok: true, msg: `Raised ${ok} work order${ok === 1 ? '' : 's'}${opts.dispatch ? ' and dispatched' : ''}.` },
    );
    await load();
  }

  async function dismiss(ids, note) {
    await http.post('/api/work-orders/dismiss', { assessment_ids: ids, note });
    setUndo({ ids: [...ids], count: ids.length });
    // same principle as approve: only the actioned block leaves the selection
    const block = selectedKey;
    setChecked(prev => {
      const next = new Set(prev);
      if (block != null) next.delete(block);
      return next;
    });
    setSelectedKey(null);
    await load();
  }

  async function undoDismiss() {
    if (!undo) return;
    const ids = undo.ids;
    setUndo(null);
    try {
      await http.post('/api/work-orders/undismiss', { assessment_ids: ids });
      await load();
    } catch {
      setToast({ ok: false, msg: 'Could not undo - the reports may have already been actioned.' });
    }
  }

  async function closeWo(id) {
    await http.patch(`/api/work-orders/${id}/close`);
    // a closed order must leave the selection, or a later bulk close reports it
    // as a false failure
    setChecked(prev => {
      const next = new Set(prev);
      next.delete(String(id));
      return next;
    });
    setToast({ ok: true, msg: 'Work order marked done.' });
    setSelectedKey(null);
    await load();
  }

  async function closeSelected() {
    setBusyBulk(true);
    let ok = 0;
    const failed = [];
    try {
      for (const key of checked) {
        const id = Number(key);
        try { await http.patch(`/api/work-orders/${id}/close`); ok++; } catch { failed.push(`#${id}`); }
      }
      setChecked(new Set());
      setToast(
        failed.length
          ? { ok: false, msg: `Closed ${ok}; ${failed.length} failed (${failed.join(', ')}).` }
          : { ok: true, msg: `Marked ${ok} work order${ok === 1 ? '' : 's'} done.` },
      );
      await load();
    } finally { setBusyBulk(false); }
  }

  /* ---- selection -------------------------------------------------------- */

  const rows = tab === 'pending' ? pendingRows : orderRows;
  const rowKey = r => (tab === 'pending' ? r.cluster.block : String(r.id));



  const toggle = key => setChecked(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const toggleAll = on => setChecked(on ? new Set(rows.map(rowKey)) : new Set());

  function onSort(key) {
    setSort(s => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }));
  }

  // In list view the tab tells us what a selection means. The board shows all
  // three stages at once, so the card records its own kind when clicked.
  const selKind = view === 'board' ? boardSelKind : (tab === 'pending' ? 'pending' : 'order');
  const selectedCluster = selKind === 'pending' ? clusters.find(c => c.block === selectedKey) : null;
  const selectedOrder = selKind === 'order' ? workOrders.find(w => String(w.id) === selectedKey) : null;

  // lazily pull the linked reports for whichever work order is open. "Loading" is
  // derived from the id mismatch rather than stored, so the effect never has to
  // write state synchronously just to raise a spinner.
  const selectedOrderId = selectedOrder?.id ?? null;
  useEffect(() => {
    if (selectedOrderId == null) return;
    let live = true;
    http.get(`/api/work-orders/${selectedOrderId}`)
      .then(r => { if (live) setOrderDetail({ id: selectedOrderId, data: r.data }); })
      .catch(() => { if (live) setOrderDetail({ id: selectedOrderId, data: null }); });
    return () => { live = false; };
  }, [selectedOrderId]);

  const detailOpen = Boolean(selectedCluster || selectedOrder);
  // The 40/60 split is gone: squeezing the grid to 40% defeated the point of a
  // dense table, and the panel's own content had to reflow every time it opened.
  // A drawer keeps the queue at full width and unmoved behind it - the pattern
  // Linear/Jira/Zendesk use for exactly this triage job.
  const split = false;

  /* ---- board drag/drop ----------------------------------------------------
     Only forward transitions are droppable, and each one maps to a real
     operation: pending -> open raises a work order (via the same confirm dialog
     the bulk path uses, because it creates a contractor job), open -> closed
     closes it. Backwards drags are rejected rather than silently ignored, and
     drag is never the only route - every card keeps its buttons and the
     keyboard-reachable detail panel. --------------------------------------- */

  /**
   * Which drops are legal.
   *
   * Mirrors backend canTransition (services/workOrderStages.js): forward-only,
   * and skipping ahead IS allowed - a contractor can turn up without anyone
   * having logged a scheduled date, and forcing a fake 'scheduled' event just to
   * reach 'in_progress' would be exactly the retro-filling the pipeline forbids.
   * The server re-checks every one of these; this only stops the UI offering a
   * drop it knows will be rejected.
   */
  const allows = (d, col) => {
    if (!d) return false;
    if (d.type === 'pending') return col === 'raised';   // approving creates the order
    const from = BOARD_RANK[d.status];
    const to = BOARD_RANK[col];
    if (from == null || to == null) return false;
    return to > from;
  };
  const canDropOn = col => allows(drag, col);

  async function handleBoardDrop(col) {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    setDropCol(null);
    if (!allows(d, col)) return;

    if (d.type === 'pending') {
      // reuse the approve dialog: raising a work order dispatches a contractor,
      // so it keeps its confirmation step even when triggered by a drag
      setChecked(new Set([d.id]));
      setTab('pending');
      setBulkApprove(true);
      return;
    }

    // 'scheduled' cannot be entered without a REAL attendance date - the backend
    // rejects it outright and there is deliberately no default, no "+3 days" and
    // no estimate. So the drop opens a date prompt instead of guessing one.
    if (col === 'scheduled') {
      setScheduleFor({ id: Number(d.id) });
      return;
    }
    await moveStage(Number(d.id), STAGE_FOR_COLUMN[col]);
  }

  // One stage transition. Every call writes an append-only event server-side with
  // the acting officer and a real timestamp.
  async function moveStage(id, stage, extra = {}) {
    setBusyRow(id);
    try {
      const { data } = await http.patch(`/api/work-orders/${id}/stage`, { stage, ...extra });
      setWorkOrders(list => list.map(w => (w.id === id ? { ...w, ...data } : w)));
      // the email result is whatever actually happened, never assumed
      const mail = data.notified?.attempted
        ? (data.notified.delivered ? ' Resident notified.' : ' Resident email failed.')
        : '';
      setToast({ ok: true, msg: `Work order #${id} moved to ${ORDER_STATUS[stage]?.label || stage}.${mail}` });
      load();
    } catch (e) {
      setToast({ ok: false, msg: e.response?.data?.error || 'Could not update the work order stage.' });
    } finally {
      setBusyRow(null);
    }
  }

  const dragProps = (type, id) => ({
    draggable: true,
    onDragStart: e => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
      dragRef.current = { type, id };
      setDrag({ type, id });
    },
    onDragEnd: () => { dragRef.current = null; setDrag(null); setDropCol(null); },
    dragging: drag?.type === type && drag?.id === id,
  });

  // every column accepts the dragover/drop listeners; `allows` decides at drop
  // time, so a stale render cannot leave a legal target inert
  const colProps = col => ({
    canDrop: true,
    dropActive: dropCol === col && canDropOn(col),
    onDragOver: e => {
      if (!allows(dragRef.current, col)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDropCol(col);
    },
    onDragLeave: e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropCol(c => (c === col ? null : c)); },
    onDrop: e => { e.preventDefault(); handleBoardDrop(col); },
  });

  /* ---- primary CTA ------------------------------------------------------- */

  const checkedGroups = useMemo(
    () => pendingRows.filter(r => checked.has(r.cluster.block))
      .map(r => ({ block: r.cluster.block, ids: r.cluster.assessments.map(a => a.id), cluster: r.cluster })),
    [pendingRows, checked],
  );
  const checkedReportCount = checkedGroups.reduce((s, g) => s + g.ids.length, 0);
  const checkedAvoided = checkedGroups.reduce((s, g) => s + Math.max(0, g.ids.length - 1), 0);
  const checkedSavings = checkedGroups.reduce((s, g) => s + g.cluster.est_savings, 0);
  // counts shown to the user reflect the VISIBLE selection - `checked` may still
  // hold blocks the current filters hide, and approve only acts on checkedGroups
  const visibleSelected = tab === 'pending' ? checkedGroups.length : checked.size;

  // Deliberately not memoised. It closes over `exportCsv`/`closeSelected`, which in
  // turn read the current sort and filters, so a cached object could export a stale
  // row order. Rebuilding one small object per render is cheaper than that bug.
  const primary = (() => {
    if (tab === 'pending') {
      if (checkedGroups.length > 0) {
        return {
          label: 'Approve selected',
          count: checkedGroups.length,
          icon: <DoneAllRoundedIcon />,
          onClick: () => setBulkApprove(true),
          disabled: false,
        };
      }
      return {
        // `count` renders as a badge INSIDE the button; the label stops repeating
        // it, and the warning glyph is dropped - a hazard icon on the primary
        // action read as a caution rather than an invitation to act.
        label: urgentCount > 0 ? 'Review urgent' : 'Start reviewing',
        count: urgentCount,
        icon: <ReportProblemOutlinedIcon />,
        onClick: () => {
          const first = pendingRows.find(r => URGENT.has(r.cluster.risk_level)) || pendingRows[0];
          if (first) setSelectedKey(first.cluster.block);
        },
        disabled: pendingRows.length === 0,
      };
    }
    if (tab === 'open') {
      return {
        label: 'Mark done',
        count: checked.size,
        icon: busyBulk ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <CheckRoundedIcon />,
        onClick: closeSelected,
        disabled: checked.size === 0 || busyBulk,
      };
    }
    return { label: 'Export closed orders', count: 0, icon: <FileDownloadOutlinedIcon />, onClick: exportCsv, disabled: orderRows.length === 0 };
  })();

  function exportCsv() {
    const head = tab === 'pending'
      ? ['Block', 'Priority', 'Reports', 'Call-outs avoidable', 'Est. saving (SGD)', 'Oldest report']
      : ['Order', 'Block', 'Status', 'Priority', 'Reports', 'Contractor', 'Raised'];
    const body = tab === 'pending'
      ? pendingRows.map(r => [r.cluster.block, prio(r.cluster.risk_level).label, r.cluster.count, r.cluster.call_outs_avoided, r.cluster.est_savings, r.oldest ? r.oldest.toISOString().slice(0, 10) : ''])
      : orderRows.map(w => [`#${w.id}`, w.block_number || '', w.status, prio(w.risk_level).label, w.consolidated_count, w.target_agency, new Date(w.createdAt).toISOString().slice(0, 10)]);
    const csv = [head, ...body].map(r => r.map(csvEscape).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `action-queue-${tab}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ---- columns ----------------------------------------------------------- */

  const pendingColumns = useMemo(() => [
    {
      key: 'block', label: 'Block', compact: true, width: 170,
      // the oldest date rides under the block rather than owning a column of its
      // own - same two facts, one less column competing with the observation
      render: r => (
        <Box>
          <Typography sx={{ fontSize: 14.5, fontWeight: 700, color: BRAND.heading, whiteSpace: 'nowrap', lineHeight: 1.3 }}>{r.cluster.block}</Typography>
          <Typography sx={{ fontSize: 11.5, color: BRAND.textLight, whiteSpace: 'nowrap' }}>
            {r.oldest ? `oldest ${shortDate(r.oldest)}` : 'no date recorded'}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'summary', label: 'Latest observation', sortable: false, compact: false, width: 'auto', flex: true,
      // no maxWidth: the hard 340px cap truncated mid-sentence while a band of
      // empty column sat to its right. The cell is the flexible column now, so
      // the text runs to whatever width the browser actually has.
      render: r => (
        <Typography sx={{ fontSize: 13.5, color: BRAND.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.cluster.assessments[0]?.observations || '-'}
        </Typography>
      ),
    },
    // centred: a state badge right-aligned inside a wide column reads as adrift
    { key: 'priority', label: 'Priority', align: 'center', compact: true, width: 110, render: r => <PriorityChip level={r.cluster.risk_level} /> },
    {
      key: 'count', label: 'Reports', numeric: true, compact: true, width: 90,
      render: r => <Box sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: BRAND.heading }}>{r.cluster.count}</Box>,
    },
    {
      key: 'savings', label: 'Est. saving', numeric: true, compact: false, width: 120,
      // A tinted badge rather than bright green text: ON_SURFACE.ok as body text
      // on the row surface is a thin pass, and a saturated figure in an otherwise
      // neutral column read louder than a savings estimate warrants.
      render: r => (r.cluster.est_savings > 0 ? (
        <Box
          component="span"
          sx={{
            display: 'inline-block', px: 0.85, py: '2px', borderRadius: '6px',
            bgcolor: INTENT.success.bg, color: INTENT.success.ink,
            fontSize: 12.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
          }}
        >
          {money(r.cluster.est_savings)}
        </Box>
      ) : (
        <Box component="span" sx={{ color: BRAND.textLight }}>-</Box>
      )),
    },
  ], []);

  const orderColumns = useMemo(() => [
    {
      key: 'block', label: 'Order', compact: true, width: '22%',
      render: w => (
        <Box>
          <Typography sx={{ fontSize: 14.5, fontWeight: 700, color: BRAND.heading, whiteSpace: 'nowrap' }}>
            {w.block_number || '(No block)'}
          </Typography>
          <Typography sx={{ fontSize: 12, color: BRAND.textLight }}>#{w.id}</Typography>
        </Box>
      ),
    },
    {
      key: 'agency', label: 'Contractor', sortable: false, compact: false,
      render: w => <Typography sx={{ fontSize: 13.5, color: BRAND.text }}>{w.target_agency}</Typography>,
    },
    {
      key: 'status', label: 'Stage', numeric: false, sortable: false, compact: true, width: 150,
      render: w => {
        const st = ORDER_STATUS[w.status] || ORDER_STATUS.open;
        return (
          <Stack spacing={0.6}>
            <Chip label={st.label} size="small" sx={{ bgcolor: st.bg, color: st.ink, fontWeight: 700, borderRadius: '6px', height: 22, fontSize: 12, alignSelf: 'flex-start' }} />
            <PipelineBar pipeline={w.pipeline} status={w.status} />
          </Stack>
        );
      },
    },
    {
      key: 'council', label: 'Town council', sortable: false, compact: false, width: 150,
      // never defaulted: an unrecorded council says so
      render: w => (
        <Typography sx={{ fontSize: 13, color: w.town_council ? BRAND.text : BRAND.textLight, fontStyle: w.town_council ? 'normal' : 'italic' }}>
          {w.town_council || 'not recorded'}
        </Typography>
      ),
    },
    {
      key: 'reporter', label: 'Reporter', sortable: false, compact: false, width: 130,
      render: w => (
        <Typography sx={{ fontSize: 13, color: w.reporter_name ? BRAND.text : BRAND.textLight, fontStyle: w.reporter_name ? 'normal' : 'italic', whiteSpace: 'nowrap' }}>
          {w.reporter_name || 'not recorded'}
          {w.reporters?.length > 1 && (
            <Box component="span" sx={{ color: BRAND.textLight }}> +{w.reporters.length - 1}</Box>
          )}
        </Typography>
      ),
    },
    {
      key: 'scheduled', label: 'Scheduled', sortable: false, compact: true, width: 130,
      // a null date is "not yet confirmed" - never a guess or an ETA
      render: w => (w.scheduled_for
        ? <Box sx={{ fontVariantNumeric: 'tabular-nums', color: BRAND.text }}>{shortDate(w.scheduled_for)}</Box>
        : <Typography sx={{ fontSize: 12.5, color: BRAND.textLight, fontStyle: 'italic' }}>not yet confirmed</Typography>),
    },
    { key: 'priority', label: 'Priority', numeric: true, compact: false, width: 100, render: w => <PriorityChip level={w.risk_level} /> },
    {
      key: 'count', label: 'Reports', numeric: true, compact: true, width: 90,
      render: w => (
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', justifyContent: 'flex-end' }}>
          <Box sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: BRAND.heading }}>{w.consolidated_count}</Box>
          {w.photo_count > 0 && (
            <Tooltip arrow title={`${w.photo_count} site photo${w.photo_count === 1 ? '' : 's'}`}>
              <PhotoLibraryOutlinedIcon sx={{ fontSize: 15, color: BRAND.textLight }} />
            </Tooltip>
          )}
        </Stack>
      ),
    },
    {
      key: 'raised', label: 'Raised', numeric: true, compact: false, width: 100,
      render: w => <Box sx={{ fontVariantNumeric: 'tabular-nums', color: BRAND.textLight }}>{shortDate(w.createdAt)}</Box>,
    },
    {
      key: 'last_update', label: 'Last update', numeric: true, sortable: false, compact: true, width: 120,
      // derived from stage events only, never from updatedAt
      render: w => (
        <Box sx={{ fontVariantNumeric: 'tabular-nums', color: BRAND.textLight }}>
          {w.last_update ? shortDate(w.last_update) : '-'}
        </Box>
      ),
    },
  ], []);

  const tableRows = tab === 'pending'
    ? pendingRows.map(r => ({
      ...r, key: r.cluster.block, priority: r.cluster.risk_level, selectLabel: r.cluster.block,
      actions: (
        <GhostButton
          onClick={() => setSelectedKey(r.cluster.block)}
          aria-label={`Review ${r.cluster.block}`}
        >
          Review
        </GhostButton>
      ),
    }))
    : orderRows.map(w => ({
      ...w, key: String(w.id), priority: w.risk_level, selectLabel: `work order ${w.id}`,
      actions: w.status !== 'closed'
        ? (
          <GhostButton
            disabled={busyRow === w.id}
            onClick={async () => {
              setBusyRow(w.id);
              try { await closeWo(w.id); }
              catch (e) { setToast({ ok: false, msg: e.response?.data?.error || 'Could not mark the work order done.' }); }
              finally { setBusyRow(null); }
            }}
            aria-label={`Mark work order ${w.id} done`}
          >
            {busyRow === w.id ? '…' : 'Done'}
          </GhostButton>
        )
        : <GhostButton onClick={() => setSelectedKey(String(w.id))} aria-label={`Open work order ${w.id}`}>View</GhostButton>,
    }));



  const detailNode = selectedCluster ? (
    <ClusterDetail
      key={selectedCluster.block}
      cluster={selectedCluster}
      onClose={() => setSelectedKey(null)}
      onApprove={approveGroups}
      onDismiss={dismiss}
    />
  ) : selectedOrder ? (
    <OrderDetail
      order={selectedOrder}
      detail={orderDetail.id === selectedOrder.id ? orderDetail.data : null}
      loading={orderDetail.id !== selectedOrder.id}
      onClose={() => setSelectedKey(null)}
      onCloseOrder={closeWo}
    />
  ) : null;

  return (
    /* Full-bleed route: the viewport is locked and scrolling happens inside the
       board columns / list / detail panel. That is what lets the panel's approve
       CTA stay pinned to the bottom of the drawer at any scroll depth. */
    <Box sx={{ bgcolor: BRAND.canvas, height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* sticky page header - breadcrumbs anchor, refresh sits opposite. The global
          brand mark, command palette, bell and avatar already live in the app bar
          above this, so they are deliberately not repeated here. */}
      <Box
        sx={{
          position: 'sticky', top: { xs: 56, sm: 64 }, zIndex: 3,
          // frosted rather than opaque: content scrolling under the bar stays
          // faintly visible, which keeps the header feeling attached to the page
          bgcolor: `color-mix(in srgb, ${BRAND.surface} 82%, transparent)`,
          backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
          borderBottom: `1px solid ${BRAND.border}`,
          px: { xs: 2, md: 3 }, py: 1.25,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1,
        }}
      >
        <Breadcrumbs aria-label="Breadcrumb" sx={{ fontSize: 13, '& .MuiBreadcrumbs-separator': { color: BRAND.textLight } }}>
          <Link href="/dashboard" underline="hover" sx={{ color: BRAND.textLight, fontSize: 13, fontWeight: 600 }}>Workspace</Link>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.heading }}>Action Queue</Typography>
        </Breadcrumbs>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography sx={{ fontSize: 12, color: BRAND.textLight, display: { xs: 'none', sm: 'block' } }}>
            Synced {relativeTime(syncedAt)}
          </Typography>
          <IconButton
            onClick={load}
            disabled={loading}
            aria-label="Refresh the queue"
            sx={{ width: 32, height: 32, borderRadius: '8px', color: BRAND.textLight, '&:hover': { color: ON_SURFACE.info } }}
          >
            <RefreshRoundedIcon sx={{ fontSize: 19 }} />
          </IconButton>
        </Stack>
      </Box>

      {loading && <LinearProgress sx={{ height: 2, '& .MuiLinearProgress-bar': { bgcolor: ON_SURFACE.info } }} />}

      <CommandCentre
        urgentCount={urgentCount}
        q={q} setQ={setQ}
        priority={priority} setPriority={setPriority}
        range={range} setRange={setRange}
        sort={sort} setSort={setSort}
        sortOptions={tab === 'pending' ? PENDING_SORTS : ORDER_SORTS}
        primary={primary}
        onExport={exportCsv}
        view={view}
        onView={switchView}
        kpiFilter={kpiFilter}
        applyKpiFilter={applyKpiFilter}
        boardPending={boardPending}
        boardOrders={boardOrders}
      />

      <Box sx={{ px: { xs: 2, md: 3 } }}>
        {error && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={load}>Retry</Button>}>{error}</Alert>}
        {toast && <Alert severity={toast.ok ? 'success' : 'error'} sx={{ mb: 2 }} onClose={() => setToast(null)}>{toast.msg}</Alert>}
      </Box>

      {/* The tab row is gone. It filtered by the SAME states the KPI cards now
          filter by - "Requires action / Open orders / Closed" against
          "Urgent / Requires action / Completed" - so the page offered two
          controls for one job and they could disagree with each other. The cards
          own it; the board's drag hint is all that remains here. */}
      {view === 'board' && (
        <Box sx={{ px: { xs: 2, md: 3 }, pb: 1.5 }}>
          <Typography sx={{ fontSize: 13.5, color: BRAND.textLight }}>
            Drag a card to the next stage to action it, or open one to review it in detail.
          </Typography>
        </Box>
      )}

      {/* master / detail. The grid is the master; at lg+ it compacts to 40% and the
          detail takes 60%, below that the detail becomes a full-height drawer.
          The list recedes slightly while the panel is open - the panel's own
          shadow does the heavy lifting, so the dim stays mild enough to keep the
          list's text contrast intact. */}
      <Box sx={{ display: 'flex', alignItems: 'stretch', flexGrow: 1, minHeight: 0 }}>
        <Box
          sx={{
            width: split ? '40%' : '100%', flexShrink: 0, transition: 'width .2s ease, opacity .2s ease',
            minWidth: 0, opacity: split ? 0.9 : 1, display: 'flex', flexDirection: 'column',
            minHeight: 0, overflowY: view === 'board' ? 'hidden' : 'auto',
          }}
        >
          {loading && !queue ? (
            <Box sx={{ p: 3 }}>
              <Stack spacing={1}>{[0, 1, 2, 3].map(i => <Skeleton key={i} variant="rounded" height={52} />)}</Stack>
            </Box>
          ) : view === 'board' ? (
            <Box sx={{ display: 'flex', gap: 1.5, p: { xs: 2, md: 3 }, alignItems: 'stretch', flexGrow: 1, minHeight: 0, overflowX: 'auto' }}>
              {BOARD_COLUMNS.map(c => {
                const isPending = c.col === 'pending';
                const items = isPending ? boardPending : (boardOrders[c.col] || []);
                return (
                  <BoardColumn
                    key={c.col}
                    id={`col-${c.col}`}
                    title={c.title}
                    count={items.length}
                    accent={c.accent}
                    hint={dropCol === c.col && canDropOn(c.col) ? `Drop to move to ${c.title}` : c.hint}
                    empty={items.length === 0}
                    {...colProps(c.col)}
                  >
                    {items.length === 0 && (
                      <Typography sx={{ fontSize: 12.5, color: BRAND.textLight, textAlign: 'center', py: 3 }}>
                        {isPending ? 'Nothing awaiting review.' : 'Nothing at this stage.'}
                      </Typography>
                    )}

                    {isPending && boardPending.map(r => (
                      <TaskCard
                        key={r.cluster.block}
                        title={r.cluster.block}
                        level={r.cluster.risk_level}
                        observation={r.cluster.assessments[0]?.observations}
                        selected={selectedKey === r.cluster.block && selKind === 'pending'}
                        checked={checked.has(r.cluster.block)}
                        onToggle={() => toggle(r.cluster.block)}
                        onOpen={() => { setBoardSelKind('pending'); setSelectedKey(r.cluster.block); }}
                        {...dragProps('pending', r.cluster.block)}
                        meta={
                          <>
                            <CardMeta icon={DescriptionOutlinedIcon} strong>
                              {r.cluster.count} report{r.cluster.count === 1 ? '' : 's'}
                            </CardMeta>
                            {r.oldest && (
                              <CardMeta icon={CalendarTodayRoundedIcon}>since {shortDate(r.oldest)}</CardMeta>
                            )}
                          </>
                        }
                      />
                    ))}

                    {!isPending && items.map(w => (
                      <TaskCard
                        key={w.id}
                        title={w.block_number || '(No block)'}
                        subtitle={`Order #${w.id}${w.target_agency ? ` \u00b7 ${w.target_agency}` : ''}`}
                        level={w.risk_level}
                        observation={w.notes}
                        selected={selectedKey === String(w.id) && selKind === 'order'}
                        checked={checked.has(String(w.id))}
                        onToggle={w.status === 'closed' ? undefined : () => toggle(String(w.id))}
                        onOpen={() => { setBoardSelKind('order'); setSelectedKey(String(w.id)); }}
                        // terminal orders are not draggable: there is nowhere
                        // forward to go, and backwards moves are refused anyway
                        {...(c.col === 'done' ? {} : dragProps(w.status, String(w.id)))}
                        meta={
                          <>
                            <CardMeta icon={DescriptionOutlinedIcon} strong>
                              {w.consolidated_count} report{w.consolidated_count === 1 ? '' : 's'}
                            </CardMeta>
                            <CardMeta icon={CalendarTodayRoundedIcon}>
                              {c.col === 'done'
                                ? `${w.status === 'closed' ? 'closed' : 'completed'} ${shortDate(w.closed_at || w.resolved_at || w.updatedAt)}`
                                : c.col === 'scheduled' && w.scheduled_for
                                  ? `attending ${shortDate(w.scheduled_for)}`
                                  : `raised ${shortDate(w.createdAt)}`}
                            </CardMeta>
                            {busyRow === w.id && <CircularProgress size={12} sx={{ color: ON_SURFACE.info }} />}
                          </>
                        }
                      />
                    ))}
                  </BoardColumn>
                );
              })}
            </Box>
          ) : tableRows.length ? (
            <QueueTable
              columns={tab === 'pending' ? pendingColumns : orderColumns}
              rows={tableRows}
              sort={sort}
              onSort={onSort}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
              checked={checked}
              onToggle={toggle}
              onToggleAll={toggleAll}
              compact={split}
            />
          ) : (
            <Box sx={{ py: 8, px: 3, textAlign: 'center', bgcolor: BRAND.surface }}>
              <ReportProblemOutlinedIcon sx={{ color: BRAND.textLight, fontSize: 30, mb: 1 }} />
              <Typography sx={{ color: BRAND.textLight, fontSize: 14 }}>
                {needle || priority !== 'all' || range
                  ? 'No rows match these filters.'
                  : tab === 'pending'
                    ? 'No escalations awaiting review. New AI-flagged rodent risks will appear here.'
                    : tab === 'open' ? 'No open work orders.' : 'No closed work orders yet.'}
              </Typography>
              {(needle || priority !== 'all' || range) && (
                <Button
                  size="small"
                  onClick={() => { setQ(''); setPriority('all'); setRange(0); }}
                  sx={{ mt: 1, color: ON_SURFACE.info, fontWeight: 700 }}
                >
                  Clear filters
                </Button>
              )}
            </Box>
          )}
        </Box>

        {split && (
          <Box
            sx={{
              width: '60%', borderLeft: `1px solid ${BRAND.border}`, minWidth: 0,
              // fills the locked viewport's remaining height, which is what lets
              // PanelShell's flex column pin its CTA footer to the bottom
              height: '100%', minHeight: 0,
              // elevation, not just a border: the panel reads as sliding OVER the
              // queue rather than sitting in the same plane
              boxShadow: '-4px 0 15px rgba(0,0,0,0.05), -1px 0 3px rgba(0,0,0,0.04)',
              zIndex: 2,
            }}
          >
            {detailNode}
          </Box>
        )}
      </Box>

      {/* One detail surface at every width. The queue behind it never reflows, so
          the row you came from is still exactly where you left it. */}
      <Drawer
        anchor="right"
        open={detailOpen}
        onClose={() => setSelectedKey(null)}
        slotProps={{ paper: { sx: { width: { xs: '100%', sm: 480, lg: 560 } } } }}
      >
        {detailNode}
      </Drawer>

      <ApproveDialog
        open={bulkApprove}
        onClose={() => setBulkApprove(false)}
        title={`Raise ${checkedGroups.length} work order${checkedGroups.length === 1 ? '' : 's'}`}
        count={checkedReportCount}
        blocks={checkedGroups.length}
        avoided={checkedAvoided}
        savings={checkedSavings}
        onConfirm={opts => approveGroups(checkedGroups.map(g => ({ block: g.block, ids: g.ids })), opts)}
      />

      <ScheduleDialog
        key={scheduleFor?.id ?? 'none'}
        open={Boolean(scheduleFor)}
        onClose={() => setScheduleFor(null)}
        onConfirm={async date => {
          const id = scheduleFor.id;
          setScheduleFor(null);
          await moveStage(id, 'scheduled', { scheduled_for: date });
        }}
      />

      {/* Floating action bar - appears only once there is a selection, so it
          costs no vertical space the rest of the time. Fixed to the viewport so
          it stays reachable at any scroll depth in either view. */}
      {visibleSelected > 0 && (
        <Paper
          elevation={0}
          sx={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 1200,
            display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', rowGap: 1,
            px: 2, py: 1.25, borderRadius: '12px',
            bgcolor: BRAND.surface, border: `1px solid ${BRAND.border}`,
            boxShadow: '0 12px 28px rgba(16,24,40,.18)',
            maxWidth: 'calc(100vw - 32px)',
          }}
        >
          <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: BRAND.heading, whiteSpace: 'nowrap' }}>
            {visibleSelected} selected
            {tab === 'pending' && checkedReportCount > 0 && (
              <Box component="span" sx={{ fontWeight: 500, color: BRAND.text }}>
                {' '}· {checkedReportCount} report{checkedReportCount === 1 ? '' : 's'}
                {checkedAvoided > 0 && ` · ${money(checkedSavings)} avoidable`}
              </Box>
            )}
          </Typography>
          {(view === 'board' || tab === 'pending') && checkedGroups.length > 0 && (
            <Button
              size="small"
              variant="contained"
              disableElevation
              startIcon={<DoneAllRoundedIcon sx={{ fontSize: 17 }} />}
              onClick={() => setBulkApprove(true)}
              sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '8px', bgcolor: BRAND.action, '&:hover': { bgcolor: BRAND.actionHover } }}
            >
              Approve selected
            </Button>
          )}
          <Button size="small" onClick={() => setChecked(new Set())} sx={{ color: BRAND.textLight, fontWeight: 600 }}>
            Clear
          </Button>
        </Paper>
      )}

      <UndoSnackbar
        open={!!undo}
        message={undo ? `Dismissed ${undo.count} report${undo.count === 1 ? '' : 's'}` : ''}
        onUndo={undoDismiss}
        onClose={() => setUndo(null)}
      />
    </Box>
  );
}
