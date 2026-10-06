import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { XIcon } from './Icons';
import './Modal.css';

interface ModalProps {
  onClose: () => void;
  showCloseButton?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * Modal on the native <dialog>: showModal() gives Esc-to-close, a focus trap, an inert page and
 * the ::backdrop. Render it conditionally (`{open && <Modal …/>}`); it opens on mount.
 */
export function Modal({
  onClose,
  showCloseButton = false,
  className = '',
  style,
  children,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    dialog
      .querySelector<HTMLElement>(
        'input:not([type=file]):not([readonly]), textarea:not([readonly])',
      )
      ?.focus();
  }, []);

  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => {
        e.preventDefault(); // Esc: let the owner decide (it unmounts us)
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()} // click outside the card
    >
      <div className={`modal-content ${className}`} style={style}>
        {showCloseButton && (
          <button type="button" className="modal-close-btn" onClick={onClose} title="Close">
            <XIcon size={14} />
          </button>
        )}
        {children}
      </div>
    </dialog>
  );
}
