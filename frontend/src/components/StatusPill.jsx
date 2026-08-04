import { Chip } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { STATUS_META, STATUS_BADGE, RADII } from '../theme';

/**
 * Brand-consistent case-status pill.
 * Falls back to a neutral style for unknown statuses so it never crashes on new values.
 */
export default function StatusPill({ status, size = 'small' }) {
  const mode = useTheme().palette.mode;
  const meta = STATUS_META[status] || {
    bg: 'var(--em-neutral-bg)',
    color: 'var(--em-neutral-ink)',
    label: String(status ?? 'Unknown').replace(/_/g, ' '),
  };
  // Deeper fill so the badge reads as a badge in a dense list; falls back to the shared
  // chip tokens for any status not in the set.
  const badge = (STATUS_BADGE[mode] || STATUS_BADGE.light)[status];
  return (
    <Chip
      label={meta.label}
      size={size}
      sx={{
        bgcolor: badge?.bg || meta.bg,
        color: badge?.color || meta.color,
        // minimal: pale tint + dark ink of the same hue, no border. A hairline made
        // it read as a boxed container rather than a pill.
        border: 'none',
        fontWeight: 600,
        fontSize: 12,
        // fully rounded: reads as a status pill rather than a boxed label
        borderRadius: `${RADII.pill}px`,
        px: 0.75,
      }}
    />
  );
}
