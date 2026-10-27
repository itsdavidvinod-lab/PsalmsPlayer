import { coverBackground, initialOf } from '@/lib/cover';

// A picture with a coloured placeholder when there is none (unavailable artists have no picture by design).
export default function Cover({ url, name, size = 56, round = false }: { url: string | null; name: string; size?: number; round?: boolean }) {
  const radius = round ? '50%' : size <= 48 ? 6 : size <= 72 ? 8 : 12;
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="cover" src={url} alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: radius }} loading="lazy" referrerPolicy="no-referrer" />;
  }
  return (
    <span
      className="cover cover-empty"
      style={{ width: size, height: size, borderRadius: radius, background: coverBackground(name), fontSize: Math.round(size * 0.42) }}
      aria-hidden="true"
    >
      {initialOf(name)}
    </span>
  );
}
