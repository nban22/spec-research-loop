import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export type PanelAccent = 'brand' | 'ok' | 'decide' | 'neutral';

/**
 * A top-level accented card — the brick every column is built from (DESIGN_SYSTEM §5.3).
 * One role per column, one colour per role: left = context (`brand`), middle = system-generated
 * content (`ok`/neutral), right = where a decision is due (`decide`) — §1 principle 2.
 *
 * Only top-level cards carry a shadow, and that shadow is barely visible (§4.5).
 */
const ACCENT: Record<
  PanelAccent,
  { border: string; rule: string; tile: string; title: string }
> = {
  brand: {
    border: 'border-brand-line',
    rule: 'bg-brand-line',
    tile: 'bg-brand-soft text-brand-ink',
    title: 'text-brand-strong',
  },
  ok: {
    border: 'border-ok-line',
    rule: 'bg-ok-line',
    tile: 'bg-ok-soft text-ok-ink',
    title: 'text-ok-strong',
  },
  decide: {
    border: 'border-decide-line',
    rule: 'bg-decide-line',
    tile: 'bg-decide-soft text-decide-ink',
    title: 'text-decide-strong',
  },
  neutral: {
    border: 'border-hairline',
    rule: 'bg-hairline',
    tile: 'bg-sunken text-ink-2',
    title: 'text-ink-1',
  },
};

export function Panel({
  accent = 'neutral',
  icon: Icon,
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  accent?: PanelAccent;
  icon?: LucideIcon;
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const a = ACCENT[accent];
  return (
    <section
      className={cn(
        'bg-surface shadow-card rounded-xl border',
        a.border,
        className,
      )}
    >
      {title && (
        <header className="flex items-start gap-2.5 px-3 py-2.5 sm:px-4">
          {Icon && (
            <span className={cn('rounded-md p-1.5', a.tile)}>
              <Icon className="size-4" aria-hidden />
            </span>
          )}
          <h2 className={cn('min-w-0 flex-1 pt-1 text-sm font-semibold', a.title)}>
            {title}
          </h2>
          {action}
        </header>
      )}
      {/* The rule uses the Radix `Separator`: it sets `role`/`aria-orientation` for us.
          Note the colour must be `bg-*`, not `border-*` — the component paints a fill, not a border. */}
      {title && <Separator className={a.rule} />}
      <div className={cn('space-y-3 px-3 py-3 sm:px-4', bodyClassName)}>{children}</div>
    </section>
  );
}
