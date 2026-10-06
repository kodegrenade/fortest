import { useState } from 'react';
import { useSidebarStore } from '@/stores/sidebarStore';
import { useBucketStore } from '@/stores/bucketStore';
import {
  PlusIcon,
  LayersIcon,
  EditIcon,
  TrashIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  HomeIcon,
} from '@/components/common/Icons';
import { ActionGroupDialogs, type GroupDialogState } from '@/components/common/ActionGroupDialogs';
import '../buckets/Buckets.css';

export function Sidebar() {
  const isCollapsed = useSidebarStore((s) => s.isCollapsed);
  const toggleCollapse = useSidebarStore((s) => s.toggleCollapse);
  const collapseIfNarrow = useSidebarStore((s) => s.collapseIfNarrow);

  const {
    buckets,
    activeBucketId,
    activeGroupId,
    setActiveBucket,
    setActiveGroup,
    updateBucket,
  } = useBucketStore();

  const activeBucket = buckets.find((b) => b.id === activeBucketId);

  const [dialogState, setDialogState] = useState<GroupDialogState>({ type: null });

  if (!activeBucket) return null;

  const sidebarClass = `sidebar${isCollapsed ? ' sidebar--collapsed' : ''}`;

  return (
    <>
      <aside className={sidebarClass}>
        {/* All Buckets Button */}
        <button
          className="sidebar__home-btn"
          onClick={() => setActiveBucket(null)}
          title="Back to all buckets"
          style={isCollapsed ? { width: '32px', height: '32px', padding: 0, justifyContent: 'center' } : {}}
        >
          <HomeIcon size={16} style={{ flexShrink: 0 }} />
          {!isCollapsed && <span>All Buckets</span>}
        </button>

        {!isCollapsed && (
          <>
            <div className="sidebar__active-bucket-title" title={activeBucket.name}>
              {activeBucket.name}
            </div>

            {/* Environment the bucket's runs use (managed under the bucket's Variables) */}
            {activeBucket.environments.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '0 12px 8px' }}>
                <label htmlFor="sidebar-environment" className="sidebar__header-title" style={{ fontSize: '10px' }}>
                  Environment
                </label>
                <select
                  id="sidebar-environment"
                  className="input"
                  style={{ fontSize: '12px', padding: '4px 8px' }}
                  value={activeBucket.activeEnvironmentId ?? ''}
                  onChange={(e) => updateBucket(activeBucket.id, { activeEnvironmentId: e.target.value || null })}
                >
                  <option value="">No environment</option>
                  {activeBucket.environments.map((env) => (
                    <option key={env.id} value={env.id}>
                      {env.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            
            <div className="sidebar__header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
              <span className="sidebar__header-title" style={{ fontSize: '10px' }}>Action Groups</span>
              <button
                className="btn btn--icon"
                title="New Action Group"
                onClick={() => setDialogState({ type: 'createGroup' })}
              >
                <PlusIcon size={14} />
              </button>
            </div>
          </>
        )}

        <div className="sidebar__content" style={{ marginTop: '8px' }}>
          {isCollapsed ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <button
                className="btn btn--icon"
                title="New Action Group"
                onClick={() => setDialogState({ type: 'createGroup' })}
              >
                <PlusIcon size={16} />
              </button>
              <div style={{ width: '100%', borderBottom: '1px solid var(--border-secondary)', margin: '8px 0' }} />
              {activeBucket.actionGroups.map((group) => {
                const isActive = group.id === activeGroupId;
                return (
                  <button
                    key={group.id}
                    className={`btn btn--icon ${isActive ? 'sidebar__nav-btn--active' : ''}`}
                    title={`${group.name} (${group.steps?.length || 0} steps)`}
                    onClick={() => {
                      setActiveGroup(group.id);
                      collapseIfNarrow();
                    }}
                  >
                    <LayersIcon size={18} />
                  </button>
                );
              })}
            </div>
          ) : activeBucket.actionGroups.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '12px' }}>
              No Action Groups. Click "+" to create one.
            </div>
          ) : (
            <div className="bucket-node__groups" style={{ borderLeft: 'none', marginLeft: 0, paddingLeft: 0 }}>
              {[...activeBucket.actionGroups]
                .sort((a, b) => a.order - b.order)
                .map((group) => {
                  const isGroupActive = activeGroupId === group.id;
                  return (
                    <div key={group.id} className="group-node" style={{ padding: '0 8px' }}>
                      <div
                        className={`group-node__row ${isGroupActive ? 'group-node__row--active' : ''}`}
                        onClick={() => {
                          setActiveGroup(group.id);
                          collapseIfNarrow();
                        }}
                        style={{ margin: 0 }}
                      >
                        <div className="group-node__info">
                          <LayersIcon size={12} style={{ flexShrink: 0, color: 'var(--text-secondary)' }} />
                          <span className="group-node__name">{group.name}</span>
                          <span className="group-node__badge">{group.steps?.length || 0}</span>
                        </div>

                         <div className="group-node__actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="group-node__action-btn"
                            title="Edit Group"
                            onClick={() =>
                              setDialogState({
                                type: 'renameGroup',
                                groupId: group.id,
                                initialValue: group.name,
                                initialDescription: group.description,
                              })
                            }
                          >
                            <EditIcon size={12} />
                          </button>
                          <button
                            className="group-node__action-btn group-node__action-btn--delete"
                            title="Delete Group"
                            onClick={() =>
                              setDialogState({
                                type: 'deleteGroup',
                                groupId: group.id,
                              })
                            }
                          >
                            <TrashIcon size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        <div className="sidebar__footer">
          <button
            className="sidebar__collapse-btn"
            onClick={toggleCollapse}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRightIcon size={16} /> : <ChevronLeftIcon size={16} />}
          </button>
        </div>
      </aside>

      <ActionGroupDialogs bucketId={activeBucket.id} state={dialogState} onClose={() => setDialogState({ type: null })} />
    </>
  );
}
