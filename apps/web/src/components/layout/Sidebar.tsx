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
} from '@/components/common/Icons';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ActionGroupDialog } from '@/components/common/ActionGroupDialog';
import { useToastStore } from '@/stores/toastStore';
import '../buckets/Buckets.css';

const HomeIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0 }}
  >
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

export function Sidebar() {
  const isCollapsed = useSidebarStore((s) => s.isCollapsed);
  const toggleCollapse = useSidebarStore((s) => s.toggleCollapse);

  const {
    buckets,
    activeBucketId,
    activeGroupId,
    setActiveBucket,
    setActiveGroup,
    addActionGroup,
    updateActionGroup,
    deleteActionGroup,
  } = useBucketStore();
  const { addToast } = useToastStore();

  const activeBucket = buckets.find((b) => b.id === activeBucketId);

  // Dialog state for action group management
  const [dialogState, setDialogState] = useState<{
    type: 'createGroup' | 'renameGroup' | 'deleteGroup' | null;
    groupId?: string;
    initialValue?: string;
    initialDescription?: string;
  }>({ type: null });

  if (!activeBucket) return null;

  const handleCreateGroupConfirm = async (name: string, description: string) => {
    try {
      await addActionGroup(activeBucket.id, name, description);
      addToast(`Action group "${name}" created successfully`, 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to create action group', 'error');
    }
    setDialogState({ type: null });
  };

  const handleRenameGroupConfirm = async (name: string, description: string) => {
    if (dialogState.groupId) {
      try {
        await updateActionGroup(activeBucket.id, dialogState.groupId, { name, description });
        addToast(`Action group updated successfully`, 'success');
      } catch (err: any) {
        addToast(err.message || 'Failed to update action group', 'error');
      }
    }
    setDialogState({ type: null });
  };

  const handleDeleteGroupConfirm = async () => {
    if (dialogState.groupId) {
      try {
        await deleteActionGroup(activeBucket.id, dialogState.groupId);
        addToast('Action group deleted successfully', 'success');
      } catch (err: any) {
        addToast(err.message || 'Failed to delete action group', 'error');
      }
    }
    setDialogState({ type: null });
  };

  const sidebarClass = `sidebar${isCollapsed ? ' sidebar--collapsed' : ''}`;

  return (
    <>
      <aside className={sidebarClass}>
        {/* All Buckets Button */}
        <button
          className="sidebar__home-btn"
          onClick={() => setActiveBucket(null)}
          title="Back to Dashboard Hub"
          style={isCollapsed ? { width: '32px', height: '32px', padding: 0, justifyContent: 'center' } : {}}
        >
          <HomeIcon size={16} />
          {!isCollapsed && <span>Dashboard Hub</span>}
        </button>

        {!isCollapsed && (
          <>
            <div className="sidebar__active-bucket-title" title={activeBucket.name}>
              {activeBucket.name}
            </div>
            
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
              {activeBucket.actionGroups
                .sort((a, b) => a.order - b.order)
                .map((group) => {
                  const isGroupActive = activeGroupId === group.id;
                  return (
                    <div key={group.id} className="group-node" style={{ padding: '0 8px' }}>
                      <div
                        className={`group-node__row ${isGroupActive ? 'group-node__row--active' : ''}`}
                        onClick={() => {
                          setActiveGroup(group.id);
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

      {/* Modals */}
      {dialogState.type === 'createGroup' && (
        <ActionGroupDialog
          isOpen={true}
          title="Create Action Group"
          submitText="Create"
          onConfirm={handleCreateGroupConfirm}
          onCancel={() => setDialogState({ type: null })}
        />
      )}

      {dialogState.type === 'renameGroup' && (
        <ActionGroupDialog
          isOpen={true}
          title="Edit Action Group"
          submitText="Save"
          initialName={dialogState.initialValue}
          initialDescription={dialogState.initialDescription}
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
    </>
  );
}
