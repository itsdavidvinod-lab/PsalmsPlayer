'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  TAG_KINDS, explainReferenceError, normalizeLanguageCode, normalizeRegionCode, regionCountry, suggestTagCode,
  validateLanguage, validateRegion, validateTag, type TagKind,
} from '@/lib/reference-form';

type LanguageRow = { code: string; name: string; native_name: string | null };
type RegionRow = { code: string; name: string; country_code: string };
type TagRow = { kind: TagKind; code: string; label: string };
type Status = { ok: boolean; text: string } | null;
type Failure = { code?: string | null; message?: string | null } | null;

type Field = { key: string; label: string; value: string; onChange: (v: string) => void; hint?: string; placeholder?: string; maxLength?: number };

/** A row of a list: the code (fixed) and the editable names, with Save and a two-step Delete. */
function RowEditor({ idp, title, code, fields, onSave, onDelete }: {
  idp: string;
  title: string;
  code: string;
  fields: Field[];
  onSave: () => Promise<{ problem?: string; failure?: Failure }>;
  onDelete: () => Promise<Failure>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<Status>(null);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    const result = await onSave();
    setBusy(false);
    if (result.problem) return setMsg({ ok: false, text: result.problem });
    if (result.failure) return setMsg({ ok: false, text: explainReferenceError(result.failure, 'save') });
    setMsg({ ok: true, text: 'Saved.' });
    router.refresh();
  }

  async function remove() {
    setMsg(null);
    setBusy(true);
    const failure = await onDelete();
    setBusy(false);
    setConfirm(false);
    if (failure) return setMsg({ ok: false, text: explainReferenceError(failure, 'delete') });
    router.refresh();
  }

  return (
    <details className="card">
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
        {title} <span className="pill pill-quiet">{code}</span>
      </summary>
      <form onSubmit={save} style={{ marginTop: 12 }}>
        <p className="small muted">Code: <strong>{code}</strong> (a code never changes)</p>
        {fields.map((f) => (
          <div className="field" key={f.key}>
            <label htmlFor={`${idp}-${f.key}`}>{f.label}</label>
            <input id={`${idp}-${f.key}`} className="input" maxLength={f.maxLength ?? 80} value={f.value} onChange={(e) => f.onChange(e.target.value)} />
          </div>
        ))}
        <button type="submit" className="btn" disabled={busy}>Save</button>
        {confirm ? (
          <span style={{ marginLeft: 12 }}>
            Delete {title}?{' '}
            <button type="button" className="btn" disabled={busy} onClick={remove}>Yes, delete</button>{' '}
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setConfirm(false)}>Keep it</button>
          </span>
        ) : (
          <button type="button" className="btn btn-ghost" style={{ marginLeft: 8 }} disabled={busy} onClick={() => setConfirm(true)}>Delete</button>
        )}
        {msg ? <p className={msg.ok ? 'ok' : 'error'} role={msg.ok ? 'status' : 'alert'} style={{ marginTop: 12 }}>{msg.text}</p> : null}
      </form>
    </details>
  );
}

