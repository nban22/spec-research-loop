import { CircleAlert, Info, Lightbulb, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type HintTone = 'info' | 'ok' | 'warn' | 'danger';

/** The four tones of `HintBox` (DESIGN_SYSTEM §5.3). A box nested in a Panel has **no** shadow (§4.5). */
const TONE: Record<HintTone, { wrap: string; icon: typeof Info }> = {
  info: { wrap: 'bg-brand-soft border-brand-line text-brand-strong', icon: Info },
  ok: { wrap: 'bg-ok-soft border-ok-line text-ok-strong', icon: Lightbulb },
  warn: { wrap: 'bg-warn-soft border-warn-line text-warn-strong', icon: TriangleAlert },
  danger: {
    wrap: 'bg-danger-soft border-danger-line text-danger-strong',
    icon: CircleAlert,
  },
};

export function HintBox({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: HintTone;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  const Icon = t.icon;
  return (
    <div className={cn('animate-fade-in rounded-md border px-3 py-2 text-xs', t.wrap, className)}>
      <div className="flex gap-2">
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="min-w-0 space-y-1">
          {title && <p className="font-semibold">{title}</p>}
          <div className="leading-relaxed">{children}</div>
        </div>
      </div>
    </div>
  );
}
