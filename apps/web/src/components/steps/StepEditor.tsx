import { useState, useEffect } from 'react';
import { useBucketStore } from '@/stores/bucketStore';
import { useToastStore } from '@/stores/toastStore';
import { TrashIcon, PlusIcon } from '@/components/common/Icons';
import { AuthFields } from '@/components/common/AuthFields';
import type { KeyValuePair, RequestBody, AuthConfig, ExtractionRule, Assertion, Step } from '@fortest/types';
import { effectiveVariables, interpolate, parseFormPairs } from '@fortest/utils';
import './Steps.css';
import { VariableInput } from './VariableInput';
import { KeyValueEditor } from './KeyValueEditor';

interface StepEditorProps {
  bucketId: string;
  groupId: string;
  stepId: string;
}

type TabType = 'headers' | 'params' | 'body' | 'auth' | 'extractions' | 'assertions';
type Method = Step['method'];

const METHODS: Method[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const BODY_TYPES: [RequestBody['type'], string][] = [
  ['none', 'No Body (none)'],
  ['json', 'JSON'],
  ['xml', 'XML'],
  ['raw', 'Raw Text'],
  ['form-data', 'Form Data'],
  ['x-www-form-urlencoded', 'Form URL Encoded'],
];

const EXTRACTION_SOURCES: [ExtractionRule['source'], string][] = [
  ['body', 'Response Body (JSON)'],
  ['header', 'Response Header'],
  ['status', 'Response Status Code'],
];

const ASSERTION_TARGETS: Record<Assertion['target'], string> = {
  status: 'Status Code',
  body: 'Response Body (JSON)',
  header: 'Response Header',
  response_time: 'Response Time (ms)',
};

// Also phrased for the helper text under each assertion ("Asserts that … does not equal …").
const ASSERTION_OPERATORS: Record<Assertion['operator'], [label: string, phrase: string]> = {
  equals: ['Equals', 'equals'],
  not_equals: ['Not Equals', 'does not equal'],
  contains: ['Contains', 'contains'],
  not_contains: ['Not Contains', 'does not contain'],
  greater_than: ['Greater Than', 'is greater than'],
  less_than: ['Less Than', 'is less than'],
  exists: ['Exists', 'exists'],
  not_exists: ['Not Exists', 'does not exist'],
  matches_regex: ['Matches Regex', 'matches regex pattern'],
};

const POPULAR_HEADERS = [
  'Accept',
  'Accept-Encoding',
  'Accept-Language',
  'Authorization',
  'Cache-Control',
  'Connection',
  'Content-Length',
  'Content-Type',
  'Cookie',
  'Host',
  'Origin',
  'Pragma',
  'Referer',
  'User-Agent',
  'X-API-Key',
  'X-CSRF-Token',
  'X-Requested-With',
];

const POPULAR_HEADER_VALUES = [
  'application/json',
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'text/plain',
  'text/html',
  'application/xml',
  'Bearer ',
  'no-cache',
  'no-store',
  'keep-alive',
  'UTF-8',
];

const isFormBody = (type: RequestBody['type']) => type === 'form-data' || type === 'x-www-form-urlencoded';

const fieldLabel = { fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 500 } as const;
const emptyText = { textAlign: 'center', color: 'var(--text-tertiary)', padding: '24px' } as const;
const addButton = { fontSize: '11px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' } as const;

function validateXml(content: string): string | null {
  // DOMParser doesn't throw; it reports errors as a <parsererror> element.
  const error = new DOMParser().parseFromString(content, 'application/xml').querySelector('parsererror');
  return error ? error.textContent || 'XML parsing error' : null;
}

function getBodyValidationError(body: RequestBody): string | null {
  if (!body.content.trim()) return null;
  if (body.type === 'xml') return validateXml(body.content);
  if (body.type !== 'json') return null;
  try {
    JSON.parse(body.content);
    return null;
  } catch (err: any) {
    return err.message;
  }
}

export function StepEditor({ bucketId, groupId, stepId }: StepEditorProps) {
  const { buckets, updateStep } = useBucketStore();
  const { addToast } = useToastStore();
  const bucket = buckets.find((b) => b.id === bucketId);
  const group = bucket?.actionGroups.find((g) => g.id === groupId);
  const step = group?.steps.find((s) => s.id === stepId);

  // Compute preceding steps for variable data-chaining autocomplete
  const precedingSteps = group && step
    ? group.steps.filter((s) => s.order < step.order).sort((a, b) => a.order - b.order)
    : [];

  const [activeTab, setActiveTab] = useState<TabType>('headers');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | null>('saved');

  // Local state for all fields
  const [name, setName] = useState('');
  const [method, setMethod] = useState<Method>('GET');
  const [path, setPath] = useState('');
  const [headers, setHeaders] = useState<KeyValuePair[]>([]);
  const [params, setParams] = useState<KeyValuePair[]>([]);
  const [body, setBody] = useState<RequestBody>({ type: 'none', content: '' });
  // Form bodies are edited as rows and stored as a JSON array of pairs (see parseFormPairs).
  const [bodyKeyValues, setBodyKeyValues] = useState<KeyValuePair[]>([]);
  const [auth, setAuth] = useState<AuthConfig>({ type: 'none' });
  const [extractions, setExtractions] = useState<ExtractionRule[]>([]);
  const [assertions, setAssertions] = useState<Assertion[]>([]);
  const [retry, setRetry] = useState<Step['retry']>();

  // Sync state with active step
  useEffect(() => {
    if (step) {
      setName(step.name);
      setMethod(step.method);
      setPath(step.path);
      setHeaders(step.headers);
      setParams(step.params);
      setBody(step.body);
      setBodyKeyValues(isFormBody(step.body.type) && step.body.content ? parseFormPairs(step.body.content) : []);
      setAuth(step.auth);
      setExtractions(step.extractions);
      setAssertions(step.assertions);
      setRetry(step.retry);
      setSaveStatus('saved');
    }
  }, [step, stepId]);

  if (!step || !bucket) return null;

  // Auto-save: current local state with `updates` applied; rows without a key are dropped.
  const saveStepData = async (updates: Partial<Step>) => {
    setSaveStatus('saving');
    const next = { name, method, path, headers, params, body, auth, extractions, assertions, retry, ...updates };
    try {
      const referencesUpdated = await updateStep(bucketId, groupId, stepId, {
        ...next,
        headers: next.headers.filter((h) => h.key.trim() !== ''),
        params: next.params.filter((p) => p.key.trim() !== ''),
        extractions: next.extractions.filter((e) => e.variableName.trim() !== ''),
      });
      setSaveStatus('saved');
      if (referencesUpdated) {
        addToast(`Updated ${referencesUpdated} reference${referencesUpdated === 1 ? '' : 's'} to "${next.name}" in other steps.`, 'info');
      }
    } catch (err: any) {
      console.error('Failed to auto-save step data', err);
      setSaveStatus(null);
      addToast(err.message || 'Failed to auto-save step data', 'error');
      if (updates.name !== undefined) {
        setName(step.name);
      }
    }
  };

  // Edit handlers for the extraction and assertion lists: `change` is local, the rest save.
  const listOps = <T extends { id: string }>(list: T[], set: (next: T[]) => void, field: 'extractions' | 'assertions') => {
    const commit = (next: T[]) => {
      set(next);
      saveStepData({ [field]: next });
    };
    const patch = (id: string, p: Partial<T>) => list.map((item) => (item.id === id ? { ...item, ...p } : item));
    return {
      add: (item: T) => set([...list, item]),
      change: (id: string, p: Partial<T>) => set(patch(id, p)),
      commit: (id: string, p: Partial<T>) => commit(patch(id, p)),
      remove: (id: string) => commit(list.filter((item) => item.id !== id)),
      save: () => saveStepData({ [field]: list }),
    };
  };
  const extractionOps = listOps(extractions, setExtractions, 'extractions');
  const assertionOps = listOps(assertions, setAssertions, 'assertions');

  const setFormRows = (rows: KeyValuePair[]) => {
    setBodyKeyValues(rows);
    const next = { ...body, content: JSON.stringify(rows) };
    setBody(next);
    return next;
  };

  const bodyError = getBodyValidationError(body);
  // Autocomplete and the URL preview use what a run would: shared variables + the selected environment's.
  const variables = effectiveVariables(bucket);
  const varProps = { variables, precedingSteps };

  const handleBeautifyJson = () => {
    try {
      const nextBody = { ...body, content: JSON.stringify(JSON.parse(body.content), null, 2) };
      setBody(nextBody);
      saveStepData({ body: nextBody });
    } catch {
      // Do nothing if invalid
    }
  };

  // Full URL display helper (absolute step paths, e.g. from a Postman import, are used as-is)
  const resolvedBase = interpolate(bucket.baseUrl || '', variables).resolved;
  const fullUrl = /^https?:\/\//i.test(path) ? path : `${resolvedBase}${path.startsWith('/') ? path : '/' + path}`;
  const counts: Partial<Record<TabType, number>> = {
    headers: headers.length,
    params: params.length,
    extractions: extractions.length,
    assertions: assertions.length,
  };

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
              const val = e.target.value as Method;
              setMethod(val);
              saveStepData({ method: val });
            }}
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
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
            <VariableInput
              type="text"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', padding: '4px 8px' }}
              value={path}
              onChange={setPath}
              onBlur={() => saveStepData({ path })}
              placeholder="/endpoint/path"
              {...varProps}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '16px' }}>
          {saveStatus && (
            <span
              style={{
                fontSize: '12px',
                color: saveStatus === 'saved' ? 'var(--status-2xx)' : 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span
                className={`dot-${saveStatus}`}
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: saveStatus === 'saved' ? 'var(--status-2xx)' : 'var(--accent-hover)',
                  display: 'inline-block',
                }}
              ></span>
              {saveStatus === 'saved' ? 'Saved' : 'Saving...'}
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
            {counts[tab] ? ` (${counts[tab]})` : ''}
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      <div className="step-editor__content">

        {/* Headers Tab */}
        {activeTab === 'headers' && (
          <>
            <KeyValueEditor
              rows={headers}
              onChange={setHeaders}
              onSave={(rows) => saveStepData({ headers: rows })}
              noun="Header"
              addTitle="Add custom HTTP header"
              keyPlaceholder="Header Name (e.g. Content-Type)"
              emptyText="No headers defined for this step."
              keyList="popular-headers"
              valueList="popular-header-values"
              {...varProps}
            />
            <datalist id="popular-headers">
              {POPULAR_HEADERS.map((h) => (
                <option key={h} value={h} />
              ))}
            </datalist>
            <datalist id="popular-header-values">
              {POPULAR_HEADER_VALUES.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </>
        )}

        {/* Params Tab */}
        {activeTab === 'params' && (
          <KeyValueEditor
            rows={params}
            onChange={setParams}
            onSave={(rows) => saveStepData({ params: rows })}
            noun="Parameter"
            addTitle="Add query parameter"
            keyPlaceholder="Parameter Name"
            emptyText="No query parameters defined for this step."
            {...varProps}
          />
        )}

        {/* Body Tab */}
        {activeTab === 'body' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ width: '220px' }}>
              <select
                className="input"
                value={body.type}
                onChange={(e) => {
                  const type = e.target.value as RequestBody['type'];
                  let content = body.content;
                  if (isFormBody(type)) {
                    const rows = content ? parseFormPairs(content) : [];
                    content = JSON.stringify(rows);
                    setBodyKeyValues(rows);
                  } else {
                    setBodyKeyValues([]);
                  }
                  const next = { type, content };
                  setBody(next);
                  saveStepData({ body: next });
                }}
              >
                {BODY_TYPES.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {/* Textarea for raw/JSON/XML types */}
            {(body.type === 'json' || body.type === 'xml' || body.type === 'raw') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <VariableInput
                  type="textarea"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    minHeight: '200px',
                    fontSize: '12px',
                    resize: 'vertical',
                    lineHeight: '1.5',
                    borderColor: bodyError ? 'var(--status-5xx)' : undefined,
                  }}
                  placeholder={
                    body.type === 'json'
                      ? '{\n  "key": "value"\n}'
                      : body.type === 'xml'
                      ? '<root>\n  <key>value</key>\n</root>'
                      : 'Body Content'
                  }
                  value={body.content}
                  onChange={(val) => setBody({ ...body, content: val })}
                  onBlur={() => saveStepData({ body })}
                  {...varProps}
                />

                {/* Validation & Beautify Bar */}
                {body.content.trim() && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', padding: '4px 8px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
                    <div>
                      {bodyError ? (
                        <span style={{ color: 'var(--status-5xx)', fontWeight: 500 }}>
                          ✕ Invalid {body.type.toUpperCase()}: {bodyError}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--status-2xx)', fontWeight: 500 }}>
                          ✓ Valid {body.type.toUpperCase()}
                        </span>
                      )}
                    </div>
                    {body.type === 'json' && !bodyError && (
                      <button
                        type="button"
                        className="btn btn--ghost"
                        title="Beautify and format JSON body content"
                        style={{ fontSize: '10px', padding: '2px 6px' }}
                        onClick={handleBeautifyJson}
                      >
                        Beautify / Format
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Key-Value editor for form-data and URL encoded */}
            {isFormBody(body.type) && (
              <KeyValueEditor
                rows={bodyKeyValues}
                onChange={setFormRows}
                onSave={(rows) => saveStepData({ body: setFormRows(rows) })}
                noun="Key-Value Row"
                addTitle="Add request body parameter"
                keyPlaceholder="Key"
                emptyText="No form parameters defined."
                {...varProps}
              />
            )}
          </div>
        )}

        {/* Auth Tab */}
        {activeTab === 'auth' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <AuthFields
              auth={auth}
              noneLabel="Inherit Auth from Bucket"
              onChange={setAuth}
              onCommit={(next) => saveStepData({ auth: next })}
            />
            {auth.type === 'none' && (
              <div style={{ color: 'var(--text-secondary)', fontSize: '12px', padding: '12px', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-secondary)' }}>
                This step inherits the global authentication defined in the Test Bucket ({bucket.auth.type}).
              </div>
            )}
          </div>
        )}

        {/* Extractions Tab */}
        {activeTab === 'extractions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="btn btn--ghost"
                title="Add extraction rule to extract variables from response"
                style={addButton}
                onClick={() => extractionOps.add({ id: crypto.randomUUID(), variableName: '', source: 'body', selector: '' })}
              >
                <PlusIcon size={12} /> Add Extraction Rule
              </button>
            </div>
            {extractions.map((extraction) => (
              <div key={extraction.id} className="extraction-card">
                <div className="extraction-card__header">
                  <div className="extraction-card__title">
                    <span className={`badge badge--${extraction.source}`}>
                      {extraction.source}
                    </span>
                    {extraction.variableName ? (
                      <code style={{ fontSize: '10px', color: 'var(--accent-hover)' }}>{`{{steps.${step.name}.${extraction.variableName}}}`}</code>
                    ) : (
                      <span style={{ fontStyle: 'italic', fontSize: '11px', color: 'var(--text-tertiary)' }}>Unnamed variable</span>
                    )}
                  </div>
                  <button className="btn btn--icon" title="Remove extraction rule" onClick={() => extractionOps.remove(extraction.id)}>
                    <TrashIcon size={14} />
                  </button>
                </div>
                <div className="extraction-card__body">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={fieldLabel}>Variable Name</label>
                    <input
                      type="text"
                      className="input"
                      style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                      placeholder="e.g. authToken"
                      value={extraction.variableName}
                      onChange={(e) => extractionOps.change(extraction.id, { variableName: e.target.value })}
                      onBlur={extractionOps.save}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={fieldLabel}>Source</label>
                    <select
                      className="input"
                      style={{ fontSize: '12px' }}
                      value={extraction.source}
                      onChange={(e) => extractionOps.commit(extraction.id, { source: e.target.value as ExtractionRule['source'] })}
                    >
                      {EXTRACTION_SOURCES.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 2 }}>
                    <label style={fieldLabel}>Path / Key</label>
                    <input
                      type="text"
                      className="input"
                      style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                      placeholder={
                        extraction.source === 'body'
                          ? 'JSON dot-notation path (e.g. data.token)'
                          : extraction.source === 'header'
                          ? 'Header key (e.g. Content-Type)'
                          : 'N/A (extracts the status code)'
                      }
                      value={extraction.selector}
                      onChange={(e) => extractionOps.change(extraction.id, { selector: e.target.value })}
                      onBlur={extractionOps.save}
                      disabled={extraction.source === 'status'}
                    />
                  </div>
                </div>
              </div>
            ))}
            {extractions.length === 0 && (
              <div style={emptyText}>
                No response extraction rules defined. Extract values to pass them into downstream requests.
              </div>
            )}
          </div>
        )}

        {/* Assertions Tab */}
        {activeTab === 'assertions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Retry / poll: resend until this step passes, e.g. "until the job's status is done" */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', padding: '10px 12px', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-secondary)', fontSize: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500, color: 'var(--text-primary)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!retry}
                  onChange={(e) => {
                    const next = e.target.checked ? { maxAttempts: 10, intervalMs: 1000 } : undefined;
                    setRetry(next);
                    saveStepData({ retry: next });
                  }}
                />
                Retry until this step passes
              </label>
              {retry && (
                <>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                    up to
                    <input
                      type="number"
                      className="input"
                      style={{ width: '70px', padding: '4px 6px' }}
                      min={2}
                      max={100}
                      value={retry.maxAttempts}
                      onChange={(e) => setRetry({ ...retry, maxAttempts: Math.min(100, Math.max(2, parseInt(e.target.value) || 2)) })}
                      onBlur={() => saveStepData({ retry })}
                    />
                    attempts, every
                    <input
                      type="number"
                      className="input"
                      style={{ width: '80px', padding: '4px 6px' }}
                      min={0}
                      max={60000}
                      step={100}
                      value={retry.intervalMs}
                      onChange={(e) => setRetry({ ...retry, intervalMs: Math.min(60000, Math.max(0, parseInt(e.target.value) || 0)) })}
                      onBlur={() => saveStepData({ retry })}
                    />
                    ms
                  </label>
                  <span style={{ color: 'var(--text-tertiary)' }}>
                    Waits up to {((retry.maxAttempts - 1) * retry.intervalMs / 1000).toFixed(1)}s in total.{' '}
                    {assertions.length === 0 && 'With no assertions, it retries until a 2xx/3xx response.'}
                  </span>
                </>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="btn btn--ghost"
                title="Add test assertion to validate response"
                style={addButton}
                onClick={() => {
                  // Saved straight away: a fresh assertion is already complete (status equals 200).
                  const next = [...assertions, { id: crypto.randomUUID(), target: 'status', selector: '', operator: 'equals', expected: '200' } as Assertion];
                  setAssertions(next);
                  saveStepData({ assertions: next });
                }}
              >
                <PlusIcon size={12} /> Add Assertion
              </button>
            </div>
            {assertions.map((assertion) => (
              <div key={assertion.id} className="assertion-card">
                <div className="assertion-card__header">
                  <div className="assertion-card__title">
                    <span className="badge badge--extraction">
                      Assert: {assertion.target}
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      {assertion.operator}
                    </span>
                  </div>
                  <button className="btn btn--icon" title="Remove assertion" onClick={() => assertionOps.remove(assertion.id)}>
                    <TrashIcon size={14} />
                  </button>
                </div>
                <div className="assertion-card__body">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={fieldLabel}>Target</label>
                    <select
                      className="input"
                      style={{ fontSize: '12px' }}
                      value={assertion.target}
                      onChange={(e) => assertionOps.commit(assertion.id, { target: e.target.value as Assertion['target'] })}
                    >
                      {Object.entries(ASSERTION_TARGETS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1.5 }}>
                    <label style={fieldLabel}>Property Path</label>
                    <input
                      type="text"
                      className="input"
                      style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                      placeholder={assertion.target === 'body' ? 'e.g. data.id or user.name' : assertion.target === 'header' ? 'e.g. Content-Type' : 'N/A'}
                      value={assertion.selector}
                      onChange={(e) => assertionOps.change(assertion.id, { selector: e.target.value })}
                      onBlur={assertionOps.save}
                      disabled={assertion.target === 'status' || assertion.target === 'response_time'}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={fieldLabel}>Operator</label>
                    <select
                      className="input"
                      style={{ fontSize: '12px' }}
                      value={assertion.operator}
                      onChange={(e) => assertionOps.commit(assertion.id, { operator: e.target.value as Assertion['operator'] })}
                    >
                      {Object.entries(ASSERTION_OPERATORS).map(([value, [label]]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1.5 }}>
                    <label style={fieldLabel}>Expected Value</label>
                    <VariableInput
                      type="text"
                      placeholder="e.g. 200 or {{myVar}}"
                      value={assertion.expected}
                      onChange={(val) => assertionOps.change(assertion.id, { expected: val })}
                      onBlur={assertionOps.save}
                      disabled={assertion.operator === 'exists' || assertion.operator === 'not_exists'}
                      {...varProps}
                    />
                  </div>
                </div>
                <div className="assertion-card__helper">
                  💡 {getAssertionHelperText(assertion)}
                </div>
              </div>
            ))}
            {assertions.length === 0 && (
              <div style={emptyText}>
                No assertions configured. Add assertions to validate API responses automatically.
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

function getAssertionHelperText(assertion: Assertion): string {
  const target = { status: 'HTTP Status Code', body: 'Response Body', header: 'Response Header', response_time: 'Response Time' }[assertion.target];
  const operator = ASSERTION_OPERATORS[assertion.operator][1];
  const selectorText = assertion.selector ? ` at path "${assertion.selector}"` : '';

  if (assertion.operator === 'exists' || assertion.operator === 'not_exists') {
    return `Asserts that ${target}${selectorText} ${operator}.`;
  }
  return `Asserts that ${target}${selectorText} ${operator} "${assertion.expected}".`;
}
