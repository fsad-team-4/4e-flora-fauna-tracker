import { createTheme } from '@mui/material/styles';

// Shared app theme - flora/fauna estate-biodiversity palette.
// Applied globally via ThemeProvider so every page inherits it automatically.
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#2e7d32', // forest green
    },
    secondary: {
      main: '#8d6e63', // earthy brown
    },
    background: {
      default: '#f5f7f4', // soft off-white with a green tint
      paper: '#ffffff',
    },
    // status chip colors (used via STATUS_COLORS) - kept distinct and legible
    success: { main: '#2e7d32' },
    info: { main: '#0277bd' },
    warning: { main: '#ed6c02' },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
  },
  shape: {
    borderRadius: 8,
  },
});

export default theme;
