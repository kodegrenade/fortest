import { useEffect, useState } from 'react';
import { useExecutionStore } from '@/stores/executionStore';
import { StepWaterfall } from './StepWaterfall';
import { StepResultCard } from './StepResultCard';
import { LayersIcon, XIcon, ClockIcon, CheckCircleIcon } from '@/components/common/Icons';

export function RunDashboard() {
  const { activeRun, selectedStepId, selectedIteration, isRunning, error, clearRun } = useExecutionStore();
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
  const totalSteps = results.length;
  const failedSteps = results.filter((r) => r.status >= 400 || r.error || r.assertions?.some((a) => !a.passed)).length;
  const completedSteps = results.filter((r) => r.status > 0 && r.status < 400 && !r.error && !r.assertions?.some((a) => !a.passed)).length;
  
  const selectedResult = results.find(
    (r) => r.stepId === selectedStepId && (selectedIteration ? r.iteration === selectedIteration : r.iteration === 1)
  );

  const getStatusLabel = () => {
    if (activeRun.status === 'running') return 'RUNNING';
    if (activeRun.status === 'completed') return 'COMPLETED';
    if (activeRun.status === 'failed') return 'FAILED';
    return activeRun.status.toUpperCase();
  };

  const formatDuration = () => {
    if (activeRun.status === 'running') {
      return `${secondsElapsed}s`;
    }
    return `${activeRun.duration || 0} ms`;
  };

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
                  backgroundColor: activeRun.status === 'completed' 
                    ? 'hsla(145, 65%, 50%, 0.15)' 
                    : activeRun.status === 'running'
                    ? 'var(--accent-subtle)'
                    : 'hsla(0, 70%, 58%, 0.15)',
                  color: activeRun.status === 'completed'
                    ? 'var(--status-2xx)'
                    : activeRun.status === 'running'
                    ? 'var(--accent-primary)'
                    : 'var(--status-5xx)',
                  border: 'none',
                }}
              >
                {getStatusLabel()}
              </span>
            </h2>
            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
              Run ID: {activeRun.id}
            </span>
          </div>
        </div>

        <button
          className="btn btn--ghost"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
          onClick={clearRun}
        >
          <XIcon size={14} /> Close Dashboard
        </button>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--bg-secondary)' }}>
          <div style={{ color: 'var(--accent-primary)' }}>
            <LayersIcon size={24} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500 }}>Total Steps</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{totalSteps}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--bg-secondary)' }}>
          <div style={{ color: 'var(--status-2xx)' }}>
            <CheckCircleIcon size={24} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500 }}>Passed</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--status-2xx)' }}>{completedSteps}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--bg-secondary)' }}>
          <div style={{ color: 'var(--status-5xx)' }}>
            <XIcon size={24} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500 }}>Failed</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--status-5xx)' }}>{failedSteps}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--bg-secondary)' }}>
          <div style={{ color: 'var(--text-secondary)' }}>
            <ClockIcon size={24} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500 }}>Execution Time</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{formatDuration()}</div>
          </div>
        </div>
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
