'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { ApiError, api, qk } from './api';
import { messageOf } from './error-code';
import { useJob } from './use-job';
import type {
  ApiCard,
  ApiDecision,
  ApiIssueGroup,
  ApiJob,
  ApiJudgeRun,
  ApiOption,
  ApiProjectDetail,
  ApiRelatedWorkRow,
  ApiSource,
  ApiSpecSection,
  CredibilityTier,
  SupportLabel,
  VerifierFlag,
} from './types';

export function useProject(projectId: string) {
  return useQuery({
    queryKey: qk.project(projectId),
    queryFn: () => api.get<ApiProjectDetail>(`/projects/${projectId}`),
  });
}

export function useCards(versionId: string | undefined) {
  return useQuery({
    queryKey: qk.cards(versionId ?? 'none'),
    queryFn: () => api.get<{ cards: ApiCard[] }>(`/spec-versions/${versionId}/cards`),
    enabled: Boolean(versionId),
  });
}

export function useRelatedWork(versionId?: string) {
  return useQuery({
    queryKey: ['spec-versions', versionId, 'related-work'],
    queryFn: () => api.get<ApiRelatedWorkRow[]>(`/spec-versions/${versionId}/related-work`),
    enabled: !!versionId,
  });
}

export function useSections(versionId: string | undefined) {
  return useQuery({
    queryKey: qk.version(versionId ?? 'none'),
    queryFn: () =>
      api.get<{ sections: ApiSpecSection[]; completeness: number }>(
        `/spec-versions/${versionId}`,
      ),
    enabled: Boolean(versionId),
  });
}

export function useSources(projectId: string) {
  return useQuery({
    queryKey: qk.sources(projectId),
    queryFn: () => api.get<{ sources: ApiSource[] }>(`/projects/${projectId}/sources`),
  });
}

export function usePendingDecisions(projectId: string) {
  return useQuery({
    queryKey: qk.pending(projectId),
    queryFn: () => api.get<{ decisions: ApiDecision[] }>(`/projects/${projectId}/pending-decisions`),
  });
}

export function useDecisionLog(projectId: string) {
  return useQuery({
    queryKey: qk.decisions(projectId),
    queryFn: () => api.get<{ decisions: ApiDecision[] }>(`/projects/${projectId}/decisions`),
  });
}

export function useIssueGroups(versionId: string | undefined) {
  return useQuery({
    queryKey: qk.issues(versionId ?? 'none'),
    queryFn: () => api.get<{ groups: ApiIssueGroup[] }>(`/spec-versions/${versionId}/issues`),
    enabled: Boolean(versionId),
  });
}

export function useJudgeRuns(versionId: string | undefined) {
  return useQuery({
    queryKey: qk.judgeRuns(versionId ?? 'none'),
    queryFn: () => api.get<{ runs: ApiJudgeRun[] }>(`/spec-versions/${versionId}/judge-runs`),
    enabled: Boolean(versionId),
  });
}

export type VerificationPair = {
  id: string;
  card: { id: string; title: string; type: string; status: string };
  source: { id: string; title: string; year: number | null; doi: string | null };
  support_label: SupportLabel;
  /** `false` ⇒ never verified; `support_label` is only the schema default. */
  verified: boolean;
  similarity: number | null;
  entailment: string | null;
  evidence_sentence: string | null;
  flags: VerifierFlag[];
};

export function useVerification(versionId: string | undefined) {
  return useQuery({
    queryKey: qk.verification(versionId ?? 'none'),
    queryFn: () =>
      api.get<{
        pairs: VerificationPair[];
        /** Counts verified pairs only. */
        summary: Record<SupportLabel, number>;
        unverified: number;
      }>(`/spec-versions/${versionId}/verification`),
    enabled: Boolean(versionId),
  });
}

export function useGate(versionId: string | undefined) {
  return useQuery({
    queryKey: qk.gate(versionId ?? 'none'),
    queryFn: () =>
      api.get<{
        blocked: boolean;
        reason: string | null;
        offenders: {
          card_source_id: string;
          card_id: string;
          card_title: string;
          source_title: string;
        }[];
      }>(`/spec-versions/${versionId}/gate`),
    enabled: Boolean(versionId),
  });
}

/**
 * The four exits when the verifier gate blocks a (claim, source) pair — ARCHITECTURE §6.6.
 * Fetched from the backend rather than **re-declared** here: the labels are long, and declaring
 * them twice drifts silently.
 */
export function useGateOptions(cardSourceId: string | undefined) {
  return useQuery({
    queryKey: qk.gateOptions(cardSourceId ?? 'none'),
    queryFn: () =>
      api.get<{ question: string; options: ApiOption[] }>(
        `/card-sources/${cardSourceId}/gate-options`,
      ),
    enabled: Boolean(cardSourceId),
  });
}

