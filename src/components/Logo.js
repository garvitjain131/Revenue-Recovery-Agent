'use client';

/**
 * Logo component for Revenue Recovery Agent.
 * Inline SVG mark -- a stylized upward arrow integrated with a bar chart,
 * representing revenue growth and analytics.
 */
export function Logo({ size = 32 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Background rounded square */}
      <rect width="32" height="32" rx="8" fill="#6A8FB8" />
      
      {/* Bar chart bars */}
      <rect x="6" y="18" width="4" height="8" rx="1" fill="rgba(255,255,255,0.4)" />
      <rect x="12" y="14" width="4" height="12" rx="1" fill="rgba(255,255,255,0.6)" />
      <rect x="18" y="10" width="4" height="16" rx="1" fill="rgba(255,255,255,0.8)" />
      
      {/* Upward arrow */}
      <path
        d="M24 12L27 8L24 4"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <line
        x1="27"
        y1="8"
        x2="22"
        y2="8"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
