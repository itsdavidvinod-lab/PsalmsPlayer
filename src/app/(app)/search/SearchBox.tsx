'use client';

// The search field, the filter button and the filters that are on. Typing updates the address after a short pause
// (so the page shows results while you type); Enter does it at once.

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CloseIcon, FilterIcon, SearchIcon } from '@/components/icons';
import Sheet from '@/components/Sheet';
import { FILTER_KINDS, cleanQuery, searchHref, type FilterKind, type SearchState } from '@/lib/search';

export type FilterGroup = { kind: FilterKind; title: string; options: { value: string; label: string }[] };

const PAUSE_MS = 300;

export default function SearchBox({ state, groups }: { state: SearchState; groups: FilterGroup[] }) {
  const router = useRouter();
  const [text, setText] = useState(state.q);
  const [open, setOpen] = useState(false);
  const latest = useRef(state);
  latest.current = state;
  // The text this screen last put in the address. A different text in the address means the person went Back or followed a link.
  const pushed = useRef(state.q);

  useEffect(() => {
    if (state.q !== pushed.current) {
      pushed.current = state.q;
      setText(state.q);
    }
  }, [state.q]);

  useEffect(() => {
    const clean = cleanQuery(text);
    if (clean === pushed.current) return;
    const timer = window.setTimeout(() => {
      pushed.current = clean;
      router.replace(searchHref({ ...latest.current, q: clean }), { scroll: false });
    }, PAUSE_MS);
    return () => window.clearTimeout(timer);
  }, [text, router]);

  function apply(next: Partial<SearchState>) {
    const target = { ...latest.current, q: cleanQuery(text), ...next };
    pushed.current = target.q;
    router.replace(searchHref(target), { scroll: false });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    apply({});
    (document.activeElement as HTMLElement | null)?.blur();
  }

  function choose(kind: FilterKind, value: string) {
    const patch: Partial<SearchState> = {};
    patch[kind] = latest.current[kind] === value ? undefined : value;
    apply(patch);
  }

  const active = groups.flatMap((g) => {
    const value = state[g.kind];
    const option = g.options.find((o) => o.value === value);
    return option ? [{ kind: g.kind, label: option.label }] : [];
  });

  return (
    <>
      <form role="search" className="search-field" action="/search" method="get" onSubmit={onSubmit}>
        <SearchIcon size={20} />
        <input
          type="search"
          name="q"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Song, artist, genre or occasion"
          aria-label="Search songs, artists, genres and occasions"
          maxLength={60}
          autoComplete="off"
          enterKeyHint="search"
        />
        {FILTER_KINDS.map((k) => (state[k] ? <input key={k} type="hidden" name={k} value={state[k]} /> : null))}
        <button type="button" className="search-filter" aria-label="Filters: language, genre, occasion, mood" aria-expanded={open} onClick={() => setOpen(true)}>
          <FilterIcon size={20} />
        </button>
      </form>

      {active.length > 0 ? (
        <div className="chip-row" role="group" aria-label="Filters in use">
          {active.map((a) => (
            <button key={a.kind} type="button" className="chip chip-on" aria-label={`Remove filter: ${a.label}`} onClick={() => choose(a.kind, state[a.kind] ?? '')}>
              {a.label} <CloseIcon size={14} />
            </button>
          ))}
        </div>
      ) : null}

      {open ? (
        <Sheet label="Filters" onClose={() => setOpen(false)}>
          <div className="sheet-head">
            <div className="sheet-head-text">
              <div className="sheet-title">Filters</div>
            </div>
            {active.length > 0 ? (
              <button type="button" className="link-btn sheet-clear" onClick={() => apply({ language: undefined, genre: undefined, occasion: undefined, mood: undefined })}>
                Clear all
              </button>
            ) : null}
          </div>
          <div className="sheet-body filter-groups">
            {groups.map((g) => (
              <div key={g.kind} role="group" aria-label={g.title} className="filter-group">
                <div className="filter-title">{g.title}</div>
                <div className="chip-wrap">
                  {g.options.map((o) => (
                    <button key={o.value} type="button" className="chip" aria-pressed={state[g.kind] === o.value} onClick={() => choose(g.kind, o.value)}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button type="button" className="btn btn-primary btn-block" onClick={() => setOpen(false)}>Show results</button>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
