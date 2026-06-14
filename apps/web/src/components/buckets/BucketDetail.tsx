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
} from '@/components/common/Icons';
import { PromptDialog } from '@/components/common/PromptDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import type { BucketVariable, AuthConfig } from '@fortest/types';
import { useToastStore } from '@/stores/toastStore';

export function BucketDetail() {
  const {
    buckets,
    activeBucketId,
    updateBucket,
    setActiveGroup,
    addActionGroup,
    updateActionGroup,
    deleteActionGroup,
  } = useBucketStore();
  const { addToast } = useToastStore();

  const bucket = buckets.find((b) => b.id === activeBucketId);

  // Local state for form fields to allow editing before saving
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [auth, setAuth] = useState<AuthConfig>({ type: 'none' });
  const [variables, setVariables] = useState<BucketVariable[]>([]);
  const [isConfigExpanded, setIsConfigExpanded] = useState(true);

  // Sync state with active bucket
  useEffect(() => {
    if (bucket) {
      setName(bucket.name);
      setBaseUrl(bucket.baseUrl || '');
      setAuth(bucket.auth || { type: 'none' });
      setVariables(bucket.variables || []);
    }
  }, [bucket, activeBucketId]);

  // Dialog states for action group management
  const [dialogState, setDialogState] = useState<{
    type: 'createGroup' | 'renameGroup' | 'deleteGroup' | null;
    groupId?: string;
    initialValue?: string;
  }>({ type: null });

  if (!bucket) return null;

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validate variables (filter out empty keys)
    const validVariables = variables.filter((v) => v.key.trim() !== '');
    try {
      await updateBucket(bucket.id, {
        name,
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

  const handleCreateGroupConfirm = async (groupName: string) => {
    try {
      await addActionGroup(bucket.id, groupName);
      addToast(`Action group "${groupName}" created successfully`, 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to create action group', 'error');
    }
    setDialogState({ type: null });
  };

  const handleRenameGroupConfirm = async (groupName: string) => {
    if (dialogState.groupId) {
      try {
        await updateActionGroup(bucket.id, dialogState.groupId, { name: groupName });
        addToast(`Action group renamed to "${groupName}"`, 'success');
      } catch (err: any) {
        addToast(err.message || 'Failed to rename action group', 'error');
      }
    }
    setDialogState({ type: null });
  };

  const handleDeleteGroupConfirm = async () => {
    if (dialogState.groupId) {
      try {
        await deleteActionGroup(bucket.id, dialogState.groupId);
        addToast('Action group deleted successfully', 'success');
      } catch (err: any) {
        addToast(err.message || 'Failed to delete action group', 'error');
      }
    }
    setDialogState({ type: null });
  };

  const handleExport = (format: 'json' | 'yaml') => {
    const url = `/api/buckets/${bucket.id}/export?format=${format}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    addToast(`Exporting "${bucket.name}" as ${format.toUpperCase()}...`, 'info');
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
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => handleExport('yaml')}
            style={{ padding: '6px 12px', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <SaveIcon size={14} /> Export YAML
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => handleExport('json')}
            style={{ padding: '6px 12px', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <SaveIcon size={14} /> Export JSON
          </button>
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
              
              <div style={{ width: '200px' }}>
                <select
                  className="input"
                  value={auth.type}
                  onChange={(e) => setAuth({ ...auth, type: e.target.value as any })}
                >
                  <option value="none">No Auth</option>
                  <option value="bearer">Bearer Token</option>
                  <option value="basic">Basic Auth</option>
                  <option value="api-key">API Key</option>
                </select>
              </div>

              {auth.type === 'bearer' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '16px', borderLeft: '2px solid var(--border-primary)' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Token</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Token value (or {{variable}})"
                    value={auth.bearer?.token || ''}
                    onChange={(e) => setAuth({ ...auth, bearer: { token: e.target.value } })}
                  />
                </div>
              )}

              {auth.type === 'basic' && (
                <div style={{ display: 'flex', gap: '12px', paddingLeft: '16px', borderLeft: '2px solid var(--border-primary)' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Username</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Username"
                      value={auth.basic?.username || ''}
                      onChange={(e) => setAuth({
                        ...auth,
                        basic: { username: e.target.value, password: auth.basic?.password || '' }
                      })}
                    />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Password</label>
                    <input
                      type="password"
                      className="input"
                      placeholder="Password"
                      value={auth.basic?.password || ''}
                      onChange={(e) => setAuth({
                        ...auth,
                        basic: { username: auth.basic?.username || '', password: e.target.value }
                      })}
                    />
                  </div>
                </div>
              )}

              {auth.type === 'api-key' && (
                <div style={{ display: 'flex', gap: '12px', paddingLeft: '16px', borderLeft: '2px solid var(--border-primary)' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Key</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="X-API-Key"
                      value={auth.apiKey?.key || ''}
                      onChange={(e) => setAuth({
                        ...auth,
                        apiKey: {
                          key: e.target.value,
                          value: auth.apiKey?.value || '',
                          addTo: auth.apiKey?.addTo || 'header'
                        }
                      })}
                    />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Value</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Value"
                      value={auth.apiKey?.value || ''}
                      onChange={(e) => setAuth({
                        ...auth,
                        apiKey: {
                          key: auth.apiKey?.key || '',
                          value: e.target.value,
                          addTo: auth.apiKey?.addTo || 'header'
                        }
                      })}
                    />
                  </div>
                  <div style={{ width: '120px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Add To</label>
                    <select
                      className="input"
                      value={auth.apiKey?.addTo || 'header'}
                      onChange={(e) => setAuth({
                        ...auth,
                        apiKey: {
                          key: auth.apiKey?.key || '',
                          value: auth.apiKey?.value || '',
                          addTo: e.target.value as any
                        }
                      })}
                    >
                      <option value="header">Headers</option>
                      <option value="query">Query Params</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Global Variables */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ fontWeight: 500, fontSize: '12px', color: 'var(--text-secondary)' }}>Bucket Variables</label>
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ fontSize: '11px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  onClick={handleAddVariable}
                >
                  <PlusIcon size={12} /> Add Variable
                </button>
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
            {bucket.actionGroups
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
                      title="Rename"
                      onClick={() => setDialogState({ type: 'renameGroup', groupId: group.id, initialValue: group.name })}
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

      {/* Dialogs */}
      {dialogState.type === 'createGroup' && (
        <PromptDialog
          isOpen={true}
          title="Create Action Group"
          placeholder="Group Name (e.g. User Signup Flow)"
          submitText="Create"
          onConfirm={handleCreateGroupConfirm}
          onCancel={() => setDialogState({ type: null })}
        />
      )}

      {dialogState.type === 'renameGroup' && (
        <PromptDialog
          isOpen={true}
          title="Rename Action Group"
          placeholder="Group Name"
          submitText="Save"
          initialValue={dialogState.initialValue}
          onConfirm={handleRenameGroupConfirm}
          onCancel={() => setDialogState({ type: null })}
        />
      )}

      {dialogState.type === 'deleteGroup' && (
        <ConfirmDialog
          isOpen={true}
          title="Delete Action Group"
          message="Are you sure you want to delete this action group? This will permanently delete all steps in this group."
          confirmText="Delete"
          isDanger={true}
          onConfirm={handleDeleteGroupConfirm}
          onCancel={() => setDialogState({ type: null })}
        />
      )}

    </div>
  );
}
