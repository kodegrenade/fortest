import { useEffect } from 'react';
import { useExecutionStore } from '@/stores/executionStore';
import { ClockIcon, CheckCircleIcon, XIcon } from '@/components/common/Icons';
import { regressionBadgeStyle, regressionLabel, runTone, toneBadge } from '@/utils/results';

const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function relativeTime(iso: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  if (Math.abs(seconds) < 60) return 'Just now';
  for (const [unit, size] of [['day', 86400], ['hour', 3600], ['minute', 60]] as const) {
    if (Math.abs(seconds) >= size) return relativeFormat.format(Math.round(seconds / size), unit);
  }
  return '';
}

const COLUMNS = ['Execution Date', 'Status', 'Configuration', 'Duration', 'Avg Latency', 'Success Rate'];

interface HistoryListProps {
  groupId: string;
}

export function HistoryList({ groupId }: HistoryListProps) {
  const { pastRuns, pastRunsLoading, loadRuns, viewHistoricalRun } = useExecutionStore();

  useEffect(() => {
    loadRuns(groupId);
  }, [groupId, loadRuns]);

  if (pastRunsLoading && pastRuns.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '12px', color: 'var(--text-secondary)' }}>
        <div className="spinner"></div>
        <span style={{ fontSize: '14px' }}>Loading run history...</span>
      </div>
    );
  }

  if (pastRuns.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '48px', gap: '16px', color: 'var(--text-tertiary)' }}>
        <ClockIcon size={48} />
        <div style={{ textAlign: 'center' }}>
          <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>No Run History</h4>
          <p style={{ fontSize: '13px', maxWidth: '320px' }}>You haven't executed this Action Group yet. Switch to the Steps tab and click "Run Flow" to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>Historical Execution Runs</h3>
          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>Review metrics, assertions, and responses of the last 50 execution runs.</p>
        </div>
        <button
          className="btn btn--secondary"
          onClick={() => loadRuns(groupId)}
          style={{ fontSize: '12px', padding: '6px 12px' }}
          disabled={pastRunsLoading}
        >
          {pastRunsLoading ? 'Refreshing...' : 'Refresh List'}
        </button>
      </div>

      <div style={{ border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--bg-secondary)', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-primary)', color: 'var(--text-secondary)', fontWeight: 600 }}>
              {COLUMNS.map((c) => (
                <th key={c} style={{ padding: '12px 16px' }}>{c}</th>
              ))}
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pastRuns.map((run) => {
              const config = run.config || { mode: 'manual', iterations: 1, concurrency: 1 };
              const metrics = run.metrics;
              const hasMetrics = !!metrics;

              const successRate = 100 - Math.round(metrics?.errorRate ?? 0);
              const isSuccess = run.status === 'completed' && successRate === 100;

              return (
                <tr
                  key={run.id}
                  style={{
                    borderBottom: '1px solid var(--border-secondary)',
                    transition: 'background-color var(--transition-fast)',
                  }}
                  className="table-row-hover"
                >
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {dateFormat.format(new Date(run.createdAt))}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                        {relativeTime(run.createdAt)}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        ...toneBadge(isSuccess ? 'passed' : run.status === 'completed' ? 'failed' : runTone(run.status), 12),
                        border: 'none',
                      }}
                    >
                      {isSuccess ? (
                        <CheckCircleIcon size={12} />
                      ) : run.status === 'running' ? (
                        <div className="spinner" style={{ width: '10px', height: '10px', borderWidth: '1px' }}></div>
                      ) : (
                        <XIcon size={12} />
                      )}
                      {run.status === 'running' ? 'Running' : run.status === 'cancelled' ? 'Cancelled' : isSuccess ? 'Passed' : 'Failed'}
                    </span>
                    {run.regression && (
                      <span style={{ ...regressionBadgeStyle, display: 'inline-block', marginTop: '4px' }} title={regressionLabel(run.regression)}>
                        ⚠ Slower
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>
                    {config.mode === 'manual' ? (
                      'Manual Flow'
                    ) : (
                      <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Load Test</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                          {config.iterations} iter · {config.concurrency} worker{config.concurrency !== 1 ? 's' : ''}
                        </span>
                      </span>
                    )}
                    {run.environmentName && (
                      <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-tertiary)' }}>env: {run.environmentName}</span>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>
                    {run.duration !== undefined ? `${run.duration} ms` : '—'}
                  </td>
                  <td style={{ padding: '14px 16px', color: 'var(--text-primary)', fontWeight: 500 }}>
                    {hasMetrics && metrics.totalRequests > 0 ? `${Math.round(metrics.avgLatency)} ms` : '—'}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    {hasMetrics && metrics.totalRequests > 0 ? (
                      <span
                        style={{
                          fontWeight: 600,
                          color: successRate === 100 ? 'var(--status-2xx)' : 'var(--status-5xx)',
                        }}
                      >
                        {successRate}%
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    <button
                      className="btn btn--primary"
                      onClick={() => viewHistoricalRun(run.id)}
                      style={{ padding: '4px 10px', fontSize: '11.5px', borderRadius: '4px' }}
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
