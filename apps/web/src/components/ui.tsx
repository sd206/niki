import type { ReactNode } from 'react';

export type Module =
  | 'tasks'
  | 'events'
  | 'calendar'
  | 'vault'
  | 'finance'
  | 'knowledge'
  | 'memories'
  | 'search'
  | 'settings';

/** Soft accent card icon tile — colored circle behind a module's icon. */
export function IconTile({
  module,
  children,
  size = 40,
}: {
  module: Module;
  children: ReactNode;
  size?: number;
}) {
  return (
    <div
      className={`icon-tile mod-${module}`}
      style={{ width: size, height: size, borderRadius: size / 2 }}
    >
      {children}
    </div>
  );
}

/** Page header: icon tile + title + optional subtitle + optional action slot. */
export function PageHeader({
  module,
  icon,
  title,
  subtitle,
  action,
}: {
  module: Module;
  icon: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        marginBottom: 24,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <IconTile module={module} size={44}>
          {icon}
        </IconTile>
        <div>
          <h1 style={{ fontSize: 22 }}>{title}</h1>
          {subtitle && <p style={{ margin: 0, fontSize: 13 }}>{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/** Colored pill, e.g. a category/status/source tag. */
export function Badge({ module, children }: { module: Module; children: ReactNode }) {
  return <span className={`badge mod-${module}`}>{children}</span>;
}

/** Plain card surface — wraps list items, forms, panels. */
export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return <div className="card" style={style}>{children}</div>;
}

/**
 * Empty state with a colored icon "illustration" (large icon-in-circle,
 * see PHASES.md design-system note on why this stands in for bespoke
 * illustration art) + title + description + optional action.
 */
export function EmptyState({
  module,
  icon,
  title,
  description,
  action,
}: {
  module: Module;
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <IconTile module={module} size={72}>
        {icon}
      </IconTile>
      <h3 style={{ marginTop: 16 }}>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}
