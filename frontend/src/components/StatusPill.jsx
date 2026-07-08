import { Chip } from '@mui/material';
import { STATUS_META } from '../theme';

/**
 * Brand-consistent case-status pill.
 * Falls back to a neutral style for unknown statuses so it never crashes on new values.
 */
export default function StatusPill({ status, size = 'small' }) {
  const meta = STATUS_META[status] || {
    bg: '#F0F1F3',
    color: '#4B5563',
    label: String(status ?? 'Unknown').replace(/_/g, ' '),
  };
  return (
    <Chip
      label={meta.label}
      size={size}
      sx={{
        bgcolor: meta.bg,
        color: meta.color,
        fontWeight: 600,
        fontSize: 12,
        borderRadius: '6px',
        px: 0.5,
      }}
    />
  );
}
