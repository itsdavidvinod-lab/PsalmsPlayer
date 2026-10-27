'use client';

import { useState } from 'react';
import AddToListPanel from '@/components/AddToListPanel';

/** "Add to list" on a song page: a button that opens the list picker below it. */
export default function AddToList({ songId, userId }: { songId: string; userId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="add-to-list">
      <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Add to list
      </button>
      {open ? (
        <div className="card">
          <AddToListPanel songId={songId} userId={userId} />
        </div>
      ) : null}
    </div>
  );
}
