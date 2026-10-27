'use client';

import { useState } from 'react';
import { PlusIcon } from '@/components/icons';
import Sheet from '@/components/Sheet';
import NewListForm from './NewListForm';

/** The last row of the Lists card: opens a small panel to make a playlist or a setlist. */
export default function NewListButton({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="add-row" onClick={() => setOpen(true)}>
        <span className="add-tile" aria-hidden="true"><PlusIcon size={20} /></span>
        <span className="add-text">New list</span>
      </button>
      {open ? (
        <Sheet label="New list" onClose={() => setOpen(false)}>
          <div className="sheet-head">
            <div className="sheet-head-text">
              <div className="sheet-title">New list</div>
            </div>
          </div>
          <div className="sheet-body">
            <NewListForm userId={userId} />
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
