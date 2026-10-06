import type { ReactNode } from 'react';
import type { AuthConfig } from '@fortest/types';

const labelStyle = { fontSize: '11px', color: 'var(--text-secondary)' };
const groupStyle = {
  display: 'flex',
  gap: '12px',
  paddingLeft: '16px',
  borderLeft: '2px solid var(--border-primary)',
};

function Field({ label, width, children }: { label: string; width?: string; children: ReactNode }) {
  return (
    <div
      style={{
        ...(width ? { width } : { flex: 1 }),
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

interface AuthFieldsProps {
  auth: AuthConfig;
  /** Label of the `none` option, e.g. "No Auth" or "Inherit Auth from Bucket". */
  noneLabel: string;
  tokenPlaceholder?: string;
  /** Every edit. */
  onChange: (auth: AuthConfig) => void;
  /** Finished edits (select changes, field blur) — where auto-saving forms persist. */
  onCommit?: (auth: AuthConfig) => void;
}

/** Auth type picker plus its fields; shared by the bucket's global auth and per-step auth. */
export function AuthFields({
  auth,
  noneLabel,
  tokenPlaceholder = 'Bearer Token value',
  onChange,
  onCommit = () => {},
}: AuthFieldsProps) {
  const basic = { username: '', password: '', ...auth.basic };
  const apiKey = { key: '', value: '', addTo: 'header' as const, ...auth.apiKey };
  const commitOnBlur = { onBlur: () => onCommit(auth) };
  const change = (next: AuthConfig, commit = false) => {
    onChange(next);
    if (commit) onCommit(next);
  };

  return (
    <>
      <div style={{ width: '220px' }}>
        <select
          className="input"
          value={auth.type}
          onChange={(e) => change({ ...auth, type: e.target.value as AuthConfig['type'] }, true)}
        >
          <option value="none">{noneLabel}</option>
          <option value="bearer">Bearer Token</option>
          <option value="basic">Basic Auth</option>
          <option value="api-key">API Key</option>
        </select>
      </div>

      {auth.type === 'bearer' && (
        <div style={{ ...groupStyle, flexDirection: 'column', gap: '6px' }}>
          <label style={labelStyle}>Token</label>
          <input
            type="text"
            className="input"
            placeholder={tokenPlaceholder}
            value={auth.bearer?.token || ''}
            onChange={(e) => change({ ...auth, bearer: { token: e.target.value } })}
            {...commitOnBlur}
          />
        </div>
      )}

      {auth.type === 'basic' && (
        <div style={groupStyle}>
          <Field label="Username">
            <input
              type="text"
              className="input"
              placeholder="Username"
              value={basic.username}
              onChange={(e) => change({ ...auth, basic: { ...basic, username: e.target.value } })}
              {...commitOnBlur}
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              className="input"
              placeholder="Password"
              value={basic.password}
              onChange={(e) => change({ ...auth, basic: { ...basic, password: e.target.value } })}
              {...commitOnBlur}
            />
          </Field>
        </div>
      )}

      {auth.type === 'api-key' && (
        <div style={groupStyle}>
          <Field label="Key">
            <input
              type="text"
              className="input"
              placeholder="X-API-Key"
              value={apiKey.key}
              onChange={(e) => change({ ...auth, apiKey: { ...apiKey, key: e.target.value } })}
              {...commitOnBlur}
            />
          </Field>
          <Field label="Value">
            <input
              type="text"
              className="input"
              placeholder="Value"
              value={apiKey.value}
              onChange={(e) => change({ ...auth, apiKey: { ...apiKey, value: e.target.value } })}
              {...commitOnBlur}
            />
          </Field>
          <Field label="Add To" width="120px">
            <select
              className="input"
              value={apiKey.addTo}
              onChange={(e) =>
                change(
                  { ...auth, apiKey: { ...apiKey, addTo: e.target.value as 'header' | 'query' } },
                  true,
                )
              }
            >
              <option value="header">Headers</option>
              <option value="query">Query Params</option>
            </select>
          </Field>
        </div>
      )}
    </>
  );
}
