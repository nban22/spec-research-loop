import { useQuery } from '@tanstack/react-query';
import { api, qk } from '@/lib/api';

/**
 * Làn B · #9 — hook riêng cho số đo bất đồng.
 *
 * Để ở file riêng chứ không nhét vào `use-project.ts`: ba làn cùng sửa file đó là chỗ dễ đụng
 * nhau nhất. Cùng lý do `use-overclaim.ts` tồn tại.
 */

export type KappaReason =
  | 'NO_ITEMS'
  | 'INSUFFICIENT_ITEMS'
  | 'INSUFFICIENT_RATERS'
  | 'NO_VARIANCE';

export type ApiKappa = {
  kappa: number | null;
  reason: KappaReason | null;
  raters: number;
  items: number;
  unanimous: boolean;
  /** Phải khớp `KappaResult.degenerate` của backend — đây là bản chép tay, TS không gác được. */
  degenerate: 'IDENTICAL_ROWS' | null;
};

export type ApiJaccardCell = { value: number | null; union: number };

export type ApiAgreement = {
  round: number;
  computed: boolean;
  kappa: ApiKappa;
  coverage: number | null;
  matrix: Record<string, Record<string, ApiJaccardCell>>;
  solo: { judgeKey: string; solo: number; raised: number; rate: number | null }[];
  bias: { judgeKey: string; bias: number | null; n: number }[];
  leaveOneOut: {
    judgeKey: string;
    delta: number | null;
    kappaWithout: number | null;
  }[];
  unanimousGroups: number;
  raters: string[];
};

/** Dưới ngưỡng này Jaccard là ngẫu nhiên — phải khớp `MIN_UNION` của backend. */
export const MIN_UNION = 5;

export type ApiAgreementResponse = {
  /** `false` khi `Project.judge_agreement` tắt — cờ chỉ gác phần hiển thị. */
  enabled: boolean;
  agreement: ApiAgreement | null;
};

export function useJudgeAgreement(versionId: string | undefined) {
  return useQuery({
    queryKey: qk.agreement(versionId ?? 'none'),
    queryFn: () =>
      api.get<ApiAgreementResponse>(
        `/spec-versions/${versionId}/judge-agreement`,
      ),
    enabled: Boolean(versionId),
  });
}