/** Records how an unsupported citation is resolved. Returns `preview` when the spec changes. */
export function useGateDecision(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      cardSourceId: string;
      chosenKey: string;
      customText: string | null;
    }) =>
      api.post<{ decision: { id: string }; preview: PreviewPayload | null }>(
        `/card-sources/${input.cardSourceId}/gate-decision`,
        { chosen_key: input.chosenKey, custom_text: input.customText },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.project(projectId) });
      void queryClient.invalidateQueries({ queryKey: ['spec-versions'] });
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiError
          ? err.message
          : 'Your choice could not be saved. Please try again.',
      );
    },
  });
}

/**
 * Start a background job and track it. Shared by analyze / search / related-work / gap /
 * contributions / experiment-plan / judge / verify — every LLM endpoint returns `{ jobId }`
 * (ARCHITECTURE §5).
 */
export function useJobAction(projectId: string) {
  const queryClient = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);

  /**
   * Job finished ⇒ tell the user first, then refresh the data.
   *
   * `JobProgress` sits at the **top** of the middle column, while what just changed is usually
   * further down the screen — the three comment columns of the related-work table, for example.
   * Finishing with no announcement forces the user to scroll around hunting for a difference (#28).
   *
   * `job.message` is used verbatim because the backend already writes a sentence per action,
   * **with a count**: "Built 12 related-work rows." That number also patches a silent failure —
   * `relatedWork()` filters `source_id` against a whitelist, so if the model invents a
   * `source_id` the table ends up with fewer rows than before while the job still says `DONE`;
   * now it reads "Built 0 rows…".
   */
  const onSettled = useCallback(
    (job: ApiJob) => {
      if (job.status === 'FAILED') {
        // Map `error_code`, **never** branch on `message` (STACK §3.1 rule 3).
        toast.error(
          messageOf(
            job.error_code ?? undefined,
            'The job stopped with an error. Please try again.',
          ),
        );
        return;
      }
      toast.success(job.message ?? 'Done.');
      // After a mutation, invalidate the exact branch — never call `invalidateQueries()` empty.
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['spec-versions'] });
    },
    [queryClient, projectId],
  );

  const view = useJob(jobId, onSettled);

  const start = useMutation({
    mutationFn: (input: { path: string; body?: unknown }) =>
      api.post<{ jobId: string }>(input.path, input.body),
    onSuccess: (res) => setJobId(res.jobId),
    onError: (err) => {
      toast.error(
        err instanceof ApiError
          ? err.message
          : 'The job could not be started. Please try again.',
      );
    },
  });

  const reload = useCallback(() => {
    if (jobId) void queryClient.invalidateQueries({ queryKey: qk.job(jobId) });
  }, [jobId, queryClient]);

  return {
    view,
    reload,
    busy: start.isPending || view.isRunning,
    run: (path: string, body?: unknown) => start.mutate({ path, body }),
    /**
     * Track a job opened by a **different** endpoint — `POST /decisions/:id/apply` returns a
     * `verifyJobId` for the evidence re-check that runs right after the decision is applied.
     */
    attach: (id: string | null) => setJobId(id),
  };
}

/** Answer a pending question, or create one and answer it in the same call. */
export function useAnswerDecision(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<{ decision: ApiDecision; preview: PreviewPayload | null }>('/decisions', {
        project_id: projectId,
        ...body,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiError
          ? err.message
          : 'Your choice could not be saved. Please try again.',
      );
    },
  });
}

export type PreviewPayload = {
  summary: string;
  changes: {
    operation: string;
    target_card_title: string;
    new_title: string;
    new_body: string;
    rationale: string;
  }[];
  before_markdown: string;
  after_markdown: string;
};

export function useApplyDecision(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (decisionId: string) =>
      api.post<{
        version: { id: string; version_no: number };
        /** The evidence re-check job the backend opens right after applying; `null` if it could not start. */
        verifyJobId: string | null;
      }>(`/decisions/${decisionId}/apply`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['spec-versions'] });
      toast.success(
        'New version created. Re-checking the evidence in the part you just changed…',
      );
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'DECISION_ALREADY_APPLIED') {
        // To the user this is not an error — it just means "what you wanted is already there" (C4 · F.7).
        toast.info('This decision has already been applied.');
        void queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
        return;
      }
      toast.error(
        err instanceof ApiError
          ? err.message
          : 'The decision could not be applied. Please try again.',
      );
    },
  });
}

/* ─────────────────────────────── Lane A · evidence & sources ──────────────────────────────
   Append at the end of the file; never edit anybody else's hook. Payload types are declared
   right here, following the pattern lane C used for the read-only screens — `lib/types.ts` is
   reserved for the shared enums. */

