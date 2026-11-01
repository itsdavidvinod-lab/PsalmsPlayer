'use client';

import { useOffline } from '@/components/offline/OfflineProvider';

/** Sign out. Inside the Android app, songs saved for offline use belong to the signed-in account, so they are removed first. */
export default function SignOutForm() {
  const offline = useOffline();
  const hasDownloads = offline.enabled && offline.records.length > 0;
  return (
    <form
      action="/auth/signout"
      method="post"
      className="section"
      onSubmit={async (e) => {
        if (!hasDownloads) return;
        e.preventDefault();
        const form = e.currentTarget;
        await offline.removeAll();
        form.submit();
      }}
    >
      <button type="submit" className="btn btn-block">Sign out</button>
      {hasDownloads ? <p className="small muted" style={{ marginTop: 8 }}>Signing out removes your downloads from this phone.</p> : null}
    </form>
  );
}
