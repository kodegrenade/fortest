import React, { useState, useEffect, useRef } from 'react';

interface ActionGroupDialogProps {
  isOpen: boolean;
  title: string;
  submitText?: string;
  initialName?: string;
  initialDescription?: string;
  onConfirm: (name: string, description: string) => void;
  onCancel: () => void;
}

export function ActionGroupDialog({
  isOpen,
  title,
  submitText = 'Save',
  initialName = '',
  initialDescription = '',
  onConfirm,
  onCancel,
}: ActionGroupDialogProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setDescription(initialDescription);
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [isOpen, initialName, initialDescription]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onConfirm(name.trim(), description.trim());
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ position: 'relative', maxWidth: '440px', width: '100%' }}>
        <button
          type="button"
          className="modal-close-btn"
          onClick={onCancel}
          title="Close"
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <line x1={18} y1={6} x2={6} y2={18} />
            <line x1={6} y1={6} x2={18} y2={18} />
          </svg>
        </button>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 className="modal-title" style={{ marginBottom: 0 }}>{title}</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Group Name</label>
            <input
              ref={nameInputRef}
              type="text"
              className="input modal-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Authenticated Profile Sync"
              required
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Description (Optional)</label>
            <textarea
              className="input modal-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Logs in first to retrieve credentials then updates user meta"
              rows={3}
              style={{ resize: 'vertical', minHeight: '80px', fontFamily: 'inherit', fontSize: '13px', padding: '8px 12px' }}
            />
          </div>

          <div className="modal-actions" style={{ marginTop: '8px' }}>
            <button type="button" className="btn btn--ghost" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={!name.trim()}>
              {submitText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
