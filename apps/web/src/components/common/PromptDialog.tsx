import React, { useState } from 'react';
import { Modal } from './Modal';

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

interface PromptDialogProps {
  title: string;
  label?: string;
  placeholder?: string;
  submitText?: string;
  initialValue?: string;
  /** Adds an optional description textarea (e.g. for action groups). */
  description?: { initialValue?: string; placeholder?: string };
  onConfirm: (value: string, description: string) => void;
  onCancel: () => void;
}

/** A name prompt, optionally with a description. Mounted fresh on each open, so initial values just work. */
export function PromptDialog({
  title,
  label,
  placeholder,
  submitText = 'Save',
  initialValue = '',
  description,
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [descriptionValue, setDescriptionValue] = useState(description?.initialValue ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) onConfirm(value.trim(), descriptionValue.trim());
  };

  return (
    <Modal
      onClose={onCancel}
      showCloseButton={!!description}
      style={description ? { maxWidth: '440px' } : undefined}
    >
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
      >
        <h3 className="modal-title" style={{ marginBottom: 0 }}>
          {title}
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {label && <label style={labelStyle}>{label}</label>}
          <input
            type="text"
            className="input modal-input"
            style={{ marginBottom: 0 }}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            required
          />
        </div>

        {description && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={labelStyle}>Description (Optional)</label>
            <textarea
              className="input modal-input"
              value={descriptionValue}
              onChange={(e) => setDescriptionValue(e.target.value)}
              placeholder={description.placeholder}
              rows={3}
              style={{
                resize: 'vertical',
                minHeight: '80px',
                fontFamily: 'inherit',
                fontSize: '13px',
                padding: '8px 12px',
                marginBottom: 0,
              }}
            />
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: '8px' }}>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={!value.trim()}>
            {submitText}
          </button>
        </div>
      </form>
    </Modal>
  );
}
