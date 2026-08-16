'use client';

import { useQuery } from '@tanstack/react-query';
import { Beaker, Cpu, Gauge, Trophy } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { HintBox } from '@/components/hint-box';
import { JobProgress } from '@/components/job-progress';
import { OptionList } from '@/components/option-list';
import { Panel } from '@/components/panel';
import { SpecCard } from '@/components/spec-cards';
import { EmptyState } from '@/components/states';
import { EstimateRows, ExperimentPlanList, StatTileGrid } from '@/components/spec-views';
import { SummaryBar } from '@/components/summary-bar';
import { WizardShell } from '@/components/wizard-shell';
import { api } from '@/lib/api';
import type { ApiEstimate, ApiExperimentPlan } from '@/lib/types';
import { useAnswerDecision, useCards, useJobAction, useProject } from '@/lib/use-project';

/**
 * **B3 · Contribution & Kế hoạch thí nghiệm** (preset *cân bằng*).
 *
 * **[QĐ] lệch mockup 3:** mockup để cột phải làm việc *thông báo* (kiểm tra khả thi), nên bước
 * này không có chỗ nào để người dùng quyết — trái NFR-G-3. Thêm một khối quyết định gọn ở cuối
 * cột phải: **duyệt kế hoạch · giảm quy mô theo đề xuất · Other** (DESIGN_SYSTEM §5.4 #2, §8 #11).
 */
