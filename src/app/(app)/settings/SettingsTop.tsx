import Link from 'next/link';
import { ChevronLeftIcon } from '@/components/icons';

/** The top of every Settings page below the menu: a way back, and the title. */
export default function SettingsTop({ title }: { title: string }) {
  return (
    <div>
      <Link href="/settings" className="page-back">
        <ChevronLeftIcon size={18} /> Settings
      </Link>
      <h1>{title}</h1>
    </div>
  );
}
