import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'yellow' | 'red' | 'outline' | 'ghost' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  isLoading = false,
  icon,
  className = '',
  disabled,
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center font-medium transition-all duration-200 cursor-pointer select-none active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none rounded-full';

  const sizeClasses = {
    sm: 'text-xs px-3.5 py-1.5 gap-1.5 min-h-[34px]',
    md: 'text-sm px-5 py-2.5 gap-2 min-h-[42px]',
    lg: 'text-base px-7 py-3.5 gap-2.5 min-h-[50px] font-semibold'
  };

  const variantClasses = {
    // Vibrant orange with white text
    primary:
      'bg-[#FF7A1A] text-white hover:bg-[#E86707] shadow-sm hover:shadow-md focus-visible:ring-2 focus-visible:ring-[#FF7A1A]/40',
    // Sunny yellow with dark text
    yellow:
      'bg-[#FFC72C] text-[#1F1A17] font-semibold hover:bg-[#F2BA1F] shadow-sm hover:shadow-md focus-visible:ring-2 focus-visible:ring-[#FFC72C]/40',
    // Bold red with white text
    red:
      'bg-[#E5383B] text-white hover:bg-[#D32F32] shadow-sm hover:shadow-md focus-visible:ring-2 focus-visible:ring-[#E5383B]/40',
    // Outline with warm border
    outline:
      'border-2 border-[#EFE6D8] bg-white text-[#1F1A17] hover:bg-[#FFF8EC] hover:border-[#FF7A1A] focus-visible:ring-2 focus-visible:ring-[#FF7A1A]/30',
    // Ghost
    ghost:
      'text-[#1F1A17] hover:bg-[#FFF0D4] hover:text-[#FF7A1A] focus-visible:ring-2 focus-visible:ring-[#FF7A1A]/30',
    // Secondary warm card
    secondary:
      'bg-[#F5ECE0] text-[#1F1A17] hover:bg-[#ECE1D2] focus-visible:ring-2 focus-visible:ring-[#FF7A1A]/30'
  };

  const widthClass = fullWidth ? 'w-full' : '';

  return (
    <button
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${widthClass} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <svg
          className="animate-spin -ml-1 mr-2 h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      <span>{children}</span>
    </button>
  );
};
