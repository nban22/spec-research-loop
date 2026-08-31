'use client';

import { useQuery } from '@tanstack/react-query';
import { Map as MapIcon, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { use } from 'react';
import { HintBox } from '@/components/hint-box';
import { Panel } from '@/components/panel';
import { SourceMapView, type SourceMapData } from '@/components/source-map';
import { CardSkeleton, EmptyState } from '@/components/states';
import { StatTileGrid } from '@/components/spec-views';
import { api, qk } from '@/lib/api';

/**
 * **Bản đồ nguồn** — issue #16 (làn C): dòng thời gian nghiên cứu và bản đồ chủ đề.
 *
 * Trang riêng chứ không nhét vào bước 2 vì hai lý do: bước 2 đã ba cột kín chỗ, và bản đồ này là
 * thứ người ta mở ra ngắm rồi quay lại, không phải thứ thao tác trong luồng. Cùng khuôn với
 * `/cost` (#17) và `/errors` (#19) — cả ba đều là màn hình **chỉ đọc** treo ngoài wizard.
 *
 * Citation graph chưa có: nó cần trường `references` mà `sources/source.client.ts` không xin, và
 * file đó nằm ngoài phạm vi sửa của #16. Hai bản đồ dưới không phụ thuộc vào nó.
 */
export default function SourceMapPage({ params }: PageProps<'/projects/[id]/map'>) {
  const { id } = use(params);
  const { data, isLoading, isError } = useQuery({
    queryKey: qk.sourceMap(id),
    queryFn: () => api.get<SourceMapData>(`/projects/${id}/source-map`),
  });

  if (isLoading) {
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
          icon={MapIcon}
          title="Chưa đọc được bản đồ nguồn"
          description="Hệ thống chưa lấy được dữ liệu của dự án này. Bạn vui lòng tải lại trang."
        />
      </div>
    );
  }

  const cited = data.nodes.filter((n) => n.cited_by > 0).length;
  const sparse = data.nodes.filter((n) => n.sparsity > 0.66).length;
  const years = data.timeline.filter((r) => r.year !== null).map((r) => r.year as number);

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-3 px-3 py-4 md:px-4">
      <header className="space-y-1">
        <h1 className="text-ink-1 text-lg font-semibold md:text-xl">Bản đồ nguồn</h1>
        <p className="text-ink-3 text-xs md:text-sm">
          Dòng thời gian và bản đồ chủ đề của {data.nodes.length} nguồn ·{' '}
          <Link
            href={`/projects/${id}/step/2`}
            className="text-brand-strong underline underline-offset-2"
          >
            quay lại bước 2
          </Link>
        </p>
      </header>

      <Panel accent="brand" icon={Sparkles} title="Tổng quan">
        <StatTileGrid
          items={[
            { label: 'Số nguồn', value: String(data.nodes.length) },
            { label: 'Đang được trích', value: `${cited}/${data.nodes.length}` },
            { label: 'Nằm vùng thưa', value: String(sparse) },
            {
              label: 'Trải năm',
              value: years.length === 0 ? '—' : `${Math.min(...years)}–${Math.max(...years)}`,
            },
          ]}
        />
        <HintBox tone="info">
          Chấm nằm xa mọi chấm khác nghĩa là chủ đề đó ít paper vây quanh. Đó là **gợi ý** chỗ nên
          soi kỹ khi tìm research gap, không phải kết luận — bạn vẫn cần đọc để xác nhận là khoảng
          trống thật chứ không phải do từ khoá tìm chưa trúng.
        </HintBox>
      </Panel>

      <Panel accent="neutral" icon={MapIcon} title="Bản đồ">
        <SourceMapView data={data} />
      </Panel>
    </div>
  );
}
