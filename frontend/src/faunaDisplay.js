// Display-only helpers shared by the fauna pages. Nothing here changes stored
// data - every function maps a stored value to how it should be rendered.

// Shared shape/sizing for every token chip across the fauna pages (status,
// severity, behaviour tags, species, block counts) so they read as one design
// language. Pair with size="small". Colour is carried by the Chip `color` prop,
// never here.
export const TOKEN_SX = { borderRadius: 1, textTransform: 'capitalize' };

// Variant scheme that goes with TOKEN_SX: neutral tokens are outlined, and a
// severity is filled so it stands out - except routine (success), which stays
// outlined so a non-issue never shouts.
export function tokenVariant(color) {
  return !color || color === 'default' || color === 'success' ? 'outlined' : 'filled';
}

// Severity is derived from a sighting's APPLIED behaviour_tags only. Note text is
// deliberately not consulted: an untagged keyword in the notes is a hint for staff
// to review (see untagged_mentions on the hotspots drill-down), not a severity.
export const SEVERITY = {
  urgent: { label: 'Urgent', color: 'error' },
  monitor: { label: 'Monitor', color: 'warning' },
  routine: { label: 'Routine', color: 'success' },
};

export function severityFor(behaviourTags) {
  const tags = behaviourTags || [];
  if (tags.includes('aggressive')) return SEVERITY.urgent;
  if (tags.includes('nesting')) return SEVERITY.monitor;
  return SEVERITY.routine;
}

// Status labels. The stored value stays open / in_progress / resolved.
export const STATUS_LABELS = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
};

export function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

// Species labels for dropdowns and chips. Keys are the stored lowercase values
// that must keep going to the backend; only the label is capitalised.
export const SPECIES_LABELS = {
  cat: 'Cat',
  pigeon: 'Pigeon',
  crow: 'Crow',
  mynah: 'Mynah',
  other: 'Other',
};

export function speciesLabel(species) {
  return SPECIES_LABELS[species] || species;
}

// Blocks are stored inconsistently ("605" vs "Block 123"), so prefix bare ones
// for display. Never write the result back.
//
// The check looks for "block" ANYWHERE in the value, not just at the start, so a
// free-text location like "Near Block 126" is left alone instead of becoming
// "Block Near Block 126". The \b boundaries keep it to the whole word, so
// "Blockade 5" is still treated as unprefixed.
export function formatBlock(block) {
  if (!block) return '';
  return /\bblock\b/i.test(block.trim()) ? block : `Block ${block}`;
}
