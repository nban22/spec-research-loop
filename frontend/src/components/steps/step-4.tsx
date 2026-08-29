'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Gavel, ListChecks, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { HintBox } from '@/components/hint-box';
import { JobProgress } from '@/components/job-progress';
import { ConsensusMeter, IssueTable, JudgePanel, type JudgeState } from '@/components/judge';
import { OptionList } from '@/components/option-list';
import { OverclaimPanel } from '@/components/overclaim-panel';
import { Panel } from '@/components/panel';
import { SpecOutline } from '@/components/spec-views';
import { EmptyState, JudgePanelSkeleton } from '@/components/states';
import { SummaryBar } from '@/components/summary-bar';
import { WizardShell } from '@/components/wizard-shell';
import { ApiError, api, qk } from '@/lib/api';
import { MAX_JUDGE_ROUNDS, type ApiIssueGroup, type ApiOption, type JudgeKey } from '@/lib/types';
import {
  useApplyDecision,
  useIssueGroups,
  useJobAction,
  useJudgeRuns,
  useProject,
  useSections,
  useSources,
  type PreviewPayload,
} from '@/lib/use-project';

/**
 * **B4 · Judge độc lập & Sửa spec** (preset *giữa rộng*).
 *
 * Vòng lặp của bước 10 trong đề: Judge ra issue → hệ thống đưa lựa chọn A/B/C/Other →
 * user chọn → sửa spec → **hiển thị diff** → xác nhận → version mới.
 * Bốn điểm dừng, không có đường vòng nào bỏ qua chúng (ARCHITECTURE §1.2).
 */
