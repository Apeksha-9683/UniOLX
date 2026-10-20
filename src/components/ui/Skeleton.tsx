import React from 'react';

export interface SkeletonProps {
  className?: string;
  variant?: 'rectangular' | 'circular' | 'card';
  count?: number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'rectangular',
  count = 1
}) => {
  const getSkeletonItem = (index: number) => {
    if (variant === 'circular') {
      return (
        <div
          key={index}
          className={`animate-pulse rounded-full bg-[#F0E6D8] ${className}`}
        />
      );
    }

    if (variant === 'card') {
      return (
        <div
          key={index}
          className="bg-white rounded-3xl border-2 border-[#EFE6D8] p-4 flex flex-col gap-3 animate-pulse"
        >
          <div className="aspect-[4/3] w-full rounded-2xl bg-[#F0E6D8]" />
          <div className="h-4 w-1/3 rounded-full bg-[#F0E6D8]" />
          <div className="h-5 w-4/5 rounded-full bg-[#F0E6D8]" />
          <div className="h-3 w-1/2 rounded-full bg-[#F0E6D8]" />
          <div className="pt-2 border-t border-[#F2E7D7] flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-[#F0E6D8]" />
            <div className="h-3 w-24 rounded-full bg-[#F0E6D8]" />
          </div>
        </div>
      );
    }

    return (
      <div
        key={index}
        className={`animate-pulse rounded-2xl bg-[#F0E6D8] ${className}`}
      />
    );
  };

  if (count > 1) {
    return (
      <>
        {Array.from({ length: count }).map((_, i) => getSkeletonItem(i))}
      </>
    );
  }

  return getSkeletonItem(0);
};
