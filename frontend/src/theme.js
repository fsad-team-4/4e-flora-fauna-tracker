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
  categorical: ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7'],
  series: { primary: '#2a78d6', secondary: '#eb6834' }, // activity chart: cases vs sightings
  grid: '#EEEEF0',
  axis: '#898781',
  ramp: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf'], // sequential blue (magnitude)
};

// Colour follows the category entity (not its position), per the dataviz rules.
export const CATEGORY_COLORS = {
  community_cat: '#2a78d6',
  pigeon: '#1baf7a',
  flora_health: '#eda100',
  pest: '#008300',
  other: '#4a3aa7',
};

// Trend/status ink for KPI deltas. Direction is shown by an arrow; colour marks
// whether the movement is good or bad for that specific metric (never colour-alone).
export const TREND = {
  good: '#12801e',
  bad: '#d03b3b',
  neutral: '#6B7280',
};

// Estate-health traffic light for the header status chip.
export const HEALTH_META = {
  healthy: { label: 'Healthy', color: '#12801e', bg: '#E7F4E8', dot: '#0ca30c' },
  watch: { label: 'Watch', color: '#8A5200', bg: '#FFF4E5', dot: '#fab219' },
  critical: { label: 'Needs Attention', color: '#B3261E', bg: '#FDECEA', dot: '#d03b3b' },
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
    h4: { fontWeight: 800, letterSpacing: '-0.6px' },
    h5: { fontWeight: 700, letterSpacing: '-0.4px' },
    h6: { fontWeight: 700 },
    button: { fontWeight: 600 },
  },
  shape: {
    borderRadius: 10,
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { textTransform: 'none', borderRadius: 8, paddingLeft: 20, paddingRight: 20 },
        containedPrimary: {
          boxShadow: '0 4px 12px rgba(193,39,45,.28)',
          '&:hover': { backgroundColor: BRAND.primaryHover },
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
