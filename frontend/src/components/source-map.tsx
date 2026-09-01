'use client';

import { CircleDot, Clock } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { EmptyState } from '@/components/states';
import { cn } from '@/lib/utils';

/**
 * **Timeline nghiên cứu** và **similarity map** — issue #16 (làn C).
 *
 * Cả hai vẽ bằng SVG viết tay, **không thêm thư viện biểu đồ**: hai hình này chỉ cần chấm tròn,
 * cột và nhãn; kéo cả `recharts` hay `d3` vào bundle để có bấy nhiêu đó là đắt hơn phần thu được
 * (STACK §8 — cấm thêm dependency khi tự viết được).
 *
 * Backend đã trả toạ độ đã chuẩn hoá trong hộp `[-1, 1]` và độ thưa đã ép về `[0, 1]`, nên ở đây
 * chỉ còn phép đổi sang toạ độ màn hình. Cố ý: phép chiếu phải **tất định** và giống nhau giữa
 * mọi client, nên nó thuộc về server chứ không phải chỗ này.
 */

export type SourceNode = {
  id: string;
  title: string;
  year: number | null;
  venue: string | null;
  citation_count: number | null;
  doi_verified: boolean | null;
  cited_by: number;
  x: number;
  y: number;
  sparsity: number;
  nearest: { id: string; title: string; score: number } | null;
};

export type SourceMapData = {
  nodes: SourceNode[];
  timeline: { year: number | null; count: number; cited: number }[];
  weak_text_count: number;
};

/** Khung vẽ cố định; SVG tự co theo `viewBox` nên không cần đo container. */
const W = 640;
const H = 420;
const PAD = 36;

