import { createTheme } from '@mui/material/styles';

// Shared app theme - EM Services brand.
// Applied globally via ThemeProvider so every page inherits it automatically.
//
// LIGHT/DARK STRATEGY. The neutral tokens below are CSS custom properties, not hex
// literals, so flipping the colour scheme re-skins every existing `BRAND.*` call
// site (hundreds of them) without editing any of them - ThemeModeProvider just
// swaps the variable values on <html>.
//
// Two deliberate exceptions stay literal hex:
//  1. FILL hues (primary/navy/slate/...) are passed to MUI's alpha() and lighten(),
//     which parse the string and cannot handle `var()`.
//  2. Those same fills carry white text, so they must stay dark in BOTH schemes.
// For brand red used as TEXT or an icon, use `BRAND.accent` instead - it lightens
// in dark mode, because #C1272D on a dark surface is only ~2.1:1.
export const BRAND = {
  // -- literal fills (alpha-safe; white text sits on these in both schemes) ----
  primary: '#C1272D',
  primaryHover: '#A61D22',
  primaryLight: '#E74B4B',
  slate: '#37474F',
  slateHover: '#263238',
  success: '#2E7D32',
  // Corporate structural palette. Navy carries authority for chrome, chart bars
  // and the operational CTA; crimson stays the brand accent. Keeping the two
  // separate means the Action Centre reads as "the system's one big action"
  // without competing with brand-red status cues.
  navy: '#1E3A5F',
  navyHover: '#152C49',
  // Deep royal blue for the primary operational CTA. A solid red button reads as
  // "delete/error"; this carries the same weight without the alarm (white on it is
  // ~6.4:1). Shifted off indigo #4338CA, which read purple at button scale.
  // Urgency is carried by a red count badge ON the button, not by the whole button.
  action: '#1D4ED8',
  actionHover: '#1740AE',

  // -- scheme-aware neutrals + accent ink ------------------------------------
  heading: 'var(--em-heading)',
  text: 'var(--em-text)',
  textLight: 'var(--em-text-light)',
  border: 'var(--em-border)',   // one card/divider hairline everywhere
  section: 'var(--em-section)',
  canvas: 'var(--em-canvas)',   // cooler page field for dense data surfaces
  surface: 'var(--em-surface)', // card/panel background - use instead of '#fff'
  navySoft: 'var(--em-navy-soft)',
  ink: 'var(--em-ink)',         // display headings - deeper than heading
  accent: 'var(--em-accent)',   // brand red as TEXT/icon/border (lightens on dark)
};

/**
 * Scheme token values. Contrast ratios against their own surface were checked so
 * both schemes clear WCAG AA for body text:
 *   dark: text #C7CDD6 on surface #1B222D ~10:1, text-light #9AA4B2 ~6.3:1,
 *         accent #F08A8F ~6.0:1
 *   light: unchanged from the values these replaced.
 */
