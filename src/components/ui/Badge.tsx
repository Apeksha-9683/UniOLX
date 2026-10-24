import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'yellow' | 'orange' | 'red' | 'green' | 'neutral';
  size?: 'sm' | 'md';
  className?: string;
  icon?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'yellow',
  size = 'md',
  className = '',
  icon
}) => {
  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5'
  };

  const variantStyles = {
    yellow: 'bg-[#FFF3C4] text-[#8C6500] border border-[#FFD966]',
    orange: 'bg-[#FFE8D6] text-[#C04E00] border border-[#FFBA88]',
    red: 'bg-[#FDE8E8] text-[#9B1C1C] border border-[#F8B4B4]',
    green: 'bg-[#DEF7EC] text-[#03543F] border border-[#84E1BC]', // only for success/verified
    neutral: 'bg-[#F3ECE0] text-[#554C44] border border-[#E4D8C7]'
  };

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  );
};
