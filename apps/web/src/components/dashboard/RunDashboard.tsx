import { useEffect, useState } from 'react';
import { useExecutionStore } from '@/stores/executionStore';
import { StepWaterfall } from './StepWaterfall';
import { StepResultCard } from './StepResultCard';
import { LayersIcon, XIcon, ClockIcon, CheckCircleIcon } from '@/components/common/Icons';
import { isExecuting, isFailedResult, regressionBadgeStyle, regressionLabel, runTone, runVerdict, toneBadge, VERDICT_LABEL } from '@/utils/results';

export function RunDashboard() {
  const { activeRun, selectedStepId, selectedIteration, isRunning, error, clearRun, cancelRun } = useExecutionStore();
  const [secondsElapsed, setSecondsElapsed] = useState(0);

  // Timer for active runs
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isRunning && activeRun?.status === 'running') {
      setSecondsElapsed(0);
      interval = setInterval(() => {
        setSecondsElapsed((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, activeRun?.status]);

  if (!activeRun) {
    if (error) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px', textAlign: 'center', gap: '16px', flex: 1 }}>
          <span style={{ color: 'var(--status-5xx)' }}>
            <XIcon size={48} />
          </span>
          <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Execution Failed</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', fontSize: '14px' }}>{error}</p>
          <button className="btn btn--primary" onClick={clearRun}>
            Back to Configuration
          </button>
        </div>
      );
    }
    return null;
  }

  const results = activeRun.results || [];
  const failedSteps = results.filter(isFailedResult).length;
  const completedSteps = results.filter((r) => !isExecuting(r) && !isFailedResult(r)).length;
  
  const selectedResult = results.find(
    (r) => r.stepId === selectedStepId && (selectedIteration ? r.iteration === selectedIteration : r.iteration === 1)
  );

  const tiles = [
    { label: 'Total Steps', value: results.length, Icon: LayersIcon, iconColor: 'var(--accent-primary)', color: 'var(--text-primary)' },
    { label: 'Passed', value: completedSteps, Icon: CheckCircleIcon, iconColor: 'var(--status-2xx)', color: 'var(--status-2xx)' },
    { label: 'Failed', value: failedSteps, Icon: XIcon, iconColor: 'var(--status-5xx)', color: 'var(--status-5xx)' },
    {
      label: 'Execution Time',
      value: activeRun.status === 'running' ? `${secondsElapsed}s` : `${activeRun.duration || 0} ms`,
      Icon: ClockIcon,
      iconColor: 'var(--text-secondary)',
      color: 'var(--text-primary)',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', minHeight: 0 }}>
      {/* Top Bar / Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-primary)', paddingBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', backgroundColor: 'var(--accent-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--accent-primary)' }}>
            <LayersIcon size={18} />
          </div>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {activeRun.actionGroupName}
              <span
                className="badge"
                style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  ...toneBadge(runTone(runVerdict(activeRun)), 15),
                  border: 'none',
                }}
              >
                {VERDICT_LABEL[runVerdict(activeRun)].toUpperCase()}
              </span>
            </h2>
            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
              Run ID: {activeRun.id}
              {activeRun.environmentName && ` · env: ${activeRun.environmentName}`}
              {activeRun.error && ` · ${activeRun.error}`}
            </span>
            {activeRun.regression && (
              <div style={{ marginTop: '4px' }}>
                <span style={regressionBadgeStyle} title={`Compared with the median of ${activeRun.regression.comparedRuns} recent runs (same environment and run type)`}>
                  ⚠ Slower than usual: {regressionLabel(activeRun.regression)}
                </span>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {activeRun.status === 'running' && (
            <button
              className="btn btn--ghost"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--status-5xx)' }}
              onClick={() => cancelRun(activeRun.id)}
            >
              Stop Run
            </button>
          )}
          <button
            className="btn btn--ghost"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
            onClick={clearRun}
          >
            <XIcon size={14} /> Close Dashboard
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
        {tiles.map(({ label, value, Icon, iconColor, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--bg-secondary)' }}>
            <div style={{ color: iconColor }}>
              <Icon size={24} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500 }}>{label}</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color }}>{value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Execution Split View */}
      <div style={{ display: 'flex', gap: '20px', flex: 1, minHeight: 0 }}>
        {/* Left column: Steps Waterfall List */}
        <div style={{ width: '320px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <StepWaterfall />
        </div>

        {/* Right column: Selected Step Inspection Details */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {selectedResult ? (
            <StepResultCard result={selectedResult} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, border: '1px dashed var(--border-primary)', borderRadius: 'var(--radius-lg)', color: 'var(--text-tertiary)', fontSize: '13px' }}>
              Select a step in the pipeline to inspect response details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
