import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Typography, Button, Chip, Stack, Checkbox, CircularProgress, Alert,
  Tooltip, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  FormControlLabel, IconButton, Breadcrumbs, Link, Tabs, Tab, InputAdornment,
  Select, MenuItem, Table, TableBody, TableCell, TableHead, TableRow,
  TableContainer, TableSortLabel, Drawer, useMediaQuery, Skeleton, LinearProgress,
  ToggleButton, ToggleButtonGroup, Paper,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { visuallyHidden } from '@mui/utils';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
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
import { useUser } from '../contexts/UserContext';
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

function greeting(hour) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
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

// Whole-card priority wash. Kept at 6% of the priority accent rather than a flat
// 2% red: --em-prio-* are already scheme-tuned, so color-mix gives the same
// perceived weight on a dark card as on a white one. Text sits on the card
// surface underneath, so contrast is unaffected.
const prioTint = level => `color-mix(in srgb, ${prio(level).accent} 6%, ${BRAND.surface})`;

// Compact hero metric. The value story used to be a run-on text line under the
// greeting; as tiles it separates "status" from the actionable queue below.
function MetricCard({ label, value, tip }) {
  const card = (
    <Box sx={{ px: 1.5, py: 1, borderRadius: '8px', bgcolor: BRAND.section, border: `1px solid ${BRAND.border}`, minWidth: 0 }}>
      <Typography sx={{ fontSize: 18, fontWeight: 800, color: BRAND.ink, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
      <Typography sx={{ fontSize: 11, fontWeight: 600, color: BRAND.textLight, lineHeight: 1.3, mt: 0.25 }}>
        {label}
      </Typography>
    </Box>
  );
  return tip ? <Tooltip arrow title={tip}>{card}</Tooltip> : card;
}

/* ------------------------------------------------------ command centre hero -- */

const FIELD_SX = {
  minWidth: 132,
  bgcolor: BRAND.surface,
  '& .MuiOutlinedInput-notchedOutline': { borderColor: BRAND.border },
  '& .MuiSelect-select, & .MuiInputBase-input': { fontSize: 14, fontWeight: 500 },
};

const RANGES = [
  { value: 0, label: 'Any date' },
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
];

/**
 * The utilitarian hero: who you are, what is on fire, and every control needed to
 * narrow the queue - all above the fold, all left-aligned on one baseline.
 *
 * The four KPI tiles that used to sit here are gone. Counts now live in the tab
 * labels (intrinsic to the navigation) and the consolidation value story is a
 * single inline line, which is roughly an eighth of the vertical space four
 * cards were spending on four numbers.
 */
function CommandCentre({
  name, urgentCount, totals, openOrders, q, setQ, priority, setPriority,
  range, setRange, sort, setSort, sortOptions, primary, onExport,
}) {
  const hour = new Date().getHours();
  return (
    <Box sx={{ px: { xs: 2, md: 3 }, pt: 3, pb: 2.5 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { md: 'flex-start' } }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h1" sx={{ fontSize: { xs: 26, md: 32 }, fontWeight: 800, color: BRAND.ink, letterSpacing: '-0.8px', lineHeight: 1.15 }}>
            {greeting(hour)}{name ? `, ${name}` : ''}.
          </Typography>
          {/* the actionable line is the hook, so it outweighs the greeting's
              supporting text and the count carries the semantic danger ink */}
          <Typography sx={{ fontSize: { xs: 18, md: 21 }, color: BRAND.text, mt: 0.75, fontWeight: 600, lineHeight: 1.35 }}>
            {urgentCount > 0 ? (
              <>
                You have{' '}
                <Box component="span" sx={{ color: ON_SURFACE.danger, fontWeight: 800 }}>
                  {urgentCount} urgent item{urgentCount === 1 ? '' : 's'}
                </Box>{' '}
                requiring approval.
              </>
            ) : totals?.pending ? (
              <>Nothing urgent. {totals.pending} report{totals.pending === 1 ? '' : 's'} still await review.</>
            ) : (
              <>The queue is clear. Nothing awaits your approval.</>
            )}
          </Typography>
        </Box>

        {/* macro CTA + the status metrics, stacked opposite the greeting so
            "what is the state of things" never competes with "what must I do" */}
        <Stack spacing={1.5} sx={{ flexShrink: 0, alignItems: { md: 'flex-end' } }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Tooltip arrow title="Download the current view as CSV">
              <IconButton
                onClick={onExport}
                aria-label="Export current view to CSV"
                sx={{ width: 40, height: 40, borderRadius: '8px', border: `1px solid ${BRAND.border}`, color: BRAND.textLight, bgcolor: BRAND.surface }}
              >
                <FileDownloadOutlinedIcon sx={{ fontSize: 19 }} />
              </IconButton>
            </Tooltip>
            <Button
              variant="contained"
              disableElevation
              onClick={primary.onClick}
              disabled={primary.disabled}
              startIcon={primary.icon}
              sx={{
                bgcolor: BRAND.action, color: '#fff', fontWeight: 700, fontSize: 15,
                px: 2.5, py: 1.15, borderRadius: '8px', whiteSpace: 'nowrap',
                // brand-tinted glow marks this as the page's one global action.
                // The pulse is decorative and the theme's prefers-reduced-motion
                // rule collapses it to a no-op for anyone who asks for less motion.
                boxShadow: '0 4px 14px rgba(29,78,216,.34)',
                animation: primary.disabled ? 'none' : 'aqPulse 2.6s ease-in-out infinite',
                '@keyframes aqPulse': {
                  '0%,100%': { boxShadow: '0 4px 14px rgba(29,78,216,.34)' },
                  '50%': { boxShadow: '0 4px 20px rgba(29,78,216,.55)' },
                },
                '&:hover': { bgcolor: BRAND.actionHover, animation: 'none' },
              }}
            >
              {primary.label}
            </Button>
          </Stack>

          {totals && (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 1, width: { xs: '100%', md: 460 } }}>
              <MetricCard label="Blocks affected" value={totals.blocks} />
              <MetricCard
                label="Call-outs avoidable"
                value={totals.call_outs_avoidable}
                tip={`Consolidating same-block reports into single visits, assuming ${money(totals.callout_cost)} per call-out.`}
              />
              <MetricCard label="Est. saved" value={money(totals.est_savings)} />
              <MetricCard label="Orders in progress" value={openOrders} />
            </Box>
          )}
        </Stack>
      </Stack>

      {/* filter + sort toolbar, horizontally aligned under the statement */}
      <Stack
        direction="row"
        spacing={1.25}
        sx={{ mt: 2.5, flexWrap: 'wrap', rowGap: 1.25, alignItems: 'center' }}
      >
        <TextField
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search block, observation or contractor"
          size="small"
          sx={{ ...FIELD_SX, minWidth: { xs: '100%', sm: 320 }, flexGrow: { sm: 1 }, maxWidth: 460 }}
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
          <Typography sx={{ fontSize: 13, color: BRAND.textLight, fontWeight: 600 }}>Sort by</Typography>
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
              sx={{ width: 36, height: 36, borderRadius: '8px', border: `1px solid ${BRAND.border}`, bgcolor: BRAND.surface, color: BRAND.textLight, fontSize: 13, fontWeight: 700 }}
            >
              {sort.dir === 'desc' ? '↓' : '↑'}
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>
    </Box>
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
        p: 1.5, borderRadius: '10px', cursor: draggable ? 'grab' : 'pointer',
        bgcolor: level ? prioTint(level) : BRAND.surface,
        border: `1px solid ${selected ? ON_SURFACE.info : BRAND.border}`,
        boxShadow: selected ? `0 0 0 1px ${ON_SURFACE.info}` : '0 1px 2px rgba(16,24,40,.06)',
        opacity: dragging ? 0.45 : 1,
        transition: 'box-shadow .15s ease, transform .15s ease',
        '&:hover': { boxShadow: '0 4px 10px rgba(16,24,40,.10)', transform: 'translateY(-1px)' },
        '&:focus-visible': { outline: `2px solid ${BRAND.accent}`, outlineOffset: 2 },
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
        {onToggle && (
          <Checkbox
            size="small"
            checked={checked}
            onChange={onToggle}
            onClick={e => e.stopPropagation()}
            slotProps={{ input: { 'aria-label': `Select ${title}` } }}
            sx={{ p: 0.25, mt: -0.25, '&.Mui-checked': { color: ON_SURFACE.info } }}
          />
        )}
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          {/* block name dominant, priority badge immediately beside it */}
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
            <Typography sx={{ fontSize: 15.5, fontWeight: 800, color: BRAND.heading, lineHeight: 1.25 }}>{title}</Typography>
            {level && <PriorityChip level={level} />}
          </Stack>
          {subtitle && <Typography sx={{ fontSize: 12, color: BRAND.textLight, mt: 0.25 }}>{subtitle}</Typography>}
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
          {meta && (
            <Stack direction="row" spacing={1.25} sx={{ mt: 1, flexWrap: 'wrap', rowGap: 0.5, alignItems: 'center' }}>
              {meta}
            </Stack>
          )}
          {action && <Box sx={{ mt: 1.25 }}>{action}</Box>}
        </Box>
      </Stack>
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
function BoardColumn({ id, title, count, hint, accent, children, dropActive, canDrop, onDragOver, onDrop, onDragLeave }) {
  return (
    <Box
      onDragOver={canDrop ? onDragOver : undefined}
      onDrop={canDrop ? onDrop : undefined}
      onDragLeave={canDrop ? onDragLeave : undefined}
      sx={{
        flex: '1 1 0', minWidth: 260, display: 'flex', flexDirection: 'column',
        bgcolor: dropActive ? `color-mix(in srgb, ${ON_SURFACE.info} 8%, ${BRAND.section})` : BRAND.section,
        border: `1px solid ${dropActive ? ON_SURFACE.info : BRAND.border}`,
        borderRadius: '12px', minHeight: 0,
        transition: 'background-color .15s ease, border-color .15s ease',
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 1.75, py: 1.25, borderBottom: `1px solid ${BRAND.border}` }}>
        <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: accent, flexShrink: 0 }} />
        <Typography sx={{ fontSize: 13, fontWeight: 800, color: BRAND.heading, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
          {title}
        </Typography>
        <Box component="span" sx={{ fontSize: 12, fontWeight: 700, px: 0.85, borderRadius: '999px', bgcolor: BRAND.surface, color: BRAND.textLight, border: `1px solid ${BRAND.border}` }}>
          {count}
        </Box>
      </Stack>
      {hint && (
        <Typography sx={{ fontSize: 11.5, color: BRAND.textLight, px: 1.75, pt: 1 }}>{hint}</Typography>
      )}
      <Stack spacing={1.25} id={id} sx={{ p: 1.5, overflowY: 'auto', flexGrow: 1, minHeight: 120 }}>
        {children}
      </Stack>
    </Box>
  );
}

/* ------------------------------------------------------------------- table -- */

const HEAD_SX = {
  fontSize: 11.5, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase',
  letterSpacing: '0.6px', bgcolor: BRAND.section, borderBottom: `1px solid ${BRAND.border}`,
  py: 1.25, whiteSpace: 'nowrap',
};
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
                align={c.numeric ? 'right' : 'left'}
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
                  <TableCell key={c.key} align={c.numeric ? 'right' : 'left'} sx={CELL_SX}>
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
      <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 2.5, py: 2 }}>{children}</Box>
      {footer && (
        <Box sx={{ px: 2.5, py: 2, borderTop: `1px solid ${BRAND.border}`, bgcolor: BRAND.section }}>{footer}</Box>
      )}
    </Box>
  );
}

