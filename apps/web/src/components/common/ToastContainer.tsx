import { useToastStore } from '@/stores/toastStore';
import { CheckCircleIcon, AlertCircleIcon, InfoIcon, XIcon } from './Icons';
import './ToastContainer.css';

const TOAST_STYLE = {
  success: [CheckCircleIcon, 'var(--status-2xx)'],
  error: [AlertCircleIcon, 'var(--status-5xx)'],
  warning: [AlertCircleIcon, 'var(--status-3xx)'],
  info: [InfoIcon, 'var(--accent-primary)'],
} as const;

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => {
        const [IconComponent, iconColor] = TOAST_STYLE[toast.type];
        return (
          <div key={toast.id} className={`toast toast--${toast.type}`}>
            <span className="toast__icon" style={{ color: iconColor }}>
              <IconComponent size={18} />
            </span>
            <div className="toast__message">{toast.message}</div>
            <button
              onClick={() => removeToast(toast.id)}
              className="toast__close-btn"
              aria-label="Close notification"
            >
              <XIcon size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
