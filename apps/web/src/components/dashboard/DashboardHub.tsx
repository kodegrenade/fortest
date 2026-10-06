import { useState, useRef, useEffect } from 'react';
import { useBucketStore } from '@/stores/bucketStore';
import {
  BucketIcon,
  PlusIcon,
  EditIcon,
  TrashIcon,
  InboxIcon,
  SaveIcon,
  GridIcon,
  ListIcon,
  PlayIcon,
} from '@/components/common/Icons';
import { PromptDialog } from '@/components/common/PromptDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useToastStore } from '@/stores/toastStore';
import { useExecutionStore } from '@/stores/executionStore';
import type { RunSummary, TestBucket } from '@fortest/types';
import { Modal } from '@/components/common/Modal';
// Also checked by the API tests, so they always import cleanly.
import JSON_TEMPLATE from '@/templates/fortest-template.json?raw';
import YAML_TEMPLATE from '@/templates/fortest-template.yaml?raw';
import { displayBaseUrl } from '@/utils/variableParser';
import { relativeTime, runTone, runVerdict, toneBadge, VERDICT_LABEL } from '@/utils/results';
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
  const startRun = useExecutionStore((s) => s.startRun);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isFabOpen, setIsFabOpen] = useState(false);
  const fabRef = useRef<HTMLDivElement>(null);
  const [latestRuns, setLatestRuns] = useState<Record<string, RunSummary>>({});
  // Changes whenever a background run finishes, so the hub's "last run" refreshes.
  const finishedJobs = useExecutionStore((s) => s.backgroundJobs.filter((j) => j.status !== 'running').length);
  const [dialogState, setDialogState] = useState<{
    type: 'createBucket' | 'renameBucket' | 'deleteBucket' | 'exportBucket' | 'importBucket' | 'runSelector' | null;
    bucketId?: string;
    initialValue?: string;
    bucketName?: string;
    actionGroups?: { id: string; name: string }[];
  }>({ type: null });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [templateTab, setTemplateTab] = useState<'json' | 'yaml'>('json');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    const saved = localStorage.getItem('dashboard-view');
    return saved === 'list' ? 'list' : 'grid';
  });

  const handleToggleView = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('dashboard-view', mode);
  };

  useEffect(() => {
    fetch('/api/runs/latest')
      .then((res) => (res.ok ? res.json() : {}))
      .then(setLatestRuns)
      .catch(() => {}); // the hub works without it; the column just stays empty
  }, [buckets.length, finishedJobs]);

  // Open menu: focus its first option; Escape or a click elsewhere closes it.
  useEffect(() => {
    if (!isFabOpen) return;
    fabRef.current?.querySelector<HTMLButtonElement>('.dashboard-hub__fab-option')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setIsFabOpen(false);
      fabRef.current?.querySelector<HTMLButtonElement>('.dashboard-hub__fab-trigger')?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      if (!fabRef.current?.contains(e.target as Node)) setIsFabOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [isFabOpen]);

  // Shortcuts on the hub: N creates a bucket, I imports one (not while typing or in a dialog).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || dialogState.type) return;
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"], dialog')) return;
      const type = e.key === 'n' ? 'createBucket' : e.key === 'i' ? 'importBucket' : null;
      if (!type) return;
      e.preventDefault();
      setIsFabOpen(false);
      setDialogState({ type });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dialogState.type]);

  // Cards and rows open on Enter/Space too (only when they, not a button inside, have focus).
  const openOnKey = (bucketId: string) => (e: React.KeyboardEvent) => {
    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setActiveBucket(bucketId);
    }
  };

  // List view: most recently run first; buckets never run keep their order after them.
  const lastRunAt = (bucket: TestBucket) => latestRuns[bucket.id]?.createdAt ?? '';
  const bucketsByLastRun = [...buckets].sort((a, b) => lastRunAt(b).localeCompare(lastRunAt(a)));

  const validateAndSetFile = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (file.size > 10 * 1024 * 1024) {
      addToast('File is too large. The maximum import size is 10MB.', 'error');
    } else if (ext === 'json' || ext === 'yaml' || ext === 'yml') {
      setSelectedFile(file);
    } else {
      addToast('Unsupported file type. Please upload a .json, .yaml, or .yml file.', 'error');
    }
  };

  const handleFileImportChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
    // Reset so choosing the same file again still fires onChange.
    e.target.value = '';
  };

  const dragHandler = (dragging: boolean) => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(dragging);
  };

  const handleDrop = (e: React.DragEvent) => {
    dragHandler(false)(e);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const handleImportSubmit = async () => {
    if (!selectedFile) return;
    setIsImporting(true);

    const ext = selectedFile.name.split('.').pop()?.toLowerCase();
    const format = ext === 'yaml' || ext === 'yml' ? 'yaml' : 'json';

    try {
      const result = await importBucket(await selectedFile.text(), format);
      addToast(
        `${result.source === 'postman' ? 'Postman collection' : 'Bucket'} "${selectedFile.name}" imported successfully`,
        'success',
      );

      // Show any conversion warnings
      for (const warning of result.warnings.slice(0, 5)) addToast(warning, 'warning');
      if (result.warnings.length > 5) addToast(`...and ${result.warnings.length - 5} more warnings`, 'warning');

      setDialogState({ type: null });
      setSelectedFile(null);
    } catch (err: any) {
      addToast(err.message || 'Failed to import bucket', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const template = templateTab === 'json' ? JSON_TEMPLATE : YAML_TEMPLATE;

  const closeImport = () => {
    if (isImporting) return;
    setDialogState({ type: null });
    setSelectedFile(null);
  };

  const handleRunBucket = (bucket: TestBucket) => {
    const groups = bucket.actionGroups || [];
    if (groups.length === 0) {
      addToast(`This bucket has no action groups. Create an action group first.`, 'error');
      return;
    }

    if (groups.length === 1 && groups[0]) {
      const firstGroup = groups[0];
      startRun(bucket.id, firstGroup.id, undefined, firstGroup.name)
        .then(() => {
          addToast(`Run for "${firstGroup.name}" started in background`, 'success');
        })
        .catch((err) => {
          addToast(err.message || 'Failed to start background execution', 'error');
        });
      return;
    }

    // Multiple action groups: open selector
    setDialogState({
      type: 'runSelector',
      bucketId: bucket.id,
      bucketName: bucket.name,
      actionGroups: groups.map((g) => ({ id: g.id, name: g.name })),
    });
  };

  const attempt = async (action: () => Promise<void>, success: string, failure: string) => {
    try {
      await action();
      addToast(success, 'success');
    } catch (err: any) {
      addToast(err.message || failure, 'error');
    }
    setDialogState({ type: null });
  };

  // The same four actions in grid and list views.
  const bucketActions = (bucket: TestBucket, className: string) => (
    <div className={className} onClick={(e) => e.stopPropagation()}>
      <button className="btn btn--icon" title="Run Action Group" aria-label="Run Action Group" style={{ color: 'var(--accent-primary)' }} onClick={() => handleRunBucket(bucket)}>
        <PlayIcon size={14} />
      </button>
      <button className="btn btn--icon" title="Export Bucket" aria-label="Export Bucket" onClick={() => setDialogState({ type: 'exportBucket', bucketId: bucket.id, bucketName: bucket.name })}>
        <SaveIcon size={14} />
      </button>
      <button className="btn btn--icon" title="Rename Bucket" aria-label="Rename Bucket" onClick={() => setDialogState({ type: 'renameBucket', bucketId: bucket.id, initialValue: bucket.name })}>
        <EditIcon size={14} />
      </button>
      <button className="btn btn--icon" title="Delete Bucket" aria-label="Delete Bucket" style={{ color: 'var(--method-delete)' }} onClick={() => setDialogState({ type: 'deleteBucket', bucketId: bucket.id })}>
        <TrashIcon size={14} />
      </button>
    </div>
  );

  return (
    <div className="dashboard-hub">
      {/* Header */}
      <div className="dashboard-hub__header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <h1 className="dashboard-hub__title">Buckets</h1>
            <p className="dashboard-hub__subtitle">
              One bucket per API: its base URL, auth and variables, and the action groups that test it.
            </p>
          </div>
          
          {buckets.length > 0 && (
            <div className="dashboard-hub__view-switcher">
              <button
                type="button"
                className={`dashboard-hub__view-btn ${viewMode === 'grid' ? 'dashboard-hub__view-btn--active' : ''}`}
                onClick={() => handleToggleView('grid')}
                aria-pressed={viewMode === 'grid'}
                title="Grid View"
                aria-label="Grid View"
              >
                <GridIcon size={16} />
              </button>
              <button
                type="button"
                className={`dashboard-hub__view-btn ${viewMode === 'list' ? 'dashboard-hub__view-btn--active' : ''}`}
                onClick={() => handleToggleView('list')}
                aria-pressed={viewMode === 'list'}
                title="List View"
                aria-label="List View"
              >
                <ListIcon size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {isLoading && buckets.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px', gap: '12px', color: 'var(--text-secondary)' }}>
          <div className="spinner"></div>
          <span style={{ fontSize: '14px', fontWeight: 500 }}>Loading buckets...</span>
        </div>
      ) : buckets.length === 0 ? (
        <div className="dashboard-hub__empty-state">
          <BucketIcon size={48} style={{ color: 'var(--text-tertiary)', marginBottom: '16px' }} />
          <h3>No Test Buckets Found</h3>
          <p>Create a bucket for the API you want to test, or import a Fortest file or Postman collection.</p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button type="button" className="btn btn--primary" onClick={() => setDialogState({ type: 'createBucket' })}>
              <PlusIcon size={14} /> Create Bucket
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => setDialogState({ type: 'importBucket' })}>
              <InboxIcon size={14} /> Import
            </button>
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="dashboard-hub__grid">
        {/* Bucket Cards (Grid) */}
        {buckets.map((bucket) => {
          const groupCount = bucket.actionGroups?.length || 0;
          const totalSteps = bucket.actionGroups?.reduce((acc, curr) => acc + (curr.steps?.length || 0), 0) || 0;

          return (
            <div
              key={bucket.id}
              className="bucket-card"
              role="button"
              tabIndex={0}
              aria-label={`Open ${bucket.name}`}
              onClick={() => setActiveBucket(bucket.id)}
              onKeyDown={openOnKey(bucket.id)}
            >
              <div className="bucket-card__header">
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                  <span className="bucket-card__title">{bucket.name}</span>
                  {bucket.baseUrl ? (
                    <span className="bucket-card__url" title={bucket.baseUrl}>{displayBaseUrl(bucket)}</span>
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

                {bucketActions(bucket, 'bucket-card__actions')}
              </div>
            </div>
          );
        })}
      </div>
      ) : (
        <div className="dashboard-hub__list">
        {/* Bucket List Items (List): the dense view, most recently run first */}
        {bucketsByLastRun.map((bucket) => {
          const groupCount = bucket.actionGroups?.length || 0;
          const totalSteps = bucket.actionGroups?.reduce((acc, curr) => acc + (curr.steps?.length || 0), 0) || 0;
          const lastRun = latestRuns[bucket.id];
          const verdict = lastRun && runVerdict(lastRun);

          return (
            <div
              key={bucket.id}
              className="bucket-list-item"
              role="button"
              tabIndex={0}
              aria-label={`Open ${bucket.name}`}
              onClick={() => setActiveBucket(bucket.id)}
              onKeyDown={openOnKey(bucket.id)}
            >
              <div className="bucket-list-item__left">
                <BucketIcon size={20} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                <div className="bucket-list-item__title-group">
                  <span className="bucket-list-item__title">{bucket.name}</span>
                  {bucket.baseUrl ? (
                    <span className="bucket-list-item__url" title={bucket.baseUrl}>{displayBaseUrl(bucket)}</span>
                  ) : (
                    <span className="bucket-list-item__url-empty">No base URL configured</span>
                  )}
                </div>
              </div>

              <div className="bucket-list-item__right">
                <div className="bucket-list-item__last-run">
                  {lastRun && verdict ? (
                    <>
                      <span className="bucket-list-item__verdict" style={toneBadge(runTone(verdict), 12)}>
                        {VERDICT_LABEL[verdict]}
                      </span>
                      <span title={`${lastRun.actionGroupName}${lastRun.environmentName ? ` · env: ${lastRun.environmentName}` : ''}`}>
                        {relativeTime(lastRun.createdAt)}
                        {lastRun.environmentName && <span className="bucket-list-item__env"> · {lastRun.environmentName}</span>}
                      </span>
                    </>
                  ) : (
                    <span>Never run</span>
                  )}
                </div>
                <div className="bucket-list-item__meta">
                  <span className="bucket-list-item__badge">
                    {groupCount} {groupCount === 1 ? 'Group' : 'Groups'}
                  </span>
                  <span className="bucket-list-item__badge">
                    {totalSteps} {totalSteps === 1 ? 'Step' : 'Steps'}
                  </span>
                </div>

                {bucketActions(bucket, 'bucket-list-item__actions')}
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.yaml,.yml"
        onChange={handleFileImportChange}
        style={{ display: 'none' }}
      />

      {/* Floating Action Button (FAB) Speed Dial */}
      <div ref={fabRef} className={`dashboard-hub__fab-container ${isFabOpen ? 'dashboard-hub__fab-container--open' : ''}`}>
        <button
          type="button"
          className="dashboard-hub__fab-option dashboard-hub__fab-option--create"
          onClick={() => {
            setIsFabOpen(false);
            setDialogState({ type: 'createBucket' });
          }}
          aria-label="Create Bucket (N)"
        >
          <PlusIcon size={20} />
          <span className="dashboard-hub__fab-label" aria-hidden="true">
            Create Bucket <kbd>N</kbd>
          </span>
        </button>

        <button
          type="button"
          className="dashboard-hub__fab-option dashboard-hub__fab-option--import"
          onClick={() => {
            setIsFabOpen(false);
            setDialogState({ type: 'importBucket' });
          }}
          aria-label="Import Bucket (I)"
        >
          <InboxIcon size={20} />
          <span className="dashboard-hub__fab-label" aria-hidden="true">
            Import Bucket <kbd>I</kbd>
          </span>
        </button>

        <button
          type="button"
          className={`dashboard-hub__fab-trigger ${isFabOpen ? 'dashboard-hub__fab-trigger--open' : ''}`}
          onClick={() => setIsFabOpen(!isFabOpen)}
          title={isFabOpen ? 'Close menu' : 'Create or import a bucket'}
          aria-label={isFabOpen ? 'Close menu' : 'Create or import a bucket'}
          aria-expanded={isFabOpen}
        >
          <PlusIcon size={24} />
        </button>
      </div>

      {/* Modals */}
      {(dialogState.type === 'createBucket' || dialogState.type === 'renameBucket') && (
        <PromptDialog
          title={dialogState.type === 'createBucket' ? 'Create Test Bucket' : 'Rename Test Bucket'}
          placeholder={dialogState.type === 'createBucket' ? 'Service Name (e.g. Gateway API)' : 'Bucket Name'}
          submitText={dialogState.type === 'createBucket' ? 'Create' : 'Save'}
          initialValue={dialogState.initialValue}
          onConfirm={(name) =>
            dialogState.type === 'createBucket'
              ? attempt(() => createBucket(name), `Bucket "${name}" created successfully`, 'Failed to create bucket')
              : attempt(() => updateBucket(dialogState.bucketId!, { name }), `Bucket renamed to "${name}"`, 'Failed to rename bucket')
          }
          onCancel={() => setDialogState({ type: null })}
        />
      )}

      {dialogState.type === 'deleteBucket' && (
        <ConfirmDialog
          title="Delete Test Bucket"
          message="Are you sure you want to delete this test bucket? This will permanently delete all associated Action Groups and Steps."
          confirmText="Delete"
          isDanger={true}
          onConfirm={() => attempt(() => deleteBucket(dialogState.bucketId!), 'Bucket deleted successfully', 'Failed to delete bucket')}
          onCancel={() => setDialogState({ type: null })}
        />
      )}

      {dialogState.type === 'runSelector' && dialogState.actionGroups && (
        <Modal onClose={() => setDialogState({ type: null })} showCloseButton>
          <h3 className="modal-title" style={{ marginBottom: '16px' }}>Run Action Group</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Select which action group in <strong>{dialogState.bucketName}</strong> you want to execute in the background:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
            {dialogState.actionGroups.map((g) => (
              <button
                key={g.id}
                type="button"
                className="btn btn--ghost"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: '12px',
                  textAlign: 'left',
                  borderRadius: 'var(--radius-md)',
                }}
                onClick={() => {
                  startRun(dialogState.bucketId!, g.id, undefined, g.name)
                    .then(() => addToast(`Run for "${g.name}" started in background`, 'success'))
                    .catch((err) => addToast(err.message || 'Failed to start background execution', 'error'));
                  setDialogState({ type: null });
                }}
              >
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{g.name}</span>
                <PlayIcon size={12} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
              </button>
            ))}
          </div>
        </Modal>
      )}

      {dialogState.type === 'exportBucket' && dialogState.bucketId && (
        <Modal onClose={() => setDialogState({ type: null })} showCloseButton>
          <h3 className="modal-title">Export "{dialogState.bucketName}"</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '13px', lineHeight: 1.5 }}>
            Choose a file format to export this test bucket. The exported file will contain the complete bucket state, including variables, action groups, timeline steps, extractions, and test assertions.
          </p>
          <div className="modal-actions">
            <button type="button" className="btn btn--ghost" onClick={() => setDialogState({ type: null })}>
              Cancel
            </button>
            {(['yaml', 'json'] as const).map((format) => (
              <a
                key={format}
                className={`btn ${format === 'json' ? 'btn--primary' : 'btn--secondary'}`}
                href={`/api/buckets/${dialogState.bucketId}/export?format=${format}`}
                download
                onClick={() => {
                  addToast(`Exporting "${dialogState.bucketName}" as ${format.toUpperCase()}...`, 'info');
                  setDialogState({ type: null });
                }}
              >
                Export {format.toUpperCase()}
              </a>
            ))}
          </div>
        </Modal>
      )}

      {dialogState.type === 'importBucket' && (
        <Modal onClose={closeImport} showCloseButton className="import-modal">
          <div className="import-modal__split">
            {/* Left Panel: Upload area */}
            <div className="import-modal__upload-panel">
              <h3 className="modal-title">Import Test Bucket</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '13px', lineHeight: 1.5 }}>
                Select or drag and drop a configuration file. Supports Fortest bucket files (`.json`, `.yaml`, `.yml`) and <strong>Postman Collection exports</strong> (`.json`).
              </p>

              {!selectedFile ? (
                <div
                  className={`import-drop-zone ${isDragging ? 'import-drop-zone--dragging' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragEnter={dragHandler(true)}
                  onDragOver={dragHandler(true)}
                  onDragLeave={dragHandler(false)}
                  onDrop={handleDrop}
                >
                  <InboxIcon size={36} style={{ color: 'var(--accent-primary)', marginBottom: '4px' }} />
                  <span className="import-drop-zone__title">Drag & drop file here, or click to browse</span>
                  <span className="import-drop-zone__sub">Supports JSON or YAML (max 10MB)</span>
                </div>
              ) : (
                <div className="import-file-details">
                  <div className="import-file-details__icon">
                    <SaveIcon size={24} />
                  </div>
                  <div className="import-file-details__info">
                    <span className="import-file-details__name">{selectedFile.name}</span>
                    <div className="import-file-details__meta">
                      <span>{(selectedFile.size / 1024).toFixed(1)} KB</span>
                      <span className="import-file-details__badge">{selectedFile.name.split('.').pop()?.toLowerCase()}</span>
                    </div>
                  </div>
                  <button type="button" className="import-file-details__clear" onClick={() => setSelectedFile(null)} title="Remove file">
                    <TrashIcon size={16} />
                  </button>
                </div>
              )}

              <div className="modal-actions" style={{ marginTop: '24px' }}>
                <button type="button" className="btn btn--ghost" onClick={closeImport} disabled={isImporting}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handleImportSubmit}
                  disabled={!selectedFile || isImporting}
                >
                  {isImporting ? (
                    <>
                      <div className="spinner" style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff' }}></div>
                      Importing...
                    </>
                  ) : (
                    'Import Bucket'
                  )}
                </button>
              </div>
            </div>

            {/* Right Panel: Educational guide & templates */}
            <div className="import-modal__guide-panel">
              <h4 className="import-guide__title">Configuration Guide</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.4, margin: '0 0 16px 0' }}>
                Imported configurations must comply with the schema. You can download copy-pasteable templates below.
              </p>

              <div className="import-guide__tabs">
                {(['json', 'yaml'] as const).map((format) => (
                  <button
                    key={format}
                    className={`import-guide__tab ${templateTab === format ? 'import-guide__tab--active' : ''}`}
                    onClick={() => setTemplateTab(format)}
                  >
                    {format.toUpperCase()} Template
                  </button>
                ))}
              </div>

              <div className="import-guide__preview-container">
                <pre className="import-guide__preview">
                  <code>{template}</code>
                </pre>
              </div>

              <a
                className="btn btn--secondary"
                style={{ width: '100%', marginTop: '16px', justifyContent: 'center' }}
                href={`data:text/plain;charset=utf-8,${encodeURIComponent(template)}`}
                download={`fortest-template.${templateTab}`}
                onClick={() => addToast(`Template fortest-template.${templateTab} downloaded successfully`, 'success')}
              >
                <SaveIcon size={14} />
                Download {templateTab.toUpperCase()} Template
              </a>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
