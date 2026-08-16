'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ListChecks, Route, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { HintBox } from '@/components/hint-box';
import { JobProgress } from '@/components/job-progress';
import { Panel } from '@/components/panel';
import { ExportBar, HowItWorksList, SpecChecklist } from '@/components/spec-views';
import { SupportTag } from '@/components/support-tag';
import { WizardShell } from '@/components/wizard-shell';
import { ApiError, api, apiUrl } from '@/lib/api';
import {
  useGate,
  useJobAction,
  useProject,
  useSections,
  useVerification,
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

  const sections = sectionData?.sections ?? [];
  const summary = verification?.summary;
  const blocked = gate?.blocked ?? false;

  const blockedReason =
    gate?.reason === 'NOT_VERIFIED'
      ? 'Phiên bản này chưa qua bước kiểm chứng cứ. Chạy kiểm chứng cứ trước khi xuất bản.'
      : gate?.reason === 'UNSUPPORTED_CITATION'
        ? `Còn ${gate.offenders.length} trích dẫn không được nguồn hỗ trợ. Quay lại bước 4 để xử lý, hoặc đổi nguồn / sửa khẳng định / hạ xuống câu hỏi mở.`
        : undefined;

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
      toast.success(`Đã xuất ${res.filename}`);
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Không xuất được file.');
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
