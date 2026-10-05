import type { BucketVariable, KeyValuePair, Step } from '@fortest/types';
import { TrashIcon, PlusIcon } from '@/components/common/Icons';
import { VariableInput } from './VariableInput';

interface KeyValueEditorProps {
  rows: KeyValuePair[];
  /** Every edit. */
  onChange: (rows: KeyValuePair[]) => void;
  /** Finished edits (blur, toggle, remove) — where the step auto-saves. */
  onSave: (rows: KeyValuePair[]) => void;
  noun: string; // e.g. "Header" → "Add Header", "Remove header"
  addTitle: string;
  keyPlaceholder: string;
  emptyText: string;
  keyList?: string; // datalist ids for suggestions
  valueList?: string;
  variables: BucketVariable[];
  precedingSteps: Step[];
}

/** Editable rows of enabled / key / value, used for headers, query params and form bodies. */
export function KeyValueEditor({
  rows,
  onChange,
  onSave,
  noun,
  addTitle,
  keyPlaceholder,
  emptyText,
  keyList,
  valueList,
  variables,
  precedingSteps,
}: KeyValueEditorProps) {
  const update = (id: string, patch: Partial<KeyValuePair>) =>
    rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
  const save = (next: KeyValuePair[]) => {
    onChange(next);
    onSave(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
        <button
          className="btn btn--ghost"
          title={addTitle}
          style={{
            fontSize: '11px',
            padding: '4px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
          // Not saved yet: an empty key is dropped on save, so wait for the first blur.
          onClick={() =>
            onChange([...rows, { id: crypto.randomUUID(), key: '', value: '', enabled: true }])
          }
        >
          <PlusIcon size={12} /> Add {noun}
        </button>
      </div>
      {rows.map((row) => (
        <div key={row.id} className="key-value-row">
          <input
            type="checkbox"
            className="key-value-row__checkbox"
            checked={row.enabled}
            onChange={(e) => save(update(row.id, { enabled: e.target.checked }))}
          />
          <input
            type="text"
            className="input"
            placeholder={keyPlaceholder}
            list={keyList}
            value={row.key}
            onChange={(e) => onChange(update(row.id, { key: e.target.value }))}
            onBlur={() => onSave(rows)}
          />
          <VariableInput
            type="text"
            placeholder="Value"
            list={valueList}
            value={row.value}
            onChange={(value) => onChange(update(row.id, { value }))}
            onBlur={() => onSave(rows)}
            variables={variables}
            precedingSteps={precedingSteps}
          />
          <button
            className="btn btn--icon"
            title={`Remove ${noun.toLowerCase()}`}
            onClick={() => save(rows.filter((r) => r.id !== row.id))}
          >
            <TrashIcon size={14} />
          </button>
        </div>
      ))}
      {rows.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '24px' }}>
          {emptyText}
        </div>
      )}
    </div>
  );
}
