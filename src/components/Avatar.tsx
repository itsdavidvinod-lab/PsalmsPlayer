import { coverBackground, initialOf } from '@/lib/cover';

/** A person's round picture (from their Google account) or, without one, their initial on a coloured circle. */
export default function Avatar({ name, url, size = 32 }: { name: string | null; url: string | null; size?: number }) {
  const label = name ?? '';
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="avatar" src={url} alt="" width={size} height={size} style={{ width: size, height: size }} referrerPolicy="no-referrer" />;
  }
  return (
    <span className="avatar avatar-empty" style={{ width: size, height: size, background: coverBackground(label || '?'), fontSize: Math.round(size * 0.42) }} aria-hidden="true">
      {initialOf(label)}
    </span>
  );
}
