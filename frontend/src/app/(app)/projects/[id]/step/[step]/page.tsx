'use client';

import { useQuery } from '@tanstack/react-query';
import { use } from 'react';
import { Stepper } from '@/components/stepper';
import { Step1 } from '@/components/steps/step-1';
import { Step2 } from '@/components/steps/step-2';
import { Step3 } from '@/components/steps/step-3';
import { Step4 } from '@/components/steps/step-4';
import { Step5 } from '@/components/steps/step-5';
import { Skeleton } from '@/components/ui/skeleton';
import { api, qk } from '@/lib/api';
import { STEPS, type ApiProjectDetail } from '@/lib/types';

/**
 * Bước đang đứng nằm ở **URL**, không ở store: F5 phải về đúng chỗ và link phải gửi được
 * (SYSTEM_DESIGN_ANALYSIS S7 · F.4).
 *
 * Next.js 16: `params` là Promise, mở bằng `use()` trong Client Component.
 */
export default function StepPage({ params }: PageProps<'/projects/[id]/step/[step]'>) {
  const { id, step } = use(params);
  const stepNo = Math.min(5, Math.max(1, Number(step) || 1));

  const { data, isLoading } = useQuery({
    queryKey: qk.project(id),
    queryFn: () => api.get<ApiProjectDetail>(`/projects/${id}`),
  });

  // Người dùng nhảy về bước đã qua được; bước chưa tới thì khoá.
  const reachedNo = STEPS.find((s) => s.step === data?.project.step)?.no ?? 1;
  const maxReached = Math.max(reachedNo, stepNo);

  return (
    <>
      <Stepper projectId={id} current={stepNo} maxReached={maxReached} />

      <div className="mx-auto w-full max-w-[1400px] px-3 pt-3 md:px-4">
        <h1 className="text-ink-1 text-lg font-semibold md:text-xl">
          {stepNo}. {STEPS[stepNo - 1]?.title}
        </h1>
        <p className="text-ink-3 line-clamp-2 text-xs md:text-sm">
          {data?.project.title ?? 'Đang tải dự án…'}
        </p>
      </div>

      {isLoading ? (
        <div className="mx-auto w-full max-w-[1400px] space-y-3 p-3 md:p-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : stepNo === 1 ? (
        <Step1 projectId={id} />
      ) : stepNo === 2 ? (
        <Step2 projectId={id} />
      ) : stepNo === 3 ? (
        <Step3 projectId={id} />
      ) : stepNo === 4 ? (
        <Step4 projectId={id} />
      ) : (
        <Step5 projectId={id} />
      )}
    </>
  );
}
