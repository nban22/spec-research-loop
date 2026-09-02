'use client';

import { useQuery } from '@tanstack/react-query';
import { use } from 'react';
import { StepTransition } from '@/components/step-transition';
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
 * The current step lives in the **URL**, not the store: a refresh must land in the right place and
 * links must be shareable (SYSTEM_DESIGN_ANALYSIS S7 · F.4).
 *
 * Next.js 16: `params` is a Promise, unwrapped with `use()` inside a Client Component.
 */
export default function StepPage({ params }: PageProps<'/projects/[id]/step/[step]'>) {
  const { id, step } = use(params);
  const stepNo = Math.min(5, Math.max(1, Number(step) || 1));

  const { data, isLoading } = useQuery({
    queryKey: qk.project(id),
    queryFn: () => api.get<ApiProjectDetail>(`/projects/${id}`),
  });

  // The URL can be typed by hand; only render steps the backend confirms have been reached.
  // While loading, keep the requested step so the page does not flash back to step 1.
  const reachedNo = data
    ? (STEPS.find((s) => s.step === data.project.step)?.no ?? 1)
    : stepNo;
  const visibleStepNo = Math.min(stepNo, reachedNo);

  return (
    <>
      <Stepper projectId={id} current={visibleStepNo} maxReached={reachedNo} />

      {/* The heading lives INSIDE the transition: changing step slides the step name together with
          the content, while `Stepper` stays put because it is navigation, not content. */}
      <StepTransition step={visibleStepNo}>
        <div className="mx-auto w-full max-w-[1400px] px-3 pt-3 md:px-4">
          <h1 className="text-ink-1 text-lg font-semibold md:text-xl">
            {visibleStepNo}. {STEPS[visibleStepNo - 1]?.title}
          </h1>
          <p className="text-ink-3 line-clamp-2 text-xs md:text-sm">
            {data?.project.title ?? 'Loading the project…'}
          </p>
        </div>

        {isLoading ? (
          <div className="mx-auto w-full max-w-[1400px] space-y-3 p-3 md:p-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : visibleStepNo === 1 ? (
          <Step1 projectId={id} />
        ) : visibleStepNo === 2 ? (
          <Step2 projectId={id} />
        ) : visibleStepNo === 3 ? (
          <Step3 projectId={id} />
        ) : visibleStepNo === 4 ? (
          <Step4 projectId={id} />
        ) : (
          <Step5 projectId={id} />
        )}
      </StepTransition>
    </>
  );
}
