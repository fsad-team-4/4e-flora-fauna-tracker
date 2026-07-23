import { Snackbar, Button } from '@mui/material';

// A time-limited "UNDO" toast so a state-changing action (dismiss, acknowledge)
// is recoverable from a misclick. Clickaway keeps it open; it auto-dismisses
// after `duration`.
export default function UndoSnackbar({ open, message, onUndo, onClose, duration = 6000 }) {
  return (
    <Snackbar
      open={open}
      autoHideDuration={duration}
      onClose={(_, reason) => { if (reason !== 'clickaway') onClose(); }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      message={message}
      action={
        <Button size="small" onClick={onUndo} sx={{ color: '#FFB4A9', fontWeight: 700, letterSpacing: '0.5px' }}>
          Undo
        </Button>
      }
    />
  );
}
