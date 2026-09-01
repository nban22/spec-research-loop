'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ListChecks, Route, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConflictPanel } from '@/components/conflict-panel';
import { HintBox } from '@/components/hint-box';
import { JobProgress } from '@/components/job-progress';
import { OptionList } from '@/components/option-list';
import { Panel } from '@/components/panel';
import { ExportBar, HowItWorksList, SpecChecklist } from '@/components/spec-views';
import { SupportTag } from '@/components/support-tag';
import { WizardShell } from '@/components/wizard-shell';
import { ApiError, api, apiUrl } from '@/lib/api';
import {
  useApplyDecision,
  useGate,
  useGateDecision,
  useGateOptions,
  useJobAction,
  useProject,
  useSections,
  useVerification,
  type PreviewPayload,
} from '@/lib/use-project';

const HOW_IT_WORKS = [
  'Diễn giải lại ý tưởng thô của bạn và phân rã thành thẻ 8 loại, mỗi thẻ mang một trạng thái.',
  'Tìm tài liệu thật trên Semantic Scholar và OpenAlex, rồi mới cho mô hình đọc abstract để dựng bảng nghiên cứu liên quan.',
  'Rút khoảng trống nghiên cứu trả lời đủ bốn câu hỏi, sinh Claim–Evidence năm trường và kế hoạch thí nghiệm.',
  'Cho 5 Judge phản biện độc lập, gộp ý kiến, và để bạn quyết định từng thay đổi trước khi tạo phiên bản mới.',
];

/**
 * **B5 · Spec cuối & Xuất bản** — preset *hai cột*, **không có cột quyết định riêng**.
 * Bước này hành động bằng `ExportBar`, nên trên mobile `ExportBar` thành thanh dính đáy
 * thay cho `DecisionSheet` (DESIGN_SYSTEM §6.4).
 */