export const THEME_TOKENS = {
  light: {
    '--em-heading': '#1A1A1A',
    '--em-text': '#444444',
    // Secondary ink. #6B7280 cleared 4.8:1 on the white card but only 4.39:1 on
    // the section grey and 4.11:1 on the navySoft row hover - and secondary text
    // sits on all three (toolbars, column headers, zebra rows), so it was failing
    // AA wherever it was NOT on white. #5B6470 measures 6.00 / 5.45 / 5.10.
    // Dark mode's #9AA4B2 already clears both its backdrops (6.34 / 6.78).
    '--em-text-light': '#5B6470',
    '--em-border': '#E5E7EB',     // grey-200
    '--em-section': '#F3F4F6', // page field - cards sit on it as pure white
    // One step deeper than slate-50 (#F8FAFC). At slate-50 a white card's 1px border was
    // doing all the separating and washed out on a bright display, so the KPI row read as
    // four labels on one continuous field. #F4F7F9 is still a near-white page - nothing
    // reads as grey - but it is enough contrast for a white card to sit ON it.
    '--em-canvas': '#F4F7F9',
    '--em-surface': '#FFFFFF',
    '--em-navy-soft': '#E8EDF4',
    '--em-ink': '#0F172A',
    '--em-accent': '#C1272D',
    // -- semantic pairs: chip fill + its ink, and `-strong` for a coloured word or
    //    icon sitting DIRECTLY on a card with no tint behind it. Every pair was
    //    measured: ink/fill >=4.5:1, `-strong`/card >=4.5:1.
    '--em-ok-bg': '#E7F4E8', '--em-ok-ink': '#1E6023', '--em-ok-border': '#D6E7D9', '--em-ok-strong': '#1E6023',
    '--em-warn-bg': '#FFF4E5', '--em-warn-ink': '#8A5200', '--em-warn-border': '#F0E2C4', '--em-warn-strong': '#8A5200',
    '--em-danger-bg': '#FDECEA', '--em-danger-ink': '#B3261E', '--em-danger-border': '#F5C2C2', '--em-danger-strong': '#B3261E',
    // Cell/row TINT, deeper than the chip `-bg`. A chip fill only has to separate
    // from the card, but a tinted table cell also sits on the zebra stripe and the
    // row-hover wash - and #FDECEA is 1.04:1 against the stripe, so it vanished
    // there. Measured: 1.46:1 vs card, 1.33:1 vs stripe, 1.24:1 vs navySoft hover,
    // with the crimson digit ink #8E1038 still at 6.3:1 on it.
    '--em-danger-tint': '#F7CBCB',
    '--em-info-bg': '#E8F1FB', '--em-info-ink': '#175CD3', '--em-info-border': '#CFE0F5', '--em-info-strong': '#1D4ED8',
    '--em-neutral-bg': '#EEF2F7', '--em-neutral-ink': '#334E68', '--em-neutral-border': '#DCE3EC',
    // priority rules down a table row's leading edge - graphics, so >=3:1 on the
    // card. The old #ED9B00 amber was 2.26:1 on white and genuinely too faint.
    '--em-prio-critical': '#B3261E', '--em-prio-high': '#D9463C', '--em-prio-medium': '#C67C00', '--em-prio-low': '#64748B',
    // oversized hero score. Light keeps the deep authoritative shade; dark has to
    // invert or the single biggest number on the dashboard drops to ~2:1.
    '--em-display-healthy': '#14532D', '--em-display-watch': '#7C4A03', '--em-display-critical': '#9F1239',
  },
  dark: {
    '--em-heading': '#F3F5F7',
    '--em-text': '#C7CDD6',
    '--em-text-light': '#9AA4B2',
    '--em-border': '#2A3341',
    '--em-section': '#161C26',
    '--em-canvas': '#111722',
    '--em-surface': '#1B222D',
    '--em-navy-soft': '#1C2A3D',
    '--em-ink': '#F8FAFC',
    '--em-accent': '#F08A8F',
    '--em-ok-bg': '#14301F', '--em-ok-ink': '#7EE0A3', '--em-ok-border': '#2A5238', '--em-ok-strong': '#6EE7A0',
    '--em-warn-bg': '#3A2A0A', '--em-warn-ink': '#FBBF24', '--em-warn-border': '#574010', '--em-warn-strong': '#FBBF24',
    '--em-danger-bg': '#52201C', '--em-danger-ink': '#FF9A94', '--em-danger-border': '#6E2C27', '--em-danger-strong': '#FF8A80',
    // Dark inverts the stack - the zebra (#161C26) is DARKER than the card
    // (#1B222D) - and the navySoft hover (#1C2A3D) is lighter again, so the tint
    // has to clear backdrops on both sides of the card. #52201C sat at 1.09:1
    // against that hover and disappeared on it. Measured here: 1.38 / 1.47 / 1.25
    // vs card / stripe / hover, digit ink #FF8FA8 at 5.4:1.
    '--em-danger-tint': '#5A2B28',
    '--em-info-bg': '#122740', '--em-info-ink': '#8FBCFF', '--em-info-border': '#24405F', '--em-info-strong': '#93B4FF',
    '--em-neutral-bg': '#232D3A', '--em-neutral-ink': '#AEB9C7', '--em-neutral-border': '#35404F',
    '--em-prio-critical': '#F0736B', '--em-prio-high': '#E8695F', '--em-prio-medium': '#F0B33C', '--em-prio-low': '#7D8CA3',
    '--em-display-healthy': '#7EE0A3', '--em-display-watch': '#F5C860', '--em-display-critical': '#FF9E97',
  },
};