export function Step3({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { data: detail } = useProject(projectId);
  const versionId = detail?.currentVersion?.id;
  const { data: cardData } = useCards(versionId);
  const job = useJobAction(projectId);
  const answer = useAnswerDecision(projectId);

  const cards = cardData?.cards ?? [];
  const contributions = cards.filter(
    (c) => c.type === 'CONTRIBUTION' && c.payload?.role !== 'proposed_approach',
  );
  const approach = cards.find(
    (c) => c.type === 'CONTRIBUTION' && c.payload?.role === 'proposed_approach',
  );
  const claims = cards.filter((c) => c.type === 'CLAIM');
  const hasPlan = detail?.currentVersion?.has_experiment_plan ?? false;
  const hasEstimate = detail?.currentVersion?.has_estimate ?? false;

  const { data: planData } = usePlanAndEstimate(versionId);
  const plan = planData?.plan ?? null;
  const estimate = planData?.estimate ? toApiEstimate(planData.estimate) : null;

  const context = (
    <>
      <Panel accent="brand" icon={Trophy} title="Đóng góp dự kiến">
        {contributions.length === 0 ? (
          <p className="text-ink-3 text-xs">
            Chưa sinh. Bấm “Sinh contribution & claim” ở cột giữa.
          </p>
        ) : (
          <>
            {approach && (
              <div className="border-brand-line bg-brand-soft rounded-md border px-3 py-2">
                <p className="text-brand-strong text-xs font-medium">Proposed approach</p>
                <p className="text-ink-1 text-xs">{approach.body}</p>
              </div>
            )}
            <ol className="space-y-2">
              {contributions.map((c) => (
                <SpecCard key={c.id} card={c} />
              ))}
            </ol>
          </>
        )}
      </Panel>

      <Panel accent="neutral" icon={Gauge} title="Claim – Evidence">
        {claims.length === 0 ? (
          <p className="text-ink-3 text-xs">Chưa có khẳng định nào.</p>
        ) : (
          <div className="space-y-2">
            {claims.map((c) => (
              <SpecCard key={c.id} card={c} />
            ))}
          </div>
        )}
      </Panel>
    </>
  );

  const content = (
    <>
      <JobProgress view={job.view} onReload={job.reload} />

      <Panel accent="ok" icon={Beaker} title="Kế hoạch thí nghiệm">
        {!hasPlan ? (
          <EmptyState
            title="Chưa có kế hoạch thí nghiệm"
            description="Sinh contribution và Claim–Evidence trước, rồi dựng kế hoạch thí nghiệm. Mỗi thí nghiệm phải gắn với ít nhất một khẳng định."
            action={
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <Button
                  size="sm"
                  disabled={job.busy}
                  onClick={() => job.run(`/projects/${projectId}/contributions`)}
                >
                  Sinh contribution &amp; claim
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={job.busy || claims.length === 0}
                  onClick={() => job.run(`/projects/${projectId}/experiment-plan`)}
                >
                  Dựng kế hoạch thí nghiệm
                </Button>
              </div>
            }
          />
        ) : plan ? (
          <ExperimentPlanList plan={plan} />
        ) : null}
      </Panel>
    </>
  );

  const decide = (
    <>
      <Panel accent="decide" icon={Cpu} title="Kiểm tra tính khả thi">
        {estimate ? (
          <>
            <StatTileGrid
              items={[
                { label: 'Model', value: `${estimate.inputs.model_params_b}B` },
                { label: 'Lượng tử hoá', value: String(estimate.inputs.quantization) },
                { label: 'Candidates', value: String(estimate.inputs.candidates) },
                { label: 'Số vòng', value: String(estimate.inputs.rounds) },
              ]}
            />
            <EstimateRows estimate={estimate} />
          </>
        ) : (
          <p className="text-ink-3 text-xs">
            Ước lượng xuất hiện sau khi có kế hoạch thí nghiệm. Đây là công thức thuần — không
            gọi mô hình.
          </p>
        )}
      </Panel>

      {/* Khối quyết định thêm vào so với mockup 3 — không có nó thì bước này tự chốt. */}
      {hasEstimate && (
        <Panel accent="decide" icon={Beaker} title="Duyệt kế hoạch">
          <OptionList
            question="Bạn muốn chốt kế hoạch thí nghiệm theo hướng nào?"
            options={[
              {
                key: 'A',
                label: 'Duyệt kế hoạch',
                explain: 'Giữ nguyên quy mô hiện tại và sang bước phản biện.',
                example: 'Chạy đúng số candidate và số mẫu đánh giá đang ước lượng.',
                recommended: estimate?.fits_rtx3090 ?? true,
              },
              {
                key: 'B',
                label: 'Giảm quy mô theo đề xuất',
                explain: 'Áp dụng các đề xuất giảm quy mô để vừa tài nguyên.',
                example:
                  estimate?.downscale_suggestion?.[0]?.reason ??
                  'Giảm số candidate hoặc hạ lượng tử hoá.',
                recommended: !(estimate?.fits_rtx3090 ?? true),
              },
            ]}
            variant="compact"
            submitting={answer.isPending}
            submitLabel="Chốt kế hoạch"
            onSubmit={(chosenKey, customText) =>
              answer.mutate(
                {
                  spec_version_id: versionId,
                  step: 'S3',
                  question: 'Bạn muốn chốt kế hoạch thí nghiệm theo hướng nào?',
                  options: [
                    { key: 'A', label: 'Duyệt kế hoạch', explain: '', example: '' },
                    { key: 'B', label: 'Giảm quy mô theo đề xuất', explain: '', example: '' },
                  ],
                  chosen_key: chosenKey,
                  custom_text: customText,
                },
                { onSuccess: () => router.push(`/projects/${projectId}/step/4`) },
              )
            }
          />
          {estimate && !estimate.fits_rtx3090 && (
            <HintBox tone="warn">
              Cấu hình hiện tại vượt RTX 3090. Chọn “Giảm quy mô theo đề xuất” nếu bạn định chạy
              trên một card duy nhất.
            </HintBox>
          )}
        </Panel>
      )}
    </>
  );

  return (
    <WizardShell
      preset="balanced"
      contextTitle="Đóng góp & Claim–Evidence"
      contextDefaultOpen
      context={context}
      content={content}
      decide={decide}
      decideCount={hasEstimate ? 1 : 0}
      decideSummary={hasEstimate ? 'Duyệt kế hoạch thí nghiệm' : undefined}
      summaryBar={
        <SummaryBar
          round={1}
          nodes={['Contribution', 'Thí nghiệm', 'Ước lượng', 'Xác nhận']}
          activeIndex={claims.length === 0 ? 0 : !hasPlan ? 1 : !hasEstimate ? 2 : 3}
          hint="Mỗi khẳng định cần một điều kiện bác bỏ — trường hay bị quên nhất."
        />
      }
    />
  );
}

/**
 * Kế hoạch thí nghiệm + ước lượng tài nguyên của version hiện tại.
 * Một endpoint, một round-trip — cả hai luôn đọc cùng nhau nên không tách hai query.
 */
function usePlanAndEstimate(versionId: string | undefined) {
  return useQuery({
    queryKey: ['spec-versions', versionId, 'plan'],
    queryFn: () =>
      api.get<{ plan: ApiExperimentPlan | null; estimate: StoredEstimate | null }>(
        `/spec-versions/${versionId}/plan`,
      ),
    enabled: Boolean(versionId),
  });
}

/** Bản ghi `ResourceEstimate` trong DB — cùng số liệu với `ApiEstimate` nhưng không có `breakdown`. */
type StoredEstimate = {
  inputs: Record<string, string | number>;
  vram_gb: number;
  hours_min: number;
  hours_max: number;
  tokens_est: number;
  cost_usd: number;
  fits_rtx3090: boolean;
  downscale_suggestion: ApiEstimate['downscale_suggestion'];
};

/** Dựng lại hình dạng `ApiEstimate` để dùng chung component hiển thị. */
function toApiEstimate(e: StoredEstimate): ApiEstimate {
  return {
    ...e,
    warn_near_limit: !e.fits_rtx3090 || e.vram_gb >= 20,
    breakdown: [],
  };
}
