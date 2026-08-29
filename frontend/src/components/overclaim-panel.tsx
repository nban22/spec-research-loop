'use client';

import { Check, Megaphone, ScanSearch, ShieldCheck, Zap } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/states';
import { Panel } from '@/components/panel';
import { SeverityBadge } from '@/components/severity-badge';
import { ApiError } from '@/lib/api';
import type { Severity } from '@/lib/types';
import {
  useChooseOverclaimExit,
  useOverclaimFlags,
  useScanOverclaim,
  type ApiOverclaimFlag,
  type ApiOverclaimOption,
  type OverclaimExit,
} from '@/lib/use-overclaim';
import { cn } from '@/lib/utils';

/**
 * **B1 · Cờ claim bị phóng đại** (#7) — hiển thị ở bước 4, cạnh bảng issue của hội đồng judge.
 *
 * Khác bảng issue ở một điểm quan trọng: mỗi cờ **luôn kèm một câu thu hẹp dùng được ngay**,
 * không phải lời cảnh báo suông. Ba nút bên dưới là ba đường ra của Bước 10; bấm cái nào thì
 * lựa chọn đó được ghi thành `Decision`.
 */
export function OverclaimPanel({ versionId }: { versionId: string | undefined }) {
  const { data, isLoading } = useOverclaimFlags(versionId);
  const scan = useScanOverclaim(versionId);

  const flags = data?.flags ?? [];
  const options = data?.options ?? [];
  const byRule = flags.filter((f) => f.llm_calls === 0).length;

  return (
    <Panel
      accent={flags.length > 0 ? 'decide' : 'neutral'}
      icon={Megaphone}
      title="Claim bị phóng đại"
      action={
        <Button
          size="sm"
          variant="outline"
          disabled={scan.isPending || !versionId}
          onClick={() =>
            scan.mutate(undefined, {
              onSuccess: (res) => {
                if (!res.enabled) {
                  toast.info(
                    'Bộ bắt claim phóng đại đang tắt cho dự án này. Bật cờ overclaim_detector để dùng.',
                  );
                  return;
                }
                toast.success(
                  `Đã quét ${res.scanned} khẳng định — ${res.flagged} bị cờ (${res.byRule} bằng luật, ${res.byLlm} lời gọi LLM).`,
                );
              },
              onError: (err) =>
                toast.error(
                  err instanceof ApiError
                    ? err.message
                    : 'Hệ thống chưa quét được. Bạn vui lòng thử lại.',
                ),
            })
          }
        >
          {scan.isPending ? 'Đang quét…' : 'Quét lại'}
        </Button>
      }
    >
      {isLoading ? (
        <p className="text-ink-3 text-xs">Đang tải cờ phóng đại…</p>
      ) : flags.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          tone="ok"
          title="Không có khẳng định nào bị cờ"
          description="Phạm vi mỗi khẳng định đều nằm trong thứ kế hoạch thí nghiệm chứng minh được."
        />
      ) : (
        <>
          <p className="text-ink-3 flex items-center gap-1.5 text-xs">
            <Zap className="size-3 shrink-0" aria-hidden />
            {byRule}/{flags.length} cờ do tầng luật bắt, không tốn lời gọi LLM nào.
          </p>
          <ul className="space-y-2.5">
            {flags.map((flag) => (
              <FlagRow
                key={flag.id}
                flag={flag}
                options={options}
                versionId={versionId}
              />
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

function FlagRow({
  flag,
  options,
  versionId,
}: {
  flag: ApiOverclaimFlag;
  options: ApiOverclaimOption[];
  versionId: string | undefined;
}) {
  const choose = useChooseOverclaimExit(versionId);
  const [chosen, setChosen] = useState<OverclaimExit | null>(null);
  const settled = flag.chosen_exit !== null;

  return (
    <li className="border-hairline bg-sunken rounded-md border px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {/* `NONE` không bao giờ được ghi xuống DB, nên mức ở đây luôn là một `Severity` hợp lệ. */}
        <SeverityBadge severity={flag.level as Severity} />
        <span className="text-ink-1 text-xs font-medium">{flag.card_title}</span>
        <span
          className={cn(
            'text-2xs inline-flex items-center gap-1 rounded-[3px] px-1.5 py-0.5 font-medium',
            flag.detector === 'RULE' ? 'bg-ok-soft text-ok-ink' : 'bg-brand-soft text-brand-ink',
          )}
        >
          {flag.detector === 'RULE' ? (
            <>
              <Zap className="size-3" aria-hidden />0 token
            </>
          ) : (
            <>
              <ScanSearch className="size-3" aria-hidden />
              LLM
            </>
          )}
        </span>
      </div>

      <p className="text-ink-2 mt-1.5 text-xs">{flag.rationale}</p>

      {flag.matched_terms.length > 0 && (
        <p className="text-ink-3 mt-1 text-xs">
          Cụm bị bắt:{' '}
          <span className="font-mono">{flag.matched_terms.join(' · ')}</span>
        </p>
      )}

      {flag.suggested_narrowing && (
        <div className="border-decide-line bg-surface mt-2 rounded-md border px-2.5 py-2">
          <p className="text-ink-3 text-2xs mb-1 font-medium tracking-wide uppercase">
            Câu thu hẹp đề xuất
          </p>
          {/* Nội dung spec là tiếng Anh backend trả về — FE render nguyên văn, không dịch. */}
          <p className="text-ink-1 text-xs">{flag.suggested_narrowing}</p>
        </div>
      )}

      {settled ? (
        <p className="text-ok-strong mt-2 flex items-center gap-1.5 text-xs font-medium">
          <Check className="size-3.5 shrink-0" aria-hidden />
          Đã chọn: {labelOf(options, flag.chosen_exit)}
        </p>
      ) : (
        <div className="mt-2.5 space-y-1.5">
          {options.map((opt) => {
            const isChosen = chosen === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                disabled={choose.isPending}
                onClick={() => setChosen(opt.key as OverclaimExit)}
                className={cn(
                  'block w-full rounded-md border px-2.5 py-2 text-left transition-colors',
                  isChosen
                    ? 'border-decide-line border-2 bg-decide-soft'
                    : 'border-hairline bg-surface hover:bg-sunken',
                  // Tailwind v4 bỏ `cursor: pointer` mặc định của `<button>`; `option-list.tsx`
                  // cũng khai tay đúng cặp này.
                  choose.isPending
                    ? 'cursor-not-allowed opacity-60'
                    : 'cursor-pointer',
                )}
              >
                <span className="text-ink-1 text-xs font-medium">
                  {opt.label}
                  {opt.key === flag.recommended_exit && (
                    <span className="text-decide-strong ml-1.5 font-normal">
                      · Hệ thống đề xuất
                    </span>
                  )}
                </span>
                <span className="text-ink-3 mt-0.5 block text-xs">{opt.explain}</span>
              </button>
            );
          })}
          <Button
            size="sm"
            className="w-full"
            disabled={chosen === null || choose.isPending}
            onClick={() => {
              if (!chosen) return;
              choose.mutate(
                { flagId: flag.id, exit: chosen },
                {
                  onSuccess: () => toast.success('Đã ghi lại lựa chọn của bạn.'),
                  onError: (err) =>
                    toast.error(
                      err instanceof ApiError
                        ? err.message
                        : 'Hệ thống chưa lưu được lựa chọn. Vui lòng thử lại.',
                    ),
                },
              );
            }}
          >
            {choose.isPending ? 'Đang lưu…' : 'Ghi lại lựa chọn'}
          </Button>
        </div>
      )}
    </li>
  );
}

function labelOf(options: ApiOverclaimOption[], key: string | null): string {
  return options.find((o) => o.key === key)?.label ?? (key ?? '');
}
