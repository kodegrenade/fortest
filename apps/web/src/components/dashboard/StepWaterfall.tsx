import { useExecutionStore } from '@/stores/executionStore';
import { CheckCircleIcon, XIcon } from '@/components/common/Icons';

export function StepWaterfall() {
  const { activeRun, selectedStepId, selectStep } = useExecutionStore();

  if (!activeRun) return null;

  const results = activeRun.results || [];
  
  // Find maximum response time to compute relative bar widths
  const maxResponseTime = Math.max(...results.map((r) => r.responseTime), 1);

  const getStepStatusIcon = (status: number, statusText?: string, error?: string) => {
    if (statusText === 'Executing...') {
      return <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '1.5px' }}></div>;
    }
    if (status >= 200 && status < 300) {
      return <CheckCircleIcon size={16} style={{ color: 'var(--status-2xx)' }} />;
    }
    if (error || status >= 400 || (results.some(r => r.assertions?.some(a => !a.passed)))) {
      return <XIcon size={16} style={{ color: 'var(--status-5xx)' }} />;
    }
    return <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--text-tertiary)' }}></div>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flex: 1 }}>
      <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', paddingBottom: '4px', borderBottom: '1px solid var(--border-primary)' }}>
        Execution Pipeline
      </h3>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
        {results.map((res) => {
          const isSelected = selectedStepId === res.stepId;
          const relativeWidth = (res.responseTime / maxResponseTime) * 100;
          const isExecuting = res.statusText === 'Executing...';
          
          return (
            <div
              key={res.stepId}
              onClick={() => selectStep(res.stepId)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '8px 12px',
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
                {getStepStatusIcon(res.status, res.statusText, res.error)}
              </div>

              {/* Step Info */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', zIndex: 2, minWidth: 0 }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {res.stepName}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                  {isExecuting ? 'Running request...' : res.error ? 'Failed' : `${res.status || 'Done'} · ${res.responseTime}ms`}
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
                      ? 'hsla(145, 65%, 50%, 0.04)' 
                      : 'hsla(0, 70%, 58%, 0.04)',
                    borderRight: res.status >= 200 && res.status < 300
                      ? '1.5px solid hsla(145, 65%, 50%, 0.15)'
                      : '1.5px solid hsla(0, 70%, 58%, 0.15)',
                    zIndex: 1,
                    pointerEvents: 'none',
                    transition: 'width 0.3s ease',
                  }}
                />
              )}
            </div>
          );
        })}

        {results.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-tertiary)', fontSize: '12px' }}>
            Preparing step execution...
          </div>
        )}
      </div>
    </div>
  );
}
