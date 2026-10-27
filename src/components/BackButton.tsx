'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeftIcon } from './icons';

/** A round back button: goes to the page before, or to `fallback` when this page was opened directly (a shared link, a new tab). */
export default function BackButton({ fallback = '/', label = 'Back', className = 'round-back' }: { fallback?: string; label?: string; className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallback);
      }}
    >
      <ChevronLeftIcon size={20} />
    </button>
  );
}
