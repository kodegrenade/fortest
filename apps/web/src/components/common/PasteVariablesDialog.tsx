import React, { useState, useEffect, useRef } from 'react';
import { parseBulkVariables } from '@/utils/variableParser';

interface PasteVariablesDialogProps {
  isOpen: boolean;
  onConfirm: (variables: { key: string; value: string; enabled: boolean }[]) => void;
  onCancel: () => void;
}

export function PasteVariablesDialog({
  isOpen,
  onConfirm,
  onCancel,
}: PasteVariablesDialogProps) {
  const [text, setText] = useState('');
  const [parsedVars, setParsedVars] = useState<{ key: string; value: string; enabled: boolean }[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setText('');
      setParsedVars([]);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setParsedVars(parseBulkVariables(text));
  }, [text]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedVars.length > 0) {
      onConfirm(parsedVars);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          maxWidth: '760px',
          width: '90%',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Close Button */}
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

        <h3 className="modal-title" style={{ marginBottom: 0 }}>Bulk Paste Variables</h3>

        <div className="paste-dialog-layout" style={{ display: 'flex', gap: '20px', minHeight: '340px' }}>
          {/* Left: Input Textarea */}
          <div style={{ flex: '1.2', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Paste Content
            </label>
            <textarea
              ref={textareaRef}
              className="input modal-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="PASTE_KEY=value&#10;export ANOTHER_KEY='my-token'&#10;&#10;or JSON object:&#10;{&#10;  &quot;MY_VAR&quot;: &quot;value&quot;&#10;}"
              style={{
                flex: 1,
                resize: 'none',
                minHeight: '260px',
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                padding: '12px',
                lineHeight: '1.5',
              }}
            />
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: parsedVars.length > 0 ? 'var(--method-get)' : 'var(--text-tertiary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'color var(--transition-fast)',
                }}
              >
                {parsedVars.length > 0 ? (
                  <>
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {parsedVars.length} {parsedVars.length === 1 ? 'variable' : 'variables'} detected
                  </>
                ) : (
                  '0 variables detected'
                )}
              </span>
            </div>
          </div>

          {/* Right: Guide */}
          <div
            style={{
              flex: '0.8',
              backgroundColor: 'var(--bg-primary)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-primary)',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              fontSize: '12px',
              overflowY: 'auto',
              maxHeight: '340px',
            }}
          >
            <h4 style={{ fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Supported Formats</h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <span style={{ fontWeight: 600, color: 'var(--accent-primary)', display: 'block', marginBottom: '4px' }}>1. Key-Value / .env</span>
                <pre style={{ margin: 0, padding: '6px 8px', backgroundColor: 'var(--bg-secondary)', borderRadius: '4px', fontSize: '11px', fontFamily: 'var(--font-mono)', border: '1px solid var(--border-primary)', color: 'var(--text-secondary)' }}>
                  DB_HOST=localhost{"\n"}
                  export DB_PASS="secret"{"\n"}
                  PORT: 8080{"\n"}
                  # comments are ignored
                </pre>
              </div>

              <div>
                <span style={{ fontWeight: 600, color: 'var(--accent-primary)', display: 'block', marginBottom: '4px' }}>2. JSON Object</span>
                <pre style={{ margin: 0, padding: '6px 8px', backgroundColor: 'var(--bg-secondary)', borderRadius: '4px', fontSize: '11px', fontFamily: 'var(--font-mono)', border: '1px solid var(--border-primary)', color: 'var(--text-secondary)' }}>
                  {"{"}{"\n"}
                  &nbsp;&nbsp;"API_KEY": "secret-123",{"\n"}
                  &nbsp;&nbsp;"TIMEOUT": 3000{"\n"}
                  {"}"}
                </pre>
              </div>

              <div>
                <span style={{ fontWeight: 600, color: 'var(--accent-primary)', display: 'block', marginBottom: '4px' }}>3. JSON Array</span>
                <pre style={{ margin: 0, padding: '6px 8px', backgroundColor: 'var(--bg-secondary)', borderRadius: '4px', fontSize: '11px', fontFamily: 'var(--font-mono)', border: '1px solid var(--border-primary)', color: 'var(--text-secondary)' }}>
                  [{"\n"}
                  &nbsp;&nbsp;{"{"} "key": "URL", "value": "api.com" {"}"}{"\n"}
                  ]
                </pre>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="modal-actions" style={{ borderTop: '1px solid var(--border-primary)', paddingTop: '16px', marginTop: '4px' }}>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={parsedVars.length === 0}
            onClick={handleSubmit}
          >
            Add Variables
          </button>
        </div>
      </div>
    </div>
  );
}
