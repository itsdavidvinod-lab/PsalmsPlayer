'use client';

// The songs this person has liked, for every heart on every screen. Loaded by the app layout on a full page load, kept here
// while people move between pages, and changed at once when a heart is tapped (the save happens in the background).

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type LikesApi = {
  isLiked: (songId: string) => boolean;
  /** Flips the heart and saves it. Resolves to an error text when saving failed (the heart is put back), otherwise null. */
  toggle: (songId: string) => Promise<string | null>;
};

const LikesContext = createContext<LikesApi | null>(null);

export function useLikes(): LikesApi {
  const value = useContext(LikesContext);
  if (!value) throw new Error('useLikes must be used inside LikesProvider');
  return value;
}

export function LikesProvider({ userId, initial, children }: { userId: string | null; initial: string[]; children: React.ReactNode }) {
  const [liked, setLiked] = useState<ReadonlySet<string>>(() => new Set(initial));

  const set = useCallback((songId: string, on: boolean) => {
    setLiked((cur) => {
      if (cur.has(songId) === on) return cur;
      const next = new Set(cur);
      if (on) next.add(songId);
      else next.delete(songId);
      return next;
    });
  }, []);

  const toggle = useCallback(
    async (songId: string): Promise<string | null> => {
      if (!userId) return 'Sign in to like songs.';
      const want = !liked.has(songId);
      set(songId, want);
      const supabase = createClient();
      const { error } = want
        ? await supabase.from('song_likes').insert({ user_id: userId, song_id: songId })
        : await supabase.from('song_likes').delete().eq('user_id', userId).eq('song_id', songId);
      // 23505: already liked (for example from another tab). That is what was asked for, so it is not a failure.
      if (error && !(want && error.code === '23505')) {
        set(songId, !want);
        return 'Could not update your liked songs. Please try again.';
      }
      return null;
    },
    [userId, liked, set],
  );

  const api = useMemo<LikesApi>(() => ({ isLiked: (id) => liked.has(id), toggle }), [liked, toggle]);
  return <LikesContext.Provider value={api}>{children}</LikesContext.Provider>;
}
