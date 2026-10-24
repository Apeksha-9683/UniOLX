import React from 'react';
import { ListingStatus } from '../../types';
import { CheckCircle2, Clock, Ban, Check, Tag, Lock } from 'lucide-react';

export interface StatusBadgeProps {
  status: ListingStatus;
  size?: 'sm' | 'md';
  className?: string;
  showIcon?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  className = '',
  showIcon = true
}) => {
  const sizeClasses = {
    sm: 'text-[11px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5'
  };

  // Strictly adhere: Green ONLY for success states ('Completed', 'Verified').
  // Bright orange, yellow, warm red, or neutral for others.
  const config: Record<
    ListingStatus,
    { label: string; bg: string; text: string; border: string; icon: React.ReactNode }
  > = {
    Available: {
      label: 'Available',
      bg: 'bg-[#FFF9E6]',
      text: 'text-[#9A6E00]',
      border: 'border-[#FFD54F]',
      icon: <Tag className="w-3.5 h-3.5" />
    },
    Reserved: {
      label: 'Reserved',
      bg: 'bg-[#FFF3E0]',
      text: 'text-[#D85A00]',
      border: 'border-[#FFB74D]',
      icon: <Lock className="w-3.5 h-3.5" />
    },
    Pending: {
      label: 'Pending Trade',
      bg: 'bg-[#FFF8E1]',
      text: 'text-[#B26A00]',
      border: 'border-[#FFE082]',
      icon: <Clock className="w-3.5 h-3.5" />
    },
    Completed: {
      // SUCCESS STATE: GREEN
      label: 'Completed',
      bg: 'bg-[#DEF7EC]',
      text: 'text-[#03543F]',
      border: 'border-[#84E1BC]',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-[#0E9F6E]" />
    },
    Sold: {
      label: 'Sold',
      bg: 'bg-[#F5ECE0]',
      text: 'text-[#6B625A]',
      border: 'border-[#E0D3C1]',
      icon: <Check className="w-3.5 h-3.5" />
    },
    Cancelled: {
      label: 'Cancelled',
      bg: 'bg-[#FDE8E8]',
      text: 'text-[#9B1C1C]',
      border: 'border-[#F8B4B4]',
      icon: <Ban className="w-3.5 h-3.5 text-[#E02424]" />
    }
  };

  const item = config[status] || config.Available;

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border ${sizeClasses[size]} ${item.bg} ${item.text} ${item.border} ${className}`}
    >
      {showIcon && <span className="shrink-0">{item.icon}</span>}
      <span>{item.label}</span>
    </span>
  );
};
