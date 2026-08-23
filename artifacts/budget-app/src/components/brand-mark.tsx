import type { SVGProps } from "react";

export function BrandMark({ size = 40, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient id="ledger-mark-bg" x1="11" y1="7" x2="55" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#132C3A" />
          <stop offset="1" stopColor="#081B2A" />
        </linearGradient>
        <linearGradient id="ledger-mark-mint" x1="18" y1="16" x2="49" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9AF4D7" />
          <stop offset="1" stopColor="#62E6C3" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="18" fill="url(#ledger-mark-bg)" />
      <rect x="1" y="1" width="62" height="62" rx="18" stroke="#62E6C3" strokeOpacity=".22" />
      <path
        d="M48.5 18.5A22 22 0 1 1 18.7 48"
        stroke="#8178F8"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="8 5"
        opacity=".9"
      />
      <circle cx="48.5" cy="18.5" r="3.5" fill="#F6C667" />
      <path d="M19 17.5V40a7 7 0 0 0 7 7h18" stroke="#F7FFFC" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M25 18h20M25 27h14M25 36h8" stroke="url(#ledger-mark-mint)" strokeWidth="4.5" strokeLinecap="round" />
      <path d="m37 39.5 3.5 3.5L49 33" stroke="#F7FFFC" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}