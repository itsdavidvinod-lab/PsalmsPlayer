// Stage mode has no app frame: no sidebar, no tab bar, no player bar. Just the words.
export default function StageLayout({ children }: { children: React.ReactNode }) {
  return <div className="stage-root">{children}</div>;
}
