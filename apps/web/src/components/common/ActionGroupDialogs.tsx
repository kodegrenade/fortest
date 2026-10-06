import { useBucketStore } from '@/stores/bucketStore';
import { useToastStore } from '@/stores/toastStore';
import { ConfirmDialog } from './ConfirmDialog';
import { PromptDialog } from './PromptDialog';

export interface GroupDialogState {
  type: 'createGroup' | 'renameGroup' | 'deleteGroup' | null;
  groupId?: string;
  initialValue?: string;
  initialDescription?: string;
}

/** Create / edit / delete dialogs for a bucket's action groups (shared by the sidebar and bucket page). */
export function ActionGroupDialogs({
  bucketId,
  state,
  onClose,
}: {
  bucketId: string;
  state: GroupDialogState;
  onClose: () => void;
}) {
  const { addActionGroup, updateActionGroup, deleteActionGroup } = useBucketStore();
  const { addToast } = useToastStore();

  const attempt = async (action: () => Promise<void>, success: string, failure: string) => {
    try {
      await action();
      addToast(success, 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : failure, 'error');
    }
    onClose();
  };

  if (state.type === 'deleteGroup') {
    return (
      <ConfirmDialog
        title="Delete Action Group"
        message="Are you sure you want to delete this action group? This will permanently delete all steps in this group."
        confirmText="Delete"
        isDanger={true}
        onConfirm={() =>
          attempt(
            () => deleteActionGroup(bucketId, state.groupId!),
            'Action group deleted successfully',
            'Failed to delete action group',
          )
        }
        onCancel={onClose}
      />
    );
  }

  if (state.type !== 'createGroup' && state.type !== 'renameGroup') return null;
  const isEdit = state.type === 'renameGroup';

  return (
    <PromptDialog
      title={isEdit ? 'Edit Action Group' : 'Create Action Group'}
      label="Group Name"
      placeholder="e.g. Authenticated Profile Sync"
      submitText={isEdit ? 'Save' : 'Create'}
      initialValue={state.initialValue}
      description={{
        initialValue: state.initialDescription,
        placeholder: 'e.g. Logs in first to retrieve credentials then updates user meta',
      }}
      onConfirm={(name, description) =>
        isEdit
          ? attempt(
              () => updateActionGroup(bucketId, state.groupId!, { name, description }),
              'Action group updated successfully',
              'Failed to update action group',
            )
          : attempt(
              () => addActionGroup(bucketId, name, description),
              `Action group "${name}" created successfully`,
              'Failed to create action group',
            )
      }
      onCancel={onClose}
    />
  );
}