/** The "add one" box under a list. */
function AddForm({ idp, heading, button, fields, onAdd, onReset }: {
  idp: string;
  heading: string;
  button: string;
  fields: Field[];
  onAdd: () => Promise<{ problem?: string; failure?: Failure }>;
  onReset: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Status>(null);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    const result = await onAdd();
    setBusy(false);
    if (result.problem) return setMsg({ ok: false, text: result.problem });
    if (result.failure) return setMsg({ ok: false, text: explainReferenceError(result.failure, 'save') });
    onReset();
    setMsg({ ok: true, text: 'Added.' });
    router.refresh();
  }

  return (
    <details className="card" style={{ marginTop: 8 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{heading}</summary>
      <form onSubmit={add} style={{ marginTop: 12 }}>
        {fields.map((f) => (
          <div className="field" key={f.key}>
            <label htmlFor={`${idp}-${f.key}`}>{f.label}</label>
            <input id={`${idp}-${f.key}`} className="input" maxLength={f.maxLength ?? 80} placeholder={f.placeholder} value={f.value} onChange={(e) => f.onChange(e.target.value)} />
            {f.hint ? <span className="small muted">{f.hint}</span> : null}
          </div>
        ))}
        <button type="submit" className="btn" disabled={busy}>{button}</button>
        {msg ? <p className={msg.ok ? 'ok' : 'error'} role={msg.ok ? 'status' : 'alert'} style={{ marginTop: 12 }}>{msg.text}</p> : null}
      </form>
    </details>
  );
}

// ---------------------------------------------------------------- languages
function LanguageItem({ row }: { row: LanguageRow }) {
  const [name, setName] = useState(row.name);
  const [native, setNative] = useState(row.native_name ?? '');
  return (
    <RowEditor
      idp={`lang-${row.code}`}
      title={row.native_name && row.native_name !== row.name ? `${row.name} · ${row.native_name}` : row.name}
      code={row.code}
      fields={[
        { key: 'name', label: 'Name', value: name, onChange: setName },
        { key: 'native', label: 'Name in its own script', value: native, onChange: setNative },
      ]}
      onSave={async () => {
        const problem = validateLanguage({ code: row.code, name, native_name: native });
        if (problem) return { problem };
        const { error } = await createClient().from('languages').update({ name: name.trim(), native_name: native.trim() || null }).eq('code', row.code);
        return { failure: error };
      }}
      onDelete={async () => (await createClient().from('languages').delete().eq('code', row.code)).error}
    />
  );
}

function AddLanguage() {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [native, setNative] = useState('');
  return (
    <AddForm
      idp="lang-new"
      heading="Add a language"
      button="Add language"
      fields={[
        { key: 'code', label: 'Code', value: code, onChange: setCode, maxLength: 3, hint: '2 or 3 letters, for example ta, ml or hin. It can never be changed.' },
        { key: 'name', label: 'Name', value: name, onChange: setName },
        { key: 'native', label: 'Name in its own script (optional)', value: native, onChange: setNative },
      ]}
      onAdd={async () => {
        const problem = validateLanguage({ code, name, native_name: native });
        if (problem) return { problem };
        const { error } = await createClient().from('languages').insert({ code: normalizeLanguageCode(code), name: name.trim(), native_name: native.trim() || null });
        return { failure: error };
      }}
      onReset={() => { setCode(''); setName(''); setNative(''); }}
    />
  );
}

// ---------------------------------------------------------------- regions
function RegionItem({ row }: { row: RegionRow }) {
  const [name, setName] = useState(row.name);
  return (
    <RowEditor
      idp={`region-${row.code}`}
      title={row.name}
      code={row.code}
      fields={[{ key: 'name', label: 'Name', value: name, onChange: setName }]}
      onSave={async () => {
        const problem = validateRegion({ code: row.code, name });
        if (problem) return { problem };
        const { error } = await createClient().from('regions').update({ name: name.trim() }).eq('code', row.code);
        return { failure: error };
      }}
      onDelete={async () => (await createClient().from('regions').delete().eq('code', row.code)).error}
    />
  );
}

function AddRegion() {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  return (
    <AddForm
      idp="region-new"
      heading="Add a region"
      button="Add region"
      fields={[
        { key: 'code', label: 'Code', value: code, onChange: setCode, maxLength: 6, hint: 'A country such as IN, or a state such as IN-TN. Add the country first. It can never be changed.' },
        { key: 'name', label: 'Name', value: name, onChange: setName },
      ]}
      onAdd={async () => {
        const problem = validateRegion({ code, name });
        if (problem) return { problem };
        const norm = normalizeRegionCode(code);
        const { error } = await createClient().from('regions').insert({ code: norm, name: name.trim(), country_code: regionCountry(norm) });
        return { failure: error };
      }}
      onReset={() => { setCode(''); setName(''); }}
    />
  );
}

// ---------------------------------------------------------------- genres, occasions, moods
function TagItem({ row }: { row: TagRow }) {
  const single = TAG_KINDS.find((k) => k.kind === row.kind)?.single ?? 'tag';
  const [label, setLabel] = useState(row.label);
  return (
    <RowEditor
      idp={`tag-${row.kind}-${row.code}`}
      title={row.label}
      code={row.code}
      fields={[{ key: 'label', label: 'Label', value: label, onChange: setLabel }]}
      onSave={async () => {
        const problem = validateTag({ code: row.code, label }, single);
        if (problem) return { problem };
        const { error } = await createClient().from('tags').update({ label: label.trim() }).eq('kind', row.kind).eq('code', row.code);
        return { failure: error };
      }}
      onDelete={async () => (await createClient().from('tags').delete().eq('kind', row.kind).eq('code', row.code)).error}
    />
  );
}

function AddTag({ kind }: { kind: TagKind }) {
  const single = TAG_KINDS.find((k) => k.kind === kind)?.single ?? 'tag';
  const [label, setLabel] = useState('');
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  return (
    <AddForm
      idp={`tag-${kind}-new`}
      heading={`Add a ${single}`}
      button={`Add ${single}`}
      fields={[
        { key: 'label', label: 'Label', value: label, onChange: (v) => { setLabel(v); if (!codeTouched) setCode(suggestTagCode(v)); } },
        { key: 'code', label: 'Code', value: code, onChange: (v) => { setCode(v); setCodeTouched(true); }, maxLength: 40, hint: 'Lowercase letters, numbers and hyphens. It can never be changed.' },
      ]}
      onAdd={async () => {
        const problem = validateTag({ code, label }, single);
        if (problem) return { problem };
        const { error } = await createClient().from('tags').insert({ kind, code: code.trim(), label: label.trim() });
        return { failure: error };
      }}
      onReset={() => { setLabel(''); setCode(''); setCodeTouched(false); }}
    />
  );
}

/** The five controlled lists. Everything an artist, song, listener or poster can be tagged with comes from here. */
export default function ListEditors({ languages, regions, tags }: { languages: LanguageRow[]; regions: RegionRow[]; tags: TagRow[] }) {
  return (
    <div>
      <section className="section" aria-labelledby="lists-languages">
        <h2 id="lists-languages">Languages</h2>
        <div className="grid-list">{languages.map((l) => <LanguageItem key={l.code} row={l} />)}</div>
        <AddLanguage />
      </section>
      <section className="section" aria-labelledby="lists-regions">
        <h2 id="lists-regions">Regions</h2>
        <div className="grid-list">{regions.map((r) => <RegionItem key={r.code} row={r} />)}</div>
        <AddRegion />
      </section>
      {TAG_KINDS.map((k) => (
        <section className="section" key={k.kind} aria-labelledby={`lists-${k.kind}`}>
          <h2 id={`lists-${k.kind}`}>{k.heading}</h2>
          <div className="grid-list">{tags.filter((t) => t.kind === k.kind).map((t) => <TagItem key={t.code} row={t} />)}</div>
          <AddTag kind={k.kind} />
        </section>
      ))}
    </div>
  );
}
