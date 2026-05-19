import { useToast } from '../hooks/useToast';
import Toast from './Toast';

function ToastContainer() {
  const { toasts, removeToast } = useToast();

  return (
    <div className="fixed top-0 right-0 z-[100000] space-y-2 p-4 pointer-events-none">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          id={toast.id}
          type={toast.type}
          message={toast.message}
          duration={toast.duration}
          onClose={removeToast}
        />
      ))}
    </div>
  );
}

export default ToastContainer;