/** Cắt tiêu đề dài cho nhãn cạnh chấm. Tiêu đề paper là văn bản tự do — cắt được. */
function short(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * Bán kính chấm theo số lần trích dẫn, thang **căn bậc hai** để diện tích tỉ lệ với số đo —
 * thang tuyến tính làm paper 5000 trích dẫn nuốt hết phần còn lại của bản đồ.
 */
function radiusOf(citations: number | null): number {
  return 4 + Math.sqrt(Math.max(0, citations ?? 0)) * 0.55;
}

export function SourceMapView({ data }: { data: SourceMapData }) {
  const [tab, setTab] = useState<'similarity' | 'timeline'>('similarity');
  const [focus, setFocus] = useState<string | null>(null);
  const reduced = useReducedMotion();

  if (data.nodes.length === 0) {
    return (
      <EmptyState
        icon={CircleDot}
        title="Chưa có nguồn nào để vẽ"
        description="Bạn hãy chạy tìm nguồn ở bước 2, rồi quay lại đây xem bản đồ."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ViewToggle value={tab} onChange={setTab} />
        {data.weak_text_count > 0 && (
          <p className="text-ink-3 text-2xs">
            {data.weak_text_count}/{data.nodes.length} nguồn thiếu abstract — vị trí của chúng
            trên bản đồ chỉ dựa vào tiêu đề, bạn đọc với mức tin vừa phải.
          </p>
        )}
      </div>

      {/* `mode="wait"` chứ không phải chồng hai view lên nhau: hai hình này cao khác nhau, cho
          chúng cùng tồn tại một nhịp làm cả trang giật chiều cao. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: reduced ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduced ? 0 : -8 }}
          transition={{ duration: reduced ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          {tab === 'similarity' ? (
            <SimilarityMap nodes={data.nodes} focus={focus} onFocus={setFocus} />
          ) : (
            <Timeline rows={data.timeline} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/**
 * Hai nút `aria-pressed` thay vì `Tabs` của shadcn: component đó đã bị gỡ trong đợt revamp và
 * `components/ui/**` nằm ngoài phạm vi được sửa của issue này.
 */
function ViewToggle({
  value,
  onChange,
}: {
  value: 'similarity' | 'timeline';
  onChange: (v: 'similarity' | 'timeline') => void;
}) {
  const opts = [
    { key: 'similarity' as const, label: 'Bản đồ chủ đề', icon: CircleDot },
    { key: 'timeline' as const, label: 'Dòng thời gian', icon: Clock },
  ];
  return (
    <div className="border-hairline inline-flex rounded-md border p-0.5">
      {opts.map((o) => {
        const Icon = o.icon;
        const on = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.key)}
            className={cn(
              'ease-out-quart flex cursor-pointer items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors duration-150',
              on ? 'bg-brand-soft text-brand-strong font-medium' : 'text-ink-3',
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Similarity map: mỗi chấm là một nguồn, gần nhau = gần chủ đề.
 *
 * **Vùng thưa là thứ đáng nhìn nhất ở đây** (§8 của đề — cách phát hiện research gap). Nên độ
 * thưa được tô bằng màu chứ không giấu trong tooltip: cảm ứng không có hover, và thông tin chỉ
 * nằm trong hover thì trên điện thoại là không tồn tại (DS §6.7).
 */
function SimilarityMap({
  nodes,
  focus,
  onFocus,
}: {
  nodes: SourceNode[];
  focus: string | null;
  onFocus: (id: string | null) => void;
}) {
  const sx = (x: number) => PAD + ((x + 1) / 2) * (W - PAD * 2);
  const sy = (y: number) => PAD + ((y + 1) / 2) * (H - PAD * 2);
  const picked = nodes.find((n) => n.id === focus) ?? null;
  const reduced = useReducedMotion();

  return (
    <div className="space-y-2">
      <div className="border-hairline bg-surface overflow-x-auto rounded-lg border">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full min-w-[520px]"
          role="img"
          aria-label={`Bản đồ chủ đề của ${nodes.length} nguồn`}
        >
          {picked?.nearest && (
            <line
              x1={sx(picked.x)}
              y1={sy(picked.y)}
              x2={sx(nodes.find((n) => n.id === picked.nearest?.id)?.x ?? picked.x)}
              y2={sy(nodes.find((n) => n.id === picked.nearest?.id)?.y ?? picked.y)}
              className="stroke-brand-line"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
          )}

          {nodes.map((n, i) => {
            const on = n.id === focus;
            const pick = () => onFocus(on ? null : n.id);
            return (
              /* `<g role="button">` thay vì `<circle onClick>`: phần tử bấm được phải tới được
                 bằng bàn phím và có tên (frontend/CLAUDE.md §7). Cùng khuôn với `concept-map`.
                 Nở ra lệch pha theo thứ tự: bản đồ hiện dần cho mắt kịp bắt cụm, thay vì đổ ập
                 vài chục chấm cùng lúc rồi phải quét lại từ đầu. */
              <motion.g
                key={n.id}
                initial={{ opacity: 0, scale: reduced ? 1 : 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  duration: reduced ? 0 : 0.32,
                  delay: reduced ? 0 : Math.min(i, 24) * 0.022,
                  ease: [0.22, 1, 0.36, 1],
                }}
                style={{ transformOrigin: `${sx(n.x)}px ${sy(n.y)}px` }}
                role="button"
                tabIndex={0}
                aria-label={`Xem chi tiết nguồn ${n.title}`}
                aria-pressed={on}
                className="cursor-pointer"
                onClick={pick}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    pick();
                  }
                }}
              >
                <circle
                  cx={sx(n.x)}
                  cy={sy(n.y)}
                  r={radiusOf(n.citation_count)}
                  className={cn(
                    // Thưa ⇒ ngả sang màu cảnh báo. Ba mức, không dùng gradient liên tục:
                    // mắt không đọc được sắc độ liên tục, còn ba mức thì phân biệt được ngay.
                    n.sparsity > 0.66
                      ? 'fill-warn-ink'
                      : n.sparsity > 0.33
                        ? 'fill-brand-line'
                        : 'fill-brand-ink',
                    // Nguồn chưa claim nào trích: rỗng ruột, để "có nguồn mà chưa dùng" nhìn ra ngay.
                    n.cited_by === 0 && 'fill-surface',
                  )}
                  stroke="currentColor"
                  strokeWidth={on ? 2.5 : 1.2}
                />
                <text
                  x={sx(n.x)}
                  y={sy(n.y) - radiusOf(n.citation_count) - 4}
                  textAnchor="middle"
                  className="fill-ink-3 pointer-events-none text-[9px]"
                >
                  {short(n.title, 26)}
                </text>
              </motion.g>
            );
          })}
        </svg>
      </div>

      <Legend />

      {/* Chi tiết hiện bằng CHỮ dưới bản đồ, không phải tooltip — xem chú thích của hàm này.
          Hộp này **đẩy nội dung dưới nó xuống**, nên phải mở bằng chiều cao chứ không phải chỉ
          mờ dần: hiện tức thì thì cả trang nhảy một nhịp mỗi lần bấm sang nguồn khác. */}
      <AnimatePresence initial={false}>
        {picked && (
          <motion.div
            key={picked.id}
            className="border-hairline bg-surface space-y-1 overflow-hidden rounded-md border px-3 py-2"
            initial={{ opacity: 0, height: reduced ? 'auto' : 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: reduced ? 'auto' : 0 }}
            transition={{ duration: reduced ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="text-ink-1 text-sm font-medium">{picked.title}</p>
          <p className="text-ink-3 text-xs">
            {picked.year ?? 'không rõ năm'}
            {picked.venue ? ` · ${picked.venue}` : ''} · {picked.citation_count ?? 0} trích dẫn ·{' '}
            {picked.cited_by === 0 ? 'chưa claim nào dùng' : `${picked.cited_by} claim đang dùng`}
          </p>
          <p className="text-ink-3 text-xs">
            Độ thưa {(picked.sparsity * 100).toFixed(0)}% ·{' '}
            {picked.nearest
              ? `gần nhất: ${short(picked.nearest.title, 48)} (${(picked.nearest.score * 100).toFixed(0)}%)`
              : 'không nguồn nào cùng từ khoá'}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Legend() {
  return (
    <ul className="text-ink-3 text-2xs flex flex-wrap items-center gap-x-4 gap-y-1">
      <li className="flex items-center gap-1.5">
        <span className="bg-brand-ink inline-block size-2.5 rounded-full" aria-hidden />
        nằm giữa cụm
      </li>
      <li className="flex items-center gap-1.5">
        <span className="bg-warn-ink inline-block size-2.5 rounded-full" aria-hidden />
        vùng thưa — chỗ đáng ngờ có gap
      </li>
      <li className="flex items-center gap-1.5">
        <span
          className="border-ink-3 bg-surface inline-block size-2.5 rounded-full border"
          aria-hidden
        />
        chưa claim nào trích
      </li>
      <li>chấm to = nhiều trích dẫn</li>
    </ul>
  );
}

/**
 * Timeline: mỗi cột một năm có nguồn. Phần đậm là số nguồn **đang được claim trích** — chênh
 * lệch giữa hai phần cho thấy nguồn tìm về rồi để đó.
 */
function Timeline({ rows }: { rows: SourceMapData['timeline'] }) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  const reduced = useReducedMotion();

  return (
    <div className="border-hairline bg-surface space-y-2 rounded-lg border px-3 py-3">
      <div className="flex items-end gap-2 overflow-x-auto pb-1">
        {rows.map((r, i) => (
          <div key={String(r.year)} className="flex min-w-9 flex-1 flex-col items-center gap-1">
            <span className="text-ink-3 text-2xs">{r.count}</span>
            {/* Cột mọc từ đáy lên, lệch pha theo thứ tự năm — mắt đọc được chiều của trục thời
                gian ngay trong lúc hình đang dựng, thay vì thấy cả bảng hiện ra một lúc. */}
            <motion.div
              className="bg-brand-soft flex w-full flex-col justify-end overflow-hidden rounded-t"
              initial={{ height: reduced ? `${(r.count / max) * 120 + 4}px` : 4 }}
              animate={{ height: `${(r.count / max) * 120 + 4}px` }}
              transition={{
                duration: reduced ? 0 : 0.4,
                delay: reduced ? 0 : Math.min(i, 12) * 0.035,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <div
                className="bg-brand-ink w-full rounded-t"
                style={{ height: `${(r.cited / r.count) * 100}%` }}
              />
            </motion.div>
            <span className="text-ink-3 text-2xs whitespace-nowrap">
              {r.year ?? 'không rõ'}
            </span>
          </div>
        ))}
      </div>
      <p className="text-ink-3 text-2xs">
        Cột nhạt là toàn bộ nguồn của năm đó; phần đậm là số nguồn đang được claim trích. Năm
        không có nguồn nào thì không có cột — khoảng trống trên trục là khoảng trống thật.
      </p>
    </div>
  );
}
