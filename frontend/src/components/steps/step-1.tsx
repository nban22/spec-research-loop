'use client';

import { ClipboardList, Lightbulb, ListChecks, MessageCircleQuestion } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { HintBox } from '@/components/hint-box';
import { IdeaInput, TopicChipList } from '@/components/idea-input';
import { JobProgress } from '@/components/job-progress';
import { OptionList } from '@/components/option-list';
import { Panel } from '@/components/panel';
import { CardBoard } from '@/components/spec-cards';
import { CardSkeleton, EmptyState } from '@/components/states';
import { SummaryBar } from '@/components/summary-bar';
import { WizardShell } from '@/components/wizard-shell';
import { CONFIDENCE_STYLE } from '@/lib/status-style';
import {
  useAnswerDecision,
  useCards,
  useJobAction,
  usePendingDecisions,
  useProject,
} from '@/lib/use-project';

/**
 * **B1 · Nhập ý tưởng & Làm rõ** — bản đồ màn hình ở DESIGN_SYSTEM §5.4.
 *
 * Cột 1 `IdeaInput` + `TopicChipList` · Cột 2 `ParaphraseCard` → `KeyProblemList` →
 * `HintBox` mức chắc chắn → **`CardBoard`** · Cột 3 các câu hỏi làm rõ.
 *
 * `CardBoard` nằm ở cột giữa, **dưới** phần diễn giải — không tách thành bước riêng, vì
 * ARCHITECTURE §4 đã gộp bước 1–2 của đề vào B1 (§5.4 #1).
 */
export function Step1({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { data: detail, isLoading } = useProject(projectId);
  const versionId = detail?.currentVersion?.id;
  const { data: cardData } = useCards(versionId);
  const { data: pendingData } = usePendingDecisions(projectId);
  const job = useJobAction(projectId);
  const answer = useAnswerDecision(projectId);

  const meta = detail?.currentVersion?.meta ?? null;
  const cards = cardData?.cards ?? [];
  const pending = (pendingData?.decisions ?? []).filter((d) => d.step === 'S1');
  const analyzed = cards.length > 0;

  const context = (
    <>
      <Panel accent="brand" icon={Lightbulb} title="Ý tưởng ban đầu">
        <IdeaInput
          value={detail?.project.raw_idea}
          variant="inline"
          analyzing={job.busy}
          onAnalyze={() => job.run(`/projects/${projectId}/analyze`)}
        />
        {meta?.topics && meta.topics.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <p className="text-ink-3 text-xs font-medium">Chủ đề hệ thống suy ra</p>
            <TopicChipList topics={meta.topics} />
          </div>
        )}
      </Panel>
    </>
  );

  const content = (
    <>
      <JobProgress view={job.view} onReload={job.reload} />

      {isLoading ? (
        <CardSkeleton rows={2} />
      ) : !analyzed ? (
        <EmptyState
          title="Chưa phân tích ý tưởng"
          description="Bấm “Phân tích ý tưởng” ở cột bên trái. Hệ thống sẽ diễn giải lại ý tưởng, chỉ ra các vấn đề chính, và phân rã thành thẻ để bạn xác nhận."
        />
      ) : (
        <>
          {/* ParaphraseCard — chức năng 2, hiện thực "Cách hệ thống đang hiểu ý tưởng" */}
          <Panel accent="ok" icon={ClipboardList} title="Cách hệ thống đang hiểu ý tưởng">
            <p className="bg-ok-soft text-ink-1 rounded-md px-3 py-2.5 text-sm leading-relaxed">
              {meta?.paraphrase_vi}
            </p>
            {meta?.confidence && (
              <HintBox
                tone={CONFIDENCE_STYLE[meta.confidence].tone}
                title={`Mức chắc chắn: ${CONFIDENCE_STYLE[meta.confidence].label}`}
              >
                {CONFIDENCE_STYLE[meta.confidence].hint}
              </HintBox>
            )}
          </Panel>

          {meta?.key_problems && meta.key_problems.length > 0 && (
            <Panel accent="neutral" icon={ListChecks} title="Vấn đề chính">
              {/* Họ `warn`, KHÔNG dùng cam như mockup — cam là tài sản riêng của Severity (§8 #5) */}
              <ul className="space-y-1.5">
                {meta.key_problems.map((p, i) => (
                  <li key={i} className="text-ink-2 flex gap-2 text-sm">
                    <span className="bg-warn-ink mt-1.5 size-1.5 shrink-0 rounded-full" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel
            accent="neutral"
            icon={ClipboardList}
            title="Bảng thẻ phân rã — 8 loại × 6 trạng thái"
          >
            <CardBoard cards={cards} />
          </Panel>
        </>
      )}
    </>
  );

  const decide =
    pending.length > 0 ? (
      <Panel accent="decide" icon={MessageCircleQuestion} title="Câu hỏi làm rõ">
        <div className="space-y-5">
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
        </div>
      </Panel>
    ) : analyzed ? (
      <Panel accent="ok" icon={ListChecks} title="Đã trả lời hết câu hỏi">
        <HintBox tone="ok">
          Bạn đã xác nhận cách hệ thống hiểu ý tưởng. Sang bước 2 để đi tìm tài liệu thật.
        </HintBox>
        <button
          type="button"
          onClick={() => router.push(`/projects/${projectId}/step/2`)}
          className="bg-brand-ink w-full rounded-md px-4 py-2.5 text-sm font-medium text-white"
        >
          Sang bước tiếp theo
        </button>
      </Panel>
    ) : undefined;

  return (
    <WizardShell
      preset="balanced"
      contextTitle="Ý tưởng ban đầu"
      /* B1: KHÔNG thu gọn — `IdeaInput` là hành động chính của bước này (§6.9). */
      contextDefaultOpen
      context={context}
      content={content}
      decide={decide}
      decideCount={pending.length}
      decideSummary={
        pending.length > 0 ? `Cần bạn quyết: ${pending.length} câu hỏi` : undefined
      }
      summaryBar={
        <SummaryBar
          round={1}
          nodes={['Nhập ý tưởng', 'Làm rõ', 'Xác nhận', 'Sang bước tiếp theo']}
          activeIndex={!analyzed ? 0 : pending.length > 0 ? 1 : 2}
          hint="Không bước nào tự chốt — bạn xác nhận rồi hệ thống mới đi tiếp."
        />
      }
    />
  );
}