/* ==========================================================================
 * REFERENCE-DERIVED SURFACE SYSTEM
 *
 * Taken from the two dark analytics references (Fitonist, Nexus). What was
 * extracted is the SYSTEM, not the screenshots:
 *
 *   1. A three-step surface ladder - page, card, and an INSET panel nested
 *      inside a card. Both references put their charts on a slightly different
 *      surface within the card, which is what stops a big card reading as one
 *      empty rectangle.
 *   2. Large radii. 20px cards, 16px insets. This is the single biggest "modern
 *      product" signal in both references.
 *   3. NO GREY HAIRLINES ON DARK - that is what makes a dark UI read as a light
 *      one with the colours flipped. Dark instead gets a white-at-6% INNER
 *      HIGHLIGHT, which catches the top edge the way a lit surface does. Light
 *      keeps a real hairline, because white on white has no lightness step left.
 *
 * DELIBERATELY NOT TAKEN: the violet + lime accent pair. Those are not EM
 * Services colours, and the brand is crimson + navy. The forms are borrowed; the
 * palette stays. Nor is the references' decorative use of green - green means
 * status here, so it appears on a delta only when a movement has genuinely been
 * measured as good (see TREND).
 *
 * LIGHT IS NOT AN INVERSION. White cards on a white-ish page have no lightness
 * step left to separate them, so light keeps a hairline where dark has none.
 * That is the considered equivalent of the rule, not a copy of it.
 * ========================================================================== */
/**
 * RADII - sharpened from the reference's 20/16 down to 8.
 *
 * The large radii were lifted from consumer analytics dashboards, where a soft corner
 * signals "friendly product". This is an estate operations tool: sharper corners read as
 * utilitarian, which is the right register, and at 8px a card still reads as a card
 * without looking like a phone widget.
 */
/**
 * Corner radii.
 *
 * Cards moved 8 -> 14 and insets 8 -> 12. Two reference dashboards were the prompt, but
 * the reason is a hierarchy the flat 8 could not express: at one radius for everything, a
 * card, the chart well inside it and the control on top of it all read as the same
 * surface, so the eye got no help telling container from content. Cards are now the
 * softest shape, insets sit inside them, controls are tighter again, chips tightest.
 *
 * Deliberately theme-agnostic - radii carry the same hierarchy in light and dark, which
 * is why this belongs here rather than in either scheme's tokens.
 *
 * CAVEAT: about 20 files hardcode a pixel radius instead of reading these, so they will
 * not follow. Worth converting them opportunistically; not worth a sweep that touches
 * every file at once.
 */
export const RADII = { pill: 999, card: 14, inset: 12, control: 10, chip: 8, sm: 6 };

export const SURFACE = {
  dark: {
    page: '#121216',   // charcoal, very slightly cool
    card: '#1E1E24',
    inset: '#2A2A35',  // the nested panel a chart sits on
    raised: '#343442', // hover / a pill sitting on the inset
    // A HIGHLIGHT, not a hairline. The earlier rule banned grey 1px borders on dark
    // because they made cards read as light-mode cards with the colours flipped. A
    // white-at-5% inner edge is a different thing: it catches the top of the card the
    // way a lit surface does, which is what the references actually use.
    border: 'rgba(255,255,255,0.06)',
    insetBorder: 'rgba(255,255,255,0.04)',
  },
  light: {
    page: '#F4F5F7',
    card: '#FFFFFF',
    inset: '#F7F8FA',
    raised: '#EEF0F4',
    // light needs a real hairline - white on white has no lightness step left
    border: '#EAEAEA',
    insetBorder: '#EDEFF3',
  },
};

/**
 * Card lift, per scheme.
 *
 * Light gets a TIGHT 4px shadow, not a diffuse halo: the border does the separating and
 * the shadow only lifts the edge a millimetre off the page. A wide soft shadow is the
 * thing that reads as a template.
 *
 * Dark gets none. A black shadow on a charcoal page is invisible, so there the inner
 * white highlight (SURFACE.dark.border) catches the edge instead.
 */
/**
 * A LAYERED shadow, not a single soft blur.
 *
 * `0 2px 4px rgba(0,0,0,.04)` was a haze - visible only as a slight dirtying of the pixels
 * under the card, which reads as a rendering artefact rather than as elevation. Two stops
 * is what actually says "raised": a tight 1px contact shadow that anchors the card's edge
 * to the page, and a wider soft one that carries the height. This is the same two-stop
 * shape Tailwind's shadow-md and every corporate design system uses, for the reason that
 * one blur radius cannot express both contact and distance.
 *
 * Dark stays none: on a charcoal page a black shadow is invisible, and the card is already
 * separated by being LIGHTER than its field. Elevation is carried by value there, not by
 * shadow - which is why this is mode-indexed rather than one constant.
 */
const CARD_SHADOW = {
  light: '0 4px 6px -1px rgba(16,24,40,0.05), 0 1px 3px -1px rgba(16,24,40,0.07)',
  dark: 'none',
};

