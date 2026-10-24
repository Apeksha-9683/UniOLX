import React from 'react';
import { Button } from './Button';
import { PackageOpen } from 'lucide-react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = ''
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-8 sm:p-12 bg-white rounded-3xl border-2 border-dashed border-[#EFE6D8] max-w-lg mx-auto ${className}`}
    >
      <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-[#FFF3C4] to-[#FFE2BF] flex items-center justify-center text-[#FF7A1A] mb-4 shadow-xs">
        {icon || <PackageOpen className="w-8 h-8" />}
      </div>
      <h3 className="text-lg sm:text-xl font-bold text-[#1F1A17] mb-2">{title}</h3>
      <p className="text-sm text-[#6B625A] max-w-sm mb-6 leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <Button variant="primary" onClick={onAction} size="md">
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
