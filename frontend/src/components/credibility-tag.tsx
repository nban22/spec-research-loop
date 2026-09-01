import { cn } from '@/lib/utils';
import { CREDIBILITY_STYLE } from '@/lib/status-style';
import type { CredibilityTier } from '@/lib/types';

/**
 * `styleOr` không dùng được ở đây: nó trả về `StatusStyle` (có `icon`), mà mức tin cậy cố ý
 * **không có icon** — xem docblock dưới. Lối thoát riêng, cùng nguyên tắc: hiện nguyên văn giá
 * trị lạ thay vì nuốt thành "Không rõ".
 */
const FALLBACK = {
  label: '',
  className: 'bg-neutral-soft text-neutral-strong border-neutral-line',
};

/**
 * Mức tin cậy của một nguồn (#1) — **pill nhạt, có nền**, cố ý khác hình dạng `SupportTag`
 * (tag rỗng ruột, viền dày). Hai thứ này hay đứng cạnh nhau và nói hai chuyện khác hẳn:
 * `SupportTag` nói *nguồn này có chống lưng khẳng định không*, còn cái này nói *bản thân nguồn
 * đáng tin tới đâu*. Cùng hình dạng thì người đọc gộp chúng làm một.
 *
 * `reason` là câu backend sinh sẵn bằng luật. **Không bao giờ hiện điểm số** — tiêu chí hoàn thành
 * của #1 là "mỗi mức hiển thị kèm lý do đọc được bằng tiếng Việt, không phải số thô".
 */
export function CredibilityTag({
  tier,
  reason,
  className,
}: {
  tier: CredibilityTier;
  reason?: string;
  className?: string;
}) {
  const known: { label: string; className: string } | undefined =
    CREDIBILITY_STYLE[tier];
  const style = known ?? { ...FALLBACK, label: tier };
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>
      <span
        className={cn(
          'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-2xs font-medium',
          style.className,
        )}
      >
        {style.label}
      </span>
      {/* Lý do hiện bằng CHỮ, không giấu trong tooltip — cảm ứng không có hover (§6.7 luật 1). */}
      {reason && <span className="text-ink-3 text-xs">{reason}</span>}
    </span>
  );
}