/**
 * NEON DATA PALETTE - for CHARTS AND DATA HIGHLIGHTS ONLY.
 *
 * Scope is the whole point of this constant. Chrome - nav, buttons, the logo, the
 * primary CTA - stays EM Services crimson and navy, because this product is delivered
 * to a Town Council and a fintech-purple button is not their brand. Neon is for the
 * data layer, where it earns its keep by making a series pop off a charcoal card.
 *
 * NO YELLOW. The references pair cyan with electric yellow, but amber is a reserved
 * status hue in this codebase (see the note on CATEGORY_COLORS), and a categorical
 * yellow beside a warning amber is exactly the collision that reservation exists to
 * prevent. Teal takes the second slot instead - same visual register, no clash.
 *
 * The LIGHT set is not the same hex at lower opacity. Neon is defined by being bright
 * against a dark field; on white the identical values are illegible, so each slot is
 * re-stepped to a deep, saturated equivalent that holds its hue identity while
 * clearing AA. A series therefore keeps its identity across the toggle without either
 * scheme getting a colour that does not work on it.
 */
export const NEON = {
  dark: {
    cyan: '#22D3EE',
    purple: '#A78BFA',
    magenta: '#F472B6',
    teal: '#2DD4BF',
    slate: '#8B93A7',
  },
  light: {
    cyan: '#0E7490',
    purple: '#6D28D9',
    magenta: '#BE185D',
    teal: '#0F766E',
    slate: '#5B6470',
  },
};

/**
 * Coloured glow behind a data mark, as an sx `boxShadow` or an SVG `filter` companion.
 *
 * Dark only, deliberately: a glow is light bleeding off a bright object onto a dark
 * field. On white there is nothing for it to bleed into - it renders as a dirty smudge -
 * so on light this returns `none` and the mark carries itself on contrast alone.
 */
export function glow(mode, color, strength = 0.45) {
  if (mode !== 'dark') return 'none';
  return `0 0 12px 0 ${color}${Math.round(strength * 255).toString(16).padStart(2, '0')}`;
}

/**
 * Card styling for the reference look. Spread into `sx`.
 * `tone` picks the ladder step: 'card' for a panel, 'inset' for a nested one.
 */
/**
 * Hover lift for an interactive card. Spread AFTER surfaceSx so it overrides the
 * resting shadow.
 *
 * Only for cards that actually do something on click - a lift on a static panel
 * promises an interaction that is not there, which is worse than no feedback. It also
 * respects reduced-motion: the shadow still deepens so the hover is not lost, but the
 * card stops moving.
 */
export function liftSx(mode = 'dark') {
  return {
    transition: 'transform .16s ease, box-shadow .16s ease',
    '&:hover': {
      transform: 'translateY(-2px)',
      boxShadow: mode === 'dark'
        ? '0 8px 20px -6px rgba(0,0,0,.55)'
        : '0 8px 18px -8px rgba(16,24,40,.20)',
    },
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'box-shadow .16s ease',
      '&:hover': { transform: 'none' },
    },
  };
}

export function surfaceSx(mode = 'dark', tone = 'card') {
  const s = SURFACE[mode] || SURFACE.dark;
  const isInset = tone === 'inset';
  return {
    backgroundColor: isInset ? s.inset : s.card,
    borderRadius: `${isInset ? RADII.inset : RADII.card}px`,
    border: `1px solid ${isInset ? s.insetBorder : s.border}`,
    // an inset sits inside a card that already carries the lift, so it never stacks a
    // second shadow on top of it
    boxShadow: isInset ? 'none' : (CARD_SHADOW[mode] || 'none'),
  };
}

// Semantic status tokens shared by StatusPill and any status UI.
// `open` is deliberately NOT red. An open case is the normal state of work, not an
// error - painting every one red spends the alarm colour on the most common status
// and leaves nothing louder for genuine escalations. Pale slate-blue instead; red
// stays reserved for critical/overdue states.
export const STATUS_META = {
  open: { bg: 'var(--em-neutral-bg)', color: 'var(--em-neutral-ink)', label: 'Open' },
  in_progress: { bg: 'var(--em-warn-bg)', color: 'var(--em-warn-ink)', label: 'In Progress' },
  resolved: { bg: 'var(--em-ok-bg)', color: 'var(--em-ok-ink)', label: 'Resolved' },
};

