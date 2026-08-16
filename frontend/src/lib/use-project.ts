'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { ApiError, api, qk } from './api';
import { useJob } from './use-job';
import type {
  ApiCard,
  ApiDecision,
  ApiIssueGroup,
  ApiJudgeRun,
  ApiProjectDetail,
  ApiSource,
  ApiSpecSection,
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
  similarity: number | null;
  entailment: string | null;
  evidence_sentence: string | null;
  flags: VerifierFlag[];
};

export function useVerification(versionId: string | undefined) {
  return useQuery({
    queryKey: qk.verification(versionId ?? 'none'),
    queryFn: () =>
      api.get<{ pairs: VerificationPair[]; summary: Record<SupportLabel, number> }>(
        `/spec-versions/${versionId}/verification`,
      ),
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
        offenders: { card_id: string; card_title: string; source_title: string }[];
      }>(`/spec-versions/${versionId}/gate`),
    enabled: Boolean(versionId),
  });
}

/**
 * Khởi động một job nền và theo dõi nó. Dùng chung cho analyze / search / related-work /
 * gap / contributions / experiment-plan / judge / verify — mọi endpoint gọi LLM đều trả
 * `{ jobId }` (ARCHITECTURE §5).
 */
export function useJobAction(projectId: string) {
  const queryClient = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);

  const onDone = useCallback(() => {
    // Đổi dữ liệu xong thì invalidate đúng nhánh, không gọi `invalidateQueries()` trống.
    void queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
    void queryClient.invalidateQueries({ queryKey: ['spec-versions'] });
  }, [queryClient, projectId]);

  const view = useJob(jobId, onDone);

  const start = useMutation({
    mutationFn: (input: { path: string; body?: unknown }) =>
      api.post<{ jobId: string }>(input.path, input.body),
    onSuccess: (res) => setJobId(res.jobId),
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Không khởi động được tiến trình.');
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
  };
}

/** Trả lời một câu hỏi đang chờ, hoặc tạo mới rồi trả lời luôn. */
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
      toast.error(err instanceof ApiError ? err.message : 'Không lưu được lựa chọn.');
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
      api.post<{ version: { id: string; version_no: number } }>(
        `/decisions/${decisionId}/apply`,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['spec-versions'] });
      toast.success('Đã tạo phiên bản mới.');
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'DECISION_ALREADY_APPLIED') {
        // Với người dùng đây không phải lỗi — chỉ là "thứ bạn muốn đã có rồi" (C4 · F.7).
        toast.info('Quyết định này đã được áp dụng rồi.');
        void queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
        return;
      }
      toast.error(err instanceof ApiError ? err.message : 'Không áp dụng được quyết định.');
    },
  });
}
