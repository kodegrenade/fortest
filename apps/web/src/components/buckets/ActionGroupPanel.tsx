import { useState, useEffect } from 'react';
import { useBucketStore } from '@/stores/bucketStore';
import { StepEditor } from '../steps/StepEditor';
import { PlusIcon, TrashIcon, LayersIcon, ChevronLeftIcon, PlayIcon, CopyIcon } from '@/components/common/Icons';
import { PromptDialog } from '@/components/common/PromptDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { useToastStore } from '@/stores/toastStore';
import { useExecutionStore } from '@/stores/executionStore';
import { RunDashboard } from '../dashboard/RunDashboard';
import { RunConfigModal } from './RunConfigModal';
import { HistoryList } from '../dashboard/HistoryList';
import { AnalyticsCharts } from '../dashboard/AnalyticsCharts';
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
    reorderSteps,
    duplicateStep,
  } = useBucketStore();
  const { addToast } = useToastStore();
  const { activeRun, clearRun } = useExecutionStore();

  const bucket = buckets.find((b) => b.id === activeBucketId);
  const group = bucket?.actionGroups.find((g) => g.id === activeGroupId);

  const [dialogState, setDialogState] = useState<{
    type: 'createStep' | 'deleteStep' | null;
    stepId?: string;
  }>({ type: null });

  const [isRunConfigOpen, setIsRunConfigOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'steps' | 'history' | 'analytics'>('steps');

  // Drag and Drop local states
  const [draggedStepId, setDraggedStepId] = useState<string | null>(null);
  const [dragOverStepId, setDragOverStepId] = useState<string | null>(null);

  // Reset tab to steps when switching action groups
  useEffect(() => {
    setActiveTab('steps');
  }, [activeGroupId]);

  // Clear any active run when switching between action groups
  useEffect(() => {
    if (activeRun && activeRun.actionGroupId !== activeGroupId) {
      clearRun();
    }
  }, [activeGroupId, activeRun, clearRun]);

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

  const sortedSteps = [...group.steps].sort((a, b) => a.order - b.order);

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

  const handleDuplicateStep = async (stepId: string, stepName: string) => {
    if (bucket && group) {
      try {
        await duplicateStep(bucket.id, group.id, stepId);
        addToast(`Step "${stepName}" duplicated successfully`, 'success');
      } catch (err: any) {
        addToast(err.message || 'Failed to duplicate step', 'error');
      }
    }
  };

  // Drag and drop timeline handlers
  const handleDragStart = (e: React.DragEvent, stepId: string) => {
    e.dataTransfer.setData('text/plain', stepId);
    setDraggedStepId(stepId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, stepId: string) => {
    e.preventDefault();
    if (draggedStepId === stepId) return;
    setDragOverStepId(stepId);
  };

  const handleDragLeave = () => {
    setDragOverStepId(null);
  };

  const handleDragEnd = () => {
    setDraggedStepId(null);
    setDragOverStepId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetStepId: string) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId || draggedId === targetStepId) return;

    const draggedIndex = sortedSteps.findIndex((s) => s.id === draggedId);
    const targetIndex = sortedSteps.findIndex((s) => s.id === targetStepId);
    if (draggedIndex === -1 || targetIndex === -1) return;

    const newSteps = [...sortedSteps];
    const [removed] = newSteps.splice(draggedIndex, 1);
    newSteps.splice(targetIndex, 0, removed!);

    const newStepIds = newSteps.map((s) => s.id);

    try {
      await reorderSteps(bucket.id, group.id, newStepIds);
      addToast('Steps reordered successfully', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to reorder steps', 'error');
    }

    setDraggedStepId(null);
    setDragOverStepId(null);
  };

  if (activeRun) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '24px', overflow: 'hidden', backgroundColor: 'var(--bg-primary)' }}>
        <RunDashboard />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Top Navigation Header */}
      <div
        className="action-group-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border-primary)',
          padding: '12px 24px',
          backgroundColor: 'var(--bg-secondary)',
          gap: '16px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          <button
            className="btn btn--icon"
            onClick={() => setActiveGroup(null)}
            title="Back to Bucket Details"
            style={{ padding: '6px', borderRadius: 'var(--radius-md)' }}
          >
            <ChevronLeftIcon size={16} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <LayersIcon size={16} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  lineHeight: '1.2',
                }}
              >
                {group.name}
              </span>
              {group.description && (
                <span
                  style={{
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginTop: '2px',
                    lineHeight: '1.2',
                  }}
                  title={group.description}
                >
                  {group.description}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tab Selection */}
        <div
          style={{
            display: 'flex',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
            padding: '2px',
            backgroundColor: 'var(--bg-primary)',
          }}
        >
          {(['steps', 'history', 'analytics'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '6px 16px',
                fontSize: '12px',
                fontWeight: 600,
                borderRadius: 'var(--radius-sm)',
                color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-secondary)',
                backgroundColor: activeTab === tab ? 'var(--bg-hover)' : 'transparent',
                transition: 'all var(--transition-fast)',
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Header Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {sortedSteps.length > 0 && activeTab === 'steps' && (
            <button
              className="btn btn--primary"
              title="Run Action Group"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', fontSize: '12.5px', fontWeight: 600 }}
              onClick={() => setIsRunConfigOpen(true)}
            >
              <PlayIcon size={14} /> Run Flow
            </button>
          )}
        </div>
      </div>

      {/* Workspace Body */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'steps' && (
          <div className="action-group-panel" style={{ flex: 1, minHeight: 0 }}>
            {/* Step Timeline Side */}
            <div className="step-timeline-container" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div className="step-timeline-header" style={{ justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-secondary)', flexShrink: 0 }}>
                <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)' }}>
                  Steps List ({sortedSteps.length})
                </span>
                <button
                  className="btn btn--icon"
                  title="Add Test Step"
                  onClick={() => setDialogState({ type: 'createStep' })}
                >
                  <PlusIcon size={14} />
                </button>
              </div>

              <div className="step-timeline" style={{ flex: 1, overflowY: 'auto' }}>
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
                      className={`step-node ${isActive ? 'step-node--active' : ''} ${
                        draggedStepId === step.id ? 'step-node--dragging' : ''
                      } ${dragOverStepId === step.id ? 'step-node--drag-over' : ''}`}
                      style={{ cursor: draggedStepId === step.id ? 'grabbing' : 'grab' }}
                      onClick={() => setActiveStep(step.id)}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, step.id)}
                      onDragOver={(e) => handleDragOver(e, step.id)}
                      onDragLeave={handleDragLeave}
                      onDragEnd={handleDragEnd}
                      onDrop={(e) => handleDrop(e, step.id)}
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
                            title="Duplicate Step"
                            style={{ width: '24px', height: '24px', color: 'var(--text-secondary)', marginRight: '4px' }}
                            onClick={() => handleDuplicateStep(step.id, step.name)}
                          >
                            <CopyIcon size={12} />
                          </button>
                          <button
                            className="btn btn--icon"
                            title="Delete Step"
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
          </div>
        )}

        {activeTab === 'history' && (
          <HistoryList groupId={group.id} />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsCharts groupId={group.id} />
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

      {isRunConfigOpen && (
        <RunConfigModal
          isOpen={true}
          bucketId={bucket.id}
          groupId={group.id}
          onClose={() => setIsRunConfigOpen(false)}
        />
      )}
    </div>
  );
}
