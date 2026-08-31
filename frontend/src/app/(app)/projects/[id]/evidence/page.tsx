'use client';

import { ShieldQuestion } from 'lucide-react';
import Link from 'next/link';
import { use } from 'react';
import { EvidenceTraceView } from '@/components/evidence-trace';
import { HintBox } from '@/components/hint-box';
import { Panel } from '@/components/panel';
import { StatTileGrid } from '@/components/spec-views';
import { CardSkeleton, EmptyState } from '@/components/states';
import { useEvidenceTrace, useProject } from '@/lib/use-project';

/**
 * **Vì sao nhãn này** — issue #5 (làn A).
 *
 * Verifier gán `SUPPORTED` / `WEAK` / `UNSUPPORTED` cho từng cặp khẳng định–nguồn, nhưng trước
 * trang này người dùng không thấy được **vì sao**. Toàn bộ dữ liệu để giải thích đã nằm sẵn trong
 * database từ đầu; thiếu duy nhất một chỗ để hiện nó ra.
 *
 * Đây không phải màn debug — nó là câu trả lời trực quan cho câu chắc chắn bị hỏi khi vấn đáp:
 * *"làm sao tin nhãn này đúng?"*. Cùng khuôn với `/cost`, `/map`, `/errors` của làn C: màn hình
 * **chỉ đọc** treo ngoài wizard, không thêm endpoint ghi, không thêm bảng.
 */
export default function EvidencePage({
  params,
}: PageProps<'/projects/[id]/evidence'>) {
  const { id } = use(params);
  const { data: detail } = useProject(id);
  const versionId = detail?.currentVersion?.id;
  const { data, isLoading, isError } = useEvidenceTrace(versionId);

  if (isLoading || !detail) {
    return (
      <div className="mx-auto w-full max-w-[1400px] space-y-3 px-3 py-4 md:px-4">
        <CardSkeleton rows={3} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-3 py-4 md:px-4">
        <EmptyState
          icon={ShieldQuestion}
          title="Chưa đọc được bằng chứng"
          description="Dự án này chưa có phiên bản spec nào được kiểm chứng cứ. Chạy kiểm chứng cứ ở bước 5 trước đã."
        />
      </div>
    );
  }

  const total = data.pairs.length;
  const l4Ratio =
    data.run && data.run.units_total > 0
      ? `${Math.round((data.run.units_l4 / data.run.units_total) * 100)}%`
      : '—';
  const fromFullText = data.pairs.filter((p) => p.passages.length > 0).length;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-3 px-3 py-4 md:px-4">
      <header className="space-y-1">
        <h1 className="text-ink-1 text-lg font-semibold md:text-xl">
          Vì sao nhãn này
        </h1>
        <p className="text-ink-3 text-xs md:text-sm">
          Đường đi của {total} cặp khẳng định–nguồn qua các tầng kiểm chứng ·{' '}
          <Link
            href={`/projects/${id}/step/5`}
            className="text-brand-strong underline underline-offset-2"
          >
            quay lại bước 5
          </Link>
        </p>
      </header>

      <Panel accent="brand" icon={ShieldQuestion} title="Tổng quan lần chạy">
        <StatTileGrid
          items={[
            { label: 'Có nguồn hỗ trợ', value: String(data.summary.SUPPORTED) },
            { label: 'Yếu', value: String(data.summary.WEAK) },
            { label: 'Không hỗ trợ', value: String(data.summary.UNSUPPORTED) },
            { label: 'Phải hỏi mô hình', value: l4Ratio },
            { label: 'Đọc từ toàn văn', value: String(fromFullText) },
          ]}
        />
        <HintBox tone="info" title="Cách đọc trang này">
          <p>
            Bấm vào một dòng để xem tầng nào đã quyết định nhãn của nó. Ba tầng đầu chạy bằng luật
            và không tốn token nào; chỉ những cặp nằm trong vùng xám mới được đưa lên mô hình.
          </p>
          <p className="mt-1">
            Ngưỡng hiển thị ở đây là ngưỡng của <strong>chính lần chạy đó</strong> (tương đồng{' '}
            {data.thresholds.tau_low}–{data.thresholds.tau_high}, độ chắc chắn tối thiểu{' '}
            {data.thresholds.conf_min}), không phải ngưỡng hiện hành — nên nhãn cũ vẫn giải thích
            được sau khi ngưỡng được hiệu chỉnh.
          </p>
        </HintBox>
      </Panel>

      <Panel accent="neutral" icon={ShieldQuestion} title="Từng cặp một">
        <EvidenceTraceView data={data} />
      </Panel>
    </div>
  );
}