/**
 * Status badge FILLS, deepened for the light scheme.
 *
 * The `-bg` tokens above are chip washes tuned to sit quietly behind a coloured word.
 * In a dense list that reads as washed-out - the badge stops looking like a badge. These
 * are a step deeper, so a status is legible at a glance across a column of rows.
 *
 * WHY NOT JUST CHANGE `--em-warn-bg`: those tokens are also the fill for chips, table
 * cell tints and inline callouts on four other pages, all with contrast measured against
 * the current value. This is a separate, opt-in set for badges only.
 *
 * Each ink still clears 4.5:1 on its own deepened fill:
 *   open        #334E68 on #DCE5EF -> 6.4:1
 *   in_progress #7A4A00 on #FCE7BF -> 5.3:1
 *   resolved    #1E6023 on #CFEAD4 -> 5.6:1
 */
export const STATUS_BADGE = {
  light: {
    open: { bg: '#DCE5EF', color: '#334E68' },
    in_progress: { bg: '#FCE7BF', color: '#7A4A00' },
    resolved: { bg: '#CFEAD4', color: '#1E6023' },
  },
  // dark already reads as a badge - a deep tint against a charcoal card has plenty of
  // separation, so these are the existing token values kept as literals
  dark: {
    open: { bg: '#232D3A', color: '#AEB9C7' },
    in_progress: { bg: '#3A2A0A', color: '#FBBF24' },
    resolved: { bg: '#14301F', color: '#7EE0A3' },
  },
};

/**
 * Status INTENT tokens. One place for "this is fine / watch this / act on this",
 * so pages stop inventing their own #E7F4E8 / #FFF4E5 / #FDECEA triples inline.
 *
 * `bg`/`ink`/`border` are scheme-aware: in dark mode the pale fill becomes a deep
 * tint and the ink flips light, so a chip reads as native to the dark card instead
 * of a bright sticker on it. `ink` on `bg` clears 4.5:1 in BOTH schemes.
 *
 * `solid` stays a literal hex on purpose - it is consumed as an SVG presentation
 * attribute (recharts stroke/fill), and `var()` does not resolve there.
 */
export const INTENT = {
  success: { bg: 'var(--em-ok-bg)', ink: 'var(--em-ok-ink)', solid: '#2E7D32', border: 'var(--em-ok-border)' },
  warning: { bg: 'var(--em-warn-bg)', ink: 'var(--em-warn-ink)', solid: '#ED9B00', border: 'var(--em-warn-border)' },
  danger: { bg: 'var(--em-danger-bg)', ink: 'var(--em-danger-ink)', solid: '#B3261E', border: 'var(--em-danger-border)', tint: 'var(--em-danger-tint)' },
  neutral: { bg: 'var(--em-neutral-bg)', ink: 'var(--em-neutral-ink)', solid: '#64748B', border: 'var(--em-neutral-border)' },
};

/**
 * Coloured text or an icon sitting DIRECTLY on a card, with no tinted pill behind
 * it. Both schemes clear 4.5:1 against their own card surface, which the raw
 * INTENT inks do not - #1E6023 on a dark card is 2.10:1.
 */
export const ON_SURFACE = {
  ok: 'var(--em-ok-strong)',
  warn: 'var(--em-warn-strong)',
  info: 'var(--em-info-strong)',
  danger: 'var(--em-danger-strong)',
};

/**
 * Literal per-scheme accents for the places a CSS variable cannot reach: SVG
 * presentation attributes (recharts `stroke`/`fill`, hand-written `<svg>`) and
 * Leaflet `divIcon` HTML strings. Index with `theme.palette.mode`.
 *
 * Each value was measured at >=3:1 against its own scheme's card surface, the
 * WCAG threshold for a graphical object.
 */
export const SVG_ACCENT = {
  light: { ok: '#2E7D32', warn: '#8A5200', info: '#1565C0', danger: '#C1272D', line: '#2E67B5' },
  dark: { ok: '#58C877', warn: '#F0B33C', info: '#6BA6F5', danger: '#F08A8F', line: '#6BA6F5' },
};

// KPI tile tone: the icon ink and the tinted well behind it. Paired per scheme so
// a dark card gets a deep well with a light icon rather than a pale sticker.
export const KPI_TONE = {
  light: {
    warn: { ink: '#8A5200', tint: '#FFF4E5' }, danger: { ink: '#C1272D', tint: '#FDECEA' },
    info: { ink: '#1565C0', tint: '#E8F1FB' }, ok: { ink: '#2E7D32', tint: '#E7F4E8' },
  },
  dark: {
    warn: { ink: '#F0B33C', tint: '#3A2A0A' }, danger: { ink: '#F08A8F', tint: '#52201C' },
    info: { ink: '#6BA6F5', tint: '#122740' }, ok: { ink: '#58C877', tint: '#14301F' },
  },
};

