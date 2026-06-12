import React, { useState, useEffect, useRef } from 'react';
import './PromptDialog.css';

interface PromptDialogProps {
  isOpen: boolean;
  title: string;
  placeholder?: string;
  submitText?: string;
  initialValue?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function PromptDialog({
  isOpen,
  title,
  placeholder,
  submitText = 'Save',
  initialValue = '',
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onConfirm(value.trim());
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <h3 className="modal-title">{title}</h3>
          <input
            ref={inputRef}
            type="text"
            className="input modal-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
          />
          <div className="modal-actions">
            <button type="button" className="btn btn--ghost" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={!value.trim()}>
              {submitText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
