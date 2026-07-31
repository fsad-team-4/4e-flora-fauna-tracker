import { Chip } from '@mui/material';
import { STATUS_META } from '../theme';

/**
 * Brand-consistent case-status pill.
 * Falls back to a neutral style for unknown statuses so it never crashes on new values.
 */
export default function StatusPill({ status, size = 'small' }) {
  const meta = STATUS_META[status] || {
    bg: 'var(--em-neutral-bg)',
    color: 'var(--em-neutral-ink)',
    label: String(status ?? 'Unknown').replace(/_/g, ' '),
  };
  return (
    <Chip
      label={meta.label}
      size={size}
      sx={{
        bgcolor: meta.bg,
        color: meta.color,
        // minimal: pale tint + dark ink of the same hue, no border. A hairline made
        // it read as a boxed container rather than a pill.
        border: 'none',
        fontWeight: 700,
        fontSize: 12,
        // fully rounded: reads as a status pill rather than a boxed label
        borderRadius: '999px',
        px: 0.75,
      }}
    />
  );
}
