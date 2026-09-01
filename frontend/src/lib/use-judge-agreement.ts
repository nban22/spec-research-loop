import { useQuery } from '@tanstack/react-query';
import { api, qk } from '@/lib/api';

/**
 * Lane B · #9 — a dedicated hook for the disagreement metrics.
 *
 * It lives in its own file rather than inside `use-project.ts`: that file is where three lanes
 * collide most often. Same reason `use-overclaim.ts` exists.
 */

/**
 * Why the coefficient **could not be computed**. Must match the backend `KappaReason` — this is a
 * hand copy across two packages and TypeScript cannot guard the drift, so every consumer has to
 * use `Record<KappaReason, …>` and let the compiler force a complete enumeration (see
 * `REASON_TEXT` in `judge-agreement-panel.tsx`).
 *
 * `MALFORMED_COUNTS` was once **missing** here: the backend emitted it, the service zod let it
 * through, and the panel fell into a bare `else` branch reporting "No cards to measure yet" — a
 * false statement that hid exactly the data-integrity problem that check exists to surface.
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
  /** Must match the backend `KappaResult.degenerate` — a hand copy, TS cannot guard it. */
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
   * Null tests for the two accusatory lines. `draws: 0` = an old record with no test run.
   * `p` uses the add-one form so it is never exactly 0, and the statistic is the **max across
   * judges** — already corrected for the fact that the panel only prints the leader.
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

/** Below this threshold Jaccard is noise — must match the backend `MIN_UNION`. */
export const MIN_UNION = 5;

export type ApiAgreementResponse = {
  /** `null` when no judge round has run yet. There is no on/off flag — see `AgreementService.forDisplay`. */
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
