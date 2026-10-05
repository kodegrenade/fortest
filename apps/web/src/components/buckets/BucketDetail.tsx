import { useState, useEffect } from 'react';
import { useBucketStore } from '@/stores/bucketStore';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  EditIcon,
  TrashIcon,
  LayersIcon,
  XIcon,
  SaveIcon,
  ClipboardIcon,
} from '@/components/common/Icons';
import { AuthFields } from '@/components/common/AuthFields';
import { ActionGroupDialogs, type GroupDialogState } from '@/components/common/ActionGroupDialogs';
import { PasteVariablesDialog } from '@/components/common/PasteVariablesDialog';
import type { BucketVariable, AuthConfig } from '@fortest/types';
import { useToastStore } from '@/stores/toastStore';

export function BucketDetail() {
  const {
    buckets,
    activeBucketId,
    updateBucket,
    setActiveGroup,
  } = useBucketStore();
  const { addToast } = useToastStore();

  const bucket = buckets.find((b) => b.id === activeBucketId);

  // Local state for form fields to allow editing before saving
  const [baseUrl, setBaseUrl] = useState('');
  const [auth, setAuth] = useState<AuthConfig>({ type: 'none' });
  const [variables, setVariables] = useState<BucketVariable[]>([]);
  const [isConfigExpanded, setIsConfigExpanded] = useState(true);

  // Sync state with active bucket. Keyed on the config fields only: other store updates
  // (e.g. adding an action group) must not wipe unsaved edits to the form.
  const configKey = bucket && JSON.stringify([bucket.id, bucket.name, bucket.baseUrl, bucket.auth, bucket.variables]);
  useEffect(() => {
    if (bucket) {
      setBaseUrl(bucket.baseUrl || '');
      setAuth(bucket.auth || { type: 'none' });
      setVariables(bucket.variables || []);
    }
  }, [configKey]);

  const [dialogState, setDialogState] = useState<{ type: GroupDialogState['type'] | 'pasteVariables' } & Omit<GroupDialogState, 'type'>>({ type: null });

  if (!bucket) return null;

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validate variables (filter out empty keys)
    const validVariables = variables.filter((v) => v.key.trim() !== '');
    try {
      await updateBucket(bucket.id, {
        baseUrl,
        auth,
        variables: validVariables,
      });
      addToast('Global configuration saved successfully', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to save configuration', 'error');
    }
  };

  const handleAddVariable = () => {
    const newVar: BucketVariable = {
      id: crypto.randomUUID(),
      key: '',
      value: '',
      enabled: true,
    };
    setVariables([...variables, newVar]);
  };

  const handleVariableChange = (id: string, field: keyof BucketVariable, val: any) => {
    setVariables(
      variables.map((v) => {
        if (v.id === id) {
          return { ...v, [field]: val };
        }
        return v;
      })
    );
  };

  const handleRemoveVariable = (id: string) => {
    setVariables(variables.filter((v) => v.id !== id));
  };

  const handleBulkAddVariables = (parsedVars: { key: string; value: string; enabled: boolean }[]) => {
    const newVars: BucketVariable[] = parsedVars.map((v) => ({
      id: crypto.randomUUID(),
      key: v.key,
      value: v.value,
      enabled: v.enabled,
    }));
    setVariables([...variables, ...newVars]);
    addToast(`Successfully added ${newVars.length} variables. Click "Save Configuration" to persist them.`, 'success');
    setDialogState({ type: null });
  };

  return (
    <div className="bucket-detail">
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
            {bucket.name}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            Configure and run sequences of tests for this API service
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <a
            className="btn btn--secondary"
            href={`/api/buckets/${bucket.id}/export?format=yaml`}
            download
            onClick={() => addToast(`Exporting "${bucket.name}" as YAML...`, 'info')}
            style={{ padding: '6px 12px', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <SaveIcon size={14} /> Export YAML
          </a>
          <a
            className="btn btn--secondary"
            href={`/api/buckets/${bucket.id}/export?format=json`}
            download
            onClick={() => addToast(`Exporting "${bucket.name}" as JSON...`, 'info')}
            style={{ padding: '6px 12px', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <SaveIcon size={14} /> Export JSON
          </a>
        </div>
      </div>

      {/* Global Config Section */}
      <div className="config-panel">
        <div 
          onClick={() => setIsConfigExpanded(!isConfigExpanded)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', cursor: 'pointer', userSelect: 'none' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isConfigExpanded ? <ChevronDownIcon size={18} /> : <ChevronRightIcon size={18} />}
            <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>Global Configuration</span>
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
            Base URL, Global Auth, and Variables
          </span>
        </div>

        {isConfigExpanded && (
          <form onSubmit={handleSaveConfig} style={{ padding: '16px', borderTop: '1px solid var(--border-primary)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Base URL */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontWeight: 500, fontSize: '12px', color: 'var(--text-secondary)' }}>Service Base URL</label>
              <input
                type="text"
                className="input"
                placeholder="https://api.example.com/v1"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>

            {/* Global Auth */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ fontWeight: 500, fontSize: '12px', color: 'var(--text-secondary)' }}>Global Authentication</label>
              
              <AuthFields auth={auth} noneLabel="No Auth" tokenPlaceholder="Token value (or {{variable}})" onChange={setAuth} />
            </div>

            {/* Global Variables */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ fontWeight: 500, fontSize: '12px', color: 'var(--text-secondary)' }}>Bucket Variables</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    style={{ fontSize: '11px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    onClick={() => setDialogState({ type: 'pasteVariables' })}
                  >
                    <ClipboardIcon size={12} /> Bulk Paste
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    style={{ fontSize: '11px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    onClick={handleAddVariable}
                  >
                    <PlusIcon size={12} /> Add Variable
                  </button>
                </div>
              </div>

              {variables.length === 0 ? (
                <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-primary)', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '12px' }}>
                  No variables defined. Reference values in paths, headers, or bodies using double curly braces (e.g. &#123;&#123;baseUrl&#125;&#125;).
                </div>
              ) : (
                <div className="variables-list">
                  {variables.map((variable) => (
                    <div key={variable.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        checked={variable.enabled}
                        onChange={(e) => handleVariableChange(variable.id, 'enabled', e.target.checked)}
                        style={{ cursor: 'pointer' }}
                      />
                      <input
                        type="text"
                        className="input"
                        placeholder="variableName"
                        style={{ fontFamily: 'var(--font-mono)' }}
                        value={variable.key}
                        onChange={(e) => handleVariableChange(variable.id, 'key', e.target.value)}
                      />
                      <input
                        type="text"
                        className="input"
                        placeholder="Value"
                        value={variable.value}
                        onChange={(e) => handleVariableChange(variable.id, 'value', e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn--icon"
                        style={{ color: 'var(--text-tertiary)' }}
                        onClick={() => handleRemoveVariable(variable.id)}
                      >
                        <XIcon size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Save Button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-primary)', paddingTop: '16px' }}>
              <button type="submit" className="btn btn--primary">
                Save Configuration
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Action Groups Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>Action Groups</h2>
          <button
            className="btn btn--primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={() => setDialogState({ type: 'createGroup' })}
          >
            <PlusIcon size={14} /> Create Action Group
          </button>
        </div>

        {bucket.actionGroups.length === 0 ? (
          <div style={{ padding: '48px', border: '1px dashed var(--border-primary)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--bg-secondary)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
            <LayersIcon size={32} style={{ margin: '0 auto 12px auto', color: 'var(--text-tertiary)' }} />
            <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '4px' }}>No Action Groups yet</p>
            <p style={{ fontSize: '12px' }}>Create an action group to orchestrate sequential API endpoints.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {[...bucket.actionGroups]
              .sort((a, b) => a.order - b.order)
              .map((group) => (
                <div
                  key={group.id}
                  onClick={() => setActiveGroup(group.id)}
                  style={{
                    border: '1px solid var(--border-primary)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-secondary)',
                    padding: '16px',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'border-color var(--transition-fast), transform var(--transition-fast)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '120px',
                  }}
                  className="action-group-card"
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{group.name}</span>
                      <span className="badge" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                        {group.steps?.length || 0} {group.steps?.length === 1 ? 'step' : 'steps'}
                      </span>
                    </div>
                    {group.description && (
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>{group.description}</p>
                    )}
                  </div>

                  <div 
                    style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className="btn btn--icon"
                      title="Edit Group"
                      onClick={() => setDialogState({
                        type: 'renameGroup',
                        groupId: group.id,
                        initialValue: group.name,
                        initialDescription: group.description
                      })}
                    >
                      <EditIcon size={14} />
                    </button>
                    <button
                      className="btn btn--icon"
                      title="Delete"
                      style={{ color: 'var(--method-delete)' }}
                      onClick={() => setDialogState({ type: 'deleteGroup', groupId: group.id })}
                    >
                      <TrashIcon size={14} />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {dialogState.type === 'pasteVariables' ? (
        <PasteVariablesDialog onConfirm={handleBulkAddVariables} onCancel={() => setDialogState({ type: null })} />
      ) : (
        <ActionGroupDialogs
          bucketId={bucket.id}
          state={{ ...dialogState, type: dialogState.type }}
          onClose={() => setDialogState({ type: null })}
        />
      )}

    </div>
  );
}
