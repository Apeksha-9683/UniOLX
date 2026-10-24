import React from 'react';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onClick?: () => void;
  icon?: React.ReactNode;
  count?: number;
  className?: string;
  size?: 'sm' | 'md';
}

export const Chip: React.FC<ChipProps> = ({
  label,
  selected = false,
  onClick,
  icon,
  count,
  className = '',
  size = 'md'
}) => {
  const sizeClasses = {
    sm: 'text-xs px-3 py-1 gap-1.5 min-h-[30px]',
    md: 'text-sm px-4 py-1.5 gap-2 min-h-[36px]'
  };

  const selectedClasses = selected
    ? 'bg-[#FF7A1A] text-white border-[#FF7A1A] font-semibold shadow-sm shadow-[#FF7A1A]/20'
    : 'bg-white text-[#1F1A17] border-[#EFE6D8] hover:border-[#FFC72C] hover:bg-[#FFF9EE]';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-full border transition-all duration-150 cursor-pointer select-none active:scale-95 ${sizeClasses[size]} ${selectedClasses} ${className}`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="whitespace-nowrap">{label}</span>
      {count !== undefined && (
        <span
          className={`text-[11px] px-1.5 py-0.2 rounded-full font-bold ml-0.5 ${
            selected ? 'bg-white/25 text-white' : 'bg-[#F2E7D7] text-[#6B625A]'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
};
