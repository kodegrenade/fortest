import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { parseBulkVariables } from '@/utils/variableParser';
import { Modal } from './Modal';

interface PasteVariablesDialogProps {
  onConfirm: (variables: { key: string; value: string; enabled: boolean }[]) => void;
  onCancel: () => void;
}

const exampleStyle: React.CSSProperties = {
  margin: 0,
  padding: '6px 8px',
  backgroundColor: 'var(--bg-secondary)',
  borderRadius: '4px',
  fontSize: '11px',
  fontFamily: 'var(--font-mono)',
  border: '1px solid var(--border-primary)',
  color: 'var(--text-secondary)',
};

const EXAMPLES = [
  [
    '1. Key-Value / .env',
    'DB_HOST=localhost\nexport DB_PASS="secret"\nPORT: 8080\n# comments are ignored',
  ],
  ['2. JSON Object', '{\n  "API_KEY": "secret-123",\n  "TIMEOUT": 3000\n}'],
  ['3. JSON Array', '[\n  { "key": "URL", "value": "api.com" }\n]'],
];

export function PasteVariablesDialog({ onConfirm, onCancel }: PasteVariablesDialogProps) {
  const [text, setText] = useState('');
  const parsedVars = parseBulkVariables(text);

  return (
    <Modal
      onClose={onCancel}
      showCloseButton
      style={{
        maxWidth: '760px',
        width: '90%',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <h3 className="modal-title" style={{ marginBottom: 0 }}>
        Bulk Paste Variables
      </h3>

      <div
        className="paste-dialog-layout"
        style={{ display: 'flex', gap: '20px', minHeight: '340px' }}
      >
        {/* Left: Input Textarea */}
        <div style={{ flex: '1.2', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Paste Content
          </label>
          <textarea
            className="input modal-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='PASTE_KEY=value&#10;export ANOTHER_KEY=&apos;my-token&apos;&#10;&#10;or JSON object:&#10;{&#10;  "MY_VAR": "value"&#10;}'
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

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '4px',
            }}
          >
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
                  <Check size={14} strokeWidth={2.5} />
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
          <h4 style={{ fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            Supported Formats
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {EXAMPLES.map(([title, sample]) => (
              <div key={title}>
                <span
                  style={{
                    fontWeight: 600,
                    color: 'var(--accent-primary)',
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  {title}
                </span>
                <pre style={exampleStyle}>{sample}</pre>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modal Actions */}
      <div
        className="modal-actions"
        style={{
          borderTop: '1px solid var(--border-primary)',
          paddingTop: '16px',
          marginTop: '4px',
        }}
      >
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={parsedVars.length === 0}
          onClick={() => onConfirm(parsedVars)}
        >
          Add Variables
        </button>
      </div>
    </Modal>
  );
}
