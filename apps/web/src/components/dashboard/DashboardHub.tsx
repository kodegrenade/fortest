import { useState, useRef } from 'react';
import { useBucketStore } from '@/stores/bucketStore';
import {
  BucketIcon,
  PlusIcon,
  EditIcon,
  TrashIcon,
  InboxIcon,
  SaveIcon,
} from '@/components/common/Icons';
import { PromptDialog } from '@/components/common/PromptDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useToastStore } from '@/stores/toastStore';
import '../buckets/Buckets.css';

export function DashboardHub() {
  const {
    buckets,
    createBucket,
    updateBucket,
    deleteBucket,
    setActiveBucket,
    importBucket,
    isLoading,
  } = useBucketStore();
  const { addToast } = useToastStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dialogState, setDialogState] = useState<{
    type: 'createBucket' | 'renameBucket' | 'deleteBucket' | 'exportBucket' | null;
    bucketId?: string;
    initialValue?: string;
    bucketName?: string;
  }>({ type: null });

  const handleFileImportChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const ext = file.name.split('.').pop()?.toLowerCase();
      const format = ext === 'yaml' || ext === 'yml' ? 'yaml' : 'json';

      try {
        await importBucket(text, format);
        addToast(`Bucket "${file.name}" imported successfully`, 'success');
      } catch (err: any) {
        addToast(err.message || 'Failed to import bucket', 'error');
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleExportBucket = (bucketId: string, format: 'json' | 'yaml', bucketName: string) => {
    const url = `/api/buckets/${bucketId}/export?format=${format}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    addToast(`Exporting "${bucketName}" as ${format.toUpperCase()}...`, 'info');
    setDialogState({ type: null });
  };

  const handleCreateBucketConfirm = async (name: string) => {
    try {
      await createBucket(name);
      addToast(`Bucket "${name}" created successfully`, 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to create bucket', 'error');
    }
    setDialogState({ type: null });
  };

  const handleRenameBucketConfirm = async (name: string) => {
    if (dialogState.bucketId) {
      try {
        await updateBucket(dialogState.bucketId, { name });
        addToast(`Bucket renamed to "${name}"`, 'success');
      } catch (err: any) {
        addToast(err.message || 'Failed to rename bucket', 'error');
      }
    }
    setDialogState({ type: null });
  };

  const handleDeleteBucketConfirm = async () => {
    if (dialogState.bucketId) {
      try {
        await deleteBucket(dialogState.bucketId);
        addToast('Bucket deleted successfully', 'success');
      } catch (err: any) {
        addToast(err.message || 'Failed to delete bucket', 'error');
      }
    }
    setDialogState({ type: null });
  };

  return (
    <div className="dashboard-hub">
      {/* Header */}
      <div className="dashboard-hub__header">
        <h1 className="dashboard-hub__title">API Test Orchestration Hub</h1>
        <p className="dashboard-hub__subtitle">
          Configure test buckets, chain HTTP requests in action flows, and watch performance metrics run in real-time.
        </p>
      </div>

      {/* Grid */}
      {isLoading && buckets.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px', gap: '12px', color: 'var(--text-secondary)' }}>
          <div className="spinner"></div>
          <span style={{ fontSize: '14px', fontWeight: 500 }}>Loading buckets...</span>
        </div>
      ) : (
        <div className="dashboard-hub__grid">
        {/* Create Card */}
        <div
          className="bucket-card bucket-card--create"
          onClick={() => setDialogState({ type: 'createBucket' })}
        >
          <PlusIcon size={32} style={{ color: 'var(--accent-primary)' }} />
          <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-secondary)' }}>
            Create New Test Bucket
          </span>
        </div>

        {/* Import Card */}
        <div
          className="bucket-card bucket-card--create"
          onClick={() => fileInputRef.current?.click()}
          style={{ borderStyle: 'dashed', borderColor: 'var(--border-primary)' }}
        >
          <InboxIcon size={32} style={{ color: 'var(--accent-primary)' }} />
          <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-secondary)' }}>
            Import Bucket (JSON/YAML)
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.yaml,.yml"
            onChange={handleFileImportChange}
            style={{ display: 'none' }}
          />
        </div>

        {/* Bucket Cards */}
        {buckets.map((bucket) => {
          const groupCount = bucket.actionGroups?.length || 0;
          const totalSteps = bucket.actionGroups?.reduce((acc, curr) => acc + (curr.steps?.length || 0), 0) || 0;

          return (
            <div
              key={bucket.id}
              className="bucket-card"
              onClick={() => setActiveBucket(bucket.id)}
            >
              <div className="bucket-card__header">
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                  <span className="bucket-card__title">{bucket.name}</span>
                  {bucket.baseUrl ? (
                    <span className="bucket-card__url">{bucket.baseUrl}</span>
                  ) : (
                    <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px', fontStyle: 'italic' }}>
                      No base URL configured
                    </span>
                  )}
                </div>
                <BucketIcon size={24} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
              </div>

              <div className="bucket-card__meta">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                    {groupCount} {groupCount === 1 ? 'Action Group' : 'Action Groups'}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                    {totalSteps} {totalSteps === 1 ? 'Step' : 'Steps'} total
                  </span>
                </div>

                <div className="bucket-card__actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="btn btn--icon"
                    title="Export Bucket"
                    onClick={() =>
                      setDialogState({
                        type: 'exportBucket',
                        bucketId: bucket.id,
                        bucketName: bucket.name,
                      })
                    }
                  >
                    <SaveIcon size={14} />
                  </button>
                  <button
                    className="btn btn--icon"
                    title="Rename Bucket"
                    onClick={() =>
                      setDialogState({
                        type: 'renameBucket',
                        bucketId: bucket.id,
                        initialValue: bucket.name,
                      })
                    }
                  >
                    <EditIcon size={14} />
                  </button>
                  <button
                    className="btn btn--icon"
                    title="Delete Bucket"
                    style={{ color: 'var(--method-delete)' }}
                    onClick={() =>
                      setDialogState({
                        type: 'deleteBucket',
                        bucketId: bucket.id,
                      })
                    }
                  >
                    <TrashIcon size={14} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* Modals */}
      {dialogState.type === 'createBucket' && (
        <PromptDialog
          isOpen={true}
          title="Create Test Bucket"
          placeholder="Service Name (e.g. Gateway API)"
          submitText="Create"
          onConfirm={handleCreateBucketConfirm}
          onCancel={() => setDialogState({ type: null })}
        />
      )}

      {dialogState.type === 'renameBucket' && (
        <PromptDialog
          isOpen={true}
          title="Rename Test Bucket"
          placeholder="Bucket Name"
          submitText="Save"
          initialValue={dialogState.initialValue}
          onConfirm={handleRenameBucketConfirm}
          onCancel={() => setDialogState({ type: null })}
        />
      )}

      {dialogState.type === 'deleteBucket' && (
        <ConfirmDialog
          isOpen={true}
          title="Delete Test Bucket"
          message="Are you sure you want to delete this test bucket? This will permanently delete all associated Action Groups and Steps."
          confirmText="Delete"
          isDanger={true}
          onConfirm={handleDeleteBucketConfirm}
          onCancel={() => setDialogState({ type: null })}
        />
      )}

      {dialogState.type === 'exportBucket' && dialogState.bucketId && dialogState.bucketName && (
        <div className="modal-overlay" onClick={() => setDialogState({ type: null })}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Export "{dialogState.bucketName}"</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '13px', lineHeight: 1.5 }}>
              Choose a file format to export this test bucket. The exported file will contain the complete bucket state, including variables, action groups, timeline steps, extractions, and test assertions.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setDialogState({ type: null })}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => handleExportBucket(dialogState.bucketId!, 'yaml', dialogState.bucketName!)}
              >
                Export YAML
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => handleExportBucket(dialogState.bucketId!, 'json', dialogState.bucketName!)}
              >
                Export JSON
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