// Chart palette, per scheme - consumed by recharts/SVG, so these are LITERALS
// indexed by theme.palette.mode (the SVG_ACCENT pattern), never var() strings:
// SVG presentation attributes cannot resolve var(). The dark set is NOT an
// auto-flip of the light one - each slot was re-stepped for the dark surface and
// the whole set re-run through the dataviz validator against #1B222D (lightness
// band, chroma, CVD separation, >=3:1 contrast). Slots keep the same hue identity
// in both schemes so a category never changes colour when the toggle flips.
export const CHART = {
  light: {
    categorical: ['#2a78d6', '#7c4dff', '#00838f', '#c2185b', '#546e7a'],
    series: { primary: '#2a78d6', secondary: '#eb6834' }, // activity chart: cases vs sightings
    grid: '#EEEEF0',
    // Axis TICK LABELS are text, so they answer to the 4.5:1 bar, not the 3:1
    // graphics one. #898781 measured 3.59:1 on the white card - a real AA failure
    // on every chart that used it. #61605C is 6.30:1 and stays in the same warm
    // grey family, so nothing else about the chart's temperature changes.
    axis: '#61605C',
    ramp: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf'], // sequential blue (magnitude)
  },
  dark: {
    categorical: ['#4F95EE', '#7455DC', '#14A3B2', '#DB5287', '#6E85A3'],
    series: { primary: '#4F95EE', secondary: '#D95926' },
    grid: '#2A3341',  // matches --em-border dark: recessive, not a glare line
    axis: '#9AA4B2',  // text-safe on the dark card (6.3:1)
    ramp: ['#1D3A5C', '#27507F', '#3B6CA6', '#5E8FCB', '#8FB8E8'], // dim -> bright: high = closest to white on dark
  },
};
// Backward compatibility: teammate modules (e.g. utils/plantIcons.js) still read
// the pre-reshape flat keys (CHART.categorical, CHART.ramp, ...). Those files are
// out of scope to edit, so the light values stay reachable at the old paths.
Object.assign(CHART, CHART.light);

/**
 * SENSOR_RAMP - the SIMULATED sensor surface only.
 *
 * This is the standard NWS/NEXRAD reflectivity scale, adopted DELIBERATELY at
 * the client's request so the surface reads exactly like a weather radar image.
 * Same values in both schemes: a radar scale is absolute, not theme-relative,
 * and the basemap auto-darkens whenever this layer is on.
 *
 * ---------------------------------------------------------------------------
 * DOCUMENTED EXCEPTION TO THE LOCKED RULE BELOW, AND ITS COST.
 *
 * The locked rule reserves red/amber/green for STATUS. This ramp breaks it on
 * purpose, and the cost is real and known: the rodent pins drawn ON TOP of this
 * surface use medium #F59E0B, high #EF4444 and critical #B91C1C, so the hot end
 * of this ramp is close to the colours that mean "real critical report".
 *
 * Mitigation, which must survive any restyle: every rodent/feeding pin carries a
 * heavy white halo (see makeIcon/rodentIcon in RodentRiskMap.jsx) so a discrete
 * REAL report stays separable from a hot SIMULATED band behind it. The four
 * "Simulated sensor data" labels (toggle, caption, banner, legend) are what
 * carry the honesty guarantee - they are not optional and never were.
 *
 * If a future reader is tempted to reuse this ramp for anything else: don't.
 * It is scoped to one simulated layer precisely because it spends the status
 * hues, and no other surface can afford that.
 * ---------------------------------------------------------------------------
 */
const NEXRAD_REFLECTIVITY = [
  // SEVEN steps, down from fifteen.
  //
  // The full NWS reflectivity scale has 15, but it is built for a radar operator
  // reading dBZ off a legend. Here the reader is an estate officer asking "is
  // this patch worse than that one", and 15 stops meant several neighbouring
  // bands were near-indistinguishable while the legend needed 15 swatches.
  //
  // These 7 are the scale's own inflection points - one per hue family - so the
  // low-to-high progression is unchanged and every step is separable at a
  // glance. The raster still interpolates between them (makeColourLut, 256
  // entries), so the surface stays continuous rather than posterised.
  '#04E9E7', // cyan    - lightest activity
  '#0300F4', // blue
  '#02FD02', // green
  '#FDF802', // yellow
  '#FD9500', // orange
  '#FD0000', // red
  '#F800FD', // magenta - heaviest activity
];
export const SENSOR_RAMP = {
  light: NEXRAD_REFLECTIVITY,
  dark: NEXRAD_REFLECTIVITY,
};

