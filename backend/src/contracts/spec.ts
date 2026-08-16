import { z } from 'zod';

/**
 * 14 mục của research spec (kim-chỉ-nam §1). Mockup 5 chỉ vẽ 10 — lấy 14 theo đề
 * (DESIGN_SYSTEM §8 #9). Tên mục để tiếng Anh vì nội dung spec là tiếng Anh (STACK §10).
 */
export const SPEC_SECTIONS = [
  { no: 1, key: 'problem_statement', title: 'Problem statement' },
  { no: 2, key: 'research_questions', title: 'Research questions' },
  { no: 3, key: 'related_work_matrix', title: 'Related-work matrix' },
  { no: 4, key: 'research_gap', title: 'Research gap' },
  { no: 5, key: 'proposed_approach', title: 'Proposed approach' },
  { no: 6, key: 'expected_contributions', title: 'Expected contributions' },
  { no: 7, key: 'claim_evidence_matrix', title: 'Claim–evidence matrix' },
  { no: 8, key: 'experimental_protocol', title: 'Experimental protocol' },
  { no: 9, key: 'baselines_and_metrics', title: 'Baselines and metrics' },
  { no: 10, key: 'ablation_plan', title: 'Ablation plan' },
  { no: 11, key: 'compute_budget', title: 'Compute budget' },
  { no: 12, key: 'risks_and_limitations', title: 'Risks and limitations' },
  { no: 13, key: 'open_issues', title: 'Open issues' },
  { no: 14, key: 'decision_history', title: 'Decision history' },
] as const;

export type SpecSectionKey = (typeof SPEC_SECTIONS)[number]['key'];

export const specSectionSchema = z.object({
  no: z.number().int(),
  key: z.string(),
  title: z.string(),
  /** Markdown tiếng Anh. Rỗng ⇒ mục này thiếu, dùng cho metric completeness_14. */
  body: z.string(),
  present: z.boolean(),
});
export type SpecSection = z.infer<typeof specSectionSchema>;
