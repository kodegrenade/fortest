import { useState } from 'react';
import type { StepResult } from '@fortest/types';
import { CheckCircleIcon, XIcon, AlertCircleIcon } from '@/components/common/Icons';
import { attemptsLabel, formatBytes, isExecuting, prettyJson, tint } from '@/utils/results';

interface StepResultCardProps {
  result: StepResult;
}

type TabType = 'overview' | 'headers' | 'requestBody' | 'body' | 'assertions' | 'extractions';

export function StepResultCard({ result }: StepResultCardProps) {
  // A failed assertion is the reason the step failed, so show it first (the card is keyed per step).
  const [activeTab, setActiveTab] = useState<TabType>(() =>
    result.assertions.some((a) => !a.passed) ? 'assertions' : 'overview',
  );

  const statusColor = isExecuting(result)
    ? 'var(--accent-primary)'
    : result.status >= 200 && result.status < 300
    ? 'var(--status-2xx)'
    : result.status >= 300 && result.status < 400
    ? 'var(--status-3xx)'
    : 'var(--status-5xx)';

  const tabs = [
    { id: 'overview', label: 'Overview' },
    ...(result.requestBody || result.bodyOmitted ? [{ id: 'requestBody', label: 'Request Body' }] : []),
    { id: 'headers', label: 'Headers' },
    { id: 'body', label: 'Response Body' },
    { id: 'assertions', label: `Assertions (${result.assertions.length})` },
    { id: 'extractions', label: `Extractions (${Object.keys(result.extractedData).length})` },
  ] as { id: TabType; label: string }[];

  const tile = { padding: '12px', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-primary)' };

  return (
    <div className="config-panel" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Header Info */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid var(--border-primary)' }}>
        <div>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{result.stepName}</h3>
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
            Executed at {new Date(result.timestamp).toLocaleTimeString()}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            className="badge"
            style={{
              backgroundColor: tint(statusColor, 8),
              color: statusColor,
              border: `1px solid ${tint(statusColor, 19)}`,
              fontSize: '12px',
              padding: '4px 8px',
            }}
          >
            {isExecuting(result)
              ? 'Executing...'
              : result.status > 0 
                ? `${result.status} ${result.statusText}` 
                : result.statusText || 'Failed'}
          </span>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {result.responseTime} ms{attemptsLabel(result)}
          </span>
        </div>
      </div>

      {/* Detail Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-secondary)', padding: '0 8px', backgroundColor: 'var(--bg-secondary)', overflowX: 'auto' }}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 14px',
                fontSize: '12px',
                fontWeight: 500,
                color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                borderBottom: isActive ? '2px solid var(--accent-primary)' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div style={{ padding: '16px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
        
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {result.error && (
              <div style={{ display: 'flex', gap: '8px', padding: '12px', backgroundColor: tint('var(--status-5xx)', 10), border: `1px solid ${tint('var(--status-5xx)', 20)}`, borderRadius: 'var(--radius-md)', color: 'var(--method-delete)', fontSize: '13px' }}>
                <AlertCircleIcon size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <div style={{ fontWeight: 600, marginBottom: '2px' }}>Execution Error</div>
                  <div>{result.error}</div>
                </div>
              </div>
            )}
            
            {result.url && (
              <div style={{ padding: '12px', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-primary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500 }}>Request URL</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: `var(--method-${(result.method || 'GET').toLowerCase()})`,
                      color: 'white',
                      textTransform: 'uppercase',
                      flexShrink: 0,
                    }}
                  >
                    {result.method || 'GET'}
                  </span>
                  <code style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-primary)', wordBreak: 'break-all', display: 'block' }}>
                    {result.url}
                  </code>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
              {[
                ['Duration', `${result.responseTime} ms`],
                ['Response Size', formatBytes(result.responseSize)],
              ].map(([label, value]) => (
                <div key={label} style={tile}>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>{label}</div>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{value}</div>
                </div>
              ))}
              <div style={tile}>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Content Type</div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={result.contentType}>
                  {result.contentType || 'unknown'}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'headers' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {Object.keys(result.responseHeaders || {}).length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '24px' }}>No response headers</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                {Object.entries(result.responseHeaders).map(([key, val]) => (
                  <div key={key} style={{ display: 'flex', fontSize: '12px', borderBottom: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)' }}>
                    <div style={{ width: '200px', padding: '8px 12px', borderRight: '1px solid var(--border-secondary)', fontWeight: 600, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                      {key}
                    </div>
                    <div style={{ flex: 1, padding: '8px 12px', color: 'var(--text-primary)', wordBreak: 'break-all', fontFamily: 'var(--font-mono)' }}>
                      {val}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {(activeTab === 'requestBody' || activeTab === 'body') && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <textarea
              readOnly
              className="input"
              style={{
                fontFamily: 'var(--font-mono)',
                width: '100%',
                flex: 1,
                minHeight: '220px',
                fontSize: '12px',
                resize: 'none',
                lineHeight: '1.5',
                backgroundColor: 'var(--bg-primary)',
                cursor: 'text',
              }}
              value={
                result.bodyOmitted
                  ? 'Body not retained: load runs keep bodies only for iteration 1 and for failed steps.'
                  : activeTab === 'body'
                  ? result.responseBody ? prettyJson(result.responseBody) : 'Empty response body'
                  : result.requestBody ? prettyJson(result.requestBody) : 'Empty request body'
              }
            />
          </div>
        )}

        {activeTab === 'assertions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {(!result.assertions || result.assertions.length === 0) ? (
              <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '24px' }}>
                No assertions defined for this step.
              </div>
            ) : (
              result.assertions.map((assert) => (
                <div
                  key={assert.assertionId}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '12px',
                    border: '1px solid var(--border-primary)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: tint(assert.passed ? 'var(--status-2xx)' : 'var(--status-5xx)', 5),
                  }}
                >
                  <span style={{ color: assert.passed ? 'var(--status-2xx)' : 'var(--status-5xx)', marginTop: '2px' }}>
                    {assert.passed ? <CheckCircleIcon size={16} /> : <XIcon size={16} />}
                  </span>
                  <div style={{ flex: 1, fontSize: '13px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                      Assert {assert.operator.toUpperCase()} on {assert.operator === 'exists' || assert.operator === 'not_exists' ? 'value' : `expected "${assert.expected}"`}
                    </div>
                    {!assert.passed && assert.message && (
                      <div style={{ color: 'var(--status-5xx)', fontSize: '12px', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                        {assert.message}
                      </div>
                    )}
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                      Actual Value: <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{assert.actual}</code>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'extractions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {Object.keys(result.extractedData || {}).length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '24px' }}>
                No variables extracted from this step.
              </div>
            ) : (
              Object.entries(result.extractedData).map(([key, val]) => (
                <div
                  key={key}
                  style={{
                    padding: '12px',
                    border: '1px solid var(--border-primary)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-primary)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
                      {key}
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', padding: '2px 6px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px' }}>
                      Extracted
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Value: <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', wordBreak: 'break-all' }}>{String(val)}</code>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
