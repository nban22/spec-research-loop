import { cn } from '@/lib/utils';
import { SUPPORT_STYLE, VERIFIER_FLAG_LABEL } from '@/lib/status-style';
import type { SupportLabel, VerifierFlag } from '@/lib/types';

/**
 * `SupportLabel` → **tag rỗng ruột**, viền dày hơn, CHỮ HOA, icon họ khiên (DESIGN_SYSTEM §3.4).
 * Rỗng ruột là cố ý: tag này luôn nằm cạnh tên nguồn trong danh sách; tô nền đặc thì mỗi dòng
 * nguồn thành một vệt màu và bảng related-work sẽ loạn.
 * Đây là nơi **duy nhất** đọc ánh xạ của `SupportLabel`.
 */
export function SupportTag({
  label,
  flags,
  className,
}: {
  label: SupportLabel;
  flags?: VerifierFlag[] | null;
  className?: string;
}) {
  const style = SUPPORT_STYLE[label];
  const Icon = style.icon;
  const reasons = (flags ?? []).map((f) => VERIFIER_FLAG_LABEL[f]).filter(Boolean);

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-sm border-2 bg-transparent px-1.5 py-0.5 text-2xs font-bold tracking-wide',
          style.className,
        )}
      >
        <Icon className="size-3" aria-hidden />
        {style.label}
      </span>
      {/* Lý do hiện bằng CHỮ, không phải tooltip — cảm ứng không có hover (§6.7 luật 1). */}
      {reasons.length > 0 && (
        <span className="text-ink-3 text-xs">{reasons.join(' · ')}</span>
      )}
    </span>
  );
}
