import { useState, useRef, useEffect } from 'react';
import { useBucketStore } from '@/stores/bucketStore';
import {
  BucketIcon,
  PlusIcon,
  EditIcon,
  TrashIcon,
  InboxIcon,
  SaveIcon,
  XIcon,
  GridIcon,
  ListIcon,
  PlayIcon,
} from '@/components/common/Icons';
import { PromptDialog } from '@/components/common/PromptDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useToastStore } from '@/stores/toastStore';
import { useExecutionStore } from '@/stores/executionStore';
import type { TestBucket } from '@fortest/types';
const JSON_TEMPLATE = `{
  "name": "Sample Gateway API",
  "baseUrl": "https://api.example.com",
  "variables": [
    {
      "key": "env",
      "value": "staging",
      "enabled": true
    }
  ],
  "actionGroups": [
    {
      "name": "User Authentication",
      "description": "Authenticate user and fetch profile info",
      "order": 0,
      "steps": [
        {
          "name": "Login Request",
          "order": 0,
          "method": "POST",
          "path": "/auth/login",
          "headers": [
            { "key": "Content-Type", "value": "application/json", "enabled": true }
          ],
          "body": {
            "type": "json",
            "content": "{\\n  \\"email\\": \\"user@example.com\\",\\n  \\"password\\": \\"securepassword\\"\\n}"
          },
          "extractions": [
            {
              "variableName": "accessToken",
              "source": "body",
              "selector": "data.token"
            }
          ],
          "assertions": [
            {
              "target": "status",
              "operator": "equals",
              "expected": "200"
            }
          ]
        },
        {
          "name": "Get Profile",
          "order": 1,
          "method": "GET",
          "path": "/users/me",
          "headers": [
            { "key": "Authorization", "value": "Bearer {{steps.Login Request.accessToken}}", "enabled": true }
          ],
          "extractions": [],
          "assertions": [
            {
              "target": "status",
              "operator": "equals",
              "expected": "200"
            }
          ]
        }
      ]
    }
  ]
}`;

