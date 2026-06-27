export const CATEGORY_LABELS = {
  flora_health: 'Flora Health',
  community_cat: 'Community Cat',
  pigeon: 'Pigeon',
  pest: 'Pest',
  other: 'Other',
};

export const STATUS_COLORS = {
  open: 'warning',
  in_progress: 'info',
  resolved: 'success',
};

export const STATUS_OPTIONS = ['open', 'in_progress', 'resolved'];

// Derived from CATEGORY_LABELS for use in dropdowns.
export const CATEGORIES = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
  value,
  label,
}));
