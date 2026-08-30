'use client';

import { useQuery } from '@tanstack/react-query';
import { Coins, Gauge, Layers, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { use } from 'react';
import { HintBox } from '@/components/hint-box';
import { Panel } from '@/components/panel';
import { CardSkeleton, EmptyState, StatTileSkeleton, TableSkeleton } from '@/components/states';
import { StatTileGrid } from '@/components/spec-views';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * **Bảng theo dõi token, thời gian và chi phí thật** — issue #17 (làn C).
 *
 * `LlmCall` đã ghi đủ cho **mọi** lời gọi từ ngày đầu mà chưa màn hình nào đọc. Trang này chỉ
 * đọc, không có một nút ghi nào.
 */

type Bucket = {
  key: string;
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
  cost_usd: number;
  retried_calls: number;
  failed_calls: number;
};

type CostOverview = {
  project: { id: string; title: string };
  totals: {
    calls: number;
    failed_calls: number;
    retried_calls: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    latency_ms: number;
    cost_usd: number;
  };
  cache: { hit_tokens: number; miss_tokens: number; hit_ratio: number | null };
  reliability: { retry_ratio: number | null; failure_ratio: number | null };
  by_step: Bucket[];
  by_prompt: Bucket[];
  by_model: Bucket[];
  estimate_vs_actual: {
    estimated_usd: number;
    estimated_tokens: number;
    actual_usd: number;
    diff_usd: number;
    diff_ratio: number | null;
  } | null;
};

const n = (v: number) => v.toLocaleString('vi-VN');
const usd = (v: number) => `$${v.toFixed(v < 1 ? 4 : 2)}`;
const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export default function CostPage({ params }: PageProps<'/projects/[id]/cost'>) {
  const { id } = use(params);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['projects', id, 'cost'],
    queryFn: () => api.get<CostOverview>(`/projects/${id}/cost`),
  });

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1400px] space-y-3 px-3 py-4 md:px-4">
        <StatTileSkeleton />
        <TableSkeleton rows={5} cols={5} />
        <CardSkeleton rows={2} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-3 py-4 md:px-4">
        <EmptyState
          icon={Coins}
          title="Chưa đọc được số liệu chi phí"
          description="Hệ thống chưa lấy được dữ liệu của dự án này. Bạn vui lòng tải lại trang."
        />
      </div>
    );
  }

  const t = data.totals;
  const ev = data.estimate_vs_actual;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-3 px-3 py-4 md:px-4">
      <header className="space-y-1">
        <h1 className="text-ink-1 text-lg font-semibold md:text-xl">
          Token, thời gian và chi phí thật
        </h1>
        <p className="text-ink-3 line-clamp-1 text-xs md:text-sm">
          {data.project.title} ·{' '}
          <Link
            href={`/projects/${id}/step/1`}
            className="text-brand-strong underline underline-offset-2"
          >
            quay lại dự án
          </Link>
        </p>
      </header>

      {t.calls === 0 ? (
        <EmptyState
          icon={Coins}
          tone="brand"
          title="Dự án này chưa gọi mô hình lần nào"
          description="Chạy bước 1 để phân tích ý tưởng, rồi quay lại đây. Mỗi lời gọi đều được ghi lại token, độ trễ và số lần thử."
        />
      ) : (
        <>
          <Panel accent="brand" icon={Gauge} title="Tổng quan">
            <StatTileGrid
              items={[
                { label: 'Chi phí thật', value: usd(t.cost_usd) },
                { label: 'Tổng token', value: n(t.total_tokens) },
                { label: 'Lời gọi', value: n(t.calls) },
                { label: 'Tổng thời gian', value: secs(t.latency_ms) },
              ]}
            />
            <StatTileGrid
              items={[
                { label: 'Ăn cache prefix', value: pct(data.cache.hit_ratio) },
                { label: 'Phải thử lại', value: pct(data.reliability.retry_ratio) },
                { label: 'Lời gọi hỏng', value: pct(data.reliability.failure_ratio) },
                { label: 'Token vào / ra', value: `${n(t.prompt_tokens)} / ${n(t.completion_tokens)}` },
              ]}
            />
            <HintBox tone="info">
              Tỉ lệ ăn cache prefix cho biết phần dùng chung của prompt có được đặt ở đầu hay
              không — đặt đúng thì lần gọi sau chỉ trả tiền cho phần khác biệt. Tỉ lệ “phải thử
              lại” cao ở một prompt nào đó nghĩa là prompt đó hay trả JSON sai khuôn.
            </HintBox>
          </Panel>

          {ev && (
            <Panel accent="decide" icon={Coins} title="Ước lượng so với thực tế">
              <StatTileGrid
                items={[
                  { label: 'Dự toán thí nghiệm', value: usd(ev.estimated_usd) },
                  { label: 'Đã tiêu dựng spec', value: usd(ev.actual_usd) },
                  { label: 'Chênh lệch', value: usd(ev.diff_usd) },
                  { label: 'Tỉ lệ chênh', value: pct(ev.diff_ratio) },
                ]}
              />
              <HintBox tone="warn" title="Đọc con số này cho đúng">
                Hai vế đo hai thứ khác nhau: dự toán là tiền cho <strong>thí nghiệm sắp chạy</strong>,
                còn chi phí thật là tiền đã tiêu để <strong>dựng bản đặc tả</strong>. Vì vậy đây là
                thước đo mức lạc quan của bộ ước lượng, không phải hiệu của hai đại lượng cùng loại.
                Cả hai vế dùng chung một đơn giá nên chênh lệch không lẫn chênh giá.
              </HintBox>
            </Panel>
          )}

          <Panel accent="ok" icon={Layers} title="Theo bước">
            <BucketTable rows={data.by_step} firstCol="Bước" />
          </Panel>

          <Panel accent="neutral" icon={RefreshCw} title="Theo prompt">
            <BucketTable rows={data.by_prompt} firstCol="Prompt" mono />
          </Panel>

          <Panel accent="neutral" icon={Layers} title="Theo model">
            <BucketTable rows={data.by_model} firstCol="Model" mono />
          </Panel>
        </>
      )}
    </div>
  );
}

