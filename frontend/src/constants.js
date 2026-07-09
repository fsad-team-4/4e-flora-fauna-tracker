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

export const HEALTH_STATUS_LABELS = {
  healthy: 'Healthy',
  at_risk: 'At Risk',
  critical: 'Critical',
};

export const HEALTH_STATUS_COLORS = {
  healthy: 'success',
  at_risk: 'warning',
  critical: 'error',
};

// Derived from HEALTH_STATUS_LABELS for use in dropdowns.
export const HEALTH_STATUS_OPTIONS = Object.entries(HEALTH_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));
