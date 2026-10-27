import Link from 'next/link';
import type { ReactNode } from 'react';

/** The first cell of a table row: a picture, the name (a link that opens the record; it stretches over the whole row) and a quiet line under it. */
export default function NameCell({ href, title, sub, cover }: { href: string; title: string; sub?: string; cover: ReactNode }) {
  return (
    <Link href={href} className="adm-name">
      {cover}
      <span className="adm-name-text">
        <span className="adm-name-title">{title}</span>
        {sub ? <span className="adm-name-sub">{sub}</span> : null}
      </span>
    </Link>
  );
}
