import { Modal } from './Modal';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDanger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal onClose={onCancel}>
      <h3 className="modal-title">{title}</h3>
      <p
        style={{
          color: 'var(--text-secondary)',
          marginBottom: '24px',
          fontSize: '14px',
          lineHeight: 1.5,
        }}
      >
        {message}
      </p>
      <div className="modal-actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          {cancelText}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          style={isDanger ? { backgroundColor: 'var(--method-delete)' } : {}}
          onClick={() => {
            onConfirm();
            onCancel();
          }}
        >
          {confirmText}
        </button>
      </div>
    </Modal>
  );
}
