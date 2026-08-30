'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity, Grid3x3, ShieldAlert, TrendingDown } from 'lucide-react';
import Link from 'next/link';
import { use } from 'react';
import { HintBox } from '@/components/hint-box';
import { Panel } from '@/components/panel';
import { EmptyState, TableSkeleton } from '@/components/states';
import { StatTileGrid } from '@/components/spec-views';
import { SupportTag } from '@/components/support-tag';
import { api } from '@/lib/api';
import { VERIFIER_FLAG_LABEL } from '@/lib/status-style';
import { CARD_TYPE_LABEL, type CardType, type SupportLabel } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * **Phân tích lỗi trực quan** — issue #19 (làn C). Thuần đọc.
 *
 * Màn hình có **hai tầng khác nhau về độ phân giải**, và nó phải nói ra chứ không trộn:
 * ma trận cặp là ảnh chụp **hiện tại** (vì `CardSource` bị ghi đè mỗi lần verifier chạy),
 * còn bảng so sánh trước/sau đọc từ `VerifierRun` nên có **mọi** lần chạy.
 */

type Matrix<K extends string> = {
  total: number;
  by_type: Record<string, number>;
} & Record<K, string>;

type ErrorAnalysis = {
  project: { id: string; title: string };
  runs: {
    id: string;
    version_no: number;
    created_at: string;
    units_total: number;
    units_l4: number;
    l4_ratio: number | null;
    label_counts: Record<SupportLabel, number>;
    unsupported_ratio: number | null;
    thresholds: Record<string, number | null>;
  }[];
  current: {
    spec_version_id: string | null;
    pairs_total: number;
    overridden: number;
    flag_by_card_type: Matrix<'flag'>[];
    label_by_card_type: (Matrix<'label'> & { label: SupportLabel })[];
  };
};

const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);
const num = (v: number | null) => (v === null ? '—' : String(v));

