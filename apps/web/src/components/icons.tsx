/**
 * Minimal hand-rolled line-icon set (no external icon package — keeps the
 * dependency footprint at zero, which also sidesteps this sandbox's
 * recurring npm-install/cleanup corruption issue, see PHASES.md). Style:
 * 24x24 viewBox, currentColor stroke, 2px weight, round caps — close to the
 * common "outline" icon convention used across the design.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base(props: IconProps) {
  const { size = 20, ...rest } = props;
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...rest,
  };
}

export function HomeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9.5a1 1 0 0 0 1 1H9.5a1 1 0 0 0 1-1V15a1.5 1.5 0 0 1 1.5-1.5 1.5 1.5 0 0 1 1.5 1.5v4.5a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1V10" />
    </svg>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M15.5 5.5a3 3 0 0 1 0 5.8" />
      <path d="M16 14.6c2.4.5 4.2 2.3 4.5 4.9" />
    </svg>
  );
}

export function TasksIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="4" width="16" height="17" rx="2" />
      <path d="M9 3.5h6" />
      <path d="M8 12.5l2 2 4.5-4.5" />
    </svg>
  );
}

export function EventsIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 4v16.5" />
      <path d="M5 4.5h11l-2.5 3.5L16 11.5H5" />
    </svg>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </svg>
  );
}

export function VaultIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
      <circle cx="12" cy="15" r="1.6" />
    </svg>
  );
}

export function FinanceIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="6.5" width="18" height="13" rx="2" />
      <path d="M3 10.5h18" />
      <circle cx="16.5" cy="14.5" r="1.4" />
    </svg>
  );
}

export function KnowledgeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 6.2c-1.4-1.2-3.4-1.7-6-1.7v13c2.6 0 4.6.5 6 1.7 1.4-1.2 3.4-1.7 6-1.7v-13c-2.6 0-4.6.5-6 1.7Z" />
      <path d="M12 6.2v13" />
    </svg>
  );
}

export function MemoriesIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 20s-7.5-4.3-9.3-9.3C1.7 7.4 3.6 4.5 6.6 4.5c2 0 3.4 1.1 5.4 3 2-1.9 3.4-3 5.4-3 3 0 4.9 2.9 3.9 6.2C19.5 15.7 12 20 12 20Z" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.8-4.8" />
    </svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.8-1.4-2-3.4-2.1.6a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.5 2.3a7.6 7.6 0 0 0-2.6 1.5l-2.1-.6-2 3.4L4.6 10.5a7.6 7.6 0 0 0 0 3L2.8 15l2 3.4 2.1-.6c.76.66 1.64 1.17 2.6 1.5l.5 2.2h4l.5-2.3a7.6 7.6 0 0 0 2.6-1.5l2.1.6 2-3.4Z" />
    </svg>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 21H5.5a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 5.5 3H9" />
      <path d="M16 16.5 21 12l-5-4.5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 4.5v15" />
      <path d="M4.5 12h15" />
    </svg>
  );
}

export function XIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 5l14 14" />
      <path d="M19 5 5 19" />
    </svg>
  );
}

export function MicIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
      <path d="M8.5 21h7" />
    </svg>
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1-2h7l1 2h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5Z" />
      <circle cx="12" cy="12.5" r="3.3" />
    </svg>
  );
}
