import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qk } from '@/lib/api';

/**
 * Lane B · #7 — a dedicated hook for overclaim flags.
 *
 * It lives in its own file rather than inside `use-project.ts`: that file is where three lanes
 * collide most often, and nothing here is shared with anybody else.
 */

export type OverclaimExit = 'NARROW_CLAIM' | 'EXPAND_EXPERIMENT' | 'TO_RESEARCH_QUESTION';
export type OverclaimLevel = 'NONE' | 'MINOR' | 'MAJOR' | 'CRITICAL';

export type ApiOverclaimFlag = {
  id: string;
  card_id: string;
  card_title: string;
  detector: 'RULE' | 'LLM';
  level: OverclaimLevel;
  matched_terms: string[];
  rationale: string;
  suggested_narrowing: string;
  recommended_exit: OverclaimExit;
  chosen_exit: string | null;
  llm_calls: number;
};

export type ApiOverclaimOption = {
  key: string;
  label: string;
  explain: string;
  example: string;
  recommended?: boolean;
};

type OverclaimResponse = {
  flags: ApiOverclaimFlag[];
  options: ApiOverclaimOption[];
};

export type OverclaimScanResult = {
  enabled: boolean;
  scanned: number;
  flagged: number;
  byRule: number;
  byLlm: number;
};

export function useOverclaimFlags(versionId: string | undefined) {
  return useQuery({
    queryKey: qk.overclaim(versionId ?? 'none'),
    queryFn: () => api.get<OverclaimResponse>(`/spec-versions/${versionId}/overclaim`),
    enabled: Boolean(versionId),
  });
}

export function useScanOverclaim(versionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<OverclaimScanResult>(`/spec-versions/${versionId}/overclaim`),
    onSuccess: () => {
      if (versionId) {
        void queryClient.invalidateQueries({ queryKey: qk.overclaim(versionId) });
      }
    },
  });
}

export function useChooseOverclaimExit(versionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { flagId: string; exit: OverclaimExit; customText?: string }) =>
      api.post<{ decision_id: string }>(`/overclaim-flags/${vars.flagId}/exit`, {
        exit: vars.exit,
        custom_text: vars.customText,
      }),
    onSuccess: () => {
      if (versionId) {
        void queryClient.invalidateQueries({ queryKey: qk.overclaim(versionId) });
      }
    },
  });
}
