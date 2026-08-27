import { cn } from '@/lib/utils';
import { SEVERITY_STYLE } from '@/lib/status-style';
import type { Severity } from '@/lib/types';

/**
 * `Severity` → **khối đặc, góc vuông nhất, CHỮ HOA**, icon họ đa giác (DESIGN_SYSTEM §3.3).
 * Cố ý nặng nhất trong ba nhóm badge: đây là thứ duy nhất người dùng **bắt buộc** phải xử lý
 * trước khi chốt spec. Đây là nơi **duy nhất** đọc ánh xạ của `Severity`.
 */
export function SeverityBadge({
  severity,
  className,
}: {
  severity: Severity;
  className?: string;
}) {
  const style = SEVERITY_STYLE[severity];
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
