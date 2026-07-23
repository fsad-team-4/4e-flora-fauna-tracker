import { createTheme } from '@mui/material/styles';

// Shared app theme - EM Services brand.
// Applied globally via ThemeProvider so every page inherits it automatically.
// Brand palette mirrors the Command Centre dashboard.
// Exported so components can reference the exact same tokens (single source of truth).
export const BRAND = {
  primary: '#C1272D',
  primaryHover: '#A61D22',
  primaryLight: '#E74B4B',
  heading: '#1A1A1A',
  text: '#444444',
  textLight: '#6B7280', // slate-500: ~4.8:1 on white, meets WCAG AA for body text
  border: '#EAEAEA',
  section: '#F6F7F9',
  // neutral slate accent (secondary buttons / quiet chrome) + success green,
  // shared so pages stop redefining their own drifted copies.
  slate: '#37474F',
  slateHover: '#263238',
  success: '#2E7D32',
};

// Semantic status tokens shared by StatusPill and any status UI.
export const STATUS_META = {
  open: { bg: '#FDECEA', color: '#C1272D', label: 'Open' },
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
  pigeon: '#7c4dff',        // violet (was green — moved off semantic green)
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
export const HEALTH_META = {
  healthy: { label: 'Healthy', color: '#12801e', bg: '#E7F4E8', dot: '#0ca30c' },
  watch: { label: 'Watch', color: '#8A5200', bg: '#FFF4E5', dot: '#fab219' },
  critical: { label: 'Needs Attention', color: '#B3261E', bg: '#FDECEA', dot: '#d03b3b' },
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

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: BRAND.primary,
      dark: BRAND.primaryHover,
      light: BRAND.primaryLight,
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#37474F', // slate - neutral accent alongside the brand red
    },
    background: {
      default: BRAND.section,
      paper: '#ffffff',
    },
    text: {
      primary: BRAND.heading,
      secondary: BRAND.textLight,
    },
    divider: BRAND.border,
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
    borderRadius: 10,
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
          // never rely on colour alone; keep a visible keyboard focus ring
          '&:focus-visible': { outline: `2px solid ${BRAND.primary}`, outlineOffset: 2 },
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
          '&:focus-visible': { outline: `2px solid ${BRAND.primary}`, outlineOffset: 2 },
        },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: 14,
          border: `1px solid ${BRAND.border}`,
          boxShadow: '0 1px 3px rgba(16,24,40,.04), 0 8px 24px rgba(16,24,40,.04)',
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
          backgroundColor: '#ffffff',
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

export default theme;