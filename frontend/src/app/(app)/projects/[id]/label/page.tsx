'use client';

import { ClipboardCheck } from 'lucide-react';
import Link from 'next/link';
import { use, useState } from 'react';
import { HintBox } from '@/components/hint-box';
import { Panel } from '@/components/panel';
import { CardSkeleton, EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { SupportLabel } from '@/lib/types';
import {
  useLabelQueue,
  useProject,
  useRecordHumanCheck,
} from '@/lib/use-project';

/**
 * **Gán nhãn tay cho cặp khẳng định–nguồn** — issue #4 (làn A).
 *
 * `thresholds.ts` tự thú rằng 0,35 / 0,72 / 0,7 *"là ước đoán, không phải số đo"*. Trang này là
 * đầu vào để biến chúng thành số đo: người chấm đọc khẳng định và tóm tắt nguồn rồi tự quyết,
 * sau đó `eval/calibrate.ts` quét lưới ngưỡng trên tập nhãn đó.
 *
 * **Chấm mù là cả điểm của trang.** Màn hình này cố ý không hiện nhãn máy, độ tương đồng, hay bất
 * kỳ cờ chẩn đoán nào — backend cũng không trả chúng về. Thấy nhãn máy trước khi chọn thì phép đo
 * chỉ còn là "người có đồng ý với chính mình không".
 */
const CHOICES: { label: SupportLabel; text: string; hint: string }[] = [
  {
    label: 'SUPPORTED',
    text: 'Có hỗ trợ',
    hint: 'Tóm tắt nói đúng điều khẳng định nói.',
  },
  {
    label: 'WEAK',
    text: 'Yếu',
    hint: 'Có liên quan nhưng không đủ để kết luận.',
  },
  {
    label: 'UNSUPPORTED',
    text: 'Không hỗ trợ',
    hint: 'Không nói về điều đó, hoặc nói ngược lại.',
  },
];

export default function LabelPage({ params }: PageProps<'/projects/[id]/label'>) {
  const { id } = use(params);
  const { data: detail } = useProject(id);
  const versionId = detail?.currentVersion?.id;
  const { data, isLoading, isError } = useLabelQueue(versionId);
  const record = useRecordHumanCheck(versionId);
  const [justSaved, setJustSaved] = useState(false);

  if (isLoading || !detail) {
    return (
      <div className="mx-auto w-full max-w-[900px] space-y-3 px-3 py-4 md:px-4">
        <CardSkeleton rows={2} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto w-full max-w-[900px] px-3 py-4 md:px-4">
        <EmptyState
          icon={ClipboardCheck}
          title="Chưa có cặp nào để gán nhãn"
          description="Dự án này chưa có phiên bản spec nào được kiểm chứng cứ. Chạy kiểm chứng cứ ở bước 5 trước đã."
        />
      </div>
    );
  }

  const current = data.items[0] ?? null;
  const { labelled, labelled_total, target } = data.progress;
  const pct = Math.min(100, Math.round((labelled_total / target) * 100));

  return (
    <div className="mx-auto w-full max-w-[900px] space-y-3 px-3 py-4 md:px-4">
      <header className="space-y-1">
        <h1 className="text-ink-1 text-lg font-semibold md:text-xl">
          Gán nhãn cho cặp khẳng định–nguồn
        </h1>
        <p className="text-ink-3 text-xs md:text-sm">
          Dùng để hiệu chỉnh ngưỡng của bộ kiểm chứng cứ ·{' '}
          <Link
            href={`/projects/${id}/evidence`}
            className="text-brand-strong underline underline-offset-2"
          >
            xem trang giải trình nhãn
          </Link>
        </p>
      </header>

      <Panel accent="brand" icon={ClipboardCheck} title="Tiến độ">
        <div className="space-y-2">
          <Progress value={pct} />
          <p className="text-ink-3 text-xs">
            Đã gán {labelled_total}/{target} cặp trên toàn hệ thống ({labelled} cặp
            thuộc dự án này). Còn {data.progress.remaining} cặp chưa gán ở phiên bản
            hiện tại.
          </p>
        </div>
        <HintBox tone="info" title="Chấm mù — đọc kỹ chỗ này">
          <p>
            Màn hình này <strong>cố ý không hiện nhãn máy</strong>. Bạn tự đọc khẳng định và tóm
            tắt rồi quyết định; hệ thống chỉ so hai bên với nhau ở phía server. Nếu bạn nhìn thấy
            nhãn máy trước khi chọn thì con số đo được sau đó không còn nghĩa gì.
          </p>
          <p className="mt-1">
            Cố gắng gán đủ {target} cặp và trải đều cả ba nhãn — đừng chỉ chọn những cặp dễ.
          </p>
        </HintBox>
      </Panel>

      {!current ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Đã gán hết các cặp của phiên bản này"
          description={
            labelled_total >= target
              ? `Đủ ${labelled_total} cặp. Chạy "npx tsx eval/calibrate.ts" để xem bảng so sánh các bộ ngưỡng.`
              : `Mới có ${labelled_total}/${target} cặp. Mở thêm một dự án khác để gán tiếp cho đủ cỡ mẫu.`
          }
        />
      ) : (
        <Panel accent="decide" icon={ClipboardCheck} title="Cặp đang xét">
          <div className="space-y-3">
            <section>
              <p className="text-ink-4 text-2xs tracking-wide uppercase">
                Khẳng định
              </p>
              <p className="text-ink-1 mt-1 text-sm font-medium">
                {current.claim_title}
              </p>
              <p className="text-ink-2 mt-1 text-sm">{current.claim_body}</p>
            </section>

            <section>
              <p className="text-ink-4 text-2xs tracking-wide uppercase">
                Nguồn được trích
              </p>
              <p className="text-ink-2 mt-1 text-sm font-medium">
                {current.source_title}
                {current.source_year ? ` (${current.source_year})` : ''}
              </p>
              <ScrollArea className="border-hairline bg-sunken mt-1 max-h-56 rounded-md border p-2">
                <p className="text-ink-2 text-sm leading-relaxed">
                  {current.source_abstract || 'Nguồn này không có tóm tắt.'}
                </p>
              </ScrollArea>
            </section>

            <fieldset className="space-y-2">
              <legend className="text-ink-1 text-sm font-medium">
                Tóm tắt này có hỗ trợ khẳng định trên không?
              </legend>
              <div className="grid gap-2 md:grid-cols-3">
                {CHOICES.map((c) => (
                  <Button
                    key={c.label}
                    variant="outline"
                    size="lg"
                    className="h-auto cursor-pointer flex-col items-start gap-0.5 py-2 text-left whitespace-normal"
                    disabled={record.isPending}
                    onClick={() =>
                      record.mutate(
                        {
                          cardSourceId: current.card_source_id,
                          label: c.label,
                        },
                        {
                          onSuccess: () => {
                            // Cố ý **không** báo "khớp / không khớp với máy": nói ra là hỏng
                            // tính mù cho những cặp còn lại của cùng người chấm.
                            setJustSaved(true);
                            window.setTimeout(() => setJustSaved(false), 1200);
                          },
                        },
                      )
                    }
                  >
                    <span className="text-sm font-medium">{c.text}</span>
                    <span className="text-ink-3 text-xs font-normal">
                      {c.hint}
                    </span>
                  </Button>
                ))}
              </div>
              {justSaved && (
                <p className="text-ok-strong text-xs">Đã ghi nhãn của bạn.</p>
              )}
            </fieldset>
          </div>
        </Panel>
      )}
    </div>
  );
}
