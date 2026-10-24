import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'md'
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Manage body scroll lock cleanly: lock on open, restore on close, navigation, and unmount
  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = '';
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow || '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Trap focus inside modal while open
  useEffect(() => {
    if (!isOpen || !dialogRef.current) return;

    // Focus first focusable element inside the modal
    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector);

    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !dialogRef.current) return;

      const currentFocusables = dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector);
      if (currentFocusables.length === 0) return;

      const first = currentFocusables[0];
      const last = currentFocusables[currentFocusables.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleTabKey);
    return () => {
      window.removeEventListener('keydown', handleTabKey);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl'
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] overflow-y-auto p-4 flex min-h-[100dvh]"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#1F1A17]/60 backdrop-blur-xs transition-opacity duration-200"
        aria-hidden="true"
      />

      {/* Modal Dialog Container: centered with m-auto, max-h-[calc(100dvh-32px)], flex flex-col */}
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full ${maxWidthClasses[maxWidth]} max-h-[calc(100dvh-32px)] m-auto bg-white rounded-3xl shadow-2xl border-2 border-[#EFE6D8] flex flex-col overflow-hidden z-10 transform transition-all duration-200 animate-in fade-in zoom-in-95`}
      >
        {/* 1. Header: fixed, does not shrink (shrink-0) */}
        {(title || subtitle) ? (
          <div className="shrink-0 px-6 pt-5 pb-4 border-b border-[#EFE6D8] flex items-start justify-between bg-gradient-to-r from-[#FFFDF8] to-[#FFF8EC]">
            <div className="pr-4">
              {title && <h3 className="text-lg sm:text-xl font-bold text-[#1F1A17]">{title}</h3>}
              {subtitle && <p className="text-xs sm:text-sm text-[#6B625A] mt-0.5">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full text-[#6B625A] hover:text-[#1F1A17] hover:bg-[#F5ECE0] transition-colors cursor-pointer shrink-0"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 z-20 p-1.5 rounded-full text-[#6B625A] hover:text-[#1F1A17] hover:bg-[#F5ECE0] transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* 2. Body: flex-1, min-h-0, overflow-y-auto (ONLY part that scrolls inside dialog) */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6">
          {children}
        </div>

        {/* 3. Footer: shrink-0 and always visible, never pushed off screen */}
        {footer && (
          <div className="shrink-0 p-4 sm:px-6 sm:py-4 border-t border-[#EFE6D8] bg-[#FFFDF8]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