// Categorical identity colours, per scheme. LOCKED RULE: none of these may use the
// semantic hues (red/amber/green) - those are reserved for status only, so a
// category colour is never confused with "attention/warning/healthy". Kept
// colourblind-distinct (blue / purple / teal / magenta / slate); the dark set is
// the validated CHART.dark.categorical, hue-matched slot for slot.
export const CATEGORY_COLORS = {
  light: {
    community_cat: '#2860C0', // navy-blue (deepened from #2a78d6 for the slate-navy dashboard scheme)
    pigeon: '#5B3FBF',        // deep indigo (was a bright #7c4dff violet, which read
                              // consumer-grade next to the navy/teal corporate set)
    flora_health: '#0E8A8A',  // teal (was amber - moved off semantic amber)
    pest: '#c2185b',          // magenta (was green - now distinct from pigeon)
    other: '#5B6B82',         // slate (recessive neutral; every bar is directly labelled)
  },
  dark: {
    community_cat: '#4F95EE',
    pigeon: '#7455DC',
    flora_health: '#14A3B2',
    pest: '#DB5287',
    other: '#6E85A3',
  },
};

// Trend/status ink for KPI deltas, per scheme. Direction is shown by an arrow;
// colour marks whether the movement is good or bad for that specific metric
// (never colour-alone). Literals, not var(): consumers pass these through MUI
// alpha() for the tinted delta pills, which cannot parse var() strings.
export const TREND = {
  light: {
    good: '#0E6B18', // darkened from #12801e so green text clears AA (4.5:1) on the risk tints too
    bad: '#C0392B',  // darkened so red delta text clears AA on tinted backgrounds
    neutral: '#5B6472', // darker than textLight so a dimmed % still clears AA
  },
  dark: {
    good: '#58C877',    // 7.6:1 on the dark card; same family as SVG_ACCENT.dark.ok
    bad: '#FF8A80',     // 7.0:1; matches the danger-strong ink family
    neutral: '#9AA4B2', // = dark textLight, 6.3:1
  },
};

// Estate-health traffic light for the header status chip.
// `ink` is the strong on-white semantic shade used for DISPLAY figures, pills and
// the live gauge segment now that the hero sits on white: colour carries the state
// instead of a large tinted panel. All three clear WCAG AA (4.5:1+) on white, so
// they are safe for the pill fill (white text) and the score text alike.
// SCHEME NOTE: `color`/`ink`/`dot` are literals and only fill-safe in dark mode
// (white text on them stays legible); as TEXT on a dark card they sit near 3:1,
// so text call sites must use `display` (var-based) or the ON_SURFACE inks.
// `display` is the deeper, more authoritative shade for the oversized hero figure
// - a flat bright red at 56px reads cheap, so the big number goes darker while the
// pill keeps the vivid `ink` for contrast against white text.
export const HEALTH_META = {
  healthy: { label: 'Healthy', color: '#12801e', ink: '#15803D', display: 'var(--em-display-healthy)', bg: 'var(--em-ok-bg)', dot: '#0ca30c' },
  watch: { label: 'Monitor', color: '#8A5200', ink: '#B45309', display: 'var(--em-display-watch)', bg: 'var(--em-warn-bg)', dot: '#fab219' },
  critical: { label: 'Needs Attention', color: '#B3261E', ink: '#DC2626', display: 'var(--em-display-critical)', bg: 'var(--em-danger-bg)', dot: '#d03b3b' },
};

// Gauge zone FILLS. These paint large areas, so they use the brighter semantic
// hues; HEALTH_META keeps the darker shades because those are used for TEXT and
// need the contrast. Thresholds are discrete (<25 / 25-59 / 60+), so the gauge
// uses hard stops between these, never a gradient.
export const GAUGE_ZONES = {
  healthy: { fill: '#2E7D32', label: 'Healthy' },
  watch: { fill: '#ED9B00', label: 'Monitor' },        // true amber (the old #8A5200 read brown as a fill)
  critical: { fill: '#D93F3F', label: 'Needs Attention' },
};

/**
 * Build the MUI theme for a colour scheme.
 *
 * The palette uses the scheme's LITERAL token values (not the `var()` strings) -
 * MUI derives hover/disabled/outline shades internally with alpha()/lighten(), so
 * it needs real colours here. Components keep reading `BRAND.*` vars for their own
 * styling; this palette is what makes built-in MUI surfaces (Menu, Dialog, Table,
 * TextField, Tooltip) follow the scheme without per-component overrides.
 */
