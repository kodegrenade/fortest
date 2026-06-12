import { useState, useEffect } from 'react';
import { useBucketStore } from '@/stores/bucketStore';
import { TrashIcon, PlusIcon } from '@/components/common/Icons';
import type { KeyValuePair, RequestBody, AuthConfig, ExtractionRule, Assertion } from '@fortest/types';
import './Steps.css';

interface StepEditorProps {
  bucketId: string;
  groupId: string;
  stepId: string;
}

type TabType = 'headers' | 'params' | 'body' | 'auth' | 'extractions' | 'assertions';

export function StepEditor({ bucketId, groupId, stepId }: StepEditorProps) {
  const { buckets, updateStep } = useBucketStore();
  const bucket = buckets.find((b) => b.id === bucketId);
  const group = bucket?.actionGroups.find((g) => g.id === groupId);
  const step = group?.steps.find((s) => s.id === stepId);

  const [activeTab, setActiveTab] = useState<TabType>('headers');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | null>('saved');

  // Local state for all fields
  const [name, setName] = useState('');
  const [method, setMethod] = useState<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'>('GET');
  const [path, setPath] = useState('');
  const [headers, setHeaders] = useState<KeyValuePair[]>([]);
  const [params, setParams] = useState<KeyValuePair[]>([]);
  const [body, setBody] = useState<RequestBody>({ type: 'none', content: '' });
  const [auth, setAuth] = useState<AuthConfig>({ type: 'none' });
  const [extractions, setExtractions] = useState<ExtractionRule[]>([]);
  const [assertions, setAssertions] = useState<Assertion[]>([]);

  // Sync state with active step
  useEffect(() => {
    if (step) {
      setName(step.name);
      setMethod(step.method as any);
      setPath(step.path);
      setHeaders(step.headers || []);
      setParams(step.params || []);
      setBody(step.body || { type: 'none', content: '' });
      setAuth(step.auth || { type: 'none' });
      setExtractions(step.extractions || []);
      setAssertions(step.assertions || []);
      setSaveStatus('saved');
    }
  }, [step, stepId]);

  if (!step || !bucket) return null;

  // General auto-save executor
  const saveStepData = async (updates: Partial<{
    name: string;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
    path: string;
    headers: KeyValuePair[];
    params: KeyValuePair[];
    body: RequestBody;
    auth: AuthConfig;
    extractions: ExtractionRule[];
    assertions: Assertion[];
  }>) => {
    setSaveStatus('saving');
    try {
      const nextHeaders = updates.headers !== undefined ? updates.headers : headers;
      const nextParams = updates.params !== undefined ? updates.params : params;
      const nextExtractions = updates.extractions !== undefined ? updates.extractions : extractions;
      const nextAssertions = updates.assertions !== undefined ? updates.assertions : assertions;

      const cleanHeaders = nextHeaders.filter((h) => h.key.trim() !== '');
      const cleanParams = nextParams.filter((p) => p.key.trim() !== '');
      const cleanExtractions = nextExtractions.filter((e) => e.variableName.trim() !== '');
      const cleanAssertions = nextAssertions.filter((a) => a.expected !== undefined);

      await updateStep(bucketId, groupId, stepId, {
        name: updates.name !== undefined ? updates.name : name,
        method: updates.method !== undefined ? updates.method : method,
        path: updates.path !== undefined ? updates.path : path,
        headers: cleanHeaders,
        params: cleanParams,
        body: updates.body !== undefined ? updates.body : body,
        auth: updates.auth !== undefined ? updates.auth : auth,
        extractions: cleanExtractions,
        assertions: cleanAssertions,
      });
      setSaveStatus('saved');
    } catch (err) {
      console.error('Failed to auto-save step data', err);
      setSaveStatus(null);
    }
  };

  // Helper helpers
  const handleAddHeader = () => {
    const updated = [...headers, { id: crypto.randomUUID(), key: '', value: '', enabled: true }];
    setHeaders(updated);
    // Note: we don't save immediately since key is empty, it will save on blur once typed
  };

  const handleHeaderChange = (id: string, field: keyof KeyValuePair, val: any) => {
    setHeaders(headers.map((h) => (h.id === id ? { ...h, [field]: val } : h)));
  };

  const handleRemoveHeader = (id: string) => {
    const updated = headers.filter((h) => h.id !== id);
    setHeaders(updated);
    saveStepData({ headers: updated });
  };

  const handleAddParam = () => {
    const updated = [...params, { id: crypto.randomUUID(), key: '', value: '', enabled: true }];
    setParams(updated);
  };

  const handleParamChange = (id: string, field: keyof KeyValuePair, val: any) => {
    setParams(params.map((p) => (p.id === id ? { ...p, [field]: val } : p)));
  };

  const handleRemoveParam = (id: string) => {
    const updated = params.filter((p) => p.id !== id);
    setParams(updated);
    saveStepData({ params: updated });
  };

  const handleAddExtraction = () => {
    const updated: ExtractionRule[] = [
      ...extractions,
      {
        id: crypto.randomUUID(),
        variableName: '',
        source: 'body' as const,
        selector: '',
      },
    ];
    setExtractions(updated);
  };

  const handleExtractionChange = (id: string, field: keyof ExtractionRule, val: any) => {
    setExtractions(extractions.map((e) => (e.id === id ? { ...e, [field]: val } as ExtractionRule : e)));
  };

  const handleRemoveExtraction = (id: string) => {
    const updated = extractions.filter((e) => e.id !== id);
    setExtractions(updated);
    saveStepData({ extractions: updated });
  };

  const handleAddAssertion = () => {
    const updated: Assertion[] = [
      ...assertions,
      {
        id: crypto.randomUUID(),
        target: 'status' as const,
        selector: '',
        operator: 'equals' as const,
        expected: '200',
      },
    ];
    setAssertions(updated);
    saveStepData({ assertions: updated });
  };

  const handleAssertionChange = (id: string, field: keyof Assertion, val: any) => {
    setAssertions(assertions.map((a) => (a.id === id ? { ...a, [field]: val } as Assertion : a)));
  };

  const handleRemoveAssertion = (id: string) => {
    const updated = assertions.filter((a) => a.id !== id);
    setAssertions(updated);
    saveStepData({ assertions: updated });
  };

  // Full URL display helper
  const fullUrl = `${bucket.baseUrl || ''}${path.startsWith('/') ? path : '/' + path}`;

  return (
    <div className="step-editor">
      {/* Header Info */}
      <div className="step-editor__header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
          <select
            className="input"
            style={{ width: '110px', fontWeight: 600, color: `var(--method-${method.toLowerCase()})` }}
            value={method}
            onChange={(e) => {
              const val = e.target.value as any;
              setMethod(val);
              saveStepData({ method: val });
            }}
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
            <option value="HEAD">HEAD</option>
            <option value="OPTIONS">OPTIONS</option>
          </select>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <input
              type="text"
              className="input"
              style={{ fontWeight: 600 }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => saveStepData({ name })}
              placeholder="Step Name"
            />
            <input
              type="text"
              className="input"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', padding: '4px 8px' }}
              value={path}
              onChange={(e) => setPath(e.target.value)}
              onBlur={() => saveStepData({ path })}
              placeholder="/endpoint/path"
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '16px' }}>
          {saveStatus === 'saving' && (
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span className="dot-saving" style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-hover)', display: 'inline-block' }}></span>
              Saving...
            </span>
          )}
          {saveStatus === 'saved' && (
            <span style={{ fontSize: '12px', color: 'var(--status-2xx)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span className="dot-saved" style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--status-2xx)', display: 'inline-block' }}></span>
              Saved
            </span>
          )}
        </div>
      </div>

      {/* Helper full URL display */}
      <div style={{ padding: '6px 16px', borderBottom: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: '11px', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        Request URL: <span style={{ color: 'var(--text-primary)' }}>{fullUrl}</span>
      </div>

      {/* Tabs */}
      <div className="step-editor__tabs">
        {(['headers', 'params', 'body', 'auth', 'extractions', 'assertions'] as TabType[]).map((tab) => (
          <button
            key={tab}
            className={`step-editor__tab ${activeTab === tab ? 'step-editor__tab--active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === 'headers' && headers.length > 0 && ` (${headers.length})`}
            {tab === 'params' && params.length > 0 && ` (${params.length})`}
            {tab === 'extractions' && extractions.length > 0 && ` (${extractions.length})`}
            {tab === 'assertions' && assertions.length > 0 && ` (${assertions.length})`}
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      <div className="step-editor__content">
        
        {/* Headers Tab */}
        {activeTab === 'headers' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
              <button className="btn btn--ghost" style={{ fontSize: '11px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={handleAddHeader}>
                <PlusIcon size={12} /> Add Header
              </button>
            </div>
            {headers.map((header) => (
              <div key={header.id} className="key-value-row">
                <input
                  type="checkbox"
                  className="key-value-row__checkbox"
                  checked={header.enabled}
                  onChange={(e) => {
                    const updated = headers.map((h) => (h.id === header.id ? { ...h, enabled: e.target.checked } : h));
                    setHeaders(updated);
                    saveStepData({ headers: updated });
                  }}
                />
                <input
                  type="text"
                  className="input"
                  placeholder="Header Name (e.g. Content-Type)"
                  value={header.key}
                  onChange={(e) => handleHeaderChange(header.id, 'key', e.target.value)}
                  onBlur={() => saveStepData({ headers })}
                />
                <input
                  type="text"
                  className="input"
                  placeholder="Value"
                  value={header.value}
                  onChange={(e) => handleHeaderChange(header.id, 'value', e.target.value)}
                  onBlur={() => saveStepData({ headers })}
                />
                <button className="btn btn--icon" onClick={() => handleRemoveHeader(header.id)}>
                  <TrashIcon size={14} />
                </button>
              </div>
            ))}
            {headers.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '24px' }}>
                No headers defined for this step.
              </div>
            )}
          </div>
        )}

        {/* Params Tab */}
        {activeTab === 'params' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
              <button className="btn btn--ghost" style={{ fontSize: '11px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={handleAddParam}>
                <PlusIcon size={12} /> Add Parameter
              </button>
            </div>
            {params.map((param) => (
              <div key={param.id} className="key-value-row">
                <input
                  type="checkbox"
                  className="key-value-row__checkbox"
                  checked={param.enabled}
                  onChange={(e) => {
                    const updated = params.map((p) => (p.id === param.id ? { ...p, enabled: e.target.checked } : p));
                    setParams(updated);
                    saveStepData({ params: updated });
                  }}
                />
                <input
                  type="text"
                  className="input"
                  placeholder="Parameter Name"
                  value={param.key}
                  onChange={(e) => handleParamChange(param.id, 'key', e.target.value)}
                  onBlur={() => saveStepData({ params })}
                />
                <input
                  type="text"
                  className="input"
                  placeholder="Value"
                  value={param.value}
                  onChange={(e) => handleParamChange(param.id, 'value', e.target.value)}
                  onBlur={() => saveStepData({ params })}
                />
                <button className="btn btn--icon" onClick={() => handleRemoveParam(param.id)}>
                  <TrashIcon size={14} />
                </button>
              </div>
            ))}
            {params.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '24px' }}>
                No query parameters defined for this step.
              </div>
            )}
          </div>
        )}

        {/* Body Tab */}
        {activeTab === 'body' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ width: '200px' }}>
              <select
                className="input"
                value={body.type}
                onChange={(e) => {
                  const next = { ...body, type: e.target.value as any };
                  setBody(next);
                  saveStepData({ body: next });
                }}
              >
                <option value="none">No Body (none)</option>
                <option value="json">JSON</option>
                <option value="xml">XML</option>
                <option value="raw">Raw Text</option>
                <option value="form-data">Form Data</option>
                <option value="x-www-form-urlencoded">Form URL Encoded</option>
              </select>
            </div>

            {body.type !== 'none' && (
              <textarea
                className="input"
                style={{ fontFamily: 'var(--font-mono)', minHeight: '200px', fontSize: '12px', resize: 'vertical', lineHeight: '1.5' }}
                placeholder={body.type === 'json' ? '{\n  "key": "value"\n}' : 'Body Content'}
                value={body.content}
                onChange={(e) => setBody({ ...body, content: e.target.value })}
                onBlur={() => saveStepData({ body })}
              />
            )}
          </div>
        )}

        {/* Auth Tab */}
        {activeTab === 'auth' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ width: '220px' }}>
              <select
                className="input"
                value={auth.type}
                onChange={(e) => {
                  const next = { ...auth, type: e.target.value as any };
                  setAuth(next);
                  saveStepData({ auth: next });
                }}
              >
                <option value="none">Inherit Auth from Bucket</option>
                <option value="bearer">Bearer Token</option>
                <option value="basic">Basic Auth</option>
                <option value="api-key">API Key</option>
              </select>
            </div>

            {auth.type === 'none' && (
              <div style={{ color: 'var(--text-secondary)', fontSize: '12px', padding: '12px', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-secondary)' }}>
                This step inherits the global authentication defined in the Test Bucket ({bucket.auth.type}).
              </div>
            )}

            {auth.type === 'bearer' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '16px', borderLeft: '2px solid var(--border-primary)' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Token</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Bearer Token value"
                  value={auth.bearer?.token || ''}
                  onChange={(e) => setAuth({ ...auth, bearer: { token: e.target.value } })}
                  onBlur={() => saveStepData({ auth })}
                />
              </div>
            )}

            {auth.type === 'basic' && (
              <div style={{ display: 'flex', gap: '12px', paddingLeft: '16px', borderLeft: '2px solid var(--border-primary)' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Username</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Username"
                    value={auth.basic?.username || ''}
                    onChange={(e) => setAuth({
                      ...auth,
                      basic: { username: e.target.value, password: auth.basic?.password || '' }
                    })}
                    onBlur={() => saveStepData({ auth })}
                  />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Password</label>
                  <input
                    type="password"
                    className="input"
                    placeholder="Password"
                    value={auth.basic?.password || ''}
                    onChange={(e) => setAuth({
                      ...auth,
                      basic: { username: auth.basic?.username || '', password: e.target.value }
                    })}
                    onBlur={() => saveStepData({ auth })}
                  />
                </div>
              </div>
            )}

            {auth.type === 'api-key' && (
              <div style={{ display: 'flex', gap: '12px', paddingLeft: '16px', borderLeft: '2px solid var(--border-primary)' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Key</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="X-API-Key"
                    value={auth.apiKey?.key || ''}
                    onChange={(e) => setAuth({
                      ...auth,
                      apiKey: {
                        key: e.target.value,
                        value: auth.apiKey?.value || '',
                        addTo: auth.apiKey?.addTo || 'header'
                      }
                    })}
                    onBlur={() => saveStepData({ auth })}
                  />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Value</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Value"
                    value={auth.apiKey?.value || ''}
                    onChange={(e) => setAuth({
                      ...auth,
                      apiKey: {
                        key: auth.apiKey?.key || '',
                        value: e.target.value,
                        addTo: auth.apiKey?.addTo || 'header'
                      }
                    })}
                    onBlur={() => saveStepData({ auth })}
                  />
                </div>
                <div style={{ width: '120px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Add To</label>
                  <select
                    className="input"
                    value={auth.apiKey?.addTo || 'header'}
                    onChange={(e) => {
                      const next = { ...auth, apiKey: { ...auth.apiKey!, addTo: e.target.value as any } };
                      setAuth(next);
                      saveStepData({ auth: next });
                    }}
                  >
                    <option value="header">Headers</option>
                    <option value="query">Query Params</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Extractions Tab */}
        {activeTab === 'extractions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
              <button className="btn btn--ghost" style={{ fontSize: '11px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={handleAddExtraction}>
                <PlusIcon size={12} /> Add Extraction Rule
              </button>
            </div>
            {extractions.map((extraction) => (
              <div key={extraction.id} className="key-value-row">
                <input
                  type="text"
                  className="input"
                  style={{ flex: 1, fontFamily: 'var(--font-mono)' }}
                  placeholder="Variable Name (e.g. token)"
                  value={extraction.variableName}
                  onChange={(e) => handleExtractionChange(extraction.id, 'variableName', e.target.value)}
                  onBlur={() => saveStepData({ extractions })}
                />
                <select
                  className="input"
                  style={{ width: '100px', flex: 'none' }}
                  value={extraction.source}
                  onChange={(e) => {
                    const updated = extractions.map((ex) => (ex.id === extraction.id ? { ...ex, source: e.target.value as any } : ex));
                    setExtractions(updated);
                    saveStepData({ extractions: updated });
                  }}
                >
                  <option value="body">Body</option>
                  <option value="header">Header</option>
                  <option value="status">Status</option>
                </select>
                <input
                  type="text"
                  className="input"
                  style={{ flex: 2, fontFamily: 'var(--font-mono)' }}
                  placeholder={extraction.source === 'body' ? 'JSON Path / selector (e.g. data.token)' : 'Header Name (e.g. Authorization)'}
                  value={extraction.selector}
                  onChange={(e) => handleExtractionChange(extraction.id, 'selector', e.target.value)}
                  onBlur={() => saveStepData({ extractions })}
                  disabled={extraction.source === 'status'}
                />
                <button className="btn btn--icon" onClick={() => handleRemoveExtraction(extraction.id)}>
                  <TrashIcon size={14} />
                </button>
              </div>
            ))}
            {extractions.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '24px' }}>
                No response extraction rules defined. Extract values to pass them into downstream requests.
              </div>
            )}
          </div>
        )}

        {/* Assertions Tab */}
        {activeTab === 'assertions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
              <button className="btn btn--ghost" style={{ fontSize: '11px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={handleAddAssertion}>
                <PlusIcon size={12} /> Add Assertion
              </button>
            </div>
            {assertions.map((assertion) => (
              <div key={assertion.id} className="key-value-row">
                <select
                  className="input"
                  style={{ width: '130px', flex: 'none' }}
                  value={assertion.target}
                  onChange={(e) => {
                    const updated = assertions.map((a) => (a.id === assertion.id ? { ...a, target: e.target.value as any } : a));
                    setAssertions(updated);
                    saveStepData({ assertions: updated });
                  }}
                >
                  <option value="status">Status Code</option>
                  <option value="body">Response Body</option>
                  <option value="header">Response Header</option>
                  <option value="response_time">Response Time (ms)</option>
                </select>

                <input
                  type="text"
                  className="input"
                  style={{ flex: 1, fontFamily: 'var(--font-mono)' }}
                  placeholder={assertion.target === 'body' ? 'JSON Path (e.g. user.id)' : assertion.target === 'header' ? 'Header Name' : 'N/A'}
                  value={assertion.selector}
                  onChange={(e) => handleAssertionChange(assertion.id, 'selector', e.target.value)}
                  onBlur={() => saveStepData({ assertions })}
                  disabled={assertion.target === 'status' || assertion.target === 'response_time'}
                />

                <select
                  className="input"
                  style={{ width: '130px', flex: 'none' }}
                  value={assertion.operator}
                  onChange={(e) => {
                    const updated = assertions.map((a) => (a.id === assertion.id ? { ...a, operator: e.target.value as any } : a));
                    setAssertions(updated);
                    saveStepData({ assertions: updated });
                  }}
                >
                  <option value="equals">Equals</option>
                  <option value="not_equals">Not Equals</option>
                  <option value="contains">Contains</option>
                  <option value="not_contains">Not Contains</option>
                  <option value="greater_than">Greater Than</option>
                  <option value="less_than">Less Than</option>
                  <option value="exists">Exists</option>
                  <option value="not_exists">Not Exists</option>
                  <option value="matches_regex">Matches Regex</option>
                </select>

                <input
                  type="text"
                  className="input"
                  style={{ flex: 1 }}
                  placeholder="Expected Value"
                  value={assertion.expected}
                  onChange={(e) => handleAssertionChange(assertion.id, 'expected', e.target.value)}
                  onBlur={() => saveStepData({ assertions })}
                  disabled={assertion.operator === 'exists' || assertion.operator === 'not_exists'}
                />

                <button className="btn btn--icon" onClick={() => handleRemoveAssertion(assertion.id)}>
                  <TrashIcon size={14} />
                </button>
              </div>
            ))}
            {assertions.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '24px' }}>
                No assertions configured. Add assertions to validate API responses automatically.
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
