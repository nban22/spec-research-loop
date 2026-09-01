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
  /** `false` ⇒ chưa kiểm chứng lần nào; `support_label` chỉ là mặc định của schema. */
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
        /** Chỉ đếm cặp đã kiểm chứng. */
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
 * Bốn đường ra khi verifier gate chặn một cặp (khẳng định, nguồn) — ARCHITECTURE §6.6.
 * Lấy từ backend chứ **không** khai lại ở đây: nhãn dài, khai hai chỗ là lệch âm thầm.
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

/** Ghi lựa chọn xử lý trích dẫn không được hỗ trợ. Trả `preview` khi có thay đổi spec. */
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
          : 'Hệ thống chưa lưu được lựa chọn của bạn. Vui lòng thử lại.',
      );
    },
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

  /**
   * Job về đích ⇒ báo cho người dùng, rồi mới làm mới dữ liệu.
   *
   * `JobProgress` nằm **trên cùng** cột giữa, còn thứ vừa đổi thường nằm dưới màn hình — ví dụ
   * ba cột nhận xét của bảng nghiên cứu liên quan. Xong việc mà không có gì báo thì người dùng
   * phải tự cuộn đi tìm xem có gì khác không (#28).
   *
   * Dùng thẳng `job.message` vì backend đã viết sẵn câu riêng cho từng hành động, **kèm số
   * lượng**: "Đã dựng 12 dòng nghiên cứu liên quan." Con số đó cũng vá luôn một đường hỏng im
   * lặng — `relatedWork()` lọc `source_id` theo whitelist, model trả `source_id` bịa thì bảng
   * còn ít dòng hơn trước mà job vẫn `DONE`; giờ nó hiện thành "Đã dựng 0 dòng…".
   */
  const onSettled = useCallback(
    (job: ApiJob) => {
      if (job.status === 'FAILED') {
        // Ánh xạ `error_code`, **không** phân nhánh bằng `message` (STACK §3.1 luật 3).
        toast.error(
          messageOf(
            job.error_code ?? undefined,
            'Tiến trình đã dừng vì lỗi. Bạn vui lòng thử lại.',
          ),
        );
        return;
      }
      toast.success(job.message ?? 'Đã xong.');
      // Đổi dữ liệu xong thì invalidate đúng nhánh, không gọi `invalidateQueries()` trống.
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
          : 'Hệ thống chưa khởi động được tiến trình. Bạn vui lòng thử lại.',
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
     * Theo dõi một job do endpoint **khác** mở ra — `POST /decisions/:id/apply` trả kèm
     * `verifyJobId` cho lần kiểm lại chứng cứ ngay sau khi áp dụng.
     */
    attach: (id: string | null) => setJobId(id),
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
      toast.error(
        err instanceof ApiError
          ? err.message
          : 'Hệ thống chưa lưu được lựa chọn của bạn. Vui lòng thử lại.',
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
        /** Job kiểm lại chứng cứ do backend mở ngay sau khi áp dụng; `null` nếu không mở được. */
        verifyJobId: string | null;
      }>(`/decisions/${decisionId}/apply`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['spec-versions'] });
      toast.success(
        'Đã tạo phiên bản mới. Hệ thống đang kiểm lại chứng cứ ở phần bạn vừa sửa…',
      );
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'DECISION_ALREADY_APPLIED') {
        // Với người dùng đây không phải lỗi — chỉ là "thứ bạn muốn đã có rồi" (C4 · F.7).
        toast.info('Quyết định này đã được áp dụng trước đó.');
        void queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
        return;
      }
      toast.error(
        err instanceof ApiError
          ? err.message
          : 'Hệ thống chưa áp dụng được quyết định. Bạn vui lòng thử lại.',
      );
    },
  });
}

/* ─────────────────────────────── làn A · bằng chứng & nguồn ───────────────────────────────
   Thêm dòng vào cuối file, không sửa hook của ai. Type của payload khai ngay tại đây theo đúng
   khuôn làn C đã dùng cho các màn hình đọc — `lib/types.ts` giữ cho enum dùng chung. */

export type ApiCredibilitySource = {
  source_id: string;
  tier: CredibilityTier;
  reason: string;
  /** Chỉ để **sắp xếp**. Giao diện không hiện con số này (tiêu chí #1). */
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
  /** `false` ⇒ chưa kiểm chứng lần nào; `support_label` chỉ là mặc định của schema. */
  verified: boolean;
  similarity: number | null;
  entailment: string | null;
  confidence: number | null;
  evidence_sentence: string | null;
  flags: VerifierFlag[];
  /** `null` khi `verified === false` — không tầng nào từng chạm vào cặp này. */
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
  /** Ngưỡng của **chính lần chạy đó**, không phải hằng số hiện tại (yêu cầu của #5). */
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
  /** **Chỉ đếm cặp đã kiểm chứng** — cặp chưa kiểm nằm ở `unverified`. */
  summary: Record<SupportLabel, number>;
  /** Số cặp chưa từng đi qua verifier. `summary` + `unverified` = `pairs.length`. */
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
    // Hàng đợi đổi sau **mỗi** lần gán ⇒ không giữ cache cũ.
    staleTime: 0,
    queryFn: () =>
      api.get<ApiLabelQueue>(`/spec-versions/${versionId}/label-queue`),
  });
}

/**
 * Ghi nhãn người. Response chỉ trả `match` — client **không** gửi và **không** biết nhãn máy
 * trước đó, đó là cả điểm của việc chấm mù (#4).
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
          : 'Hệ thống chưa ghi được nhãn. Bạn vui lòng thử lại.',
      );
    },
  });
}
