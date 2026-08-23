/**
 * Bộ khung chạy eval. **Gọi thẳng service, không qua HTTP** — và lý do không phải là "cho nhanh":
 * service **không được phép biết về HTTP**, điều đó buộc `userId` là tham số chứ không phải thứ
 * moi ra từ request, và đó chính là thứ làm NFR-EVL-4 (một đường ghi duy nhất) khả thi
 * (SYSTEM_DESIGN_ANALYSIS C5 · F.4).
 */
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { INestApplicationContext, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';
import { json } from '../src/common/prisma-json';
import { DecisionService, OTHER_OPTION } from '../src/decision/decision.service';
import { GeneratorService } from '../src/generator/generator.service';
import { JudgeService } from '../src/judge/judge.service';
import { LlmService } from '../src/llm/llm.service';
import { PromptLoaderService } from '../src/prompts/prompt-loader.service';
import { SourcesService } from '../src/sources/sources.service';
import { SpecService } from '../src/spec/spec.service';
import { VerifierService } from '../src/verifier/verifier.service';
import { singleShotOutputSchema } from '../src/contracts/llm-io/judge';
import { runRepairLoop, type RepairStats } from './repair-loop';
import type { Arm } from '../src/generated/prisma/enums';

export const EVAL_USER_EMAIL = 'eval@local';

/**
 * Thư mục `eval/` **trong source**, không phải trong `dist-eval/`.
 * `ideas.json` là deliverable #4 và `results/` được commit vào git, nên cả hai phải nằm ở
 * cây nguồn — script đã biên dịch vẫn phải đọc/ghi đúng chỗ đó.
 */
export const EVAL_DIR = resolve(process.cwd(), 'eval');

/** Mọi prompt runtime — `prompt_hash` của từng cái đi vào `EvalRun.config` (NFR-EVL-2). */
export const PROMPT_IDS = [
  'generator',
  'generator_related_work',
  'generator_gap',
  'generator_contribution',
  'generator_experiment',
  'generator_options',
  'generator_revise',
  'judge_gap',
  'judge_contribution',
  'judge_experiment',
  'judge_evidence',
  'judge_readiness',
  'verifier_entailment',
  'auditor',
  'baseline_b1',
];

export type Idea = { id: string; domain: string; text: string };

export type Services = {
  app: INestApplicationContext;
  prisma: PrismaService;
  generator: GeneratorService;
  sources: SourcesService;
  spec: SpecService;
  judge: JudgeService;
  verifier: VerifierService;
  decision: DecisionService;
  llm: LlmService;
  prompts: PromptLoaderService;
};

export async function boot(): Promise<Services> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  return {
    app,
    prisma: app.get(PrismaService),
    generator: app.get(GeneratorService),
    sources: app.get(SourcesService),
    spec: app.get(SpecService),
    judge: app.get(JudgeService),
    verifier: app.get(VerifierService),
    decision: app.get(DecisionService),
    llm: app.get(LlmService),
    prompts: app.get(PromptLoaderService),
  };
}

export async function ensureEvalUser(prisma: PrismaService): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { email: EVAL_USER_EMAIL } });
  if (existing) return existing.id;
  const created = await prisma.user.create({
    data: {
      email: EVAL_USER_EMAIL,
      password_hash: await bcrypt.hash('eval-only-no-login', 10),
      display_name: 'Eval Harness',
    },
  });
  return created.id;
}

/**
 * `ScriptedDecisionPolicy` — thay người thật khi chạy eval (ARCHITECTURE §7.4).
 *
 * Ba tính chất khiến 4 arm chạy công bằng: **cùng một policy** cho cả bốn ·
 * **deterministic** (không random, không LLM) · **đi qua đúng đường ghi của app thật**
 * (vẫn tạo `Decision`, vẫn tạo `SpecVersion`).
 *
 * **Không bao giờ chọn `Other`.** Limitation phải ghi vào báo cáo: scripted user luôn chọn
 * phương án hệ thống gợi ý, nên kết quả là **cận trên** của những gì đạt được khi user hợp tác
 * hoàn toàn — người thật có thể chọn tệ hơn.
 */
