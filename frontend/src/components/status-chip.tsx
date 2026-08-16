import { cn } from '@/lib/utils';
import { CARD_STATUS_STYLE } from '@/lib/status-style';
import type { CardStatus } from '@/lib/types';

/**
 * `CardStatus` → **pill bo tròn hoàn toàn**, nền rất nhạt, icon họ vòng tròn (DESIGN_SYSTEM §3.2).
 * Đây là nơi **duy nhất** đọc ánh xạ của `CardStatus`.
 *
 * Nhãn chữ **luôn** hiện, kể cả ở 375px — cấm rút gọn badge thành chấm không chữ (§3.6, §6.10).
 */
export function StatusChip({
  status,
  className,
}: {
  status: CardStatus;
  className?: string;
}) {
  const style = CARD_STATUS_STYLE[status];
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
