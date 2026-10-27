import type { ReactNode } from 'react';

/** The top of every admin page: where you are (optional), the title, one line of help (optional) and the page's main buttons. */
export default function PageHead({ title, sub, crumbs, actions }: { title: string; sub?: string; crumbs?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="adm-head">
      <div className="adm-head-text">
        {crumbs ? <p className="adm-crumbs">{crumbs}</p> : null}
        <h1>{title}</h1>
        {sub ? <p className="adm-sub">{sub}</p> : null}
      </div>
      {actions ? <div className="adm-head-actions">{actions}</div> : null}
    </div>
  );
}