export function createAppTheme(mode = 'light') {
  const t = THEME_TOKENS[mode] || THEME_TOKENS.light;
  const dark = mode === 'dark';
  // brand red as ink needs to lighten on dark; as a fill it must not
  const accent = t['--em-accent'];

  return createTheme({
  palette: {
    mode,
    primary: {
      main: BRAND.primary,
      dark: BRAND.primaryHover,
      light: BRAND.primaryLight,
      contrastText: '#ffffff',
    },
    secondary: {
      main: dark ? '#7A8CA3' : '#37474F', // slate - neutral accent alongside the brand red
    },
    background: {
      default: t['--em-section'],
      paper: t['--em-surface'],
    },
    text: {
      primary: t['--em-heading'],
      secondary: t['--em-text-light'],
    },
    // literal, not the var(): consumers like recharts write this into an SVG
    // `stroke` attribute and need a real colour, and MUI derives shades from it
    divider: t['--em-border'],
    success: { main: '#2E7D32' },
    info: { main: '#1565C0' },
    warning: { main: '#B26A00' },
    error: { main: BRAND.primary },
  },
  typography: {
    fontFamily: '"Inter", "Helvetica", "Arial", sans-serif',
    // Base bumped 14 -> 15 (~7%) to lift readability a little across every page.
    // Scales all variant-based text (headings, body, buttons, inputs, table cells).
    fontSize: 15,
    h4: { fontWeight: 800, letterSpacing: '-0.6px' },
    h5: { fontWeight: 700, letterSpacing: '-0.4px' },
    h6: { fontWeight: 700 },
    button: { fontWeight: 600 },
  },
  shape: {
    // 8px, not 12-16. Slightly sharper corners read as structural and serious;
    // heavily rounded cards read consumer-grade.
    borderRadius: 8,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        // Tabular figures: proportional digits change width as values update, so a
        // polling dashboard visibly jitters and KPI values stop sharing a left edge.
        'body, .MuiTypography-root': {
          fontVariantNumeric: 'tabular-nums',
        },
        // Respect the OS setting - all the count-ups, bar animations and expander
        // transitions collapse to instant for anyone who asks for less motion.
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': {
            animationDuration: '0.01ms !important',
            animationIterationCount: '1 !important',
            transitionDuration: '0.01ms !important',
            scrollBehavior: 'auto !important',
          },
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
          paddingLeft: 20,
          paddingRight: 20,
          // never rely on colour alone; keep a visible keyboard focus ring.
          // Uses the scheme's accent so the ring keeps 3:1 against a dark surface.
          '&:focus-visible': { outline: `2px solid ${accent}`, outlineOffset: 2 },
        },
        containedPrimary: {
          boxShadow: '0 4px 12px rgba(193,39,45,.28)',
          '&:hover': { backgroundColor: BRAND.primaryHover },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          '&:focus-visible': { outline: `2px solid ${accent}`, outlineOffset: 2 },
        },
      },
    },
    MuiLink: {
      styleOverrides: {
        // default Link colour is primary.main, the literal fill red - fine on
        // light, ~2.9:1 on the dark page. Route it through the scheme accent so
        // body links (auth pages etc.) lighten in dark without per-site fixes.
        root: {
          color: accent,
          textDecorationColor: accent,
        },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        // One card treatment for the whole app: white, a single hairline border and
        // one soft shadow. Per-card left-border accents / tinted panels are out;
        // category is carried by a coloured icon inside the card instead.
        root: {
          borderRadius: 8,
          // hairline keeps cards defined against the grey page field; the shadow is
          // deliberately tight rather than a soft halo. On dark, a black shadow is
          // invisible, so the border does the separating and the shadow deepens.
          border: `1px solid ${BRAND.border}`,
          // one standard elevation for every container in the app
          boxShadow: dark ? '0 1px 3px rgba(0,0,0,0.45)' : '0 1px 3px rgba(0,0,0,0.1)',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 8, fontWeight: 600 },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'inherit' },
      styleOverrides: {
        root: {
          backgroundColor: BRAND.surface,
          color: BRAND.heading,
          borderBottom: `1px solid ${BRAND.border}`,
        },
      },
    },
    MuiTextField: {
      defaultProps: { size: 'small' },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: 8 },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: BRAND.border },
      },
    },
  },
  });
}

// Default light theme, kept as the default export so any consumer that just wants
// "the theme" (and does not participate in scheme switching) still works.
const theme = createAppTheme('light');

export default theme;