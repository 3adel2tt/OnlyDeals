interface P {
  className?: string;
}

/** Static deal-tag mark with a % punched through it — the onlydeals brand. */
export function BrandMark({ className = "w-8 h-8" }: P) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path
        d="M4.6 16 15.2 5.4a2 2 0 0 1 1.4-.6H26a2.4 2.4 0 0 1 2.4 2.4v17.6A2.4 2.4 0 0 1 26 27.2H16.6a2 2 0 0 1-1.4-.6L4.6 16Z"
        fill="var(--color-brick)"
      />
      <circle cx="9.4" cy="16" r="1.7" fill="var(--color-paper)" />
      <path d="M23.4 10.6 15.6 21.4" stroke="var(--color-paper)" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="15.9" cy="11.6" r="2.3" stroke="var(--color-paper)" strokeWidth="2" fill="none" />
      <circle cx="23.1" cy="20.4" r="2.3" stroke="var(--color-paper)" strokeWidth="2" fill="none" />
    </svg>
  );
}

export function SearchIcon({ className = "w-4 h-4" }: P) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="9" r="5.5" />
      <path d="m13.5 13.5 3.5 3.5" strokeLinecap="round" />
    </svg>
  );
}

export function ArrowUpRight({ className = "w-4 h-4" }: P) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5.5 14.5 14.5 5.5M7.5 5.5h7v7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CloseIcon({ className = "w-4 h-4" }: P) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
    </svg>
  );
}

export function CopyIcon({ className = "w-4 h-4" }: P) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="7" y="7" width="9" height="9" rx="1.5" />
      <path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-6A1.5 1.5 0 0 0 4 5.5v6A1.5 1.5 0 0 0 5.5 13H7" />
    </svg>
  );
}

export function CheckIcon({ className = "w-4 h-4" }: P) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m4 10.5 4 4L16 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RefreshIcon({ className = "w-4 h-4" }: P) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M16.5 8A7 7 0 0 0 4.2 5.6L3 7m0-3.5V7h3.5M3.5 12a7 7 0 0 0 12.3 2.4l1.2-1.4m0 3.5V13h-3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CalendarIcon({ className = "w-4 h-4" }: P) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="4.5" width="14" height="12" rx="1.5" />
      <path d="M3 8.5h14M7 2.5v3.5M13 2.5v3.5" strokeLinecap="round" />
    </svg>
  );
}

export function CardIcon({ className = "w-4 h-4" }: P) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2.5" y="4.5" width="15" height="11" rx="1.8" />
      <path d="M2.5 8h15M5.5 12.5h4" strokeLinecap="round" />
    </svg>
  );
}

export function MenuIcon({ className = "w-4 h-4" }: P) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3.5 5.5h13M3.5 10h9.5M3.5 14.5h13" strokeLinecap="round" />
    </svg>
  );
}

export function BackIcon({ className = "w-4 h-4" }: P) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M16.5 10H3.8m0 0 4.7-4.7M3.8 10l4.7 4.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronRightIcon({ className = "w-4 h-4" }: P) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m7.5 4 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BankIcon({ className = "w-4 h-4" }: P) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2.5 8 10 3.2 17.5 8v.7h-15V8Z" strokeLinejoin="round" />
      <path d="M4.4 8.7v6.3M10 8.7v6.3M15.6 8.7v6.3M2.8 17.2h14.4" strokeLinecap="round" />
    </svg>
  );
}

export function StoreIcon({ className = "w-4 h-4" }: P) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 3.5h12l1.3 4.4a2 2 0 0 1-1.9 2.6h-.3a2.1 2.1 0 0 1-2-1.5 2.1 2.1 0 0 1-4.1 0 2.1 2.1 0 0 1-4.1 0 2 2 0 0 1-2.2 1.5 2 2 0 0 1-1.9-2.6L4 3.5Z" strokeLinejoin="round" />
      <path d="M4 10.8v5.7h12v-5.7M8.3 16.5v-3.6h3.4v3.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PlusIcon({ className = "w-4 h-4" }: P) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 4v12M4 10h12" strokeLinecap="round" />
    </svg>
  );
}

export function TrashIcon({ className = "w-4 h-4" }: P) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 5.5h12M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5.5 5.5l.7 9.4a1.5 1.5 0 0 0 1.5 1.4h4.6a1.5 1.5 0 0 0 1.5-1.4l.7-9.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.2 8.5v4M11.8 8.5v4" strokeLinecap="round" />
    </svg>
  );
}

export function PulseIcon({ className = "w-4 h-4" }: P) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M2 10h3.5l2-4.5 3 9 2.5-4.5H18" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StarIcon({ className = "w-4 h-4", filled = false }: P & { filled?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6">
      <path
        d="M10 2.9l2.1 4.4 4.9.7-3.5 3.4.8 4.8L10 13.9l-4.3 2.3.8-4.8L3 8l4.9-.7L10 2.9z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function UserIcon({ className = "w-4 h-4" }: P) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="7" r="3.2" />
      <path d="M3.8 16.5c.7-3 3.2-4.5 6.2-4.5s5.5 1.5 6.2 4.5" strokeLinecap="round" />
    </svg>
  );
}

export function LockIcon({ className = "w-4 h-4" }: P) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="4.5" y="9" width="11" height="8" rx="1.6" />
      <path d="M7 9V6.8a3 3 0 0 1 6 0V9M10 12.2v1.8" strokeLinecap="round" />
    </svg>
  );
}

export function LogoutIcon({ className = "w-4 h-4" }: P) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M8 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8M13 7l3 3-3 3M16 10H8.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DownloadIcon({ className = "w-4 h-4" }: P) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M10 3.5v9m0 0 3.5-3.5M10 12.5 6.5 9M4 14.5v1A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5v-1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SunIcon({ className = "w-4 h-4" }: P) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="10" r="3.6" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4" strokeLinecap="round" />
    </svg>
  );
}

export function MoonIcon({ className = "w-4 h-4" }: P) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M16.5 11.8A6.8 6.8 0 0 1 8.2 3.5a6.8 6.8 0 1 0 8.3 8.3Z" strokeLinejoin="round" />
    </svg>
  );
}

export function WorkflowIcon({ className = "w-4 h-4" }: P) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2.5" y="3" width="5" height="5" rx="1.2" />
      <rect x="12.5" y="12" width="5" height="5" rx="1.2" />
      <rect x="12.5" y="3" width="5" height="5" rx="1.2" />
      <path d="M7.5 5.5h5M15 8v4M7.5 14.5h5" strokeLinecap="round" />
    </svg>
  );
}
