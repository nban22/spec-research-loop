import { cn } from '@/lib/utils';
import { SEVERITY_STYLE } from '@/lib/status-style';
import { styleOr } from '@/lib/unknown-style';
import type { Severity } from '@/lib/types';

/**
 * `Severity` → a **solid block, squarest corners, UPPERCASE**, polygon icon family
 * (DESIGN_SYSTEM §3.3). Deliberately the heaviest of the three badge families: it is the one
 * thing the user **must** deal with before finalising the spec. This is the **only** reader of
 * the `Severity` map.
 */
export function SeverityBadge({
  severity,
  className,
}: {
  severity: Severity;
  className?: string;
}) {
  const style = styleOr(SEVERITY_STYLE, severity);
  const Icon = style.icon;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-[3px] px-1.5 py-0.5 text-2xs font-bold tracking-wide',
        style.className,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {style.label}
    </span>
  );
}
