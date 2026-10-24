import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  message: string;
  type?: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = `toast_${Date.now()}_${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast container floating at bottom-right or bottom-center */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full px-4 sm:px-0 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 p-4 rounded-2xl shadow-xl border-2 transition-all duration-300 animate-in slide-in-from-bottom-5 ${
              toast.type === 'success'
                ? 'bg-[#DEF7EC] border-[#84E1BC] text-[#03543F]'
                : toast.type === 'error'
                ? 'bg-[#FDE8E8] border-[#F8B4B4] text-[#9B1C1C]'
                : 'bg-white border-[#FFC72C] text-[#1F1A17]'
            }`}
            role="status"
          >
            <div className="flex items-center gap-3">
              {toast.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-[#0E9F6E] shrink-0" />
              ) : toast.type === 'error' ? (
                <AlertCircle className="w-5 h-5 text-[#E02424] shrink-0" />
              ) : (
                <Info className="w-5 h-5 text-[#FF7A1A] shrink-0" />
              )}
              <span className="text-sm font-semibold">{toast.message}</span>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="p-1 rounded-full hover:bg-black/5 text-current opacity-70 hover:opacity-100 transition-opacity"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
