import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  icon?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, helperText, error, icon, rightElement, className = '', id, readOnly, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    const effectiveReadOnly = readOnly !== undefined ? readOnly : (props.value !== undefined && !props.onChange ? true : undefined);

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-bold uppercase tracking-wider text-[#6B625A] mb-1.5"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {icon && (
            <div className="absolute left-3.5 flex items-center pointer-events-none text-[#6B625A]">
              {icon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            readOnly={effectiveReadOnly}
            className={`w-full rounded-2xl bg-white border px-4 py-2.5 text-sm text-[#1F1A17] placeholder-[#A4998E] transition-all duration-200 outline-none focus:outline-none
              ${
                error
                  ? 'border-[#E5383B] focus:border-[#E5383B] focus:ring-4 focus:ring-[#E5383B]/[0.18]'
                  : 'border-[#E8DFD3] hover:border-[#FFC72C] focus:border-[#FF7A1A] focus:ring-4 focus:ring-[#FF7A1A]/[0.18]'
              }
              ${icon ? 'pl-10' : ''}
              ${rightElement ? 'pr-11' : ''}
              disabled:bg-[#FAF4E9] disabled:text-[#A4998E] disabled:cursor-not-allowed
              ${className}
            `}
            {...props}
          />
          {rightElement && (
            <div className="absolute right-3 flex items-center">
              {rightElement}
            </div>
          )}
        </div>
        {error ? (
          <p className="mt-1.5 text-xs text-[#E5383B] font-semibold flex items-center gap-1">
            <span>●</span> {error}
          </p>
        ) : helperText ? (
          <p className="mt-1 text-xs text-[#6B625A]">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';
