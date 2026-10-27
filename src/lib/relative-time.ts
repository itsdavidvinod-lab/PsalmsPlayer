/** How long ago something happened, in the short form used on song rows: "just now", "5m ago", "3h ago", "2d ago", "3w ago",
 *  "4mo ago", "2y ago". Nothing (or a date that cannot be read) gives an empty text. A date in the future counts as "just now". */
export function timeAgo(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const seconds = Math.max(0, Math.floor((now.getTime() - then) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  const hours = Math.floor(seconds / 3600);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
