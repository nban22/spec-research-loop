'use client';

import { Check, Download, FileText, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ApiEstimate, ApiExperimentPlan, ApiSpecSection } from '@/lib/types';
import { cn } from '@/lib/utils';
import { HintBox } from './hint-box';

/** TN1…TNn: mã thí nghiệm + tiêu đề + các gạch đầu dòng. */
export function ExperimentPlanList({ plan }: { plan: ApiExperimentPlan }) {
  return (
    <ol className="space-y-2">
      {plan.experiments.map((e) => (
        <li
          key={e.code}
          className="border-hairline bg-surface ease-out-quart hover:border-brand-line hover:shadow-card rounded-lg border p-3 transition-[border-color,box-shadow] duration-150"
        >
          <p className="text-ink-1 text-sm font-semibold">
            <span className="text-brand-strong">{e.code}</span> — {e.title}
          </p>
          <ul className="mt-1.5 space-y-1">
            {e.bullets.map((b, i) => (
              <li key={i} className="text-ink-2 flex gap-1.5 text-xs">
                <span className="text-ink-4">•</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          {e.linked_claim_title && (
            <p className="text-ink-3 mt-1.5 text-xs italic">
              Kiểm chứng khẳng định: {e.linked_claim_title}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Lưới ô thông số. Container query: ô ngắn, hai cột ở 375px vẫn thoải mái (§6.5, §6.8). */
export function StatTileGrid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="@container">
      <dl className="grid grid-cols-2 gap-2 @lg:grid-cols-4">
        {items.map((s) => (
          <div
            key={s.label}
            className="border-hairline bg-sunken ease-out-quart hover:border-brand-line rounded-md border px-2.5 py-2 transition-colors duration-150"
          >
            <dt className="text-ink-3 text-xs">{s.label}</dt>
            <dd className="text-ink-1 text-sm font-semibold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** VRAM · Thời gian · Token · Chi phí + cảnh báo khi vượt ngưỡng RTX 3090. */
export function EstimateRows({ estimate }: { estimate: ApiEstimate }) {
  const rows = [
    { label: 'VRAM', value: `${estimate.vram_gb} GB`, warn: !estimate.fits_rtx3090 },
    { label: 'Thời gian', value: `${estimate.hours_min}–${estimate.hours_max} giờ` },
    { label: 'Token', value: estimate.tokens_est.toLocaleString('vi-VN') },
    { label: 'Chi phí API', value: `~$${estimate.cost_usd}` },
  ];

  return (
    <div className="space-y-2">
      <dl className="divide-hairline border-hairline divide-y rounded-md border">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between px-3 py-2">
            <dt className="text-ink-2 text-xs">{r.label}</dt>
            <dd
              className={cn(
                'text-sm font-semibold tabular-nums',
                r.warn ? 'text-danger-strong' : 'text-ink-1',
              )}
            >
              {r.value}
            </dd>
          </div>
        ))}
      </dl>

      {estimate.warn_near_limit && (
        <HintBox tone={estimate.fits_rtx3090 ? 'warn' : 'danger'} title="Kiểm tra tính khả thi">
          {estimate.fits_rtx3090
            ? `Ước tính ${estimate.vram_gb} GB — vẫn vừa RTX 3090 (24 GB) nhưng đã sát ngưỡng.`
            : `Ước tính ${estimate.vram_gb} GB — vượt 24 GB của RTX 3090.`}
        </HintBox>
      )}

      {estimate.downscale_suggestion && (
        <HintBox tone="warn" title="Đề xuất giảm quy mô">
          <ul className="space-y-1">
            {estimate.downscale_suggestion.map((s, i) => (
              <li key={i}>
                <span className="font-medium">
                  {s.field}: {String(s.from)} → {String(s.to)}
                </span>
                <span className="block">{s.reason}</span>
              </li>
            ))}
          </ul>
        </HintBox>
      )}

      <details className="text-ink-3 text-xs">
        <summary className="cursor-pointer">Công thức đã dùng</summary>
        <ul className="mt-1 space-y-0.5 pl-3">
          {estimate.breakdown.map((b) => (
            <li key={b.label}>
              <span className="font-medium">{b.label}:</span> {b.value}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/**
 * **14 mục** của spec kèm trạng thái đủ/thiếu (mockup 5 chỉ vẽ 10 — lấy 14 theo đề, §8 #9).
 * Phải cuộn được ở mobile vì 14 dòng dài hơn một màn 375px.
 */
export function SpecChecklist({ sections }: { sections: ApiSpecSection[] }) {
  const present = sections.filter((s) => s.present).length;
  return (
    <div className="space-y-2">
      <p className="text-ink-2 text-xs">
        Đã có <span className="text-ink-1 font-semibold tabular-nums">{present}/14</span> mục
      </p>
      <ol className="space-y-1">
        {sections.map((s, i) => (
          <li
            key={s.key}
            /* So le 30ms: 14 mục tick lần lượt theo thứ tự đọc thay vì bật ra cùng lúc. */
            style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
            className="animate-rise flex items-start gap-2 text-xs"
          >
            <span
              className={cn(
                'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full',
                s.present ? 'bg-ok-soft text-ok-strong' : 'bg-neutral-soft text-neutral-ink',
              )}
            >
              {s.present ? (
                <Check className="size-2.5" aria-hidden />
              ) : (
                <Minus className="size-2.5" aria-hidden />
              )}
            </span>
            <span className={s.present ? 'text-ink-1' : 'text-ink-4'}>
              {s.no}. {s.title}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Mục lục để **đọc** — khác `SpecChecklist` là bảng kiểm đủ/thiếu (§5.3). */
export function SpecOutline({ sections }: { sections: ApiSpecSection[] }) {
  return (
    <ol className="space-y-1.5">
      {sections.map((s) => (
        <li key={s.key} className="flex gap-2">
          <span className="bg-sunken text-ink-3 mt-0.5 flex size-5 shrink-0 items-center justify-center rounded text-2xs font-semibold">
            {s.no}
          </span>
          <span className="min-w-0">
            <span className="text-ink-1 block text-xs font-medium">{s.title}</span>
            <span className="text-ink-3 line-clamp-1 block text-xs">
              {s.body.replace(/[#*_`|-]/g, ' ').slice(0, 90) || 'Chưa có nội dung'}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** "LLM tóm tắt cách làm" (mockup 5 cột phải): 4 bước đánh số trong vòng tròn `ok`. */
export function HowItWorksList({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-2">
          <span className="bg-ok-soft text-ok-strong flex size-5 shrink-0 items-center justify-center rounded-full text-2xs font-semibold">
            {i + 1}
          </span>
          <span className="text-ink-2 text-xs leading-relaxed">{s}</span>
        </li>
      ))}
    </ol>
  );
}

/** Hai hàng Trước/Sau (mockup 5); dùng lại làm preview trước khi tạo version mới. */
export function BeforeAfter({ before, after }: { before: string; after: string }) {
  return (
    <div className="space-y-2">
      <div className="border-hairline bg-sunken rounded-md border px-3 py-2">
        <p className="text-ink-3 text-xs font-medium">Trước</p>
        <p className="text-ink-2 text-xs">{before}</p>
      </div>
      <div className="border-ok-line bg-ok-soft rounded-md border px-3 py-2">
        <p className="text-ok-strong text-xs font-medium">Sau</p>
        <p className="text-ink-1 text-xs">{after}</p>
      </div>
    </div>
  );
}

/**
 * Xác nhận spec · Xuất PDF · Xuất Markdown.
 * Khi verifier còn chặn thì **disable kèm lý do hiển thị bằng chữ** — tooltip không dùng được
 * trên cảm ứng (§6.7 luật 1).
 */
export function ExportBar({
  blocked,
  blockedReason,
  exporting,
  onExport,
  onBackToEdit,
}: {
  blocked: boolean;
  blockedReason?: string;
  exporting: 'MD' | 'PDF' | null;
  onExport: (format: 'MD' | 'PDF') => void;
  onBackToEdit: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          size="lg"
          className="flex-1"
          disabled={blocked || exporting !== null}
          onClick={() => onExport('PDF')}
        >
          <FileText className="size-4" aria-hidden />
          {exporting === 'PDF' ? 'Đang dựng PDF…' : 'Xuất PDF'}
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="flex-1"
          disabled={blocked || exporting !== null}
          onClick={() => onExport('MD')}
        >
          <Download className="size-4" aria-hidden />
          {exporting === 'MD' ? 'Đang dựng…' : 'Xuất Markdown'}
        </Button>
      </div>
      <Button variant="ghost" size="sm" className="w-full" onClick={onBackToEdit}>
        Quay lại chỉnh sửa thêm
      </Button>
      {blocked && blockedReason && (
        <HintBox tone="danger" title="Chưa xuất bản được">
          {blockedReason}
        </HintBox>
      )}
    </div>
  );
}
