"use client";

// The brand symbol: a padlock whose shackle is open at rest and closes when a
// session starts (charte §01 — the only place the symbol animates).
type Props = {
  locked?: boolean;
  size?: number;
  className?: string;
};

export default function Padlock({
  locked = false,
  size = 20,
  className = "",
}: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <g
        style={{
          transform: locked ? "rotate(0deg)" : "rotate(-32deg)",
          transformOrigin: "8px 10px",
          transition: "transform .4s cubic-bezier(.2,.8,.3,1)",
        }}
      >
        <path d="M8 10V7a4 4 0 018 0v3" />
      </g>
      <rect x="4.5" y="10" width="15" height="10.5" rx="2.8" />
      <circle cx="12" cy="15" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