export function scriptedChoice(
  options: { key: string; recommended?: boolean }[],
): string {
  const recommended = options.find((o) => o.recommended && o.key !== OTHER_OPTION.key);
  if (recommended) return recommended.key;
  const a = options.find((o) => o.key === 'A');
  return a?.key ?? options.find((o) => o.key !== OTHER_OPTION.key)?.key ?? 'A';
}

/** Trả lời mọi câu hỏi đang chờ của một bước, bằng policy kịch bản. */
export async function answerPending(
  s: Services,
  projectId: string,
  step: 'S1' | 'S2' | 'S3',
): Promise<number> {
  const pending = await s.prisma.decision.findMany({
    where: { project_id: projectId, chosen_key: '', step },
  });
  for (const d of pending) {
    const options = Array.isArray(d.options)
      ? (d.options as { key: string; recommended?: boolean }[])
      : [];
    await s.decision.record(projectId, {
      decisionId: d.id,
      chosenKey: scriptedChoice(options),
      actor: 'SCRIPTED',
    });
  }
  return pending.length;
}

export type ArmResult = {
  projectId: string;
  specVersionId: string;
  wallMs: number;
  error?: string;
  /** Chỉ có ở arm chạy vòng sửa — đi vào `EvalRun.config` để báo cáo đọc được. */
  repair?: RepairStats;
};

/**
 * Chạy một arm trên một ý tưởng. Bảng "giai đoạn nào chạy ở arm nào" ở ARCHITECTURE §7.3 —
 * hàm này là hiện thực trực tiếp của bảng đó.
 *
 * Điểm mấu chốt: verifier có **hai vai tách rời**. Vai *đo* chạy cho **mọi** arm, kể cả B1 —
 * đó là cách duy nhất tính được `citation_validity` cho baseline. Vai *can thiệp* (gate chặn
 * xuất bản) chỉ có ở `SYS`, và nó nằm ở `Project.verifier_gate`.
 */