export default function ErrorsPage({ params }: PageProps<'/projects/[id]/errors'>) {
  const { id } = use(params);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['projects', id, 'error-analysis'],
    queryFn: () => api.get<ErrorAnalysis>(`/projects/${id}/error-analysis`),
  });

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1400px] space-y-3 px-3 py-4 md:px-4">
        <TableSkeleton rows={3} cols={6} />
        <TableSkeleton rows={7} cols={5} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-3 py-4 md:px-4">
        <EmptyState
          icon={ShieldAlert}
          title="Chưa đọc được dữ liệu phân tích"
          description="Hệ thống chưa lấy được kết quả kiểm chứng cứ của dự án này. Bạn vui lòng tải lại trang."
        />
      </div>
    );
  }

  const { runs, current } = data;
  // Loại thẻ nào thực sự có mặt — không vẽ 8 cột rỗng cho một spec chỉ dùng ba loại.
  const types = [
    ...new Set([
      ...current.flag_by_card_type.flatMap((f) => Object.keys(f.by_type)),
      ...current.label_by_card_type.flatMap((l) => Object.keys(l.by_type)),
    ]),
  ].sort() as CardType[];

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-3 px-3 py-4 md:px-4">
      <header className="space-y-1">
        <h1 className="text-ink-1 text-lg font-semibold md:text-xl">Phân tích lỗi</h1>
        <p className="text-ink-3 line-clamp-1 text-xs md:text-sm">
          {data.project.title} ·{' '}
          <Link
            href={`/projects/${id}/step/5`}
            className="text-brand-strong underline underline-offset-2"
          >
            quay lại dự án
          </Link>
        </p>
      </header>

      {runs.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          tone="brand"
          title="Verifier chưa chạy lần nào"
          description="Sang bước 5 và bấm kiểm chứng cứ. Chạy ít nhất hai lần thì bảng so sánh trước/sau mới có gì để so."
        />
      ) : (
        <>
          <Panel accent="decide" icon={TrendingDown} title="So sánh các lần chạy verifier">
            <RunTable runs={runs} />
            {runs.length === 1 && (
              <HintBox tone="info">
                Mới có một lần chạy. Đổi ngưỡng rồi chạy lại ở bước 5 thì bảng này sẽ hiện hai
                dòng, và so được ngưỡng nào cho ra ít nhãn “không có nguồn” hơn.
              </HintBox>
            )}
          </Panel>

          <Panel accent="neutral" icon={Activity} title="Ảnh chụp hiện tại">
            <StatTileGrid
              items={[
                { label: 'Cặp đang có', value: String(current.pairs_total) },
                { label: 'Đã ghi đè lý do', value: String(current.overridden) },
                { label: 'Số lần chạy', value: String(runs.length) },
                {
                  label: 'Ngưỡng đang dùng',
                  value: num(runs[runs.length - 1]?.thresholds.tau_high ?? null),
                },
              ]}
            />
            <HintBox tone="warn" title="Hai bảng dưới là ảnh chụp HIỆN TẠI">
              Mỗi lần verifier chạy, nhãn và cờ của từng cặp bị <strong>ghi đè</strong> — dữ liệu
              mức từng cặp của lần chạy cũ không phục dựng lại được. Vì vậy hai bảng dưới luôn nói
              về lần chạy gần nhất, còn bảng so sánh phía trên mới là thứ nhìn được theo thời gian.
            </HintBox>
          </Panel>

          {current.pairs_total === 0 ? (
            <EmptyState
              icon={Grid3x3}
              title="Phiên bản hiện tại chưa có cặp nào"
              description="Chưa có khẳng định nào được gắn nguồn, nên không có gì để kiểm chứng cứ."
            />
          ) : (
            <>
              <Panel accent="ok" icon={Grid3x3} title="Nhãn × loại thẻ">
                <MatrixTable
                  types={types}
                  rows={current.label_by_card_type.map((l) => ({
                    key: l.label,
                    render: <SupportTag label={l.label} />,
                    total: l.total,
                    by_type: l.by_type,
                  }))}
                  firstCol="Nhãn"
                  note="Mỗi cặp rơi vào đúng một ô, nên tổng bằng số cặp."
                />
              </Panel>

              <Panel accent="neutral" icon={ShieldAlert} title="Cờ chẩn đoán × loại thẻ">
                <MatrixTable
                  types={types}
                  rows={current.flag_by_card_type.map((f) => ({
                    key: f.flag,
                    render: (
                      <span className="text-ink-1">
                        {VERIFIER_FLAG_LABEL[f.flag] ?? f.flag}
                      </span>
                    ),
                    total: f.total,
                    by_type: f.by_type,
                  }))}
                  firstCol="Cờ"
                  note="Một cặp có thể mang nhiều cờ cùng lúc, nên tổng các ô LỚN HƠN số cặp — đây là bảng đếm lần xuất hiện, không phải bảng phân hoạch."
                />
              </Panel>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Mỗi lần chạy một dòng, kèm ngưỡng của chính lần đó. */
function RunTable({ runs }: { runs: ErrorAnalysis['runs'] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-ink-3 border-hairline border-b text-left">
            <th className="py-1.5 pr-2 font-medium">Lúc</th>
            <th className="py-1.5 pr-2 font-medium">Bản</th>
            <th className="py-1.5 pr-2 text-right font-medium">τ_low</th>
            <th className="py-1.5 pr-2 text-right font-medium">τ_high</th>
            <th className="py-1.5 pr-2 text-right font-medium">Cặp</th>
            <th className="py-1.5 pr-2 text-right font-medium">Xuống L4</th>
            <th className="py-1.5 text-right font-medium">Không có nguồn</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr
              key={r.id}
              className="border-hairline ease-out-quart hover:bg-sunken border-b transition-colors duration-150"
            >
              <td className="text-ink-2 py-1.5 pr-2 tabular-nums">
                {new Date(r.created_at).toLocaleString('vi-VN')}
              </td>
              <td className="text-ink-2 py-1.5 pr-2 tabular-nums">v{r.version_no}</td>
              <td className="text-ink-2 py-1.5 pr-2 text-right font-mono tabular-nums">
                {num(r.thresholds.tau_low)}
              </td>
              <td className="text-ink-2 py-1.5 pr-2 text-right font-mono tabular-nums">
                {num(r.thresholds.tau_high)}
              </td>
              <td className="text-ink-2 py-1.5 pr-2 text-right tabular-nums">
                {r.units_total}
              </td>
              <td
                className={cn(
                  'py-1.5 pr-2 text-right tabular-nums',
                  (r.l4_ratio ?? 0) > 0.5 ? 'text-warn-strong' : 'text-ink-2',
                )}
              >
                {pct(r.l4_ratio)}
              </td>
              <td
                className={cn(
                  'py-1.5 text-right font-medium tabular-nums',
                  (r.unsupported_ratio ?? 0) > 0 ? 'text-danger-strong' : 'text-ink-2',
                )}
              >
                {pct(r.unsupported_ratio)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Bảng chéo dùng chung cho cả nhãn lẫn cờ — hai bảng chỉ khác cột đầu và ghi chú. */
function MatrixTable({
  types,
  rows,
  firstCol,
  note,
}: {
  types: CardType[];
  rows: { key: string; render: React.ReactNode; total: number; by_type: Record<string, number> }[];
  firstCol: string;
  note: string;
}) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-ink-3 border-hairline border-b text-left">
              <th className="py-1.5 pr-3 font-medium">{firstCol}</th>
              {types.map((t) => (
                <th key={t} className="py-1.5 pr-2 text-right font-medium whitespace-nowrap">
                  {CARD_TYPE_LABEL[t] ?? t}
                </th>
              ))}
              <th className="py-1.5 text-right font-medium">Tổng</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.key}
                className={cn(
                  'border-hairline ease-out-quart border-b transition-colors duration-150',
                  r.total === 0 ? 'opacity-45' : 'hover:bg-sunken',
                )}
              >
                <td className="py-1.5 pr-3">{r.render}</td>
                {types.map((t) => {
                  const v = r.by_type[t] ?? 0;
                  return (
                    <td
                      key={t}
                      className={cn(
                        'py-1.5 pr-2 text-right tabular-nums',
                        v === 0 ? 'text-ink-4' : 'text-ink-1',
                      )}
                    >
                      {v}
                    </td>
                  );
                })}
                <td className="text-ink-1 py-1.5 text-right font-medium tabular-nums">
                  {r.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-ink-3 text-2xs">{note}</p>
    </>
  );
}
