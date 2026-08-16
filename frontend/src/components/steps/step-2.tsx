'use client';

import { useQueryClient } from '@tanstack/react-query';
import { BookMarked, Filter, Search, Telescope } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { HintBox } from '@/components/hint-box';
import { JobProgress } from '@/components/job-progress';
import { OptionList } from '@/components/option-list';
import { Panel } from '@/components/panel';
import { SpecCard } from '@/components/spec-cards';
import { KeywordChipInput, RelatedWorkTable, SourceFilterList } from '@/components/sources';
import { CardSkeleton, EmptyState } from '@/components/states';
import { SummaryBar } from '@/components/summary-bar';
import { WizardShell } from '@/components/wizard-shell';
import {
  useAnswerDecision,
  useCards,
  useJobAction,
  usePendingDecisions,
  useProject,
  useSources,
} from '@/lib/use-project';

const FILTERS = [
  { key: 'peer', label: 'Có nơi công bố (peer-reviewed)' },
  { key: 'doi', label: 'Có DOI' },
  { key: 'recent', label: 'Từ 2020 trở lại đây' },
  { key: 'abstract', label: 'Có abstract để đối chiếu' },
];

/**
 * **B2 · Nghiên cứu liên quan & Research Gap** (DESIGN_SYSTEM §5.4, preset *giữa rộng*).
 *
 * Thứ tự **tìm nguồn thật trước, gọi LLM sau** là cả thiết kế của bước này (C1 · F.6):
 * bảng related work được điền **từ danh sách paper đã nằm trong kho**, không phải từ trí nhớ
 * của model.
 */