function MetaRow({ label, children }) {
  return (
    <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', py: 0.85, borderBottom: `1px solid ${BRAND.section}` }}>
      <Typography sx={{ fontSize: 13, color: BRAND.textLight, flexShrink: 0 }}>{label}</Typography>
      <Typography component="div" sx={{ fontSize: 13.5, color: BRAND.heading, fontWeight: 600, textAlign: 'right', minWidth: 0 }}>{children}</Typography>
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
        <Button
          fullWidth
          variant="contained"
          disableElevation
          startIcon={busy ? <CircularProgress size={15} sx={{ color: '#fff' }} /> : <CheckRoundedIcon />}
          disabled={busy}
          onClick={async () => { setBusy(true); try { await onCloseOrder(order.id); } finally { setBusy(false); } }}
          sx={{ bgcolor: BRAND.action, fontWeight: 700, borderRadius: '8px', '&:hover': { bgcolor: BRAND.actionHover } }}
        >
          Mark work order done
        </Button>
      ) : (
        <Typography sx={{ fontSize: 13, color: BRAND.textLight, textAlign: 'center' }}>
          Closed by {order.closed_by_name || 'an officer'} on {shortDate(order.closed_at)}.
        </Typography>
      )}
    >
      {/* The tracked pipeline, expanded. Each row is a real logged event or an
          explicit "not yet" - the panel never fills a stage nobody performed. */}
      <Typography sx={{ fontSize: 12, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1 }}>
        Progress
      </Typography>
      <Stack spacing={0} sx={{ mb: 2 }}>
        {(detail?.pipeline || order.pipeline || []).map(stg => (
          <Stack key={stg.stage} direction="row" spacing={1.25} sx={{ alignItems: 'flex-start', py: 0.75, borderBottom: `1px solid ${BRAND.section}` }}>
            <Box
              aria-hidden
              sx={{
                width: 9, height: 9, borderRadius: '50%', mt: 0.6, flexShrink: 0,
                bgcolor: stg.reached ? ON_SURFACE.info : 'transparent',
                border: stg.reached ? 'none' : `1.5px dashed ${BRAND.border}`,
              }}
            />
            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: stg.reached ? 700 : 500, color: stg.reached ? BRAND.heading : BRAND.textLight }}>
                {stg.label}
              </Typography>
              <Typography sx={{ fontSize: 12, color: BRAND.textLight, fontStyle: stg.reached ? 'normal' : 'italic' }}>
                {stg.reached
                  ? `${new Date(stg.at).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${stg.actor_name ? ` · ${stg.actor_name}` : ''}`
                  : 'not yet'}
              </Typography>
              {stg.note && <Typography sx={{ fontSize: 12.5, color: BRAND.text, mt: 0.25 }}>{stg.note}</Typography>}
            </Box>
          </Stack>
        ))}
      </Stack>

      <MetaRow label="Town council">
        {order.town_council || <Box component="span" sx={{ color: BRAND.textLight, fontStyle: 'italic' }}>not recorded</Box>}
      </MetaRow>
      <MetaRow label="Scheduled attendance">
        {order.scheduled_for
          ? shortDate(order.scheduled_for)
          : <Box component="span" sx={{ color: BRAND.textLight, fontStyle: 'italic' }}>date not yet confirmed</Box>}
      </MetaRow>
      <MetaRow label="Reported by">
        {(detail?.reporters?.length ? detail.reporters.join(', ') : order.reporter_name)
          || <Box component="span" sx={{ color: BRAND.textLight, fontStyle: 'italic' }}>not recorded</Box>}
      </MetaRow>
      <MetaRow label="Contractor">{order.target_agency}</MetaRow>
      <MetaRow label="Reports consolidated">{order.consolidated_count}</MetaRow>
      <MetaRow label="Call-outs avoided">{order.call_outs_avoided} · {money(order.est_savings)}</MetaRow>
      <MetaRow label="Approved by">{order.approved_by_name || '-'} · {shortDate(order.createdAt)}</MetaRow>
      {order.dispatched_to && <MetaRow label="Dispatched to">{order.dispatched_to}</MetaRow>}
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
            <Box key={a.id} sx={{ py: 1.25, borderTop: i === 0 ? 'none' : `1px solid ${BRAND.section}` }}>
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
      ) : (
        <Typography sx={{ fontSize: 13, color: BRAND.textLight }}>Could not load the linked reports.</Typography>
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
  const theme = useTheme();
  const splitOk = useMediaQuery(theme.breakpoints.up('lg'));
  const { user } = useUser();

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
  const [orderDetail, setOrderDetail] = useState({ id: null, data: null });
  const [busyBulk, setBusyBulk] = useState(false);
  const [busyRow, setBusyRow] = useState(null);
  // board | list. Board is the triage surface; list stays for dense scanning and
  // for the sortable columns the board deliberately does not reproduce.
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('actionQueueView') === 'list' ? 'list' : 'board'; }
    catch { return 'board'; }
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
  const totals = queue?.totals;
  // 'open' is not a status any more - the pipeline replaced it. Everywhere the
  // UI says "open orders" it means "raised but not yet closed", i.e. still live.
  const isLive = w => w.status !== 'closed';
  const openCount = workOrders.filter(isLive).length;
  const closedCount = workOrders.filter(w => w.status === 'closed').length;
  const urgentCount = clusters.filter(c => URGENT.has(c.risk_level)).length;

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
        if (priority !== 'all' && c.risk_level !== priority) return false;
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
  }, [clusters, priority, cutoff, needle, sort]);

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
    return {
      open: workOrders.filter(w => w.status !== 'closed' && pass(w)).sort(byPriority),
      closed: workOrders.filter(w => w.status === 'closed' && pass(w)).sort(byPriority),
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

  function switchTab(next) {
    setTab(next);
    setChecked(new Set());
    setSelectedKey(null);
    setSort(next === 'pending' ? { key: 'priority', dir: 'desc' } : { key: 'raised', dir: 'desc' });
  }

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
  const split = detailOpen && splitOk;

  /* ---- board drag/drop ----------------------------------------------------
     Only forward transitions are droppable, and each one maps to a real
     operation: pending -> open raises a work order (via the same confirm dialog
     the bulk path uses, because it creates a contractor job), open -> closed
     closes it. Backwards drags are rejected rather than silently ignored, and
     drag is never the only route - every card keeps its buttons and the
     keyboard-reachable detail panel. --------------------------------------- */

  const allows = (d, col) => {
    if (!d) return false;
    if (d.type === 'pending') return col === 'open';
    if (d.type === 'open') return col === 'closed';
    return false;
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
    setBusyRow(Number(d.id));
    try { await closeWo(Number(d.id)); }
    catch (e) { setToast({ ok: false, msg: e.response?.data?.error || 'Could not close the work order.' }); }
    finally { setBusyRow(null); }
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
          label: `Approve ${checkedGroups.length} selected`,
          icon: <DoneAllRoundedIcon />,
          onClick: () => setBulkApprove(true),
          disabled: false,
        };
      }
      return {
        label: urgentCount > 0 ? `Review urgent · ${urgentCount}` : 'Start reviewing',
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
        label: checked.size > 0 ? `Mark ${checked.size} done` : 'Mark done',
        icon: busyBulk ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <CheckRoundedIcon />,
        onClick: closeSelected,
        disabled: checked.size === 0 || busyBulk,
      };
    }
    return { label: 'Export closed orders', icon: <FileDownloadOutlinedIcon />, onClick: exportCsv, disabled: orderRows.length === 0 };
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
      key: 'block', label: 'Block', compact: true, width: '18%',
      render: r => (
        <Typography sx={{ fontSize: 14.5, fontWeight: 700, color: BRAND.heading, whiteSpace: 'nowrap' }}>{r.cluster.block}</Typography>
      ),
    },
    {
      key: 'summary', label: 'Latest observation', sortable: false, compact: false,
      render: r => (
        <Typography sx={{ fontSize: 13.5, color: BRAND.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 340 }}>
          {r.cluster.assessments[0]?.observations || '-'}
        </Typography>
      ),
    },
    { key: 'priority', label: 'Priority', numeric: true, compact: true, width: 100, render: r => <PriorityChip level={r.cluster.risk_level} /> },
    {
      key: 'count', label: 'Reports', numeric: true, compact: true, width: 90,
      render: r => <Box sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: BRAND.heading }}>{r.cluster.count}</Box>,
    },
    {
      key: 'savings', label: 'Est. saving', numeric: true, compact: false, width: 120,
      render: r => (
        <Box sx={{ fontVariantNumeric: 'tabular-nums', color: r.cluster.est_savings > 0 ? ON_SURFACE.ok : BRAND.textLight, fontWeight: 600 }}>
          {r.cluster.est_savings > 0 ? money(r.cluster.est_savings) : '-'}
        </Box>
      ),
    },
    {
      key: 'oldest', label: 'Oldest', numeric: true, compact: false, width: 100,
      render: r => <Box sx={{ fontVariantNumeric: 'tabular-nums', color: BRAND.textLight }}>{r.oldest ? shortDate(r.oldest) : '-'}</Box>,
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

  const TABS = [
    { value: 'pending', label: 'Requires action', count: clusters.length },
    { value: 'open', label: 'Open orders', count: openCount },
    { value: 'closed', label: 'Closed', count: closedCount },
  ];

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
        name={user?.name?.split(' ')[0]}
        urgentCount={urgentCount}
        totals={totals}
        openOrders={openCount}
        q={q} setQ={setQ}
        priority={priority} setPriority={setPriority}
        range={range} setRange={setRange}
        sort={sort} setSort={setSort}
        sortOptions={tab === 'pending' ? PENDING_SORTS : ORDER_SORTS}
        primary={primary}
        onExport={exportCsv}
      />

      <Box sx={{ px: { xs: 2, md: 3 } }}>
        {error && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={load}>Retry</Button>}>{error}</Alert>}
        {toast && <Alert severity={toast.ok ? 'success' : 'error'} sx={{ mb: 2 }} onClose={() => setToast(null)}>{toast.msg}</Alert>}
      </Box>

      {/* segmented control tabs carry the counts the KPI cards used to. In board
          view the columns ARE the stages, so the tabs would be a second, weaker
          copy of the same navigation - only the view switcher remains. */}
      <Box sx={{ px: { xs: 2, md: 3 }, borderBottom: `1px solid ${BRAND.border}`, display: 'flex', alignItems: 'center', gap: 2 }}>
        {view === 'board' ? (
          <Typography sx={{ fontSize: 13.5, color: BRAND.textLight, py: 1.25, flexGrow: 1 }}>
            Drag a card to the next stage to action it, or open one to review it in detail.
          </Typography>
        ) : (
        <Tabs
          value={tab}
          onChange={(_, v) => switchTab(v)}
          sx={{
            flexGrow: 1,
            minHeight: 42,
            '& .MuiTabs-indicator': { backgroundColor: ON_SURFACE.info, height: 2 },
            '& .MuiTab-root': {
              textTransform: 'none', fontSize: 14, fontWeight: 600, minHeight: 42, py: 0,
              color: BRAND.textLight, '&.Mui-selected': { color: BRAND.heading, fontWeight: 700 },
            },
          }}
        >
          {TABS.map(t => (
            <Tab
              key={t.value}
              value={t.value}
              label={
                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                  <span>{t.label}</span>
                  <Box
                    component="span"
                    sx={{
                      fontSize: 12, fontWeight: 700, px: 0.75, borderRadius: '999px', minWidth: 20,
                      bgcolor: tab === t.value ? BRAND.action : BRAND.section,
                      color: tab === t.value ? '#fff' : BRAND.textLight,
                    }}
                  >
                    {t.count}
                  </Box>
                </Stack>
              }
            />
          ))}
        </Tabs>
        )}
        <ToggleButtonGroup
          value={view}
          exclusive
          onChange={(_, v) => switchView(v)}
          size="small"
          aria-label="Layout"
          sx={{
            flexShrink: 0, alignSelf: 'center',
            '& .MuiToggleButton-root': {
              px: 1.25, py: 0.4, textTransform: 'none', fontSize: 12.5, fontWeight: 600,
              color: BRAND.textLight, borderColor: BRAND.border,
              '&.Mui-selected': { bgcolor: BRAND.slate, color: '#fff', '&:hover': { bgcolor: BRAND.slateHover } },
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
      </Box>

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
            <Box sx={{ display: 'flex', gap: 2, p: { xs: 2, md: 3 }, alignItems: 'stretch', flexGrow: 1, minHeight: 0, overflowX: 'auto' }}>
              <BoardColumn
                id="col-pending"
                title="Requires action"
                count={boardPending.length}
                accent="var(--em-prio-critical)"
                hint={drag?.type === 'pending' ? 'Drop on Open orders to approve' : null}
                {...colProps('pending')}
              >
                {boardPending.length === 0 && (
                  <Typography sx={{ fontSize: 13, color: BRAND.textLight, textAlign: 'center', py: 3 }}>
                    Nothing awaiting review.
                  </Typography>
                )}
                {boardPending.map(r => (
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
                        <Typography sx={{ fontSize: 12, fontWeight: 700, color: BRAND.heading, fontVariantNumeric: 'tabular-nums' }}>
                          {r.cluster.count} report{r.cluster.count === 1 ? '' : 's'}
                        </Typography>
                        {r.cluster.est_savings > 0 && (
                          <Typography sx={{ fontSize: 12, fontWeight: 600, color: ON_SURFACE.ok, fontVariantNumeric: 'tabular-nums' }}>
                            {money(r.cluster.est_savings)}
                          </Typography>
                        )}
                        {r.oldest && (
                          <Typography sx={{ fontSize: 12, color: BRAND.textLight }}>since {shortDate(r.oldest)}</Typography>
                        )}
                      </>
                    }
                  />
                ))}
              </BoardColumn>

              <BoardColumn
                id="col-open"
                title="Open orders"
                count={boardOrders.open.length}
                accent="var(--em-info-ink)"
                hint={drag?.type === 'open' ? 'Drop on Closed to mark done' : null}
                {...colProps('open')}
              >
                {boardOrders.open.length === 0 && (
                  <Typography sx={{ fontSize: 13, color: BRAND.textLight, textAlign: 'center', py: 3 }}>
                    No open work orders.
                  </Typography>
                )}
                {boardOrders.open.map(w => (
                  <TaskCard
                    key={w.id}
                    title={w.block_number || '(No block)'}
                    subtitle={`Order #${w.id}${w.target_agency ? ` · ${w.target_agency}` : ''}`}
                    level={w.risk_level}
                    observation={w.notes}
                    selected={selectedKey === String(w.id) && selKind === 'order'}
                    checked={checked.has(String(w.id))}
                    onToggle={() => toggle(String(w.id))}
                    onOpen={() => { setBoardSelKind('order'); setSelectedKey(String(w.id)); }}
                    {...dragProps('open', String(w.id))}
                    meta={
                      <>
                        <Typography sx={{ fontSize: 12, fontWeight: 700, color: BRAND.heading, fontVariantNumeric: 'tabular-nums' }}>
                          {w.consolidated_count} report{w.consolidated_count === 1 ? '' : 's'}
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: BRAND.textLight }}>raised {shortDate(w.createdAt)}</Typography>
                      </>
                    }
                    action={
                      <GhostButton
                        disabled={busyRow === w.id}
                        onClick={async e => {
                          e.stopPropagation();
                          setBusyRow(w.id);
                          try { await closeWo(w.id); }
                          catch (err) { setToast({ ok: false, msg: err.response?.data?.error || 'Could not mark the work order done.' }); }
                          finally { setBusyRow(null); }
                        }}
                        aria-label={`Mark work order ${w.id} done`}
                      >
                        {busyRow === w.id ? '…' : 'Mark done'}
                      </GhostButton>
                    }
                  />
                ))}
              </BoardColumn>

              <BoardColumn
                id="col-closed"
                title="Closed"
                count={boardOrders.closed.length}
                accent="var(--em-ok-strong)"
                {...colProps('closed')}
              >
                {boardOrders.closed.length === 0 && (
                  <Typography sx={{ fontSize: 13, color: BRAND.textLight, textAlign: 'center', py: 3 }}>
                    No closed work orders yet.
                  </Typography>
                )}
                {boardOrders.closed.map(w => (
                  <TaskCard
                    key={w.id}
                    title={w.block_number || '(No block)'}
                    subtitle={`Order #${w.id}`}
                    level={w.risk_level}
                    observation={w.notes}
                    selected={selectedKey === String(w.id) && selKind === 'order'}
                    onOpen={() => { setBoardSelKind('order'); setSelectedKey(String(w.id)); }}
                    meta={<Typography sx={{ fontSize: 12, color: BRAND.textLight }}>closed {shortDate(w.closed_at || w.updatedAt)}</Typography>}
                  />
                ))}
              </BoardColumn>
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

      {/* below lg there is not enough width for a genuine split, so the same panel
          slides over as a drawer rather than being crushed into a column */}
      <Drawer
        anchor="right"
        open={detailOpen && !splitOk}
        onClose={() => setSelectedKey(null)}
        slotProps={{ paper: { sx: { width: { xs: '100%', sm: 460 } } } }}
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