export function Step4({ projectId }: { projectId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: detail } = useProject(projectId);
  const versionId = detail?.currentVersion?.id;

  const { data: sectionData } = useSections(versionId);
  const { data: groupData } = useIssueGroups(versionId);
  const { data: runData } = useJudgeRuns(versionId);
  /* Cùng `queryKey` với B2 nên lấy từ cache — không thêm round-trip. Dùng để tra ngược
     `source_id` rút gọn mà judge viết trong `reason`. */
  const { data: sourceData } = useSources(projectId);
  const job = useJobAction(projectId);
  const applyDecision = useApplyDecision(projectId);

  const [active, setActive] = useState<ApiIssueGroup | null>(null);
  const [options, setOptions] = useState<{ question: string; options: ApiOption[] } | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [decisionId, setDecisionId] = useState<string | null>(null);

  const skipStep = useMutation({
    mutationFn: () => api.patch(`/projects/${projectId}`, { step: 'S5' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.project(projectId) });
      router.push(`/projects/${projectId}/step/5`);
    },
  });

  const groups = groupData?.groups ?? [];
  const runs = runData?.runs ?? [];
  /**
   * Đếm theo **dự án**, không theo version: `judge_round` reset mỗi lần tạo version mới, nên
   * dùng nó thì nhãn "tối đa 3 vòng cho mỗi dự án" ở dưới là nói sai.
   */
  const roundsTotal = detail?.project.judge_rounds_total ?? 0;
  const roundsExhausted = roundsTotal >= MAX_JUDGE_ROUNDS;
  const hasJudged = runs.length > 0;

  const judgeStates = judgeStatesFrom(runs, job.view.isRunning);
  const completed = runs.filter((r) => r.status === 'OK').length;
  const failedKeys = runs.filter((r) => r.status === 'FAILED').map((r) => r.judge_key);

  /**
   * `POST /issue-groups/:id/options` trả **thẳng** `options[]`, không mở job — một lời gọi ~10s
   * và người dùng đang đứng chờ ngay tại chỗ (SYSTEM_DESIGN_ANALYSIS §4.4 #1).
   */
  const pickIssue = async (g: ApiIssueGroup) => {
    setActive(g);
    setOptions(null);
    setPreview(null);
    setDecisionId(null);
    setLoadingOptions(true);
    try {
      const res = await api.post<{ question: string; options: ApiOption[] }>(
        `/issue-groups/${g.id}/options`,
      );
      setOptions(res);
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : 'Hệ thống chưa sinh được phương án. Bạn vui lòng thử lại.',
      );
    } finally {
      setLoadingOptions(false);
    }
  };

  const submitChoice = async (chosenKey: string, customText: string | null) => {
    if (!active || !options || !versionId) return;
    setLoadingOptions(true);
    try {
      const res = await api.post<{
        decision: { id: string };
        preview: PreviewPayload | null;
      }>('/decisions', {
        project_id: projectId,
        spec_version_id: versionId,
        step: 'S4',
        issue_group_id: active.id,
        question: options.question,
        options: options.options,
        chosen_key: chosenKey,
        custom_text: customText,
      });
      setDecisionId(res.decision.id);
      setPreview(res.preview);
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : 'Hệ thống chưa lưu được lựa chọn của bạn. Vui lòng thử lại.',
      );
    } finally {
      setLoadingOptions(false);
    }
  };

  const context = (
    <Panel accent="brand" icon={FileText} title="Spec tạm thời">
      {sectionData ? (
        <>
          <SpecOutline sections={sectionData.sections} />
          <p className="text-ink-3 text-xs">
            {sectionData.completeness}/14 mục đã có nội dung
          </p>
        </>
      ) : (
        <p className="text-ink-3 text-xs">Đang dựng bản spec tạm thời…</p>
      )}
    </Panel>
  );

  const content = (
    <>
      <JobProgress view={job.view} onReload={job.reload} />

      <Panel
        accent="ok"
        icon={Gavel}
        title="Hội đồng Judge"
        action={
          <Button
            size="sm"
            disabled={job.busy || roundsExhausted}
            onClick={() => job.run(`/spec-versions/${versionId}/judge`)}
          >
            {roundsTotal === 0 ? 'Chạy Judge' : `Chạy vòng ${roundsTotal + 1}`}
          </Button>
        }
      >
        {runData ? <JudgePanel states={judgeStates} /> : <JudgePanelSkeleton />}
        {roundsExhausted && (
          <HintBox tone="warn">
            Đã dùng hết {MAX_JUDGE_ROUNDS} vòng judge cho dự án này.
          </HintBox>
        )}
      </Panel>

      <Panel accent="neutral" icon={ListChecks} title="Tổng hợp issue">
        {!hasJudged ? (
          <EmptyState
            icon={Gavel}
            tone="decide"
            title="Judge chưa chạy vòng nào"
            description="Bấm “Chạy Judge” ở trên. 5 judge chấm độc lập, mỗi judge một context sạch — không judge nào thấy nhận xét của judge khác."
          />
        ) : groups.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            tone="ok"
            title="Không có vấn đề nào được nêu"
            description="Cả 5 judge đều không tìm thấy defect nào đáng báo. Bạn có thể sang bước chốt spec."
          />
        ) : (
          <>
            <ConsensusMeter
              agreement={Math.max(0, ...groups.map((g) => g.agreement_count))}
              completed={completed}
              failedKeys={failedKeys}
            />
            <IssueTable
              groups={groups}
              sources={sourceData?.sources ?? []}
              onPick={pickIssue}
              activeId={active?.id}
            />
          </>
        )}
      </Panel>

      {/* Làn B · #7 — cờ phóng đại đứng cạnh bảng issue, không trộn vào nó: nó đến từ một cơ
          chế khác (luật + vùng xám), và nó có ba đường ra riêng của Bước 10. */}
      <OverclaimPanel versionId={versionId} />

      {/* Bằng chứng độc lập đọc thẳng từ dữ liệu — endpoint bằng chứng, không phải debug. */}
      {hasJudged && (
        <Panel accent="neutral" icon={ShieldCheck} title="Bằng chứng Judge chạy độc lập">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-ink-3 text-left">
                  <th className="py-1 pr-2">Judge</th>
                  <th className="py-1 pr-2">Model</th>
                  <th className="py-1 pr-2">input_digest</th>
                  <th className="py-1 pr-2">sha(raw_output)</th>
                  <th className="py-1">Bắt đầu</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {runs.map((r) => (
                  <tr key={r.id} className="border-hairline border-t">
                    <td className="py-1 pr-2">{r.judge_key}</td>
                    <td className="text-ink-3 py-1 pr-2">{r.model}</td>
                    <td className="text-ok-strong py-1 pr-2">
                      {r.input_digest.slice(0, 10)}
                    </td>
                    <td className="text-brand-strong py-1 pr-2">
                      {r.raw_output_sha256.slice(0, 10)}
                    </td>
                    <td className="text-ink-3 py-1">
                      {new Date(r.started_at).toISOString().slice(11, 23)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-ink-3 text-xs">
            Cùng <span className="text-ok-strong font-medium">input_digest</span> ⇒ 5 judge nhận
            đúng một đầu vào. Khác{' '}
            <span className="text-brand-strong font-medium">sha(raw_output)</span> ⇒ chúng chấm
            độc lập, không sao chép nhau.
          </p>
        </Panel>
      )}
    </>
  );

  const decide = (
    <Panel accent="decide" icon={Gavel} title="Việc cần bạn quyết">
      {!active ? (
        <p className="text-ink-3 text-xs">
          Chọn một vấn đề ở bảng bên trái để xem các phương án xử lý. Hệ thống không tự sửa gì —
          bạn là người quyết định cuối cùng.
        </p>
      ) : loadingOptions && !options ? (
        <p className="text-ink-3 text-xs">Đang sinh phương án cho vấn đề này…</p>
      ) : preview ? (
        <div className="space-y-3">
          <HintBox tone="info" title="Bản nháp đã sẵn sàng">
            {preview.summary}
          </HintBox>
          <ul className="space-y-2">
            {preview.changes.map((c, i) => (
              <li key={i} className="border-hairline bg-sunken rounded-md border px-2.5 py-2">
                <p className="text-ink-1 text-xs font-medium">
                  {c.operation} · {c.target_card_title || c.new_title}
                </p>
                <p className="text-ink-2 text-xs">{c.rationale}</p>
              </li>
            ))}
          </ul>
          <ConfirmApply
            decisionId={decisionId}
            pending={applyDecision.isPending}
            onConfirm={(id) =>
              applyDecision.mutate(id, {
                onSuccess: (res) => {
                  setActive(null);
                  setOptions(null);
                  setPreview(null);
                  // Bám vào job kiểm lại chứng cứ mà backend vừa mở, để thanh tiến độ hiện
                  // ngay tại bước 4 — đúng thứ hộp thoại xác nhận đã hứa.
                  if (res.verifyJobId) job.attach(res.verifyJobId);
                  void queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
                },
              })
            }
          />
        </div>
      ) : options ? (
        <OptionList
          question={options.question}
          options={options.options}
          variant="stacked"
          submitting={loadingOptions}
          submitLabel="Xem bản nháp thay đổi"
          onSubmit={submitChoice}
        />
      ) : null}

      {hasJudged && groups.length === 0 && (
        <Button
          className="mt-2 w-full"
          size="lg"
          disabled={skipStep.isPending}
          onClick={() => skipStep.mutate()}
        >
          Sang bước chốt spec
        </Button>
      )}
      {hasJudged && groups.length > 0 && (
        <Button
          className="mt-2 w-full"
          size="lg"
          variant="outline"
          disabled={skipStep.isPending}
          onClick={() => skipStep.mutate()}
        >
          Tôi thấy đủ tốt — sang bước chốt spec
        </Button>
      )}
    </Panel>
  );

  return (
    <WizardShell
      preset="wide-middle"
      contextTitle="Spec tạm thời"
      context={context}
      content={content}
      decide={decide}
      decideCount={groups.filter((g) => g.status === 'OPEN').length}
      decideSummary={
        active ? 'Đang xử lý một vấn đề' : `Cần bạn quyết: ${groups.length} vấn đề`
      }
      summaryBar={
        <SummaryBar
          round={Math.max(1, roundsTotal)}
          nodes={['Judge độc lập', 'Chọn cách sửa', 'Xem diff', 'Xác nhận', 'Hoàn tất']}
          activeIndex={!hasJudged ? 0 : !options ? 1 : !preview ? 2 : 3}
          hint={`Tối đa ${MAX_JUDGE_ROUNDS} vòng judge cho mỗi dự án.`}
        />
      }
    />
  );
}

/** Cửa ngõ **bắt buộc** cho mọi thao tác tạo version mới (DESIGN_SYSTEM §5.3 `ConfirmDialog`). */
function ConfirmApply({
  decisionId,
  pending,
  onConfirm,
}: {
  decisionId: string | null;
  pending: boolean;
  onConfirm: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!decisionId) return null;
  return (
    <>
      <Button className="w-full" size="lg" onClick={() => setOpen(true)} disabled={pending}>
        Xác nhận &amp; tạo phiên bản mới
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bạn xác nhận tạo phiên bản mới?</DialogTitle>
            <DialogDescription>
              Phiên bản hiện tại được giữ nguyên và không bao giờ bị sửa đè — bạn luôn so
              lại được hai bản. Sau khi áp dụng, hệ thống sẽ tự chạy lại phần kiểm chứng cứ
              trên những chỗ vừa đụng tới.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Để sau
            </Button>
            <Button
              disabled={pending}
              onClick={() => {
                setOpen(false);
                onConfirm(decisionId);
              }}
            >
              {pending ? 'Hệ thống đang tạo…' : 'Xác nhận'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function judgeStatesFrom(
  runs: { judge_key: JudgeKey; status: 'OK' | 'FAILED' }[],
  running: boolean,
): Record<JudgeKey, JudgeState> {
  const keys: JudgeKey[] = ['J1', 'J2', 'J3', 'J4', 'J5'];
  const out = {} as Record<JudgeKey, JudgeState>;
  for (const k of keys) {
    const run = runs.find((r) => r.judge_key === k);
    out[k] = run ? (run.status === 'OK' ? 'done' : 'failed') : running ? 'running' : 'idle';
  }
  return out;
}
