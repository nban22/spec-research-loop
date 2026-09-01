import { cn } from '@/lib/utils';
import {
  SUPPORT_STYLE,
  UNVERIFIED_STYLE,
  VERIFIER_FLAG_LABEL,
} from '@/lib/status-style';
import { styleOr } from '@/lib/unknown-style';
import type { SupportLabel, VerifierFlag } from '@/lib/types';

/**
 * `SupportLabel` → **tag rỗng ruột**, viền dày hơn, CHỮ HOA, icon họ khiên (DESIGN_SYSTEM §3.4).
 * Rỗng ruột là cố ý: tag này luôn nằm cạnh tên nguồn trong danh sách; tô nền đặc thì mỗi dòng
 * nguồn thành một vệt màu và bảng related-work sẽ loạn.
 * Đây là nơi **duy nhất** đọc ánh xạ của `SupportLabel`.
 *
 * `verified={false}` **đè lên `label`** và hiện `CHƯA KIỂM`. Lý do phải có: `support_label` có
 * giá trị mặc định `WEAK` ngay từ lúc generator tạo `CardSource`, nên một thẻ vừa sinh xong đã
 * đeo sẵn nhãn WEAK trong khi verifier chưa đọc nó lần nào. Không tách hai thứ này ra thì bảng
 * thẻ ở bước 3 hiện WEAK toàn bộ và người xem kết luận verifier không chống lưng được gì.
 *
 * Bỏ trống `verified` ⇒ coi như đã kiểm — giữ nguyên hành vi cho những chỗ gọi vốn chỉ nhận
 * dữ liệu đã qua verifier (ví dụ tổng hợp theo nhãn ở bước 5).
 */
export function SupportTag({
  label,
  flags,
  verified = true,
  className,
}: {
  label: SupportLabel;
  flags?: VerifierFlag[] | null;
  verified?: boolean;
  className?: string;
}) {
  if (!verified) return <UnverifiedTag className={className} />;
  const style = styleOr(SUPPORT_STYLE, label);
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

/**
 * Cùng hình dạng với `SupportTag` (rỗng ruột, viền dày, CHỮ HOA, icon khiên) nhưng viền **đứt
 * nét** — cùng tín hiệu "chỗ trống" mà `CardStatus.MISSING` đang dùng. Giữ chung hình dạng là
 * cố ý: nó chiếm đúng vị trí của một nhãn, nên phải đọc được như một nhãn.
 *
 * Kèm luôn một câu giải thích bằng chữ, vì đây là chỗ người xem dễ hiểu nhầm nhất trong cả
 * luồng: không nói ra thì "CHƯA KIỂM" trông y như một phán quyết tiêu cực thứ tư.
 */
function UnverifiedTag({ className }: { className?: string }) {
  const Icon = UNVERIFIED_STYLE.icon;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-sm border-2 bg-transparent px-1.5 py-0.5 text-2xs font-bold tracking-wide',
          UNVERIFIED_STYLE.className,
        )}
      >
        <Icon className="size-3" aria-hidden />
        {UNVERIFIED_STYLE.label}
      </span>
      <span className="text-ink-3 text-xs">chưa chạy kiểm chứng cứ cho cặp này</span>
    </span>
  );
}
