'use client';

import type { Option } from '@/lib/admin-types';

/** A row of tick boxes for choosing several values from a controlled list. */
export default function CheckGroup({ legend, options, selected, onChange }: {
  legend: string;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: '0 0 14px' }}>
      <legend>{legend}</legend>
      <div className="checks">
        {options.map((o) => (
          <label key={o.value} className="check">
            <input
              type="checkbox"
              checked={selected.includes(o.value)}
              onChange={() => onChange(selected.includes(o.value) ? selected.filter((v) => v !== o.value) : [...selected, o.value])}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