const YAML_TEMPLATE = `name: Sample Gateway API
baseUrl: https://api.example.com
variables:
  - key: env
    value: staging
    enabled: true
actionGroups:
  - name: User Authentication
    description: Authenticate user and fetch profile info
    order: 0
    steps:
      - name: Login Request
        order: 0
        method: POST
        path: /auth/login
        headers:
          - key: Content-Type
            value: application/json
            enabled: true
        body:
          type: json
          content: |
            {
              "email": "user@example.com",
              "password": "securepassword"
            }
        extractions:
          - variableName: accessToken
            source: body
            selector: data.token
        assertions:
          - target: status
            operator: equals
            expected: "200"
      - name: Get Profile
        order: 1
        method: GET
        path: /users/me
        headers:
          - key: Authorization
            value: Bearer {{steps.Login Request.accessToken}}
            enabled: true
        extractions: []
        assertions:
          - target: status
            operator: equals
            expected: "200"`;

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
    if (dialogState.type !== null) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [dialogState.type]);

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

  const handleDownloadTemplate = (format: 'json' | 'yaml') => {
    const filename = `fortest-template.${format}`;
    const content = format === 'json' ? JSON_TEMPLATE : YAML_TEMPLATE;
    const mimeType = format === 'json' ? 'application/json' : 'text/yaml';
    
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addToast(`Template ${filename} downloaded successfully`, 'success');
  };

  const handleFileImportChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
    // Reset so choosing the same file again still fires onChange.
    e.target.value = '';
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const handleImportSubmit = async () => {
    if (!selectedFile) return;
    setIsImporting(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const ext = selectedFile.name.split('.').pop()?.toLowerCase();
      const format = ext === 'yaml' || ext === 'yml' ? 'yaml' : 'json';

      try {
        const result = await importBucket(text, format);

        if (result.source === 'postman') {
          addToast(`Postman collection "${selectedFile.name}" imported successfully`, 'success');
        } else {
          addToast(`Bucket "${selectedFile.name}" imported successfully`, 'success');
        }

        // Show any conversion warnings as info toasts
        if (result.warnings && result.warnings.length > 0) {
          for (const warning of result.warnings.slice(0, 5)) {
            addToast(warning, 'warning');
          }
          if (result.warnings.length > 5) {
            addToast(`...and ${result.warnings.length - 5} more warnings`, 'warning');
          }
        }

        setDialogState({ type: null });
        setSelectedFile(null);
      } catch (err: any) {
        addToast(err.message || 'Failed to import bucket', 'error');
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(selectedFile);
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <h1 className="dashboard-hub__title">API Test Orchestration Hub</h1>
            <p className="dashboard-hub__subtitle">
              Configure test buckets, chain HTTP requests in action flows, and watch performance metrics run in real-time.
            </p>
          </div>
          
          {buckets.length > 0 && (
            <div className="dashboard-hub__view-switcher">
              <button
                type="button"
                className={`dashboard-hub__view-btn ${viewMode === 'grid' ? 'dashboard-hub__view-btn--active' : ''}`}
                onClick={() => handleToggleView('grid')}
                title="Grid View"
                aria-label="Grid View"
              >
                <GridIcon size={16} />
              </button>
              <button
                type="button"
                className={`dashboard-hub__view-btn ${viewMode === 'list' ? 'dashboard-hub__view-btn--active' : ''}`}
                onClick={() => handleToggleView('list')}
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
          <p>Click the floating action button in the bottom right corner to create or import a test bucket and begin configuration.</p>
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
                    title="Run Action Group"
                    aria-label="Run Action Group"
                    style={{ color: 'var(--accent-primary)' }}
                    onClick={() => handleRunBucket(bucket)}
                  >
                    <PlayIcon size={14} />
                  </button>
                  <button
                    className="btn btn--icon"
                    title="Export Bucket"
                    aria-label="Export Bucket"
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
                    aria-label="Rename Bucket"
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
                    aria-label="Delete Bucket"
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
      ) : (
        <div className="dashboard-hub__list">
        {/* Bucket List Items (List) */}
        {buckets.map((bucket) => {
          const groupCount = bucket.actionGroups?.length || 0;
          const totalSteps = bucket.actionGroups?.reduce((acc, curr) => acc + (curr.steps?.length || 0), 0) || 0;

          return (
            <div
              key={bucket.id}
              className="bucket-list-item"
              onClick={() => setActiveBucket(bucket.id)}
            >
              <div className="bucket-list-item__left">
                <BucketIcon size={20} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                <div className="bucket-list-item__title-group">
                  <span className="bucket-list-item__title">{bucket.name}</span>
                  {bucket.baseUrl ? (
                    <span className="bucket-list-item__url">{bucket.baseUrl}</span>
                  ) : (
                    <span className="bucket-list-item__url-empty">No base URL configured</span>
                  )}
                </div>
              </div>

              <div className="bucket-list-item__right">
                <div className="bucket-list-item__meta">
                  <span className="bucket-list-item__badge">
                    {groupCount} {groupCount === 1 ? 'Group' : 'Groups'}
                  </span>
                  <span className="bucket-list-item__badge">
                    {totalSteps} {totalSteps === 1 ? 'Step' : 'Steps'}
                  </span>
                </div>

                <div className="bucket-list-item__actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="btn btn--icon"
                    title="Run Action Group"
                    aria-label="Run Action Group"
                    style={{ color: 'var(--accent-primary)' }}
                    onClick={() => handleRunBucket(bucket)}
                  >
                    <PlayIcon size={14} />
                  </button>
                  <button
                    className="btn btn--icon"
                    title="Export Bucket"
                    aria-label="Export Bucket"
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
                    aria-label="Rename Bucket"
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
                    aria-label="Delete Bucket"
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

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.yaml,.yml"
        onChange={handleFileImportChange}
        style={{ display: 'none' }}
      />

      {/* Floating Action Button (FAB) Dial Menu */}
      {isFabOpen && (
        <div
          className="dashboard-hub__fab-overlay"
          onClick={() => setIsFabOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 999,
            backgroundColor: 'transparent',
          }}
        />
      )}

      <div className={`dashboard-hub__fab-container ${isFabOpen ? 'dashboard-hub__fab-container--open' : ''}`}>
        {/* Option: Create Bucket */}
        <button
          className="dashboard-hub__fab-option dashboard-hub__fab-option--create"
          onClick={() => {
            setIsFabOpen(false);
            setDialogState({ type: 'createBucket' });
          }}
          title="Create Bucket"
          aria-label="Create Bucket"
        >
          <PlusIcon size={20} />
          <span className="dashboard-hub__fab-label">Create Bucket</span>
        </button>

        {/* Option: Import Bucket */}
        <button
          className="dashboard-hub__fab-option dashboard-hub__fab-option--import"
          onClick={() => {
            setIsFabOpen(false);
            setDialogState({ type: 'importBucket' });
          }}
          title="Import Bucket"
          aria-label="Import Bucket"
        >
          <InboxIcon size={20} />
          <span className="dashboard-hub__fab-label">Import Bucket</span>
        </button>

        {/* Main Trigger Button */}
        <button
          className={`dashboard-hub__fab-trigger ${isFabOpen ? 'dashboard-hub__fab-trigger--open' : ''}`}
          onClick={() => setIsFabOpen(!isFabOpen)}
          title={isFabOpen ? 'Close Menu' : 'Add or Import Bucket'}
          aria-label={isFabOpen ? 'Close Menu' : 'Add or Import Bucket'}
        >
          {isFabOpen ? <XIcon size={24} /> : <BucketIcon size={24} />}
        </button>
      </div>

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

      {dialogState.type === 'runSelector' && dialogState.actionGroups && (
        <div className="modal-overlay" onClick={() => setDialogState({ type: null })}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ position: 'relative', maxWidth: '400px', width: '100%' }}
          >
            <button
              type="button"
              className="modal-close-btn"
              onClick={() => setDialogState({ type: null })}
              title="Close"
            >
              <XIcon size={16} />
            </button>

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
                      .then(() => {
                        addToast(`Run for "${g.name}" started in background`, 'success');
                      })
                      .catch((err) => {
                        addToast(err.message || 'Failed to start background execution', 'error');
                      });
                    setDialogState({ type: null });
                  }}
                >
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{g.name}</span>
                  <PlayIcon size={12} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {dialogState.type === 'exportBucket' && dialogState.bucketId && dialogState.bucketName && (
        <div className="modal-overlay" onClick={() => setDialogState({ type: null })}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ position: 'relative' }}>
            <button
              type="button"
              className="modal-close-btn"
              onClick={() => setDialogState({ type: null })}
              title="Close"
            >
              <XIcon size={16} />
            </button>
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

      {dialogState.type === 'importBucket' && (
        <div className="modal-overlay" onClick={() => {
          if (!isImporting) {
            setDialogState({ type: null });
            setSelectedFile(null);
          }
        }}>
          <div className="modal-content import-modal" onClick={(e) => e.stopPropagation()} style={{ position: 'relative' }}>
            <button
              type="button"
              className="modal-close-btn"
              onClick={() => {
                if (!isImporting) {
                  setDialogState({ type: null });
                  setSelectedFile(null);
                }
              }}
              title="Close"
              disabled={isImporting}
            >
              <XIcon size={16} />
            </button>
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
                    onDragEnter={handleDragEnter}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
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
                        <span className="import-file-details__badge">
                          {selectedFile.name.split('.').pop()?.toLowerCase()}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="import-file-details__clear"
                      onClick={() => setSelectedFile(null)}
                      title="Remove file"
                    >
                      <TrashIcon size={16} />
                    </button>
                  </div>
                )}

                <div className="modal-actions" style={{ marginTop: '24px' }}>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => {
                      setDialogState({ type: null });
                      setSelectedFile(null);
                    }}
                    disabled={isImporting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={handleImportSubmit}
                    disabled={!selectedFile || isImporting}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
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
                  <button
                    className={`import-guide__tab ${templateTab === 'json' ? 'import-guide__tab--active' : ''}`}
                    onClick={() => setTemplateTab('json')}
                  >
                    JSON Template
                  </button>
                  <button
                    className={`import-guide__tab ${templateTab === 'yaml' ? 'import-guide__tab--active' : ''}`}
                    onClick={() => setTemplateTab('yaml')}
                  >
                    YAML Template
                  </button>
                </div>

                <div className="import-guide__preview-container">
                  <pre className="import-guide__preview">
                    <code>{templateTab === 'json' ? JSON_TEMPLATE : YAML_TEMPLATE}</code>
                  </pre>
                </div>

                <button
                  type="button"
                  className="btn btn--secondary"
                  style={{ width: '100%', marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  onClick={() => handleDownloadTemplate(templateTab)}
                >
                  <SaveIcon size={14} />
                  Download {templateTab.toUpperCase()} Template
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
