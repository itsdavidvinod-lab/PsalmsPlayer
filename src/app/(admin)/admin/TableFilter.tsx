'use client';

import { useEffect, useRef, useState } from 'react';

export type FilterSelect = {
  id: string;
  label: string;
  /** Rows carry the value in `data-<attr>`; the choice "all" shows every row. */
  attr: string;
  options: { value: string; label: string }[];
};

/**
 * A search box and drop-down filters above a table. The table itself is drawn on the server, so every row has to say what it
 * contains: `data-search` holds the text to search (lower case) and `data-<attr>` the value each filter looks at. This box
 * only hides the rows that do not match, and keeps the count under it up to date.
 */
export default function TableFilter({ idPrefix, searchLabel, searchPlaceholder, noun, total, selects, children }: {
  idPrefix: string;
  searchLabel: string;
  searchPlaceholder: string;
  noun: string;
  total: number;
  selects: FilterSelect[];
  children: React.ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [shown, setShown] = useState(total);
  const area = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rows = Array.from(area.current?.querySelectorAll<HTMLElement>('tbody tr[data-search]') ?? []);
    const needle = query.trim().toLowerCase();
    let visible = 0;
    for (const row of rows) {
      let ok = needle === '' || (row.dataset.search ?? '').includes(needle);
      for (const s of selects) {
        const want = picked[s.id] ?? 'all';
        if (ok && want !== 'all' && row.getAttribute(`data-${s.attr}`) !== want) ok = false;
      }
      row.hidden = !ok;
      if (ok) visible += 1;
    }
    setShown(visible);
  }, [query, picked, selects, children]);

  return (
    <div>
      <div className="adm-tools">
        <div className="adm-search">
          <label htmlFor={`${idPrefix}-search`} className="sr-only">{searchLabel}</label>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input id={`${idPrefix}-search`} className="input" type="search" placeholder={searchPlaceholder} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {selects.map((s) => (
          <div key={s.id}>
            <label htmlFor={s.id} className="sr-only">{s.label}</label>
            <select id={s.id} className="input" value={picked[s.id] ?? 'all'} onChange={(e) => setPicked((p) => ({ ...p, [s.id]: e.target.value }))}>
              {s.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <p className="adm-count" role="status">{shown} of {total} {noun}</p>
      <div ref={area}>{children}</div>
    </div>
  );
}
