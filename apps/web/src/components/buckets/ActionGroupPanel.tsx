import { useState, useEffect } from 'react';
import { useBucketStore } from '@/stores/bucketStore';
import { StepEditor } from '../steps/StepEditor';
import { PlusIcon, TrashIcon, LayersIcon, ChevronLeftIcon, PlayIcon } from '@/components/common/Icons';
import { PromptDialog } from '@/components/common/PromptDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { useToastStore } from '@/stores/toastStore';
import { useExecutionStore } from '@/stores/executionStore';
import { RunDashboard } from '../dashboard/RunDashboard';
import '../steps/Steps.css';

export function ActionGroupPanel() {
  const {
    buckets,
    activeBucketId,
    activeGroupId,
    activeStepId,
    setActiveStep,
    setActiveGroup,
    addStep,
    deleteStep,
  } = useBucketStore();
  const { addToast } = useToastStore();
  const { activeRun, startRun } = useExecutionStore();

  const bucket = buckets.find((b) => b.id === activeBucketId);
  const group = bucket?.actionGroups.find((g) => g.id === activeGroupId);

  const [dialogState, setDialogState] = useState<{
    type: 'createStep' | 'deleteStep' | null;
    stepId?: string;
  }>({ type: null });

  // Auto-select the first step if no step is active but steps exist
  useEffect(() => {
    if (group && group.steps.length > 0 && !activeStepId) {
      // Find the first step in order
      const sorted = [...group.steps].sort((a, b) => a.order - b.order);
      if (sorted[0]) {
        setActiveStep(sorted[0].id);
      }
    }
  }, [group, activeStepId, setActiveStep]);

  if (!bucket || !group) return null;

  const handleCreateStepConfirm = async (name: string) => {
    if (bucket && group) {
      try {
        await addStep(bucket.id, group.id, name);
        addToast(`Step "${name}" added successfully`, 'success');
      } catch (err: any) {
        addToast(err.message || 'Failed to add step', 'error');
      }
    }
    setDialogState({ type: null });
  };

  const handleDeleteStepConfirm = async () => {
    if (dialogState.stepId && bucket && group) {
      try {
        await deleteStep(bucket.id, group.id, dialogState.stepId);
        addToast('Step deleted successfully', 'success');
      } catch (err: any) {
        addToast(err.message || 'Failed to delete step', 'error');
      }
    }
    setDialogState({ type: null });
  };

  const handleRunFlow = async () => {
    try {
      await startRun(bucket.id, group.id);
      addToast('Execution run initiated successfully', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to start execution run', 'error');
    }
  };

  if (activeRun) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '24px', overflow: 'hidden', backgroundColor: 'var(--bg-primary)' }}>
        <RunDashboard />
      </div>
    );
  }

  const sortedSteps = [...group.steps].sort((a, b) => a.order - b.order);

  return (
    <div className="action-group-panel">
      {/* Step Timeline Side */}
      <div className="step-timeline-container">
        <div className="step-timeline-header">
          <button
            className="btn btn--icon"
            style={{ marginRight: '8px', padding: '4px' }}
            onClick={() => setActiveGroup(null)}
            title="Back to Bucket Details"
          >
            <ChevronLeftIcon size={16} />
          </button>
          <div className="step-timeline-title" style={{ flex: 1, minWidth: 0 }}>
            <LayersIcon size={16} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.name}</span>
          </div>
          
          {sortedSteps.length > 0 && (
            <button
              className="btn btn--icon"
              title="Run Action Group"
              style={{ color: 'var(--method-get)', marginRight: '6px' }}
              onClick={handleRunFlow}
            >
              <PlayIcon size={16} />
            </button>
          )}

          <button
            className="btn btn--icon"
            title="Add Test Step"
            onClick={() => setDialogState({ type: 'createStep' })}
          >
            <PlusIcon size={16} />
          </button>
        </div>

        <div className="step-timeline">
          {sortedSteps.map((step, index) => {
            const isActive = step.id === activeStepId;
            const methodClass = `step-node__method badge`;
            const methodStyle = {
              backgroundColor: `var(--accent-subtle)`,
              color: `var(--method-${step.method?.toLowerCase() || 'get'})`,
              border: `1px solid var(--border-primary)`
            };

            return (
              <div
                key={step.id}
                className={`step-node ${isActive ? 'step-node--active' : ''}`}
                onClick={() => setActiveStep(step.id)}
              >
                <div className="step-node__dot">{index + 1}</div>
                <div className="step-node__card">
                  <div className="step-node__info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className={methodClass} style={methodStyle}>
                        {step.method}
                      </span>
                      <span className="step-node__name">{step.name}</span>
                    </div>
                    <span className="step-node__path">{step.path}</span>
                  </div>

                  <div className="step-node__actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="btn btn--icon"
                      style={{ width: '24px', height: '24px', color: 'var(--method-delete)' }}
                      onClick={() => setDialogState({ type: 'deleteStep', stepId: step.id })}
                    >
                      <TrashIcon size={12} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {sortedSteps.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '32px 16px', textAlign: 'center' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                No steps in this action group yet.
              </span>
              <button
                className="btn btn--primary"
                onClick={() => setDialogState({ type: 'createStep' })}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px' }}
              >
                <PlusIcon size={14} /> Add First Step
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Step Editor / Detail Side */}
      <div style={{ height: '100%', overflow: 'hidden' }}>
        {activeStepId ? (
          <StepEditor bucketId={bucket.id} groupId={group.id} stepId={activeStepId} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '24px' }}>
            <EmptyState
              icon={<LayersIcon size={48} style={{ color: 'var(--text-tertiary)' }} />}
              title={sortedSteps.length === 0 ? "Add a test step to begin" : "No step selected"}
              description={sortedSteps.length === 0 ? "This action group is empty. Use the 'Add First Step' button in the timeline to create your first API request step." : "Click on any step in the timeline or click the '+' button to add a new request step."}
            />
          </div>
        )}
      </div>

      {/* Dialogs */}
      {dialogState.type === 'createStep' && (
        <PromptDialog
          isOpen={true}
          title="Create Test Step"
          placeholder="Step Name (e.g. GET Profile)"
          submitText="Create"
          onConfirm={handleCreateStepConfirm}
          onCancel={() => setDialogState({ type: null })}
        />
      )}

      {dialogState.type === 'deleteStep' && (
        <ConfirmDialog
          isOpen={true}
          title="Delete Test Step"
          message="Are you sure you want to delete this test step from the action group?"
          confirmText="Delete"
          isDanger={true}
          onConfirm={handleDeleteStepConfirm}
          onCancel={() => setDialogState({ type: null })}
        />
      )}
    </div>
  );
}
