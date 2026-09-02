/**
 * Types re-declared **by hand** from `backend/src/contracts/` — two separate projects, no shared
 * package (STACK §3.1). The backend is the source of truth; when an enum changes there, edit this
 * file **and** `status-style.ts` in the **same commit**.
 *
 * The three enums that drift most easily, eyeball them every time you touch this file:
 * CardStatus (6) · Severity (3) · SupportLabel (3).
 */

export type CardType =
  | 'PROBLEM'
  | 'RESEARCH_QUESTION'
  | 'GAP'
  | 'CONTRIBUTION'
  | 'CLAIM'
  | 'EVIDENCE'
  | 'CONSTRAINT'
  | 'OPEN_QUESTION';

export type CardStatus =
  | 'CONFIRMED'
  | 'PROPOSED'
  | 'MISSING'
  | 'AMBIGUOUS'
  | 'UNSUPPORTED'
  | 'CONFLICT';

export type Severity = 'CRITICAL' | 'MAJOR' | 'MINOR';

export type SupportLabel = 'SUPPORTED' | 'WEAK' | 'UNSUPPORTED';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type JudgeKey = 'J1' | 'J2' | 'J3' | 'J4' | 'J5';

export type ProjectStep = 'S1' | 'S2' | 'S3' | 'S4' | 'S5';

export type SourceProvider = 'SEMANTIC_SCHOLAR' | 'OPENALEX' | 'ARXIV' | 'CROSSREF';

export type VerifierFlag =
  | 'SOURCE_NOT_FOUND'
  | 'EMPTY_ABSTRACT'
  | 'STALE_SOURCE'
  | 'NUMBER_NOT_IN_SOURCE'
  | 'FABRICATED_QUOTE'
  | 'DOI_UNVERIFIED'
  | 'LLM_UNAVAILABLE'
  // Lane A · #2 — 1-to-1 with the backend `verifierFlagSchema`, edit in the same commit (STACK §3.1).
  | 'FULLTEXT_USED'
  | 'FULLTEXT_UNAVAILABLE'
  /** The pair stops after L2 because this card type is not judged by entailment (GAP · CONTRIBUTION). */
  | 'CITATION_ONLY';

/** Lane A · #1 — source credibility tier, matching the `SourceScore.tier` column. */
export type CredibilityTier = 'HIGH' | 'MEDIUM' | 'REVIEW';

export const CARD_TYPES: CardType[] = [
  'PROBLEM',
  'RESEARCH_QUESTION',
  'GAP',
  'CONTRIBUTION',
  'CLAIM',
  'EVIDENCE',
  'CONSTRAINT',
  'OPEN_QUESTION',
];

export const CARD_STATUSES: CardStatus[] = [
  'CONFIRMED',
  'PROPOSED',
  'MISSING',
  'AMBIGUOUS',
  'UNSUPPORTED',
  'CONFLICT',
];

/** Labels for the 8 card types — used as group headings in `CardBoard`. */
export const CARD_TYPE_LABEL: Record<CardType, string> = {
  PROBLEM: 'Problem',
  RESEARCH_QUESTION: 'Research question',
  GAP: 'Research gap',
  CONTRIBUTION: 'Contribution',
  CLAIM: 'Claim',
  EVIDENCE: 'Evidence',
  CONSTRAINT: 'Constraint',
  OPEN_QUESTION: 'Open question',
};

/** The five wizard steps — labels fixed by mockups 1–4 (ARCHITECTURE §4, DESIGN_SYSTEM §8 #1). */
export const STEPS: { step: ProjectStep; no: number; short: string; title: string }[] = [
  { step: 'S1', no: 1, short: 'Idea', title: 'Idea intake & clarification' },
  { step: 'S2', no: 2, short: 'Related work', title: 'Related work & research gap' },
  { step: 'S3', no: 3, short: 'Contribution', title: 'Contribution & experiment plan' },
  { step: 'S4', no: 4, short: 'Judges', title: 'Independent judges & spec fixes' },
  { step: 'S5', no: 5, short: 'Final spec', title: 'Final spec & publish' },
];

/**
 * Re-declares `MAX_JUDGE_ROUNDS` from `backend/src/contracts/enums.ts` — same rule as the enums
 * above: two separate projects, the backend is the source of truth, edit both together.
 */
export const MAX_JUDGE_ROUNDS = 3;

export const JUDGE_META: Record<JudgeKey, { name: string; task: string }> = {
  J1: { name: 'Research Gap', task: 'Is the gap genuinely supported by the literature?' },
  J2: { name: 'Contribution', task: 'Is the contribution novel, clear, and free of overclaiming?' },
  J3: { name: 'Experiment', task: 'Do the experiments actually prove the claims?' },
  J4: { name: 'Evidence', task: 'Does each citation really support the text next to it?' },
  J5: { name: 'Readiness', task: 'Originality · significance · soundness · clarity' },
};

// ── shapes of the data the API returns ─────────────────────────────────────

export type ApiSource = {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  url: string | null;
  abstract: string | null;
  citation_count: number | null;
  retrieved_from: SourceProvider;
  doi_verified: boolean | null;
};

