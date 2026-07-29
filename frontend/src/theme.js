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
    '--em-section': '#F4F5F7', // page field - cards sit on it as pure white
    '--em-surface': '#FFFFFF',
    '--em-navy-soft': '#E8EDF4',
    '--em-ink': '#0F172A',
    '--em-accent': '#C1272D',
  },
  dark: {
    '--em-heading': '#F3F5F7',
    '--em-text': '#C7CDD6',
    '--em-text-light': '#9AA4B2',
    '--em-border': '#2A3341',
    '--em-section': '#161C26',
    '--em-surface': '#1B222D',
    '--em-navy-soft': '#1C2A3D',
    '--em-ink': '#F8FAFC',
    '--em-accent': '#F08A8F',
  },
};

// Semantic status tokens shared by StatusPill and any status UI.
// `open` is deliberately NOT red. An open case is the normal state of work, not an
// error - painting every one red spends the alarm colour on the most common status
// and leaves nothing louder for genuine escalations. Pale slate-blue instead; red
// stays reserved for critical/overdue states.
export const STATUS_META = {
  open: { bg: '#EEF2F7', color: '#334E68', label: 'Open' },
  in_progress: { bg: '#FFF4E5', color: '#8A5200', label: 'In Progress' },
  resolved: { bg: '#E7F4E8', color: '#1E6023', label: 'Resolved' },
};

// Chart palette - a colourblind-safe categorical set (validated with the dataviz
// skill's checker against a white card surface). Slots are assigned to entities in
// a fixed map so a colour always follows its category, never its rank.
export const CHART = {
  categorical: ['#2a78d6', '#7c4dff', '#00838f', '#c2185b', '#546e7a'],
  series: { primary: '#2a78d6', secondary: '#eb6834' }, // activity chart: cases vs sightings
  grid: '#EEEEF0',
  axis: '#898781',
  ramp: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf'], // sequential blue (magnitude)
};

// Categorical identity colours. LOCKED RULE: none of these may use the semantic
// hues (red/amber/green) — those are reserved for status only, so a category
// colour is never confused with "attention/warning/healthy". Kept colourblind-
// distinct (blue / purple / teal / magenta / slate).
export const CATEGORY_COLORS = {
  community_cat: '#2860C0', // navy-blue (deepened from #2a78d6 for the slate-navy dashboard scheme)
  pigeon: '#5B3FBF',        // deep indigo (was a bright #7c4dff violet, which read
                            // consumer-grade next to the navy/teal corporate set)
  flora_health: '#0E8A8A',  // teal (was amber — moved off semantic amber)
  pest: '#c2185b',          // magenta (was green — now distinct from pigeon)
  other: '#5B6B82',         // slate (recessive neutral; every bar is directly labelled)
};

// Trend/status ink for KPI deltas. Direction is shown by an arrow; colour marks
// whether the movement is good or bad for that specific metric (never colour-alone).
export const TREND = {
  good: '#0E6B18', // darkened from #12801e so green text clears AA (4.5:1) on the risk tints too
  bad: '#C0392B',  // darkened so red delta text clears AA on tinted backgrounds
  neutral: '#5B6472', // darker than textLight so a dimmed % still clears AA
};

// Estate-health traffic light for the header status chip.
// `ink` is the strong on-white semantic shade used for DISPLAY figures, pills and
// the live gauge segment now that the hero sits on white: colour carries the state
// instead of a large tinted panel. All three clear WCAG AA (4.5:1+) on white, so
// they are safe for the pill fill (white text) and the score text alike.
// `display` is the deeper, more authoritative shade for the oversized hero figure
// - a flat bright red at 56px reads cheap, so the big number goes darker while the
// pill keeps the vivid `ink` for contrast against white text.
export const HEALTH_META = {
  healthy: { label: 'Healthy', color: '#12801e', ink: '#15803D', display: '#14532D', bg: '#E7F4E8', dot: '#0ca30c' },
  watch: { label: 'Monitor', color: '#8A5200', ink: '#B45309', display: '#7C4A03', bg: '#FFF4E5', dot: '#fab219' },
  critical: { label: 'Needs Attention', color: '#B3261E', ink: '#DC2626', display: '#9F1239', bg: '#FDECEA', dot: '#d03b3b' },
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
          boxShadow: dark ? '0 2px 4px rgba(0,0,0,0.4)' : '0 2px 4px rgba(0,0,0,0.05)',
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