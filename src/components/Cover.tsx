// A picture with a plain placeholder when there is none (unavailable artists have no picture by design).
export default function Cover({ url, name, size = 56, round = false }: { url: string | null; name: string; size?: number; round?: boolean }) {
  const style = { width: size, height: size, borderRadius: round ? '50%' : 12 } as React.CSSProperties;
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="cover" src={url} alt="" style={style} loading="lazy" />;
  }
  return (
    <span className="cover cover-empty" style={style} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
