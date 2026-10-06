import React, { useState, useRef } from 'react';
import type { ExecutionConfig } from '@fortest/types';
import { useBucketStore } from '@/stores/bucketStore';
import { useExecutionStore } from '@/stores/executionStore';
import { useToastStore } from '@/stores/toastStore';
import { PlayIcon, XIcon } from '@/components/common/Icons';
import { Modal } from '@/components/common/Modal';
import { parseCsv } from '@fortest/utils';

interface RunConfigModalProps {
  bucketId: string;
  groupId: string;
  onClose: () => void;
}

export function RunConfigModal({ bucketId, groupId, onClose }: RunConfigModalProps) {
  const { buckets, updateActionGroup } = useBucketStore();
  const { startRun } = useExecutionStore();
  const { addToast } = useToastStore();

  const bucket = buckets.find((b) => b.id === bucketId);
  const group = bucket?.actionGroups.find((g) => g.id === groupId);

  const [iterations, setIterations] = useState(1);
  const [concurrency, setConcurrency] = useState(1);
  const [delay, setDelay] = useState(0);
  const [useDataStore, setUseDataStore] = useState(false);

  // File states
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<{
    name: string;
    records: Record<string, any>[];
  } | null>(null);
  const [isRemovingAttachedStore, setIsRemovingAttachedStore] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!bucket || !group) return null;

  // A data store is a list of records: a JSON array of objects, or a CSV whose header row names the keys.
  const handleFileContent = (fileName: string, contentStr: string) => {
    try {
      const isCsv = fileName.toLowerCase().endsWith('.csv');
      const parsed: unknown = isCsv ? parseCsv(contentStr) : JSON.parse(contentStr);
      if (!Array.isArray(parsed)) {
        throw new Error('JSON file must contain a top-level array of records.');
      }
      if (parsed.some((item) => typeof item !== 'object' || item === null || Array.isArray(item))) {
        throw new Error('Each item in the JSON array must be a key-value object.');
      }
      if (parsed.length === 0) {
        throw new Error(isCsv ? 'The CSV has a header row but no records.' : 'The JSON array is empty.');
      }

      setUploadedFile({
        name: fileName,
        records: parsed as Record<string, any>[],
      });
      setUploadError(null);
      addToast(`Data store loaded: ${parsed.length} records parsed successfully`, 'success');
    } catch (err: any) {
      setUploadError(err.message || 'Failed to parse the file.');
      addToast(err.message || 'Failed to parse the file', 'error');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((text) => handleFileContent(file.name, text));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!/\.(json|csv)$/i.test(file.name)) {
      setUploadError('Only .json (array of records) and .csv files are supported.');
      return;
    }
    file.text().then((text) => handleFileContent(file.name, text));
  };

  const handleClearUploadedFile = () => {
    setUploadedFile(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClearExistingDataStore = () => {
    setIsRemovingAttachedStore(true);
    addToast('Data store removed. Save/Run to apply changes.', 'info');
  };

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // 1. Sync Data Store to Action Group if changed
      if (useDataStore && uploadedFile) {
        const ds = {
          id: crypto.randomUUID(),
          name: uploadedFile.name,
          records: uploadedFile.records,
          createdAt: new Date().toISOString(),
        };
        await updateActionGroup(bucketId, groupId, { dataStore: ds });
      } else if (isRemovingAttachedStore) {
        await updateActionGroup(bucketId, groupId, { dataStore: undefined });
      } else if (useDataStore && !group.dataStore) {
        addToast('Please upload a JSON or CSV file to drive iterations from a data store', 'error');
        return;
      }

      // 2. Build final execution config
      const finalConfig: ExecutionConfig = {
        mode: iterations > 1 ? 'load' : 'manual',
        iterations,
        concurrency: iterations > 1 ? concurrency : 1,
        delayBetweenSteps: delay,
        useDataStore: useDataStore && (!!uploadedFile || (!!group.dataStore && !isRemovingAttachedStore)),
      };

      // 3. Trigger run
      await startRun(bucketId, groupId, finalConfig, group.name);
      addToast('Execution run initiated successfully', 'success');
      onClose();
    } catch (err: any) {
      addToast(err.message || 'Failed to start execution run', 'error');
    }
  };

  const hasDataStoreAttached = group.dataStore && !isRemovingAttachedStore;

  return (
    <Modal onClose={onClose} style={{ maxWidth: '460px' }}>
      <form onSubmit={handleRun}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3 className="modal-title" style={{ margin: 0 }}>Configure Execution Run</h3>
          <button type="button" className="btn btn--icon" onClick={onClose}>
            <XIcon size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
          {/* Iterations */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
              Iterations
            </label>
            <input
              type="number"
              className="input"
              min={1}
              max={10000}
              value={iterations}
              onChange={(e) => {
                const val = Math.min(10000, Math.max(1, parseInt(e.target.value) || 1));
                setIterations(val);
                if (val === 1) setConcurrency(1);
              }}
            />
          </div>

          {/* Concurrency */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: iterations === 1 ? 'var(--text-tertiary)' : 'var(--text-secondary)', textTransform: 'uppercase' }}>
              Concurrency (Parallel Workers)
            </label>
            <input
              type="number"
              className="input"
              min={1}
              max={100}
              value={concurrency}
              onChange={(e) => setConcurrency(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
              disabled={iterations === 1}
              placeholder="1"
            />
          </div>

          {/* Delay */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
              Delay between steps (ms)
            </label>
            <input
              type="number"
              className="input"
              min={0}
              max={60000}
              value={delay}
              onChange={(e) => setDelay(Math.min(60000, Math.max(0, parseInt(e.target.value) || 0)))}
            />
          </div>

          {/* Data Store Toggle (Clean Switcher) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px', padding: '4px 0' }}>
            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
              Drive iterations from a Data Store
            </span>
            <label style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px', flexShrink: 0, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={useDataStore}
                onChange={(e) => setUseDataStore(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: useDataStore ? 'var(--accent-primary)' : 'var(--bg-hover)',
                transition: 'all 0.2s ease',
                borderRadius: '20px',
                border: '1px solid var(--border-primary)',
              }}>
                <span style={{
                  position: 'absolute',
                  height: '12px',
                  width: '12px',
                  left: useDataStore ? '20px' : '3px',
                  bottom: '3px',
                  backgroundColor: useDataStore ? '#ffffff' : 'var(--text-secondary)',
                  transition: 'all 0.2s ease',
                  borderRadius: '50%',
                }} />
              </span>
            </label>
          </div>

          {/* Data Store File Upload */}
          {useDataStore && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', animation: 'fadeIn 150ms ease-out' }}>
              <div style={{
                fontSize: '11px',
                lineHeight: '1.4',
                color: 'var(--text-secondary)',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 12px',
                display: 'flex',
                gap: '8px'
              }}>
                <span style={{ fontSize: '14px', flexShrink: 0 }}>💡</span>
                <div>
                  <strong>How it works:</strong> Each iteration runs the entire sequence of steps in the action group. The current record's key-values (e.g. <code>{"{{email}}"}</code>) are injected as variables available to all steps.
                </div>
              </div>

              {hasDataStoreAttached ? (
                <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all', paddingRight: '12px' }}>
                      📦 {group.dataStore?.name}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                      {group.dataStore?.records.length} records attached
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--method-delete)', flexShrink: 0 }}
                    onClick={handleClearExistingDataStore}
                  >
                    Remove
                  </button>
                </div>
              ) : uploadedFile ? (
                <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid color-mix(in srgb, var(--status-2xx) 19%, transparent)', backgroundColor: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--status-2xx)', wordBreak: 'break-all', paddingRight: '12px' }}>
                      ✓ {uploadedFile.name}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      {uploadedFile.records.length} records parsed
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    style={{ padding: '4px 8px', fontSize: '11px', flexShrink: 0 }}
                    onClick={handleClearUploadedFile}
                  >
                    Clear
                  </button>
                </div>
              ) : (
                <>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: isDragging ? '2px dashed var(--accent-primary)' : '2px dashed var(--border-primary)',
                      borderRadius: 'var(--radius-md)',
                      padding: '20px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      backgroundColor: isDragging ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      style={{ display: 'none' }}
                      accept=".json,.csv"
                      onChange={handleFileSelect}
                    />
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      Drag & drop a `.json` or `.csv` file, or <span style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>browse</span>
                    </span>
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                      A JSON array of records, or a CSV with a header row
                    </div>
                  </div>
                  {uploadError && (
                    <div style={{ fontSize: '11px', color: 'var(--status-5xx)', fontWeight: 500 }}>
                      ✕ {uploadError}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="modal-actions" style={{ borderTop: '1px solid var(--border-primary)', paddingTop: '16px' }}>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn--primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            disabled={useDataStore && !uploadedFile && !hasDataStoreAttached}
          >
            <PlayIcon size={14} /> Run Flow
          </button>
        </div>
      </form>
    </Modal>
  );
}
