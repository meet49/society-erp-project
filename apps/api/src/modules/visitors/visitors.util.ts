/** "SERVICE_PROVIDER" → "Service provider" for notification copy. */
export function formatStatusLabel(value?: string | null): string {
  if (!value) return '';
  const s = String(value).toLowerCase().replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
