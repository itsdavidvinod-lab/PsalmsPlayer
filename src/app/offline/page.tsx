import type { Metadata } from 'next';
import OfflineApp from './OfflineApp';

export const metadata: Metadata = { title: 'Downloads' };

// The page the Android app opens when there is no connection (see public/sw.js). It is the same for everyone and holds no account
// data: the saved songs are read from the phone's own storage by the browser code. It must stay a static page: no cookies, no headers,
// no database calls, because a stored copy of it is what the phone shows offline.
export default function OfflinePage() {
  return <OfflineApp />;
}
