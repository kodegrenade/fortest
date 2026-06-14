import { useState, useEffect } from 'react';
import { useExecutionStore } from '@/stores/executionStore';
import { CheckCircleIcon, XIcon, ChevronDownIcon } from '@/components/common/Icons';
import type { StepResult } from '@fortest/types';

export function StepWaterfall() {
  const { activeRun, selectedStepId, selectedIteration, selectStep } = useExecutionStore();
  const [expandedIterations, setExpandedIterations] = useState<Record<number, boolean>>({ 1: true });

  if (!activeRun) return null;

  const results = activeRun.results || [];
  
  // Find maximum response time to compute relative bar widths across all results
  const maxResponseTime = Math.max(...results.map((r) => r.responseTime), 1);

  // Group results by iteration (defaulting to 1 if iteration is undefined)
  const resultsByIteration: Record<number, StepResult[]> = {};
  results.forEach((res) => {
    const iterNum = res.iteration || 1;
    if (!resultsByIteration[iterNum]) {
      resultsByIteration[iterNum] = [];
    }
    resultsByIteration[iterNum].push(res);
  });

  // Sort iteration keys numerically
  const iterationKeys = Object.keys(resultsByIteration)
    .map(Number)
    .sort((a, b) => a - b);

  // Auto-expand any running iteration as it starts
  useEffect(() => {
    const runningIterations = results
      .filter((r) => r.statusText === 'Executing...')
      .map((r) => r.iteration || 1);

    if (runningIterations.length > 0) {
      setExpandedIterations((prev) => {
        const next = { ...prev };
        let changed = false;
        runningIterations.forEach((iter) => {
          if (!next[iter]) {
            next[iter] = true;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }, [results]);

  const toggleIteration = (iter: number) => {
    setExpandedIterations((prev) => ({
      ...prev,
      [iter]: !prev[iter],
    }));
  };

  const getIterationStatus = (iterSteps: StepResult[]) => {
    const isExecuting = iterSteps.some((s) => s.statusText === 'Executing...');
    if (isExecuting) return 'running';

    const isFailed = iterSteps.some((s) => {
      const hasFailedAssertions = s.assertions?.some((a) => !a.passed);
      return s.error || s.status >= 400 || s.status === 0 || hasFailedAssertions;
    });
    if (isFailed) return 'failed';

    const allCompleted = iterSteps.length > 0 && iterSteps.every((s) => s.status > 0 && s.status < 400 && !s.error);
    if (allCompleted) return 'passed';

    return 'pending';
  };

  const getStepStatusIcon = (status: number, statusText?: string, error?: string, assertions?: any[]) => {
    if (statusText === 'Executing...') {
      return <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '1.5px' }}></div>;
    }
    const hasFailedAssertions = assertions?.some((a) => !a.passed);
    if (error || status >= 400 || status === 0 || hasFailedAssertions) {
      return <XIcon size={16} style={{ color: 'var(--status-5xx)' }} />;
    }
    if (status >= 200 && status < 300) {
      return <CheckCircleIcon size={16} style={{ color: 'var(--status-2xx)' }} />;
    }
    return <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--text-tertiary)' }}></div>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border-primary)' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
          Execution Pipeline
        </h3>
        {iterationKeys.length > 1 && (
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500 }}>
            {iterationKeys.length} Iterations
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '2px' }}>
        {iterationKeys.map((iter) => {
          const iterSteps = resultsByIteration[iter] || [];
          const status = getIterationStatus(iterSteps);
          const isExpanded = !!expandedIterations[iter];
          const totalDuration = iterSteps.reduce((sum, s) => sum + s.responseTime, 0);

          let statusColor = 'var(--text-tertiary)';
          let statusBg = 'var(--bg-hover)';
          let statusLabel = 'Pending';
          let statusBorder = 'var(--border-primary)';

          if (status === 'running') {
            statusColor = 'var(--accent-primary)';
            statusBg = 'var(--accent-subtle)';
            statusLabel = 'Running';
            statusBorder = 'hsla(250, 80%, 65%, 0.25)';
          } else if (status === 'passed') {
            statusColor = 'var(--status-2xx)';
            statusBg = 'hsla(145, 65%, 50%, 0.1)';
            statusLabel = 'Passed';
            statusBorder = 'hsla(145, 65%, 50%, 0.15)';
          } else if (status === 'failed') {
            statusColor = 'var(--status-5xx)';
            statusBg = 'hsla(0, 70%, 58%, 0.1)';
            statusLabel = 'Failed';
            statusBorder = 'hsla(0, 70%, 58%, 0.15)';
          }

          return (
            <div
              key={iter}
              style={{
                border: isExpanded ? `1px solid var(--border-primary)` : `1px solid var(--border-secondary)`,
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'var(--bg-secondary)',
                overflow: 'hidden',
                transition: 'all var(--transition-normal)',
                boxShadow: isExpanded ? 'var(--shadow-sm)' : 'none',
              }}
            >
              {/* Accordion Header */}
              <div
                onClick={() => toggleIteration(iter)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  cursor: 'pointer',
                  userSelect: 'none',
                  backgroundColor: isExpanded ? 'var(--bg-hover)' : 'transparent',
                  borderBottom: isExpanded ? '1px solid var(--border-secondary)' : 'none',
                  transition: 'background-color var(--transition-fast)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Iteration #{iter}
                  </span>
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      color: statusColor,
                      backgroundColor: statusBg,
                      border: `1px solid ${statusBorder}`,
                    }}
                  >
                    {statusLabel}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-tertiary)' }}>
                  <span style={{ fontSize: '11px' }}>
                    {iterSteps.length} step{iterSteps.length !== 1 ? 's' : ''}
                    {status !== 'pending' && totalDuration > 0 && ` · ${totalDuration}ms`}
                  </span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform var(--transition-normal)',
                    }}
                  >
                    <ChevronDownIcon size={14} />
                  </span>
                </div>
              </div>

              {/* Accordion Body */}
              {isExpanded && (
                <div
                  style={{
                    padding: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    backgroundColor: 'var(--bg-primary)',
                  }}
                >
                  {iterSteps.map((res) => {
                    const isSelected = selectedStepId === res.stepId && selectedIteration === res.iteration;
                    const relativeWidth = (res.responseTime / maxResponseTime) * 100;
                    const isExecuting = res.statusText === 'Executing...';

                    return (
                      <div
                        key={`${res.iteration}-${res.stepId}`}
                        onClick={() => selectStep(res.stepId, res.iteration)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px 10px',
                          borderRadius: 'var(--radius-md)',
                          backgroundColor: isSelected ? 'var(--bg-hover)' : 'var(--bg-secondary)',
                          border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-primary)',
                          cursor: 'pointer',
                          transition: 'all var(--transition-fast)',
                          position: 'relative',
                          overflow: 'hidden',
                        }}
                      >
                        {/* Left timeline status icon */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', zIndex: 2 }}>
                          {getStepStatusIcon(res.status, res.statusText, res.error, res.assertions)}
                        </div>

                        {/* Step Info */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', zIndex: 2, minWidth: 0 }}>
                          <span style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {res.stepName}
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                            {isExecuting
                              ? 'Running request...'
                              : (res.error || res.status === 0 || res.assertions?.some((a) => !a.passed))
                              ? 'Failed'
                              : `${res.status} · ${res.responseTime}ms`}
                          </span>
                        </div>

                        {/* Latency Waterfall Bar */}
                        {!isExecuting && res.responseTime > 0 && (
                          <div
                            style={{
                              position: 'absolute',
                              left: 0,
                              top: 0,
                              bottom: 0,
                              width: `${relativeWidth}%`,
                              backgroundColor: res.status >= 200 && res.status < 300
                                ? 'hsla(145, 65%, 50%, 0.03)'
                                : 'hsla(0, 70%, 58%, 0.03)',
                              borderRight: res.status >= 200 && res.status < 300
                                ? '1.5px solid hsla(145, 65%, 50%, 0.12)'
                                : '1.5px solid hsla(0, 70%, 58%, 0.12)',
                              zIndex: 1,
                              pointerEvents: 'none',
                              transition: 'width 0.3s ease',
                            }}
                          />
                        )}
                      </div>
                    );
                  })}

                  {iterSteps.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-tertiary)', fontSize: '11px' }}>
                      Waiting for iteration steps...
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {results.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-tertiary)', fontSize: '12px', border: '1px dashed var(--border-primary)', borderRadius: 'var(--radius-lg)' }}>
            Preparing step execution...
          </div>
        )}
      </div>
    </div>
  );
}
