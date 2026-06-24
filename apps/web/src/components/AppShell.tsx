'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  HomeIcon,
  UsersIcon,
  TasksIcon,
  EventsIcon,
  CalendarIcon,
  VaultIcon,
  FinanceIcon,
  KnowledgeIcon,
  MemoriesIcon,
  SearchIcon,
  SettingsIcon,
} from './icons';

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: HomeIcon },
  { href: '/family', label: 'Family', icon: UsersIcon },
  { href: '/tasks', label: 'Tasks', icon: TasksIcon },
  { href: '/events', label: 'Events', icon: EventsIcon },
  { href: '/calendar', label: 'Calendar', icon: CalendarIcon },
  { href: '/vault', label: 'Vault', icon: VaultIcon },
  { href: '/finance', label: 'Finance', icon: FinanceIcon },
  { href: '/knowledge', label: 'Knowledge', icon: KnowledgeIcon },
  { href: '/memories', label: 'Memories', icon: MemoriesIcon },
  { href: '/search', label: 'Search', icon: SearchIcon },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
];

/**
 * Shared top nav, shown on every authenticated page. Pages that render
 * signed-out / loading states render their own minimal markup instead (see
 * each page.tsx) since there's nothing to navigate to yet.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <>
      <nav className="topnav">
        <div className="topnav-inner">
          <span className="topnav-brand">Niki</span>
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname?.startsWith(href);
            return (
              <Link key={href} href={href} className={`topnav-link${active ? ' active' : ''}`}>
                <Icon size={15} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
      <div className="container">{children}</div>
    </>
  );
}
