import { useQuery } from '@tanstack/react-query';
import { api, qk } from '@/lib/api';

/**
 * Làn B · #9 — hook riêng cho số đo bất đồng.
 *
 * Để ở file riêng chứ không nhét vào `use-project.ts`: ba làn cùng sửa file đó là chỗ dễ đụng
 * nhau nhất. Cùng lý do `use-overclaim.ts` tồn tại.
 */

/**
 * Lý do **không tính được** hệ số. Phải khớp `KappaReason` của backend — đây là bản chép tay giữa
 * hai package, TypeScript không gác được sự lệch, nên nơi dùng phải là `Record<KappaReason, …>`
 * để trình biên dịch bắt buộc liệt kê đủ (xem `REASON_TEXT` ở `judge-agreement-panel.tsx`).
 *
 * `MALFORMED_COUNTS` từng bị **bỏ sót** ở đây: backend sinh ra nó, zod của service cho đi qua, và
 * panel rơi vào nhánh `else` trần nên báo "Chưa có thẻ nào để đo" — một câu sai sự thật, che mất
 * đúng vấn đề toàn vẹn dữ liệu mà chốt đó sinh ra để phát hiện.
 */
export type KappaReason =
  | 'NO_ITEMS'
  | 'INSUFFICIENT_ITEMS'
  | 'INSUFFICIENT_RATERS'
  | 'NO_VARIANCE'
  | 'MALFORMED_COUNTS';

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
  /**
   * Kiểm định null cho hai dòng buộc tội. `draws: 0` = bản ghi cũ chưa kiểm định.
   * `p` là dạng cộng-một nên không bao giờ bằng 0, và thống kê là **max trên các judge** —
   * đã hiệu chỉnh cho việc panel chỉ in ra người dẫn đầu.
   */
  nullTest: {
    draws: number;
    seed: number;
    disruptive: NullVerdict | null;
    harsh: NullVerdict | null;
  };
};

export type NullVerdict = {
  judgeKey: string;
  value: number;
  p: number;
  significant: boolean;
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