export type ApiCardSource = {
  id: string;
  support_label: SupportLabel;
  /**
   * `null` ⇒ the pair has never been through the verifier, and `support_label` is only the
   * schema default `WEAK`. Read this field before showing a label — see `SupportTag`.
   */
  verifier_run_id: string | null;
  similarity: number | null;
  evidence_sentence: string | null;
  flags: VerifierFlag[] | null;
  source: Pick<
    ApiSource,
    'id' | 'title' | 'year' | 'doi' | 'url' | 'venue' | 'retrieved_from'
  >;
};

export type ApiCard = {
  id: string;
  type: CardType;
  status: CardStatus;
  title: string;
  body: string;
  payload: Record<string, string> | null;
  order_index: number;
  origin: 'GENERATOR' | 'USER' | 'JUDGE_FIX';
  card_sources: ApiCardSource[];
};

export type ApiOption = {
  key: string;
  label: string;
  explain: string;
  example: string;
  recommended?: boolean;
};

export interface ApiRelatedWorkRow {
  id: string;
  spec_version_id: string;
  source_id: string;
  what_done: string;
  feedback_type: string;
  what_missing: string;
  order_index: number;
  created_at: string;
  source: ApiSource;
}

export type ApiDecision = {
  id: string;
  step: ProjectStep;
  question: string;
  options: ApiOption[];
  chosen_key: string;
  custom_text: string | null;
  actor: 'USER' | 'SCRIPTED';
  applied: boolean;
  issue_group_id: string | null;
  spec_version_id: string;
  resulting_spec_version_id: string | null;
  created_at: string;
};

export type ApiIssue = {
  id: string;
  judge_key: JudgeKey;
  severity: Severity;
  title: string;
  reason: string;
  suggestion: string;
  target_card_id: string | null;
};

export type ApiIssueGroup = {
  id: string;
  round: number;
  canonical_title: string;
  max_severity: Severity;
  judge_keys: JudgeKey[];
  agreement_count: number;
  judges_completed: number;
  disagreement_score: number;
  status: 'OPEN' | 'RESOLVED' | 'DISMISSED';
  issues: ApiIssue[];
};

export type ApiJudgeRun = {
  id: string;
  judge_key: JudgeKey;
  round: number;
  model: string;
  prompt_id: string;
  prompt_hash: string;
  input_digest: string;
  raw_output_sha256: string;
  parse_attempts: number;
  status: 'OK' | 'FAILED';
  error_code: string | null;
  started_at: string;
  finished_at: string | null;
};

export type AnalysisMeta = {
  paraphrase_en: string;
  paraphrase_vi: string;
  confidence: ConfidenceLevel;
  key_problems: string[];
  topics: string[];
  search_keywords: string[];
};

export type ApiProjectDetail = {
  project: {
    id: string;
    title: string;
    raw_idea: string;
    domain: string | null;
    step: ProjectStep;
    status: 'DRAFT' | 'IN_PROGRESS' | 'FINAL';
    arm: string;
    verifier_gate: boolean;
    judge_round: number;
    /** Judge rounds counted across the whole project — capped at 3, never reset by a new version. */
    judge_rounds_total: number;
    current_spec_version_id: string | null;
    created_at: string;
    updated_at: string;
  };
  currentVersion: {
    id: string;
    version_no: number;
    status: string;
    label: string | null;
    meta: AnalysisMeta | null;
    card_count: number;
    related_work_count: number;
    issue_group_count: number;
    has_experiment_plan: boolean;
    has_estimate: boolean;
  } | null;
  source_count: number;
};

export type ApiSpecSection = {
  no: number;
  key: string;
  title: string;
  body: string;
  present: boolean;
};

export type ApiJob = {
  id: string;
  kind: string;
  status: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED';
  progress: { done: number; total: number };
  message: string | null;
  error_code: string | null;
};

export type ApiEstimate = {
  inputs: Record<string, string | number>;
  vram_gb: number;
  hours_min: number;
  hours_max: number;
  tokens_est: number;
  cost_usd: number;
  fits_rtx3090: boolean;
  warn_near_limit: boolean;
  downscale_suggestion:
    | { field: string; from: string | number; to: string | number; reason: string }[]
    | null;
  breakdown: { label: string; value: string }[];
};

export type ApiExperimentPlan = {
  experiments: {
    code: string;
    title: string;
    bullets: string[];
    linked_claim_title: string;
  }[];
  baselines_and_metrics: string;
  ablation_plan: string;
  risks_and_limitations: string;
  /**
   * **Why** this plan does or does not have a resource estimate — matches
   * `backend/src/contracts/estimator.ts`.
   *
   * `undefined` on rows written before this field existed. The UI must read that as **"unknown"**
   * and must not default to `NOT_APPLICABLE`: the old rows in the DB actually belong to the
   * `INVALID_PARAMS` case, so that label would stick a false sentence on them.
   */
  estimate_status?: 'OK' | 'NOT_APPLICABLE' | 'INVALID_PARAMS';
  estimate_note?: string;
};
