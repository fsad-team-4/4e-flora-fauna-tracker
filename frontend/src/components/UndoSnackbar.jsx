import { Snackbar, Button } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { BRAND } from '../theme';

// A time-limited "UNDO" toast so a state-changing action (dismiss, acknowledge)
// is recoverable from a misclick. Clickaway keeps it open; it auto-dismisses
// after `duration`.
export default function UndoSnackbar({ open, message, onUndo, onClose, duration = 6000 }) {
  // SnackbarContent INVERTS with the scheme (near-white in dark mode), so the
  // Undo colour indexes against the inverted surface: light-scheme red on the
  // light snackbar, pale salmon on the dark one.
  const dark = useTheme().palette.mode === 'dark';
  return (
    <Snackbar
      open={open}
      autoHideDuration={duration}
      onClose={(_, reason) => { if (reason !== 'clickaway') onClose(); }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      message={message}
      action={
        <Button size="small" onClick={onUndo} sx={{ color: dark ? BRAND.primary : '#FFB4A9', fontWeight: 700, letterSpacing: '0.5px' }}>
          Undo
        </Button>
      }
    />
  );
}