/**
 * Một bảng dùng cho cả ba lát cắt — ba bảng khác nhau chỉ khác cột đầu, tách thành ba component
 * là chép ba lần cùng một thứ.
 *
 * Dưới `md` đổi sang danh sách, không phải bảng bị bẻ (DESIGN_SYSTEM §6.5).
 */
function BucketTable({
  rows,
  firstCol,
  mono,
}: {
  rows: Bucket[];
  firstCol: string;
  mono?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-ink-3 text-xs">Chưa có dữ liệu ở lát cắt này.</p>;
  }
  const total = rows.reduce((a, b) => a + b.cost_usd, 0);

  return (
    <>
      <div className="hidden md:block">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-ink-3 border-hairline border-b text-left">
              <th className="py-1.5 pr-2 font-medium">{firstCol}</th>
              <th className="py-1.5 pr-2 text-right font-medium">Lời gọi</th>
              <th className="py-1.5 pr-2 text-right font-medium">Token</th>
              <th className="py-1.5 pr-2 text-right font-medium">Thời gian</th>
              <th className="py-1.5 pr-2 text-right font-medium">Thử lại</th>
              <th className="py-1.5 text-right font-medium">Chi phí</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.key}
                className="border-hairline ease-out-quart hover:bg-sunken border-b transition-colors duration-150"
              >
                <td className={cn('text-ink-1 py-1.5 pr-2', mono && 'font-mono')}>{r.key}</td>
                <td className="text-ink-2 py-1.5 pr-2 text-right tabular-nums">{n(r.calls)}</td>
                <td className="text-ink-2 py-1.5 pr-2 text-right tabular-nums">
                  {n(r.total_tokens)}
                </td>
                <td className="text-ink-2 py-1.5 pr-2 text-right tabular-nums">
                  {secs(r.latency_ms)}
                </td>
                <td
                  className={cn(
                    'py-1.5 pr-2 text-right tabular-nums',
                    r.retried_calls > 0 ? 'text-warn-strong' : 'text-ink-4',
                  )}
                >
                  {n(r.retried_calls)}
                </td>
                <td className="text-ink-1 py-1.5 text-right font-medium tabular-nums">
                  {usd(r.cost_usd)}
                </td>
              </tr>
            ))}
            <tr>
              <td className="text-ink-2 py-1.5 pr-2 font-medium">Tổng</td>
              <td colSpan={4} />
              <td className="text-ink-1 py-1.5 text-right font-semibold tabular-nums">
                {usd(total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <ul className="space-y-2 md:hidden">
        {rows.map((r) => (
          <li key={r.key} className="border-hairline bg-surface space-y-1 rounded-lg border p-3">
            <p className={cn('text-ink-1 text-sm font-medium', mono && 'font-mono')}>{r.key}</p>
            <dl className="text-ink-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs tabular-nums">
              <div className="flex justify-between">
                <dt className="text-ink-3">Lời gọi</dt>
                <dd>{n(r.calls)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">Token</dt>
                <dd>{n(r.total_tokens)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">Thời gian</dt>
                <dd>{secs(r.latency_ms)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">Chi phí</dt>
                <dd className="text-ink-1 font-medium">{usd(r.cost_usd)}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
