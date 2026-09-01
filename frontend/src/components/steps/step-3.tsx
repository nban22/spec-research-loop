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
import { EmptyState, StatTileSkeleton } from '@/components/states';
import { EstimateForm } from '@/components/estimate-form';
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

  /**
   * Verifier chạy ở **bước 5**, nên mọi cặp thẻ–nguồn vừa sinh ra ở đây đều chưa được chấm.
   * `CardSource.support_label` lại có mặc định `WEAK`, nên nếu không nói ra thì cả bảng thẻ
   * trông như thể verifier đã đọc hết và không chống lưng được gì — kết luận sai hoàn toàn.
   */
  const unverifiedPairs = cards
    .flatMap((c) => c.card_sources)
    .filter((cs) => cs.verifier_run_id === null).length;
  const hasPlan = detail?.currentVersion?.has_experiment_plan ?? false;

  const { data: planData } = usePlanAndEstimate(versionId);
  /* Đọc trạng thái đã **ghi xuống**, không suy ra từ việc `estimate` vắng mặt: sự vắng mặt gộp
     bốn ca cần bốn câu nói khác nhau (`backend/src/contracts/estimator.ts`). */
  const plan = planData?.plan ?? null;
  const estimate = planData?.estimate ? toApiEstimate(planData.estimate) : null;
  const status = plan?.estimate_status;

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
            {unverifiedPairs > 0 && (
              <HintBox tone="info" title="Các cặp này chưa qua kiểm chứng cứ">
                <p>
                  {unverifiedPairs} cặp khẳng định – nguồn đang mang nhãn{' '}
                  <strong>CHƯA KIỂM</strong>. Bước kiểm chứng cứ chạy ở bước 5; trước đó chưa có
                  nhãn nào là kết luận của hệ thống.
                </p>
              </HintBox>
            )}
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
            icon={Beaker}
            tone="ok"
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
        ) : status === 'NOT_APPLICABLE' ? (
          /* Mô hình **chủ động** nói kế hoạch này không chạy trên model nào (prompt rule 8).
             Đây là câu duy nhất được phép khẳng định điều đó — ba ca còn lại nói khác. */
          <HintBox tone="info">
            Kế hoạch này không chạy trên mô hình nào nên không có gì để ước lượng.
            {plan?.estimate_note ? ` ${plan.estimate_note}` : ''}
          </HintBox>
        ) : status === 'INVALID_PARAMS' ? (
          /* Kế hoạch CÓ phần tính toán, chỉ là tham số mô hình trả về không dùng được. Con số đó
             tồn tại — mời người dùng nhập là việc đúng, không phải đẩy việc. */
          <div className="space-y-2">
            <HintBox tone="warn">
              Kế hoạch này có phần chạy trên mô hình, nhưng tham số ước lượng hệ thống nhận được
              không hợp lệ nên chưa tính được. Bạn nhập tay bảy tham số là có ngay ước lượng.
            </HintBox>
            <EstimateForm projectId={projectId} />
          </div>
        ) : hasPlan && job.busy ? (
          /* Job **đang chạy** pha 2: hiện đúng khung bốn ô sắp tới. */
          <StatTileSkeleton />
        ) : hasPlan ? (
          /* Không rõ vì sao chưa có ước lượng: hoặc là hàng ghi trước khi có `estimate_status`,
             hoặc job đang chạy mà trang vừa được tải lại nên client mất dấu nó.

             **Không khẳng định gì** ở đây. Bản vá đầu tiên nói chắc nịch "kế hoạch này không
             phải thí nghiệm tính toán" cho cả ba ca — và với dữ liệu cũ trong DB thì câu đó
             sai, vì chúng thật ra thuộc ca tham số hỏng. */
          <div className="space-y-2">
            <StatTileSkeleton />
            <p className="text-ink-3 text-xs">
              Chưa có ước lượng tài nguyên. Nếu bạn vừa dựng kế hoạch, hệ thống có thể đang tính
              — tải lại trang sau ít giây. Nếu vẫn trống, bạn nhập tay bên dưới.
            </p>
            <EstimateForm projectId={projectId} />
          </div>
        ) : (
          <p className="text-ink-3 text-xs">
            Ước lượng xuất hiện sau khi có kế hoạch thí nghiệm. Đây là công thức thuần — không
            gọi mô hình.
          </p>
        )}
      </Panel>

      {/* Khối quyết định thêm vào so với mockup 3 — không có nó thì bước này tự chốt. */}
      {/* Cổng mở theo `hasPlan`, **không** theo `hasEstimate`. Quyết định ở đây là *chốt kế
          hoạch thí nghiệm*, không phải chốt ước lượng tài nguyên. Khoá sau `hasEstimate` nghĩa
          là một nghiên cứu không chạy trên mô hình — thử nghiệm lâm sàng, khảo sát người dùng —
          sẽ **kẹt vĩnh viễn ở bước 3** vì cái nút chốt không bao giờ hiện ra. */}
      {hasPlan && (
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
              /* Chỉ hiện khi CÓ ước lượng. Không có ước lượng thì không có đề xuất nào để
                 áp và không có quy mô nào để giảm — mà `Decision` là dữ liệu đầu vào của
                 `eval/` và của báo cáo đánh giá, nên ghi vào đó một lựa chọn vô nghĩa là làm
                 bẩn đúng cái bảng dùng để đo. */
              ...(estimate
                ? [{
                key: 'B',
                label: 'Giảm quy mô theo đề xuất',
                explain: 'Áp dụng các đề xuất giảm quy mô để vừa tài nguyên.',
                example:
                  estimate?.downscale_suggestion?.[0]?.reason ??
                  'Giảm số candidate hoặc hạ lượng tử hoá.',
                recommended: !(estimate?.fits_rtx3090 ?? true),
                  }]
                : []),
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
      decideCount={hasPlan ? 1 : 0}
      decideSummary={hasPlan ? 'Duyệt kế hoạch thí nghiệm' : undefined}
      summaryBar={
        <SummaryBar
          round={1}
          nodes={['Contribution', 'Thí nghiệm', 'Ước lượng', 'Xác nhận']}
          /* `estimate` chứ không `hasEstimate`: khi kế hoạch không có phần tính toán, backend
             cố ý không sinh ước lượng. Bám vào cờ `has_estimate` thì thanh tiến độ đứng mãi ở
             "Ước lượng" cho một chặng sẽ không bao giờ tới. */
          activeIndex={
            claims.length === 0 ? 0 : !hasPlan ? 1 : job.busy && !estimate ? 2 : 3
          }
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
