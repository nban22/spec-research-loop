'use client';

import { useQuery } from '@tanstack/react-query';
import { GitBranch, History, ScrollText } from 'lucide-react';
import { use, useState } from 'react';
import { Panel } from '@/components/panel';
import { DiffView } from '@/components/diff-view';
import { CardSkeleton, EmptyState } from '@/components/states';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api, qk } from '@/lib/api';
import type { ApiDecision } from '@/lib/types';
import { useDecisionLog } from '@/lib/use-project';

type VersionRow = {
  id: string;
  version_no: number;
  status: string;
  label: string | null;
  parent_version_id: string | null;
  created_by_decision_id: string | null;
  created_at: string;
  _count: { cards: number; judge_runs: number; export_artifacts: number };
};

/**
 * `/projects/:id/versions` — `VersionTimeline` + `DiffView` + `DecisionLog`.
 * Hai cột ở desktop (chọn bên trái, diff bên phải); mobile xếp dọc và chọn bằng select
 * thay vì hai dropdown cạnh nhau (DESIGN_SYSTEM §5.4).
 */
export default function VersionsPage({ params }: PageProps<'/projects/[id]/versions'>) {
  const { id } = use(params);
  const [pickedFrom, setPickedFrom] = useState<string | null>(null);
  const [pickedTo, setPickedTo] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: qk.versions(id),
    queryFn: () => api.get<{ versions: VersionRow[] }>(`/projects/${id}/versions`),
  });
  const { data: decisionData } = useDecisionLog(id);

  const versions = data?.versions ?? [];
  /* Mặc định so hai bản mới nhất — suy ra trong lúc render, không setState trong effect. */
  const to = pickedTo ?? versions[0]?.id ?? null;
  const from = pickedFrom ?? versions[1]?.id ?? null;
  const setTo = setPickedTo;
  const setFrom = setPickedFrom;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-3 px-3 py-4 md:px-4">
      <h1 className="text-ink-1 text-xl font-semibold">Lịch sử phiên bản</h1>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,2fr)]">
        <div className="space-y-3">
          <Panel accent="brand" icon={History} title="Các phiên bản">
            {isLoading ? (
              <CardSkeleton rows={2} />
            ) : versions.length === 0 ? (
              <EmptyState
                title="Chưa có phiên bản nào"
                description="Phiên bản đầu tiên xuất hiện ngay khi bạn tạo dự án."
              />
            ) : (
              <ol className="space-y-2">
                {versions.map((v) => (
                  <li
                    key={v.id}
                    className="border-hairline bg-surface rounded-lg border px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="bg-brand-soft text-brand-strong rounded px-1.5 py-0.5 text-xs font-semibold">
                        v{v.version_no}
                      </span>
                      <span className="text-ink-3 text-xs">{v.status}</span>
                    </div>
                    {v.label && <p className="text-ink-1 mt-1 text-xs">{v.label}</p>}
                    <p className="text-ink-3 mt-1 text-xs">
                      {v._count.cards} thẻ · {v._count.judge_runs} lượt judge ·{' '}
                      {v._count.export_artifacts} lần xuất
                    </p>
                    <p className="text-ink-4 text-xs">
                      {new Date(v.created_at).toLocaleString('vi-VN')}
                    </p>
                    {/* Không có `created_by_decision_id` thì đó là v1 — mọi version sau
                        đều phải sinh ra từ một quyết định của người dùng (NFR-G-3). */}
                    <p className="text-ink-4 text-xs">
                      {v.created_by_decision_id
                        ? 'Sinh ra từ một quyết định của bạn'
                        : 'Phiên bản gốc'}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel accent="neutral" icon={ScrollText} title="Lịch sử quyết định">
            <DecisionLog decisions={decisionData?.decisions ?? []} />
          </Panel>
        </div>

        <Panel accent="ok" icon={GitBranch} title="So sánh hai phiên bản">
          {versions.length < 2 ? (
            <EmptyState
              title="Cần ít nhất hai phiên bản"
              description="Áp dụng một quyết định ở bước 4 để tạo phiên bản thứ hai, rồi quay lại đây so sánh."
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <VersionSelect
                  label="Từ"
                  value={from}
                  versions={versions}
                  onChange={setFrom}
                />
                <VersionSelect label="Đến" value={to} versions={versions} onChange={setTo} />
              </div>
              {from && to && from !== to && <DiffView versionId={to} against={from} />}
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}

function VersionSelect({
  label,
  value,
  versions,
  onChange,
}: {
  label: string;
  value: string | null;
  versions: VersionRow[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-ink-3 text-xs">{label}</span>
      <Select value={value ?? undefined} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Chọn phiên bản" />
        </SelectTrigger>
        <SelectContent>
          {versions.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              v{v.version_no} {v.label ? `· ${v.label.slice(0, 30)}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

/** Mục 14 của spec: thời điểm · câu hỏi · option đã chọn · lý do. Card list ở mobile. */
function DecisionLog({ decisions }: { decisions: ApiDecision[] }) {
  if (decisions.length === 0) {
    return (
      <p className="text-ink-3 text-xs">
        Chưa có quyết định nào. Mọi lựa chọn của bạn đều được ghi lại ở đây và xuất ra mục 14
        của bản đặc tả.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {decisions.map((d) => {
        const chosen =
          d.chosen_key === 'OTHER'
            ? (d.custom_text ?? 'Khác')
            : (d.options.find((o) => o.key === d.chosen_key)?.label ?? d.chosen_key);
        return (
          <li key={d.id} className="border-hairline bg-surface rounded-lg border px-3 py-2">
            <p className="text-ink-4 text-xs">
              {new Date(d.created_at).toLocaleString('vi-VN')} · {d.step} ·{' '}
              {d.actor === 'SCRIPTED' ? 'kịch bản' : 'bạn'}
              {!d.applied && ' · chưa áp dụng'}
            </p>
            <p className="text-ink-1 mt-0.5 text-xs font-medium">{d.question}</p>
            <p className="text-ink-2 text-xs">
              <span className="text-decide-strong font-semibold">{d.chosen_key}</span> — {chosen}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
