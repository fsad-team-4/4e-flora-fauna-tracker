import { Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, CircularProgress } from '@mui/material';
import { BRAND } from '../theme';

// One styled confirm dialog for the whole app, so destructive actions are guarded
// consistently (and keyboard-dismissable) instead of using the browser's native
// window.confirm. Supports a busy state so the action can't be double-fired.
export default function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  destructive = false, busy = false, onConfirm, onClose,
}) {
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, color: BRAND.heading }}>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ color: BRAND.text }}>{message}</DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy} sx={{ color: BRAND.textLight }}>{cancelLabel}</Button>
        <Button onClick={onConfirm} disabled={busy} variant="contained" color={destructive ? 'error' : 'primary'} autoFocus>
          {busy ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