export async function runArm(
  s: Services,
  userId: string,
  idea: Idea,
  arm: Arm,
): Promise<ArmResult> {
  const t0 = Date.now();
  const project = await s.prisma.project.create({
    data: {
      user_id: userId,
      title: `[${arm}] ${idea.id}`,
      raw_idea: idea.text,
      arm,
      verifier_gate: arm === 'SYS',
      status: 'IN_PROGRESS',
    },
  });
  const version = await s.prisma.specVersion.create({
    data: { project_id: project.id, version_no: 1, status: 'DRAFT', label: `${arm} ${idea.id}` },
  });
  await s.prisma.project.update({
    where: { id: project.id },
    data: { current_spec_version_id: version.id },
  });

  try {
    if (arm === 'B1') {
      await runSingleShot(s, project.id, version.id, idea);
    } else {
      await s.generator.analyze(project.id);
      await answerPending(s, project.id, 'S1');

      const meta = await s.prisma.specVersion.findUniqueOrThrow({
        where: { id: version.id },
        select: { meta: true },
      });
      const keywords =
        (meta.meta as { search_keywords?: string[] } | null)?.search_keywords ?? [];
      await s.sources.searchAndStore(project.id, keywords.slice(0, 3));

      await s.generator.relatedWork(project.id);
      await s.generator.gap(project.id);
      await answerPending(s, project.id, 'S2');
      await s.generator.contributions(project.id);
      await s.generator.experimentPlan(project.id);
      await answerPending(s, project.id, 'S3');
    }

    // Vai ĐO của verifier — chạy cho mọi arm, cùng một thước.
    const current = await s.spec.currentVersionOf(project.id);
    await s.verifier.verifySpecVersion(current.id, { projectId: project.id });

    /**
     * Vòng judge **và vòng sửa** chỉ có ở SYS và SYS_NO_VERIFY.
     *
     * Chạy đủ vòng sửa, không phải một lượt judge: `B2→SYS` là "đóng góp của vòng judge",
     * mà judge chỉ nêu vấn đề — không sửa gì thì không có gì để đo.
     */
    if (arm === 'SYS' || arm === 'SYS_NO_VERIFY') {
      const repair = await runRepairLoop(s, project.id, arm);
      const final = await s.spec.currentVersionOf(project.id);
      return {
        projectId: project.id,
        specVersionId: final.id,
        wallMs: Date.now() - t0,
        repair,
      };
    }

    const final = await s.spec.currentVersionOf(project.id);
    return { projectId: project.id, specVersionId: final.id, wallMs: Date.now() - t0 };
  } catch (err) {
    return {
      projectId: project.id,
      specVersionId: version.id,
      wallMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Arm **B1** — một prompt duy nhất, ý tưởng thô vào, spec 14 mục ra. Không search, không phân rã,
 * không judge. Output được parse thành `Card` thật để **cả bốn arm ghi vào cùng bộ bảng** ⇒
 * một câu SQL tính metric cho cả bốn (C5 · F.5).
 *
 * Citation của B1 đến từ trí nhớ của model, nên chúng được lưu thành thẻ `EVIDENCE` mang
 * `payload.claimed_*` và **không** thành `Source` — enum `retrieved_from` không có giá trị `LLM`,
 * đó là chỗ kiểu dữ liệu chặn rủi ro bịa nguồn. `score.ts` giải quyết chúng bằng cách tra
 * provider thật, và tỉ lệ tra ra được **chính là** `citation_validity` của B1.
 */
async function runSingleShot(
  s: Services,
  projectId: string,
  versionId: string,
  idea: Idea,
): Promise<void> {
  const out = await s.llm.completeJson({
    promptId: 'baseline_b1',
    schema: singleShotOutputSchema,
    model: 'deepseek-v4-flash',
    purpose: 'B1_SINGLE_SHOT',
    reasoningEffort: 'low',
    maxTokens: 16_000,
    variables: { raw_idea: idea.text },
    link: { projectId, specVersionId: versionId },
  });

  await s.prisma.project.update({
    where: { id: projectId },
    data: { title: out.data.title.slice(0, 200) },
  });

  // Mỗi mục thành một thẻ, để `completeness_14` đo được bằng cùng một truy vấn với arm khác.
  await s.prisma.card.createMany({
    data: out.data.sections.map((sec, i) => ({
      spec_version_id: versionId,
      type: sectionTypeOf(sec.no),
      status: sec.body.trim().length > 0 ? ('PROPOSED' as const) : ('MISSING' as const),
      title: sec.title,
      body: sec.body,
      order_index: i,
      origin: 'GENERATOR' as const,
    })),
  });

  await s.prisma.card.createMany({
    data: out.data.citations.map((c, i) => ({
      spec_version_id: versionId,
      type: 'EVIDENCE' as const,
      status: 'PROPOSED' as const,
      title: c.title.slice(0, 280),
      body: c.supports_claim ?? '',
      payload: json({
        claimed_title: c.title,
        claimed_year: c.year ?? null,
        claimed_doi: c.doi ?? null,
        from_model_memory: true,
      }),
      order_index: 100 + i,
      origin: 'GENERATOR' as const,
    })),
  });
}

/** Ánh xạ 14 mục về 8 loại thẻ, để B1 dùng chung schema với các arm khác. */
function sectionTypeOf(no: number) {
  if (no === 1) return 'PROBLEM' as const;
  if (no === 2) return 'RESEARCH_QUESTION' as const;
  if (no === 4) return 'GAP' as const;
  if (no === 5 || no === 6) return 'CONTRIBUTION' as const;
  if (no === 7) return 'CLAIM' as const;
  if (no === 11) return 'CONSTRAINT' as const;
  if (no === 13) return 'OPEN_QUESTION' as const;
  return 'EVIDENCE' as const;
}

export function log(msg: string): void {
  new Logger('eval').log(msg);
}
