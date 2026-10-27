import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// "Browse" became "Search". Old links and bookmarks keep working, and the search text is carried along.
export default async function BrowseRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) qs.append(key, v);
  }
  const text = qs.toString();
  redirect(text ? `/search?${text}` : '/search');
}
