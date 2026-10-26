/** 65 -> "1:05", 3725 -> "1:02:05". Anything that is not a sensible number of seconds shows as "0:00". */
export function formatClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const s = Math.floor(totalSeconds);
  const minutes = Math.floor(s / 60);
  const hours = Math.floor(minutes / 60);
  const secs = String(s % 60).padStart(2, '0');
  if (hours > 0) return `${hours}:${String(minutes % 60).padStart(2, '0')}:${secs}`;
  return `${minutes}:${secs}`;
}
