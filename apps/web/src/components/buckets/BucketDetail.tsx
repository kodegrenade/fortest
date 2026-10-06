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
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  LockOpenIcon,
} from '@/components/common/Icons';
import { AuthFields } from '@/components/common/AuthFields';
import { ActionGroupDialogs, type GroupDialogState } from '@/components/common/ActionGroupDialogs';
import { PasteVariablesDialog } from '@/components/common/PasteVariablesDialog';
import type { BucketVariable, AuthConfig, Environment } from '@fortest/types';
import { PromptDialog } from '@/components/common/PromptDialog';
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
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [revealed, setRevealed] = useState<Set<string>>(new Set()); // secret variables shown in clear
  // Which variable list is being edited: 'shared' (the bucket's own) or an environment id.
  const [scope, setScope] = useState('shared');
  const [isConfigExpanded, setIsConfigExpanded] = useState(true);

  // Sync state with active bucket. Keyed on the config fields only: other store updates
  // (e.g. adding an action group) must not wipe unsaved edits to the form.
  const configKey = bucket && JSON.stringify([bucket.id, bucket.name, bucket.baseUrl, bucket.auth, bucket.variables, bucket.environments]);
  useEffect(() => {
    if (bucket) {
      setBaseUrl(bucket.baseUrl || '');
      setAuth(bucket.auth || { type: 'none' });
      setVariables(bucket.variables || []);
      setEnvironments(bucket.environments || []);
    }
  }, [configKey]);

  const [dialogState, setDialogState] = useState<
    { type: GroupDialogState['type'] | 'pasteVariables' | 'newEnvironment' } & Omit<GroupDialogState, 'type'>
  >({ type: null });

  if (!bucket) return null;

  // The variable list currently shown: the bucket's shared one or the selected environment's.
  const scopedEnv = environments.find((e) => e.id === scope);
  const scopedVariables = scopedEnv ? scopedEnv.variables : variables;
  const setScopedVariables = (next: BucketVariable[]) =>
    scopedEnv
      ? setEnvironments(environments.map((e) => (e.id === scopedEnv.id ? { ...e, variables: next } : e)))
      : setVariables(next);
  const updateScopedEnv = (patch: Partial<Environment>) =>
    setEnvironments(environments.map((e) => (e.id === scope ? { ...e, ...patch } : e)));
  const hasKey = (v: BucketVariable) => v.key.trim() !== '';
  const isSelectedTab = (id: string) => (scopedEnv ? id === scopedEnv.id : id === 'shared');

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validate variables (filter out empty keys)
    const names = environments.map((e) => e.name.trim().toLowerCase());
    if (names.some((n) => !n) || new Set(names).size !== names.length) {
      addToast('Environment names must be filled in and unique.', 'error');
      return;
    }
    try {
      await updateBucket(bucket.id, {
        baseUrl,
        auth,
        variables: variables.filter(hasKey),
        environments: environments.map((e) => ({ ...e, name: e.name.trim(), variables: e.variables.filter(hasKey) })),
        // A deleted environment can't stay selected.
        activeEnvironmentId: environments.some((e) => e.id === bucket.activeEnvironmentId) ? bucket.activeEnvironmentId : null,
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
    setScopedVariables([...scopedVariables, newVar]);
  };

  const handleVariableChange = (id: string, field: keyof BucketVariable, val: any) => {
    setScopedVariables(
      scopedVariables.map((v) => {
        if (v.id === id) {
          return { ...v, [field]: val };
        }
        return v;
      })
    );
  };

  const handleRemoveVariable = (id: string) => {
    setScopedVariables(scopedVariables.filter((v) => v.id !== id));
  };

  const handleBulkAddVariables = (parsedVars: { key: string; value: string; enabled: boolean }[]) => {
    const newVars: BucketVariable[] = parsedVars.map((v) => ({
      id: crypto.randomUUID(),
      key: v.key,
      value: v.value,
      enabled: v.enabled,
    }));
    setScopedVariables([...scopedVariables, ...newVars]);
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
                <label style={{ fontWeight: 500, fontSize: '12px', color: 'var(--text-secondary)' }}>Variables</label>
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

              {/* Shared variables + one tab per environment */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                {[{ id: 'shared', name: 'Shared' }, ...environments].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`btn ${isSelectedTab(tab.id) ? 'btn--secondary' : 'btn--ghost'}`}
                    aria-pressed={isSelectedTab(tab.id)}
                    style={{
                      fontSize: '12px',
                      padding: '4px 10px',
                      boxShadow: isSelectedTab(tab.id) ? 'inset 0 -2px 0 var(--accent-primary)' : undefined,
                    }}
                    onClick={() => setScope(tab.id)}
                    title={tab.id === bucket.activeEnvironmentId ? 'Selected environment' : undefined}
                  >
                    {tab.name || 'Unnamed'}
                    {tab.id === bucket.activeEnvironmentId && <span style={{ color: 'var(--status-2xx)' }}> ●</span>}
                  </button>
                ))}
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ fontSize: '12px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  onClick={() => setDialogState({ type: 'newEnvironment' })}
                >
                  <PlusIcon size={12} /> Environment
                </button>
              </div>

              {scopedEnv ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="text"
                    className="input"
                    style={{ maxWidth: '220px' }}
                    aria-label="Environment name"
                    value={scopedEnv.name}
                    onChange={(e) => updateScopedEnv({ name: e.target.value })}
                  />
                  <span style={{ flex: 1, fontSize: '12px', color: 'var(--text-tertiary)' }}>
                    Overrides shared variables with the same name when this environment is selected.
                  </span>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    style={{ fontSize: '11px', padding: '4px 8px', color: 'var(--method-delete)' }}
                    onClick={() => {
                      setEnvironments(environments.filter((e) => e.id !== scopedEnv.id));
                      setScope('shared');
                    }}
                  >
                    Delete environment
                  </button>
                </div>
              ) : (
                environments.length > 0 && (
                  <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                    Shared variables apply in every environment. Pick the environment to run with in the sidebar.
                  </span>
                )
              )}

              {scopedVariables.length === 0 ? (
                <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-primary)', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '12px' }}>
                  No variables defined. Reference values in paths, headers, or bodies using double curly braces (e.g. &#123;&#123;baseUrl&#125;&#125;).
                </div>
              ) : (
                <div className="variables-list">
                  {scopedVariables.map((variable) => (
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
                      {/* Sized like the key input (width: 100%) so both columns share the row equally */}
                      <div style={{ position: 'relative', width: '100%', minWidth: 0, display: 'flex' }}>
                        <input
                          type={variable.secret && !revealed.has(variable.id) ? 'password' : 'text'}
                          className="input"
                          placeholder={variable.secret ? 'Secret value (or pass with --var in CI)' : 'Value'}
                          autoComplete="off"
                          style={{ width: '100%', ...(variable.secret ? { paddingRight: '32px' } : {}) }}
                          value={variable.value}
                          onChange={(e) => handleVariableChange(variable.id, 'value', e.target.value)}
                        />
                        {variable.secret && (
                          <button
                            type="button"
                            className="btn btn--icon"
                            style={{ position: 'absolute', right: '2px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }}
                            title={revealed.has(variable.id) ? 'Hide value' : 'Show value'}
                            onClick={() => {
                              const next = new Set(revealed);
                              if (!next.delete(variable.id)) next.add(variable.id);
                              setRevealed(next);
                            }}
                          >
                            {revealed.has(variable.id) ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        className="btn btn--icon"
                        style={{ color: variable.secret ? 'var(--accent-primary)' : 'var(--text-tertiary)', flexShrink: 0 }}
                        aria-pressed={!!variable.secret}
                        title={
                          variable.secret
                            ? 'Secret: masked, left out of exports, redacted from run results. Click to make it a normal variable.'
                            : 'Mark as secret (masked, left out of exports, redacted from run results)'
                        }
                        onClick={() => handleVariableChange(variable.id, 'secret', !variable.secret)}
                      >
                        {variable.secret ? <LockIcon size={14} /> : <LockOpenIcon size={14} />}
                      </button>
                      <button
                        type="button"
                        className="btn btn--icon"
                        style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}
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
      ) : dialogState.type === 'newEnvironment' ? (
        <PromptDialog
          title="New Environment"
          label="Name"
          placeholder="e.g. staging"
          submitText="Add"
          onConfirm={(name) => {
            if (environments.some((e) => e.name.toLowerCase() === name.toLowerCase())) {
              addToast(`An environment named "${name}" already exists.`, 'error');
              return;
            }
            const env: Environment = { id: crypto.randomUUID(), name, variables: [] };
            setEnvironments([...environments, env]);
            setScope(env.id);
            setDialogState({ type: null });
            addToast(`Environment "${name}" added. Click "Save Configuration" to persist it.`, 'info');
          }}
          onCancel={() => setDialogState({ type: null })}
        />
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
