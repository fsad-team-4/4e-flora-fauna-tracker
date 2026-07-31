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
    '--em-text-light': '#6B7280', // slate-500: ~4.8:1 on white
    '--em-border': '#E5E7EB',     // grey-200
    '--em-section': '#F3F4F6', // page field - cards sit on it as pure white
    '--em-canvas': '#F8FAFC',  // slate-50: dense table pages, so white rows lift off it
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
    '--em-info-bg': '#122740', '--em-info-ink': '#8FBCFF', '--em-info-border': '#24405F', '--em-info-strong': '#93B4FF',
    '--em-neutral-bg': '#232D3A', '--em-neutral-ink': '#AEB9C7', '--em-neutral-border': '#35404F',
    '--em-prio-critical': '#F0736B', '--em-prio-high': '#E8695F', '--em-prio-medium': '#F0B33C', '--em-prio-low': '#7D8CA3',
    '--em-display-healthy': '#7EE0A3', '--em-display-watch': '#F5C860', '--em-display-critical': '#FF9E97',
  },
};

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
  danger: { bg: 'var(--em-danger-bg)', ink: 'var(--em-danger-ink)', solid: '#B3261E', border: 'var(--em-danger-border)' },
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
    axis: '#898781',
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