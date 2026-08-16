'use client';

import { Check, Lightbulb } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ApiOption } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Phương án "Other" do **giao diện** luôn chèn, không phụ thuộc model có nhớ sinh ra hay không. */
export const OTHER_OPTION: ApiOption = {
  key: 'OTHER',
  label: 'Khác — tôi tự mô tả',
  explain: 'Bạn mô tả cách xử lý của riêng mình; hệ thống ghi lại nguyên văn lý do.',
  example: 'Ví dụ: giữ nguyên khẳng định nhưng ghi chú rằng bằng chứng còn yếu.',
};

/** Dòng "Ví dụ: …" với icon bóng đèn, cỡ chú thích, màu `decide` (DESIGN_SYSTEM §5.3). */
function OptionHint({ example }: { example: string }) {
  if (!example) return null;
  return (
    <p className="text-decide-strong/80 mt-1 flex items-start gap-1 text-xs">
      <Lightbulb className="mt-0.5 size-3 shrink-0" aria-hidden />
      <span>Ví dụ: {example}</span>
    </p>
  );
}

/**
 * A/B/C/**Other** — chức năng 7 của đề.
 *
 * **Tự chèn `Other` nếu API không trả về** — đây là NFR-G-3, không để phụ thuộc LLM.
 * Chọn `Other` thì **bắt buộc** nhập lý do.
 *
 * Hai biến thể chọn theo **độ dài nhãn**, không theo bước (§5.3):
 * - `compact` — lưới ô ngắn tự xuống dòng, nhãn 2–4 chữ
 * - `stacked` — mỗi option một hàng chiếm trọn bề rộng có dấu tích bên phải
 *
 * Option đang chọn dùng **viền dày gấp đôi** — độ dày là tín hiệu chọn, không phải màu (§4.4).
 */
export function OptionList({
  question,
  options,
  variant = 'stacked',
  disabled,
  submitting,
  submitLabel = 'Xác nhận lựa chọn',
  onSubmit,
}: {
  question: string;
  options: ApiOption[];
  variant?: 'compact' | 'stacked';
  disabled?: boolean;
  submitting?: boolean;
  submitLabel?: string;
  onSubmit: (chosenKey: string, customText: string | null) => void;
}) {
  const withOther = options.some((o) => o.key === 'OTHER')
    ? options
    : [...options, OTHER_OPTION];

  const [chosen, setChosen] = useState<string | null>(null);
  const [customText, setCustomText] = useState('');
  const needsReason = chosen === 'OTHER';
  const canSubmit =
    chosen !== null && (!needsReason || customText.trim().length > 0) && !disabled;

  return (
    <div className="space-y-3">
      <p className="text-ink-1 text-sm font-medium">{question}</p>

      <div
        className={cn(
          variant === 'compact' ? 'flex flex-wrap gap-2' : 'flex flex-col gap-2',
        )}
        role="radiogroup"
        aria-label={question}
      >
        {withOther.map((o) => {
          const active = chosen === o.key;
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => setChosen(o.key)}
              className={cn(
                'rounded-md border px-3 py-2 text-left transition-colors',
                active
                  ? 'border-decide-ink bg-decide-soft border-2'
                  : 'border-hairline bg-surface hover:border-decide-line',
                variant === 'compact' ? 'text-xs' : 'w-full text-sm',
                disabled && 'opacity-60',
              )}
            >
              <span className="flex items-start gap-2">
                <span className="text-decide-strong shrink-0 font-semibold">{o.key})</span>
                <span className="min-w-0 flex-1">
                  <span className="text-ink-1 font-medium">{o.label}</span>
                  {o.recommended && (
                    <span className="text-ok-strong bg-ok-soft ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold">
                      GỢI Ý
                    </span>
                  )}
                  {variant === 'stacked' && o.explain && (
                    <span className="text-ink-2 mt-0.5 block text-xs">{o.explain}</span>
                  )}
                  {variant === 'stacked' && <OptionHint example={o.example} />}
                </span>
                {active && (
                  <Check className="text-decide-ink mt-0.5 size-4 shrink-0" aria-hidden />
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Nhãn ngắn ở biến thể gọn ⇒ giải thích của option đang chọn hiện bên dưới. */}
      {variant === 'compact' && chosen && (
        <div className="border-hairline bg-sunken rounded-md border px-3 py-2">
          <p className="text-ink-2 text-xs">
            {withOther.find((o) => o.key === chosen)?.explain}
          </p>
          <OptionHint example={withOther.find((o) => o.key === chosen)?.example ?? ''} />
        </div>
      )}

      {needsReason && (
        <div className="space-y-1.5">
          <Label htmlFor="other-reason" className="text-xs">
            Lý do của bạn <span className="text-danger-ink">*</span>
          </Label>
          <Textarea
            id="other-reason"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="Mô tả cách bạn muốn xử lý. Hệ thống lưu nguyên văn vào lịch sử quyết định."
            rows={3}
          />
        </div>
      )}

      <Button
        className="w-full md:w-auto"
        size="lg"
        disabled={!canSubmit || submitting}
        onClick={() => chosen && onSubmit(chosen, needsReason ? customText.trim() : null)}
      >
        {submitting ? 'Đang lưu…' : submitLabel}
      </Button>
    </div>
  );
}
