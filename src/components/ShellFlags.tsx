'use client';

import { useLayoutEffect } from 'react';

/** Puts classes on the app frame (the `.shell`) while a page is shown, and takes them off when it goes.
 *
 *  The stylesheet already says "a frame that contains a full-screen song hides the tab bar" with `.shell:has(.screen-player)`.
 *  Older Android WebViews (before Chrome 105) do not know `:has()` and drop the whole rule, so the tab bar and the player strip
 *  stayed on top of the full-screen player. These classes carry the same rules for them (see "has-" in globals.css); newer
 *  browsers use either and get the same result. */
export default function ShellFlags({ flags }: { flags: string[] }) {
  const key = flags.join(' ');
  useLayoutEffect(() => {
    const shell = document.querySelector('.shell');
    if (!shell) return;
    const names = key.split(' ').filter(Boolean);
    shell.classList.add(...names);
    return () => shell.classList.remove(...names);
  }, [key]);
  return null;
}
