/**
 * Type khai lại **thủ công** theo `backend/src/contracts/` — hai project rời, không có package
 * dùng chung (STACK §3.1). Backend là nguồn sự thật; sửa enum ở backend thì sửa file này
 * **và** `status-style.ts` trong **cùng một commit**.
 *
 * Ba enum dễ lệch nhất, kiểm bằng mắt mỗi lần đụng tới: CardStatus (6) · Severity (3) · SupportLabel (3).
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
  // Làn A · #2 — khớp 1-1 `verifierFlagSchema` của backend, sửa cùng commit (STACK §3.1).
  | 'FULLTEXT_USED'
  | 'FULLTEXT_UNAVAILABLE';

/** Làn A · #1 — mức tin cậy của nguồn, khớp cột `SourceScore.tier`. */
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

/** Nhãn tiếng Việt cho 8 loại thẻ — dùng làm tiêu đề nhóm trong `CardBoard`. */
export const CARD_TYPE_LABEL: Record<CardType, string> = {
  PROBLEM: 'Vấn đề',
  RESEARCH_QUESTION: 'Câu hỏi nghiên cứu',
  GAP: 'Khoảng trống nghiên cứu',
  CONTRIBUTION: 'Đóng góp',
  CLAIM: 'Khẳng định',
  EVIDENCE: 'Bằng chứng',
  CONSTRAINT: 'Ràng buộc',
  OPEN_QUESTION: 'Câu hỏi mở',
};

/** Năm bước wizard — nhãn chốt theo mockup 1–4 (ARCHITECTURE §4, DESIGN_SYSTEM §8 #1). */
export const STEPS: { step: ProjectStep; no: number; short: string; title: string }[] = [
  { step: 'S1', no: 1, short: 'Nhập ý tưởng', title: 'Nhập ý tưởng & Làm rõ' },
  { step: 'S2', no: 2, short: 'Nghiên cứu', title: 'Nghiên cứu liên quan & Research Gap' },
  { step: 'S3', no: 3, short: 'Contribution', title: 'Contribution & Kế hoạch thí nghiệm' },
  { step: 'S4', no: 4, short: 'Judge', title: 'Judge độc lập & Sửa spec' },
  { step: 'S5', no: 5, short: 'Spec cuối', title: 'Spec cuối & Xuất bản' },
];

/**
 * Khai lại `MAX_JUDGE_ROUNDS` của `backend/src/contracts/enums.ts` — cùng luật với các enum
 * ở trên: hai project rời, backend là nguồn sự thật, sửa một chỗ thì sửa cả hai.
 */
export const MAX_JUDGE_ROUNDS = 3;

export const JUDGE_META: Record<JudgeKey, { name: string; task: string }> = {
  J1: { name: 'Research Gap', task: 'Gap có thật sự được tài liệu hỗ trợ không' },
  J2: { name: 'Contribution', task: 'Đóng góp có mới, rõ, có bị phóng đại không' },
  J3: { name: 'Experiment', task: 'Thí nghiệm có đủ chứng minh claim không' },
  J4: { name: 'Evidence', task: 'Citation có thật sự hỗ trợ nội dung đi kèm không' },
  J5: { name: 'Readiness', task: 'Originality · significance · soundness · clarity' },
};

// ── hình dạng dữ liệu trả về từ API ────────────────────────────────────────

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
    /** Vòng judge tính cả dự án — bộ đếm chặn ở 3, không reset khi tạo version mới. */
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
};
