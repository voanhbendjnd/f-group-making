import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import i18n from '@/locales/i18n';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      setToasts((prev) => [...prev, { id, message, type }]);

      setTimeout(() => {
        removeToast(id);
      }, 4500);
    },
    [removeToast]
  );

  const success = useCallback((msg: string) => showToast(msg, 'success'), [showToast]);
  const error = useCallback((msg: string) => showToast(msg, 'error'), [showToast]);
  const warning = useCallback((msg: string) => showToast(msg, 'warning'), [showToast]);
  const info = useCallback((msg: string) => showToast(msg, 'info'), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info }}>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map((toast) => {
          let Icon = Info;
          let iconColor = 'var(--color-info)';

          if (toast.type === 'success') {
            Icon = CheckCircle2;
            iconColor = 'var(--color-success)';
          } else if (toast.type === 'error') {
            Icon = AlertCircle;
            iconColor = 'var(--color-error)';
          } else if (toast.type === 'warning') {
            Icon = AlertTriangle;
            iconColor = 'var(--color-warning)';
          }

          return (
            <div key={toast.id} className={`toast toast-${toast.type}`} role="alert">
              <Icon size={20} style={{ color: iconColor, flexShrink: 0, marginTop: '2px' }} />
              <div style={{ flex: 1, color: 'var(--color-text-main)', wordBreak: 'break-word' }}>
                {toast.message}
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-text-subtle)',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                }}
                aria-label={i18n.t('common.closeToast')}
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
