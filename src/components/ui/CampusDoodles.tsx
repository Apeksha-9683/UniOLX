import React from 'react';

export const CampusDoodleBicycle: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
  <svg
    viewBox="0 0 48 48"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {/* Bicycle doodle */}
    <circle cx="12" cy="34" r="8" />
    <circle cx="36" cy="34" r="8" />
    <path d="M12 34l12-14 8 14H12z" />
    <path d="M24 20l-4-8h-4" />
    <path d="M36 34l-5-18h6" />
    <circle cx="24" cy="34" r="2.5" fill="currentColor" />
  </svg>
);

export const CampusDoodleBook: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
  <svg
    viewBox="0 0 48 48"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {/* Open book doodle */}
    <path d="M24 14c-4-4-10-4-16-3v22c6-1 12-1 16 3 4-4 10-4 16-3V11c-6-1-12-1-16 3z" />
    <path d="M24 14v22" />
    <path d="M14 20h-4" />
    <path d="M14 26h-4" />
    <path d="M38 20h-4" />
    <path d="M38 26h-4" />
  </svg>
);

export const CampusDoodleChai: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
  <svg
    viewBox="0 0 48 48"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {/* Cutting Chai glass doodle */}
    <path d="M14 16l3 22c.3 2.2 2.2 3.8 4.4 3.8h5.2c2.2 0 4.1-1.6 4.4-3.8l3-22H14z" />
    <path d="M12 16h24" />
    <path d="M15 24h18" strokeDasharray="2 2" />
    {/* Steam */}
    <path d="M20 11c0-2 2-3 2-5" />
    <path d="M28 11c0-2 2-3 2-5" />
  </svg>
);

export const CampusDoodleHostelLamp: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
  <svg
    viewBox="0 0 48 48"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {/* Desk lamp doodle */}
    <path d="M14 40h20" />
    <path d="M24 40V24l8-8" />
    <path d="M32 16l4 4-10 10-4-4 10-10z" />
    <path d="M35 13l4-4" strokeDasharray="2 2" />
  </svg>
);