export type ApiCredibilitySource = {
  source_id: string;
  tier: CredibilityTier;
  reason: string;
  /** For **sorting** only. The UI never shows this number (acceptance criterion #1). */
  total: number;
};

export type ApiCredibility = {
  enabled: boolean;
  sources: ApiCredibilitySource[];
  low_credibility_cards: {
    card_id: string;
    title: string;
    type: string;
    source_count: number;
  }[];
};

export function useCredibility(projectId: string | undefined) {
  return useQuery({
    queryKey: qk.credibility(projectId ?? ''),
    enabled: Boolean(projectId),
    queryFn: () => api.get<ApiCredibility>(`/projects/${projectId}/credibility`),
  });
}

export type ApiConflict = {
  id: string;
  card_id: string;
  card_title: string;
  scope: string;
  signal: string;
  other_card_id: string | null;
  other_card_title: string | null;
  card_source_a_id: string;
  card_source_b_id: string;
  source_a_title: string;
  source_b_title: string;
  evidence_a: string;
  evidence_b: string;
  terms: string[];
  reason: string;
  chosen_exit: string | null;
};

export function useConflicts(versionId: string | undefined) {
  return useQuery({
    queryKey: qk.conflicts(versionId ?? ''),
    enabled: Boolean(versionId),
    queryFn: () =>
      api.get<{ conflicts: ApiConflict[] }>(
        `/spec-versions/${versionId}/conflicts`,
      ),
  });
}

export type ApiEvidencePair = {
  card_source_id: string;
  card: { id: string; title: string; type: string; status: string };
  source: {
    id: string;
    title: string;
    year: number | null;
    doi: string | null;
    url: string | null;
    venue: string | null;
  };
  support_label: SupportLabel;
  /** `false` ⇒ never verified; `support_label` is only the schema default. */
  verified: boolean;
  similarity: number | null;
  entailment: string | null;
  confidence: number | null;
  evidence_sentence: string | null;
  flags: VerifierFlag[];
  /** `null` when `verified === false` — no layer has ever touched this pair. */
  layer: string | null;
  layer_why: string;
  credibility: { tier: CredibilityTier; reason: string } | null;
  passages: {
    rank: number;
    similarity: number;
    char_start: number;
    text: string;
    is_evidence: boolean;
  }[];
};

export type ApiEvidenceTrace = {
  /** The thresholds of **that particular run**, not today's constants (requirement of #5). */
  thresholds: {
    tau_low: number;
    tau_high: number;
    conf_min: number;
    title_match: number;
    min_abstract_chars: number;
    stale_years: number;
  };
  run: {
    id: string;
    created_at: string;
    units_total: number;
    units_l4: number;
  } | null;
  /** **Counts verified pairs only** — unverified pairs are in `unverified`. */
  summary: Record<SupportLabel, number>;
  /** How many pairs have never been through the verifier. `summary` + `unverified` = `pairs.length`. */
  unverified: number;
  pairs: ApiEvidencePair[];
};

export function useEvidenceTrace(versionId: string | undefined) {
  return useQuery({
    queryKey: qk.evidenceTrace(versionId ?? ''),
    enabled: Boolean(versionId),
    queryFn: () =>
      api.get<ApiEvidenceTrace>(`/spec-versions/${versionId}/evidence-trace`),
  });
}

export type ApiLabelQueue = {
  items: {
    card_source_id: string;
    claim_title: string;
    claim_body: string;
    source_title: string;
    source_year: number | null;
    source_abstract: string;
  }[];
  progress: {
    labelled: number;
    remaining: number;
    labelled_total: number;
    target: number;
  };
};

export function useLabelQueue(versionId: string | undefined) {
  return useQuery({
    queryKey: qk.labelQueue(versionId ?? ''),
    enabled: Boolean(versionId),
    // The queue changes after **every** label ⇒ never serve a stale cache.
    staleTime: 0,
    queryFn: () =>
      api.get<ApiLabelQueue>(`/spec-versions/${versionId}/label-queue`),
  });
}

/**
 * Record a human label. The response only returns `match` — the client **neither sends nor
 * knows** the machine label beforehand, which is the whole point of blind labelling (#4).
 */
export function useRecordHumanCheck(versionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { cardSourceId: string; label: SupportLabel }) =>
      api.post<{ match: boolean }>(
        `/card-sources/${input.cardSourceId}/human-check`,
        { human_label: input.label },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: qk.labelQueue(versionId ?? ''),
      });
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiError
          ? err.message
          : 'The label could not be recorded. Please try again.',
      );
    },
  });
}