export function Step5({ projectId }: { projectId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: detail } = useProject(projectId);
  const versionId = detail?.currentVersion?.id;

  const { data: sectionData } = useSections(versionId);
  const { data: gate } = useGate(versionId);
  const { data: verification } = useVerification(versionId);
  const job = useJobAction(projectId);
  const [exporting, setExporting] = useState<'MD' | 'PDF' | null>(null);

  const gateDecision = useGateDecision(projectId);
  const applyDecision = useApplyDecision(projectId);
  const [gatePreview, setGatePreview] = useState<PreviewPayload | null>(null);
  const [gateDecisionId, setGateDecisionId] = useState<string | null>(null);
  const [deferred, setDeferred] = useState<string[]>([]);

  const sections = sectionData?.sections ?? [];
  const summary = verification?.summary;
  const blocked = gate?.blocked ?? false;

  const blockedReason =
    gate?.reason === 'NOT_VERIFIED'
      ? 'Phiên bản này chưa qua bước kiểm chứng cứ. Chạy kiểm chứng cứ trước khi xuất bản.'
      : gate?.reason === 'UNSUPPORTED_CITATION'
        ? `Còn ${gate.offenders.length} trích dẫn không được nguồn hỗ trợ. Xử lý chúng ở khối bên dưới.`
        : undefined;

  /**
   * Xử **từng cặp một**: mỗi lựa chọn có thể sinh một version mới, nên danh sách cũ hết hiệu lực.
   *
   * `deferred` là những cặp người dùng đã chọn "tôi sẽ đi tìm nguồn khác" — phương án đó
   * **không đổi dữ liệu gì**, nên nếu không bỏ chúng ra khỏi hàng đợi thì panel ghim vĩnh viễn
   * ở cặp đầu và những cặp còn lại không bao giờ tới lượt.
   */
  const offenders = gate?.reason === 'UNSUPPORTED_CITATION' ? gate.offenders : [];
  const queue = offenders.filter((o) => !deferred.includes(o.card_source_id));
  const offender = queue[0] ?? null;
  const { data: gateOptions } = useGateOptions(offender?.card_source_id);

  const doExport = async (format: 'MD' | 'PDF') => {
    if (!versionId) return;
    setExporting(format);
    try {
      const res = await api.post<{ artifactId: string; filename: string }>(
        `/spec-versions/${versionId}/export?format=${format.toLowerCase()}`,
      );
      // Tải bằng thẻ <a download>: cookie httpOnly vẫn tự đi kèm, và trang không rời SPA.
      const a = document.createElement('a');
      a.href = apiUrl(`/spec-versions/${versionId}/export/${res.artifactId}`);
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success(`Đã xuất bản thành công: ${res.filename}. Xin cảm ơn bạn.`);
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : 'Hệ thống chưa xuất được tệp. Bạn vui lòng thử lại.',
      );
    } finally {
      setExporting(null);
    }
  };

  const context = (
    <>
      <Panel accent="brand" icon={ListChecks} title="Bản đặc tả nghiên cứu — 14 mục">
        <SpecChecklist sections={sections} />
      </Panel>
      <Panel accent="neutral" icon={ShieldCheck} title="Kết quả kiểm chứng cứ">
        {summary ? (
          <div className="space-y-2">
            {(['SUPPORTED', 'WEAK', 'UNSUPPORTED'] as const).map((label) => (
              <div key={label} className="flex items-center justify-between gap-2">
                <SupportTag label={label} />
                <span className="text-ink-1 text-sm font-semibold tabular-nums">
                  {summary[label]}
                </span>
              </div>
            ))}
            {/*
              Chỉ hiện khi còn cặp chưa kiểm. Ba ô trên **không** còn cộng gộp chúng nữa, nên
              không có dòng này thì tổng ba ô nhỏ hơn số cặp thật mà không ai giải thích được.
            */}
            {(verification?.unverified ?? 0) > 0 && (
              <div className="flex items-center justify-between gap-2">
                <SupportTag label="WEAK" verified={false} />
                <span className="text-ink-1 text-sm font-semibold tabular-nums">
                  {verification?.unverified}
                </span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-ink-3 text-xs">Chưa có kết quả kiểm chứng cứ.</p>
        )}
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          disabled={job.busy}
          onClick={() => job.run(`/spec-versions/${versionId}/verify`)}
        >
          Chạy lại kiểm chứng cứ
        </Button>
      </Panel>
    </>
  );

  const content = (
    <>
      <JobProgress view={job.view} onReload={job.reload} />

      <Panel accent="ok" icon={Route} title="Hệ thống đã đi tới bản spec này bằng đường nào">
        <HowItWorksList steps={HOW_IT_WORKS} />
      </Panel>

      {/*
        Verifier gate chặn thì phải có **đường ra ngay tại chỗ**, không phải một câu bảo người
        dùng tự quay lại bước 4 (ARCHITECTURE §6.6: bốn lựa chọn A/B/C/Other, mỗi lựa chọn
        ghi một `Decision`). Đây là chỗ gate thôi làm một cái biển báo và thành một cơ chế.
      */}
      {offender && (
        <Panel accent="decide" icon={ShieldAlert} title="Trích dẫn không được nguồn hỗ trợ">
          <p className="text-ink-2 text-xs">
            Còn <span className="font-semibold">{queue.length}</span>/{offenders.length} cặp cần
            xử. Đang xử: khẳng định{' '}
            <span className="font-medium">“{offender.card_title}”</span> trích{' '}
            <span className="font-medium">“{offender.source_title}”</span>.
          </p>

          {gatePreview ? (
            <div className="space-y-3">
              <HintBox tone="info" title="Bản nháp đã sẵn sàng">
                {gatePreview.summary}
              </HintBox>
              <Button
                className="w-full"
                size="lg"
                disabled={applyDecision.isPending || !gateDecisionId}
                onClick={() =>
                  gateDecisionId &&
                  applyDecision.mutate(gateDecisionId, {
                    onSuccess: (res) => {
                      setGatePreview(null);
                      setGateDecisionId(null);
                      if (res.verifyJobId) job.attach(res.verifyJobId);
                    },
                  })
                }
              >
                {applyDecision.isPending ? 'Đang tạo…' : 'Xác nhận & tạo phiên bản mới'}
              </Button>
            </div>
          ) : (
            <OptionList
              /*
                `key` theo cặp đang xử: `OptionList` giữ lựa chọn và ô lý do trong state
                cục bộ. Không remount thì sau khi xử cặp #1 bằng "giữ nguyên + lý do", cặp #2
                hiện ra với **đúng lý do cũ** đã điền và nút bấm đang bật — một cú click là
                lý do của cặp này bị gán cho cặp khác.
              */
              key={offender.card_source_id}
              question={gateOptions?.question ?? 'Bạn muốn xử lý thế nào?'}
              options={gateOptions?.options ?? []}
              variant="stacked"
              disabled={!gateOptions}
              submitting={gateDecision.isPending}
              submitLabel="Xác nhận cách xử lý"
              onSubmit={(chosenKey, customText) =>
                gateDecision.mutate(
                  { cardSourceId: offender.card_source_id, chosenKey, customText },
                  {
                    onSuccess: (res) => {
                      // `A` và `Other` không đổi spec ⇒ không có bản nháp để xem diff.
                      setGateDecisionId(res.preview ? res.decision.id : null);
                      setGatePreview(res.preview);
                      if (res.preview) return;
                      if (chosenKey === 'A') {
                        // Không đổi dữ liệu gì ⇒ phải tự đẩy cặp này ra khỏi hàng đợi,
                        // nếu không panel ghim ở đây mãi.
                        setDeferred((d) => [...d, offender.card_source_id]);
                        toast.info(
                          'Hệ thống đã ghi nhận. Trích dẫn này vẫn chặn xuất bản cho tới khi bạn tìm được nguồn khác ở bước 2.',
                        );
                        return;
                      }
                      toast.success(
                        'Hệ thống đã ghi nhận lý do của bạn. Trích dẫn được giữ lại và sẽ mang dấu trong tệp xuất ra.',
                      );
                    },
                  },
                )
              }
            />
          )}
        </Panel>
      )}

      {/* Hoãn hết rồi thì phải nói rõ đang chờ gì, không để người dùng đứng trước gate mù. */}
      {!offender && offenders.length > 0 && (
        <HintBox tone="warn" title="Đang chờ bạn tìm nguồn khác">
          <p>
            {offenders.length} trích dẫn vẫn chặn xuất bản. Sang bước 2 tìm nguồn khác cho những
            khẳng định đó, hoặc chọn lại cách xử lý.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => setDeferred([])}
          >
            Xử lại các trích dẫn đã hoãn
          </Button>
        </HintBox>
      )}

      {/* Làn A · #3 — hàng đợi mâu thuẫn nguồn. Tự ẩn khi không có xung đột nào. */}
      <ConflictPanel projectId={projectId} versionId={versionId} />

      <Panel accent="neutral" icon={CheckCircle2} title="Xuất bản">
        {/* Ẩn ở mobile: ExportBar đã nằm ở thanh dính đáy */}
        <div className="hidden md:block">
          <ExportBar
            blocked={blocked}
            blockedReason={blockedReason}
            exporting={exporting}
            onExport={doExport}
            onBackToEdit={() => router.push(`/projects/${projectId}/step/4`)}
          />
        </div>
        <p className="text-ink-3 md:hidden text-xs">
          Nút xuất bản nằm ở thanh dưới cùng màn hình.
        </p>
      </Panel>

      {!blocked && (
        <HintBox tone="ok" title="Spec đã sẵn sàng">
          Bản đặc tả này đã qua kiểm chứng cứ và sẵn sàng cho bước triển khai hoặc viết proposal.
        </HintBox>
      )}
    </>
  );

  return (
    <WizardShell
      preset="two-column"
      contextTitle="Bảng kiểm 14 mục"
      contextDefaultOpen
      context={context}
      content={content}
      bottomBar={
        <div className="border-hairline bg-surface shadow-sheet pb-safe fixed inset-x-0 bottom-0 z-30 border-t px-3 py-2.5 md:hidden">
          <ExportBar
            blocked={blocked}
            blockedReason={blockedReason}
            exporting={exporting}
            onExport={doExport}
            onBackToEdit={() => router.push(`/projects/${projectId}/step/4`)}
          />
        </div>
      }
    />
  );
}
