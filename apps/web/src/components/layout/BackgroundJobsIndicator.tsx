import { useState, useRef, useEffect } from 'react';
import { useExecutionStore, BackgroundJob } from '@/stores/executionStore';
import { useBucketStore } from '@/stores/bucketStore';
import { PlayIcon, CheckCircleIcon, XIcon, AlertCircleIcon, LayersIcon } from '../common/Icons';

export function BackgroundJobsIndicator() {
  const { backgroundJobs, viewHistoricalRun, removeBackgroundJob } = useExecutionStore();
  const { setActiveBucket, setActiveGroup } = useBucketStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeJobs = backgroundJobs.filter((j) => j.status === 'running');

  // Close dropdown on click outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  const handleInspect = async (job: BackgroundJob) => {
    setActiveBucket(job.bucketId);
    setActiveGroup(job.actionGroupId);
    await viewHistoricalRun(job.runId);
    setIsOpen(false);
  };

  const getStatusColor = (status: BackgroundJob['status']) => {
    switch (status) {
      case 'running':
        return 'var(--accent-primary)';
      case 'completed':
        return 'var(--status-2xx)';
      case 'failed':
        return 'var(--status-5xx)';
    }
  };

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      <button
        type="button"
        className={`btn ${activeJobs.length > 0 ? 'btn--primary' : 'btn--ghost'}`}
        style={{
          fontSize: '12px',
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          borderRadius: 'var(--radius-md)',
          position: 'relative',
        }}
        onClick={() => setIsOpen(!isOpen)}
        title="Background Execution Runs"
      >
        {activeJobs.length > 0 ? (
          <>
            <span className="spinner-mini" style={{ width: '10px', height: '10px', borderWidth: '1.5px', borderTopColor: 'currentColor' }} />
            <span>{activeJobs.length} Running</span>
          </>
        ) : (
          <>
            <PlayIcon size={13} style={{ transform: 'rotate(90deg)' }} />
            <span>Runs History</span>
          </>
        )}
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '320px',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 100,
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-primary)', paddingBottom: '8px' }}>
            <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>Background Runs</span>
            {activeJobs.length > 0 && (
              <span className="badge" style={{ backgroundColor: 'color-mix(in srgb, var(--accent-primary) 8%, transparent)', color: 'var(--accent-primary)', fontSize: '10px' }}>
                {activeJobs.length} active
              </span>
            )}
          </div>

          {backgroundJobs.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '11px', padding: '16px 0' }}>
              No recent background execution runs.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '260px', overflowY: 'auto', overscrollBehavior: 'contain', paddingRight: '4px' }}>
              {backgroundJobs.map((job) => (
                <div
                  key={job.runId}
                  style={{
                    padding: '8px',
                    border: '1px solid var(--border-primary)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-primary)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    fontSize: '12px',
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                      <LayersIcon size={12} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                      <span
                        style={{
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={job.actionGroupName}
                      >
                        {job.actionGroupName}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          backgroundColor: getStatusColor(job.status),
                        }}
                      />
                      <button
                        type="button"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-tertiary)',
                          padding: 0,
                          marginLeft: '4px',
                        }}
                        onClick={() => removeBackgroundJob(job.runId)}
                        title="Dismiss"
                      >
                        <XIcon size={10} />
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {job.status === 'running' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ width: '100%', height: '4px', backgroundColor: 'var(--border-primary)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${job.progress}%`,
                            height: '100%',
                            backgroundColor: 'var(--accent-primary)',
                            transition: 'width var(--transition-normal) ease-in-out',
                          }}
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-tertiary)' }}>
                        <span>{job.progress}% Complete</span>
                        <span>{job.completedSteps}/{job.totalSteps} steps</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 500,
                          color: job.status === 'completed' ? 'var(--status-2xx)' : 'var(--status-5xx)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                      >
                        {job.status === 'completed' ? (
                          <>
                            <CheckCircleIcon size={10} /> Passed
                          </>
                        ) : (
                          <>
                            <AlertCircleIcon size={10} /> Failed
                          </>
                        )}
                      </span>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        style={{ fontSize: '10px', padding: '2px 6px', height: 'auto' }}
                        onClick={() => handleInspect(job)}
                      >
                        Inspect
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
