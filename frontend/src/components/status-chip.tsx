import { cn } from '@/lib/utils';
import { CARD_STATUS_STYLE } from '@/lib/status-style';
import { styleOr } from '@/lib/unknown-style';
import type { CardStatus } from '@/lib/types';

/**
 * `CardStatus` → a **fully rounded pill**, very pale fill, circle icon family (DESIGN_SYSTEM §3.2).
 * This is the **only** reader of the `CardStatus` map.
 *
 * The text label is **always** shown, even at 375px — never shrink the badge to a wordless dot
 * (§3.6, §6.10).
 */
export function StatusChip({
  status,
  className,
}: {
  status: CardStatus;
  className?: string;
}) {
  const style = styleOr(CARD_STATUS_STYLE, status);
  const Icon = style.icon;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        style.className,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {style.label}
    </span>
  );
}
