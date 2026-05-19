import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback(
    (type: Toast['type'], message: string, duration?: number) => {
      const id = Date.now().toString();
      setToasts((prev) => [...prev, { id, type, message, duration }]);
    },
    [],
  );

  const success = useCallback(
    (message: string, duration?: number) => {
      addToast('success', message, duration);
    },
    [addToast],
  );

  const error = useCallback(
    (message: string, duration?: number) => {
      addToast('error', message, duration);
    },
    [addToast],
  );

  const info = useCallback(
    (message: string, duration?: number) => {
      addToast('info', message, duration);
    },
    [addToast],
  );

  const value: ToastContextValue = {
    toasts,
    success,
    error,
    info,
    removeToast,
  };

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (ctx === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