export function Step2({ projectId }: { projectId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: detail } = useProject(projectId);
  const versionId = detail?.currentVersion?.id;
  const { data: sourceData, isLoading: loadingSources } = useSources(projectId);
  const { data: cardData } = useCards(versionId);
  const { data: pendingData } = usePendingDecisions(projectId);
  const job = useJobAction(projectId);
  const answer = useAnswerDecision(projectId);

  const [active, setActive] = useState<string[]>([]);
  /* Từ khoá mặc định suy ra từ meta **trong lúc render**; state chỉ giữ phần người dùng đã sửa,
     nên không cần setState trong effect (gây render dây chuyền). */
  const [editedKeywords, setEditedKeywords] = useState<string[] | null>(null);
  const keywords =
    editedKeywords ?? (detail?.currentVersion?.meta?.search_keywords ?? []).slice(0, 4);
  const setKeywords = setEditedKeywords;

  const allSources = sourceData?.sources ?? [];
  const sources = allSources.filter((s) => {
    if (active.includes('peer') && !s.venue) return false;
    if (active.includes('doi') && !s.doi) return false;
    if (active.includes('recent') && (s.year ?? 0) < 2020) return false;
    if (active.includes('abstract') && !s.abstract) return false;
    return true;
  });

  const gaps = (cardData?.cards ?? []).filter((c) => c.type === 'GAP');
  const pending = (pendingData?.decisions ?? []).filter((d) => d.step === 'S2');
  const relatedRows = sources.slice(0, 12).map((s) => ({
    id: s.id,
    source: s,
    what_done: s.abstract?.slice(0, 220) ?? 'Không có abstract từ provider.',
    feedback_type: s.venue ? 'Đã công bố' : 'Bản tiền ấn',
    what_missing: '—',
  }));

  const context = (
    <>
      <Panel accent="brand" icon={Search} title="Từ khoá tìm nguồn">
        <KeywordChipInput keywords={keywords} onChange={setKeywords} />
        <Button
          className="w-full"
          size="lg"
          disabled={keywords.length === 0 || job.busy}
          onClick={() =>
            job.run(`/projects/${projectId}/sources/search`, { queries: keywords.slice(0, 6) })
          }
        >
          <Search className="size-4" aria-hidden />
          {job.busy ? 'Đang tìm…' : 'Tìm nguồn thật'}
        </Button>
        <HintBox tone="info">
          Nguồn chỉ đến từ Semantic Scholar và OpenAlex. Hệ thống không được phép tự nghĩ ra
          paper — cả hai nhà cung cấp cùng hỏng thì bước này dừng lại.
        </HintBox>
      </Panel>

      <Panel accent="neutral" icon={Filter} title="Nguồn ưu tiên">
        <SourceFilterList
          filters={FILTERS.map((f) => ({ ...f, checked: active.includes(f.key) }))}
          onToggle={(key) =>
            setActive((prev) =>
              prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
            )
          }
        />
        <p className="text-ink-3 text-xs">
          Hiện {sources.length}/{allSources.length} nguồn
        </p>
      </Panel>
    </>
  );

  const content = (
    <>
      <JobProgress view={job.view} onReload={job.reload} />

      <Panel accent="ok" icon={BookMarked} title="Bảng nghiên cứu liên quan">
        {loadingSources ? (
          <CardSkeleton rows={3} />
        ) : allSources.length === 0 ? (
          <EmptyState
            title="Chưa tìm nguồn lần nào"
            description="Sửa từ khoá bên trái rồi bấm “Tìm nguồn thật”. Mỗi paper lấy về đều được lưu kèm nguyên văn phản hồi API để chứng minh nó có thật."
          />
        ) : (
          <>
            <RelatedWorkTable rows={relatedRows} />
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                disabled={job.busy}
                onClick={() => job.run(`/projects/${projectId}/related-work`)}
              >
                Dựng nhận xét cho bảng
              </Button>
              <Button
                size="sm"
                disabled={job.busy}
                onClick={() => job.run(`/projects/${projectId}/gap`)}
              >
                Rút research gap
              </Button>
            </div>
          </>
        )}
      </Panel>
    </>
  );

  const decide = (
    <>
      <Panel accent="decide" icon={Telescope} title="Research gap">
        {gaps.length === 0 ? (
          <p className="text-ink-3 text-xs">
            Chưa có gap nào. Tìm nguồn xong rồi bấm “Rút research gap”. Mỗi gap phải trả lời đủ
            bốn câu hỏi của đề, và không được viện lý do “chưa thấy paper nào giống”.
          </p>
        ) : (
          <div className="space-y-2">
            {gaps.map((g) => (
              <SpecCard key={g.id} card={g} />
            ))}
          </div>
        )}
      </Panel>

      {pending.length > 0 && (
        <Panel accent="decide" icon={Telescope} title="Chọn hướng tập trung">
          {pending.map((d) => (
            <OptionList
              key={d.id}
              question={d.question}
              options={d.options}
              variant="compact"
              submitting={answer.isPending}
              onSubmit={(chosenKey, customText) =>
                answer.mutate({
                  decision_id: d.id,
                  chosen_key: chosenKey,
                  custom_text: customText,
                })
              }
            />
          ))}
        </Panel>
      )}

      {gaps.length > 0 && pending.length === 0 && (
        <Panel accent="ok" title="Đã chọn hướng">
          <Button
            className="w-full"
            size="lg"
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
              router.push(`/projects/${projectId}/step/3`);
            }}
          >
            Sang bước tiếp theo
          </Button>
        </Panel>
      )}
    </>
  );

  return (
    <WizardShell
      preset="wide-middle"
      contextTitle="Từ khoá & nguồn ưu tiên"
      context={context}
      content={content}
      decide={decide}
      decideCount={pending.length}
      decideSummary={pending.length > 0 ? 'Chọn hướng nghiên cứu' : undefined}
      summaryBar={
        <SummaryBar
          round={1}
          nodes={['Tìm nguồn', 'Bảng liên quan', 'Rút gap', 'Xác nhận']}
          activeIndex={
            allSources.length === 0 ? 0 : gaps.length === 0 ? 1 : pending.length > 0 ? 2 : 3
          }
          hint="Mọi nhận định đều phải liên kết được với một nguồn cụ thể."
        />
      }
    />
  );
}
