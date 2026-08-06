// Capitalizes the first letter of each word for display purposes only -
// does not affect stored/submitted values.
export function toTitleCase(str) {
  if (!str) return str;
  return str.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}
