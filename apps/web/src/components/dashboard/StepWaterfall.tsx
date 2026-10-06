import { useState, useEffect } from 'react';
import { useExecutionStore } from '@/stores/executionStore';
import { CheckCircleIcon, XIcon, ChevronDownIcon } from '@/components/common/Icons';
import type { StepResult } from '@fortest/types';
import { attemptsLabel, isExecuting, isFailedResult, tint, toneBadge, type Tone } from '@/utils/results';

// Latency bar color: green for 2xx, red otherwise.
const TONE_BAR = (res: StepResult) => (res.status >= 200 && res.status < 300 ? 'var(--status-2xx)' : 'var(--status-5xx)');

// Load runs can have 10k iterations; render at most this many rows at a time.
const ITERATION_PAGE = 100;
const ALWAYS_SHOWN = 20; // the first iterations are shown even when they passed

const getIterationStatus = (iterSteps: StepResult[]): Tone => {
  if (iterSteps.some(isExecuting)) return 'running';
  if (iterSteps.some(isFailedResult)) return 'failed';
  return iterSteps.length > 0 ? 'passed' : 'pending';
};

export function StepWaterfall() {
  const { activeRun, selectedStepId, selectedIteration, selectStep } = useExecutionStore();
  const [expandedIterations, setExpandedIterations] = useState<Record<number, boolean>>({ 1: true });
  const [visibleCount, setVisibleCount] = useState(ITERATION_PAGE);

  const results = activeRun?.results || [];
  
  // Find maximum response time to compute relative bar widths across all results
  // (reduce, not Math.max(...spread): a spread of 100k+ results exceeds the engine's argument limit)
  const maxResponseTime = results.reduce((max, r) => Math.max(max, r.responseTime), 1);

  // Group results by iteration (defaulting to 1 if iteration is undefined)
  const resultsByIteration: Record<number, StepResult[]> = {};
  for (const res of results) (resultsByIteration[res.iteration || 1] ??= []).push(res);

  // Sort iteration keys numerically
  const iterationKeys = Object.keys(resultsByIteration)
    .map(Number)
    .sort((a, b) => a - b);

  // Failed and running iterations first, then the first few, then the rest; shown in iteration order.
  const isNotable = (iter: number, index: number) =>
    index < ALWAYS_SHOWN || getIterationStatus(resultsByIteration[iter]!) !== 'passed';
  const visibleKeys = [
    ...iterationKeys.filter(isNotable),
    ...iterationKeys.filter((iter, index) => !isNotable(iter, index)),
  ]
    .slice(0, visibleCount)
    .sort((a, b) => a - b);
  const hiddenCount = iterationKeys.length - visibleKeys.length;

  // Auto-expand any running iteration as it starts
  useEffect(() => {
    const runningIterations = results
      .filter(isExecuting)
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

  // Early return only after every hook has run (Rules of Hooks).
  if (!activeRun) return null;

  const toggleIteration = (iter: number) => {
    setExpandedIterations((prev) => ({
      ...prev,
      [iter]: !prev[iter],
    }));
  };

  const getStepStatusIcon = (res: StepResult) => {
    if (isExecuting(res)) {
      return <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '1.5px' }}></div>;
    }
    if (isFailedResult(res)) {
      return <XIcon size={16} style={{ color: 'var(--status-5xx)' }} />;
    }
    if (res.status >= 200 && res.status < 300) {
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
        {visibleKeys.map((iter) => {
          const iterSteps = resultsByIteration[iter] || [];
          const status = getIterationStatus(iterSteps);
          const isExpanded = !!expandedIterations[iter];
          const totalDuration = iterSteps.reduce((sum, s) => sum + s.responseTime, 0);


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
                      ...toneBadge(status),
                    }}
                  >
                    {status}
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
                    const executing = isExecuting(res);

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
                          {getStepStatusIcon(res)}
                        </div>

                        {/* Step Info */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', zIndex: 2, minWidth: 0 }}>
                          <span style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {res.stepName}
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                            {executing
                              ? 'Running request...'
                              : isFailedResult(res)
                              ? 'Failed'
                              : `${res.status} · ${res.responseTime}ms${attemptsLabel(res)}`}
                          </span>
                        </div>

                        {/* Latency Waterfall Bar */}
                        {!executing && res.responseTime > 0 && (
                          <div
                            style={{
                              position: 'absolute',
                              left: 0,
                              top: 0,
                              bottom: 0,
                              width: `${relativeWidth}%`,
                              backgroundColor: tint(TONE_BAR(res), 3),
                              borderRight: `1.5px solid ${tint(TONE_BAR(res), 12)}`,
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

        {hiddenCount > 0 && (
          <button type="button" className="btn btn--ghost" style={{ alignSelf: 'center', fontSize: '12px' }} onClick={() => setVisibleCount((n) => n + ITERATION_PAGE)}>
            {hiddenCount.toLocaleString()} more iterations · Show {Math.min(ITERATION_PAGE, hiddenCount)} more
          </button>
        )}

        {results.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-tertiary)', fontSize: '12px', border: '1px dashed var(--border-primary)', borderRadius: 'var(--radius-lg)' }}>
            Preparing step execution...
          </div>
        )}
      </div>
    </div>
  );
}
