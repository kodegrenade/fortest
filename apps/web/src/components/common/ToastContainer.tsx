import { useToastStore } from '@/stores/toastStore';
import { CheckCircleIcon, AlertCircleIcon, InfoIcon, XIcon } from './Icons';
import './ToastContainer.css';

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => {
        let IconComponent = InfoIcon;
        let iconColor = 'var(--accent-primary)';

        if (toast.type === 'success') {
          IconComponent = CheckCircleIcon;
          iconColor = 'var(--status-2xx)';
        } else if (toast.type === 'error') {
          IconComponent = AlertCircleIcon;
          iconColor = 'var(--status-5xx)';
        } else if (toast.type === 'warning') {
          IconComponent = AlertCircleIcon;
          iconColor = 'var(--status-3xx)';
        }

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
