import { Injectable, Logger } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { jsonOrDbNull, json } from '../common/prisma-json';
import { PrismaService } from '../common/prisma.service';
import { titleSimilarity } from '../common/text';
import {
  analyzeOutputSchema,
  contributionOutputSchema,
  experimentOutputSchema,
  gapOutputSchema,
  relatedWorkOutputSchema,
} from '../contracts/llm-io/generator';
import {
  ESTIMATE_STATUS,
  estimatorInputSchema,
  type EstimateStatus,
  type EstimatorInput,
} from '../contracts/estimator';
import { EstimatorService } from '../estimator/estimator.service';
import { LlmService } from '../llm/llm.service';
import { SourcesService } from '../sources/sources.service';
import { SpecService } from '../spec/spec.service';
import {
  CARD_ROLE_PROPOSED_APPROACH,
  type ExperimentPlanBlob,
} from '../spec/spec.types';

export type AnalysisMeta = {
  paraphrase_en: string;
  paraphrase_vi: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  key_problems: string[];
  topics: string[];
  search_keywords: string[];
};

type Progress = (done: number, total: number, message: string) => Promise<void>;

/**
 * Sinh nội dung spec. Mọi bước ở đây gọi LLM **qua `LlmService`** và nhận `userId`/`projectId`
 * làm tham số — service không biết HTTP, để `eval/run-eval.ts` gọi thẳng được (STACK §11.3 luật 5).
 */
@Injectable()
export class GeneratorService {
  private readonly logger = new Logger(GeneratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly sources: SourcesService,
    private readonly spec: SpecService,
    private readonly estimator: EstimatorService,
  ) {}

  // ── B1 · diễn giải + phân rã thẻ + câu hỏi làm rõ ─────────────────────────

  async analyze(projectId: string, onProgress?: Progress): Promise<void> {
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    await onProgress?.(0, 1, 'Đang đọc và diễn giải lại ý tưởng…');

    const out = await this.llm.completeJson({
      promptId: 'generator',
      schema: analyzeOutputSchema,
      model: 'deepseek-v4-pro',
      purpose: 'DECOMPOSE',
      reasoningEffort: 'high',
      maxTokens: 12_000,
      variables: { raw_idea: project.raw_idea },
      link: { projectId },
    });

    const version = await this.ensureDraftVersion(projectId);

    await this.prisma.$transaction(async (tx) => {
      // Chạy lại analyze **thay thế** bộ thẻ của version nháp, không cộng dồn (S2 · F.4).
      await tx.card.deleteMany({ where: { spec_version_id: version.id } });
      await tx.card.createMany({
        data: out.data.cards.map((c, i) => ({
          spec_version_id: version.id,
          type: c.type,
          status: c.status,
          title: c.title,
          body: c.body,
          payload: jsonOrDbNull(c.payload ?? null),
          order_index: i,
          origin: 'GENERATOR' as const,
        })),
      });
      const meta: AnalysisMeta = {
        paraphrase_en: out.data.paraphrase_en,
        paraphrase_vi: out.data.paraphrase_vi,
        confidence: out.data.confidence,
        key_problems: out.data.key_problems,
        topics: out.data.topics,
        search_keywords: out.data.search_keywords,
      };
      await tx.specVersion.update({
        where: { id: version.id },
        data: { meta: json(meta) },
      });
      await tx.project.update({
        where: { id: projectId },
        data: {
          title: out.data.title.slice(0, 200),
          domain: out.data.domain.slice(0, 80),
          status: 'IN_PROGRESS',
          current_spec_version_id: version.id,
        },
      });

      // Câu hỏi làm rõ trở thành `Decision` **chưa trả lời** (`chosen_key = ''`).
      // Đây là cách `HumanDecisionPolicy` hiện thực điểm dừng chờ người dùng (C5 · F.6):
      // không có đường ghi riêng cho câu hỏi làm rõ.
      await tx.decision.deleteMany({
        where: { project_id: projectId, step: 'S1', chosen_key: '' },
      });
      for (const q of out.data.clarifying_questions) {
        await tx.decision.create({
          data: {
            project_id: projectId,
            spec_version_id: version.id,
            step: 'S1',
            question: q.question,
            options: json(q.options),
            chosen_key: '',
            actor: 'USER',
          },
        });
      }
    });

    await onProgress?.(1, 1, 'Đã phân rã ý tưởng thành thẻ.');
  }

  // ── B2 · bảng related work ────────────────────────────────────────────────

  async relatedWork(projectId: string, onProgress?: Progress): Promise<void> {
    const version = await this.spec.currentVersionOf(projectId);
    const sources = await this.sources.sourcesForPrompt(projectId);
    if (sources.length === 0) {
      throw AppError.badRequest(
        'NO_SOURCES_YET',
        'Chưa có nguồn nào. Chạy tìm nguồn trước khi dựng bảng nghiên cứu liên quan.',
      );
    }
    await onProgress?.(
      0,
      1,
      'Đang đọc abstract và dựng bảng nghiên cứu liên quan…',
    );

    const specJson = await this.spec.buildSpecJson(version.id);
    const out = await this.llm.completeJson({
      promptId: 'generator_related_work',
      schema: relatedWorkOutputSchema,
      model: 'deepseek-v4-pro',
      purpose: 'RELATED_WORK',
      reasoningEffort: 'low',
      maxTokens: 12_000,
      variables: { spec_json: specJson, sources_json: sources },
      link: { projectId, specVersionId: version.id },
    });

    // Kiểm `source_id` có thuộc danh sách trắng không. Dòng lạ bị bỏ và cộng vào bộ đếm —
    // biến một lỗi im lặng thành một con số đưa vào báo cáo được (C1 · F.7).
    const whitelist = new Set(sources.map((s) => s.source_id));
    const valid = out.data.rows.filter((r) => whitelist.has(r.source_id));
    const hallucinated = out.data.rows.length - valid.length;
    if (hallucinated > 0) {
      this.logger.warn(
        `hallucinated_source_ref=${hallucinated} ở bảng related work của project ${projectId}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.relatedWorkRow.deleteMany({
        where: { spec_version_id: version.id },
      });
      await tx.relatedWorkRow.createMany({
        data: valid.map((r, i) => ({
          spec_version_id: version.id,
          source_id: r.source_id,
          what_done: r.what_done,
          feedback_type: r.feedback_type,
          what_missing: r.what_missing,
          order_index: i,
        })),
      });
    });

    await onProgress?.(
      1,
      1,
      `Đã dựng ${valid.length} dòng nghiên cứu liên quan.`,
    );
  }

  // ── B2 · research gap ─────────────────────────────────────────────────────

  async gap(projectId: string, onProgress?: Progress): Promise<void> {
    const version = await this.spec.currentVersionOf(projectId);
    const sources = await this.sources.sourcesForPrompt(projectId);
    if (sources.length === 0) {
      throw AppError.badRequest(
        'NO_SOURCES_YET',
        'Chưa có nguồn nào để rút ra research gap.',
      );
    }
    await onProgress?.(0, 1, 'Đang rút research gap từ tài liệu đã tìm…');

    const [specJson, relatedRows] = await Promise.all([
      this.spec.buildSpecJson(version.id),
      this.prisma.relatedWorkRow.findMany({
        where: { spec_version_id: version.id },
        include: { source: { select: { id: true, title: true, year: true } } },
      }),
    ]);

    const out = await this.llm.completeJson({
      promptId: 'generator_gap',
      schema: gapOutputSchema,
      model: 'deepseek-v4-pro',
      purpose: 'GAP',
      reasoningEffort: 'high',
      maxTokens: 12_000,
      variables: {
        spec_json: specJson,
        sources_json: sources,
        related_work_json: relatedRows.map((r) => ({
          source_id: r.source_id,
          title: r.source.title,
          what_done: r.what_done,
          what_missing: r.what_missing,
        })),
      },
      link: { projectId, specVersionId: version.id },
    });

    const whitelist = new Set(sources.map((s) => s.source_id));

    await this.prisma.$transaction(async (tx) => {
      await tx.card.deleteMany({
        where: { spec_version_id: version.id, type: 'GAP' },
      });
      let order = 0;
      for (const g of out.data.gaps) {
        const complete = [
          g.prior_work,
          g.limitation,
          g.why_it_matters,
          g.testable_experiment,
        ].every((v) => v.trim().length > 0);
        const card = await tx.card.create({
          data: {
            spec_version_id: version.id,
            type: 'GAP',
            status: complete ? 'PROPOSED' : 'MISSING',
            title: g.title,
            body: g.limitation,
            payload: {
              prior_work: g.prior_work,
              limitation: g.limitation,
              why_it_matters: g.why_it_matters,
              testable_experiment: g.testable_experiment,
            },
            order_index: order++,
            origin: 'GENERATOR',
          },
        });
        await this.attachSources(tx, card.id, g.source_ids, whitelist);
      }

      // Câu hỏi chọn hướng gap ở bước B2 — vẫn đi qua đúng bảng `Decision`.
      await tx.decision.deleteMany({
        where: { project_id: projectId, step: 'S2', chosen_key: '' },
      });
      await tx.decision.create({
        data: {
          project_id: projectId,
          spec_version_id: version.id,
          step: 'S2',
          question: 'Bạn muốn tập trung vào hướng nghiên cứu nào?',
          options: json(out.data.direction_options),
          chosen_key: '',
          actor: 'USER',
        },
      });
    });

    await onProgress?.(1, 1, `Đã sinh ${out.data.gaps.length} research gap.`);
  }

  // ── B3 · contribution + claim–evidence ────────────────────────────────────

  async contributions(projectId: string, onProgress?: Progress): Promise<void> {
    const version = await this.spec.currentVersionOf(projectId);
    const sources = await this.sources.sourcesForPrompt(projectId);
    await onProgress?.(0, 1, 'Đang sinh contribution và Claim–Evidence Card…');

    const specJson = await this.spec.buildSpecJson(version.id);
    const out = await this.llm.completeJson({
      promptId: 'generator_contribution',
      schema: contributionOutputSchema,
      model: 'deepseek-v4-pro',
      purpose: 'CLAIM',
      reasoningEffort: 'high',
      maxTokens: 14_000,
      variables: { spec_json: specJson, sources_json: sources },
      link: { projectId, specVersionId: version.id },
    });

    const whitelist = new Set(sources.map((s) => s.source_id));

    await this.prisma.$transaction(async (tx) => {
      await tx.card.deleteMany({
        where: {
          spec_version_id: version.id,
          type: { in: ['CONTRIBUTION', 'CLAIM'] },
        },
      });

      await tx.card.create({
        data: {
          spec_version_id: version.id,
          type: 'CONTRIBUTION',
          status: 'PROPOSED',
          title: 'Proposed approach',
          body: out.data.proposed_approach,
          payload: { role: CARD_ROLE_PROPOSED_APPROACH },
          order_index: 0,
          origin: 'GENERATOR',
        },
      });

      let order = 1;
      for (const c of out.data.contributions) {
        const card = await tx.card.create({
          data: {
            spec_version_id: version.id,
            type: 'CONTRIBUTION',
            status: 'PROPOSED',
            title: c.title,
            body: c.body,
            order_index: order++,
            origin: 'GENERATOR',
          },
        });
        await this.attachSources(tx, card.id, c.source_ids, whitelist);
      }

      order = 0;
      for (const c of out.data.claims) {
        const missing = [
          c.baseline,
          c.metric,
          c.evidence,
          c.refutation_condition,
        ].some((v) => v.trim().length === 0);
        const card = await tx.card.create({
          data: {
            spec_version_id: version.id,
            type: 'CLAIM',
            status: missing ? 'MISSING' : 'PROPOSED',
            title: c.claim.slice(0, 180),
            body: c.claim,
            payload: {
              baseline: c.baseline,
              metric: c.metric,
              evidence: c.evidence,
              refutation_condition: c.refutation_condition,
            },
            order_index: order++,
            origin: 'GENERATOR',
          },
        });
        await this.attachSources(tx, card.id, c.source_ids, whitelist);
      }
    });

    await onProgress?.(1, 1, 'Đã sinh contribution và claim.');
  }

  // ── B3 · kế hoạch thí nghiệm + ước lượng tài nguyên ───────────────────────

  async experimentPlan(
    projectId: string,
    onProgress?: Progress,
  ): Promise<void> {
    const version = await this.spec.currentVersionOf(projectId);
    await onProgress?.(0, 2, 'Đang lập kế hoạch thí nghiệm…');

    const specJson = await this.spec.buildSpecJson(version.id);
    const out = await this.llm.completeJson({
      promptId: 'generator_experiment',
      schema: experimentOutputSchema,
      model: 'deepseek-v4-pro',
      purpose: 'EXPERIMENT',
      reasoningEffort: 'high',
      maxTokens: 14_000,
      variables: { spec_json: specJson },
      link: { projectId, specVersionId: version.id },
    });

    /**
     * Quyết trạng thái ước lượng **trước** khi ghi, rồi ghi **một lần**.
     *
     * Trước đây kế hoạch được `upsert` ngay rồi mới parse tham số. Parse ném thì job chết sau
     * khi kế hoạch đã vào DB — để lại một hàng không mang thông tin nào về việc vì sao nó thiếu
     * ước lượng, và giao diện buộc phải đoán. Đã xảy ra thật với 5 job.
     *
     * Ba trạng thái, ba câu nói khác nhau với người dùng — xem `contracts/estimator.ts`.
     */
    const raw = out.data.estimator_inputs;

    let status: EstimateStatus;
    let inputs: EstimatorInput | null = null;

    if (raw === null) {
      // Mô hình **chủ động** nói kế hoạch này không chạy trên model nào (prompt rule 8).
      status = ESTIMATE_STATUS.NOT_APPLICABLE;
    } else {
      /* Lưới cuối. Schema output đã dùng chung `estimatorInputSchema` nên nhánh này về lý
         thuyết không xảy ra — giữ lại vì "về lý thuyết" không phải là một bảo đảm, và cái giá
         của việc sai ở đây là mất cả kế hoạch thí nghiệm. */
      const parsed = estimatorInputSchema.safeParse(raw);
      if (parsed.success) {
        status = ESTIMATE_STATUS.OK;
        inputs = parsed.data;
      } else {
        status = ESTIMATE_STATUS.INVALID_PARAMS;
        // Log `path` + `code`, **không** log giá trị nhận được: `message` của một custom error
        // map có thể kèm giá trị, và đó là output model lọt vào log (backend/CLAUDE.md §5).
        this.logger.warn(
          `Ước lượng tài nguyên bị bỏ qua cho version ${version.id} — ` +
            `estimator_inputs không hợp lệ: ${parsed.error.issues
              .map((i) => `${i.path.join('.') || '(gốc)'}[${i.code}]`)
              .join(' · ')}`,
        );
      }
    }

    const blob: ExperimentPlanBlob = {
      experiments: out.data.experiments.map((e) => ({
        code: e.code,
        title: e.title,
        bullets: e.bullets,
        linked_claim_title: e.linked_claim_title ?? '',
      })),
      baselines_and_metrics: out.data.baselines_and_metrics,
      ablation_plan: out.data.ablation_plan,
      risks_and_limitations: out.data.risks_and_limitations,
      estimate_status: status,
      estimate_note:
        status === ESTIMATE_STATUS.NOT_APPLICABLE
          ? out.data.estimator_note
          : undefined,
    };

    await this.prisma.experimentPlan.upsert({
      where: { spec_version_id: version.id },
      create: { spec_version_id: version.id, plan: json(blob) },
      update: { plan: json(blob) },
    });

    await onProgress?.(1, 2, 'Đang ước lượng tài nguyên…');

    if (inputs === null) {
      await onProgress?.(
        2,
        2,
        status === ESTIMATE_STATUS.NOT_APPLICABLE
          ? 'Đã có kế hoạch thí nghiệm. Kế hoạch này không chạy trên mô hình nào nên không cần ước lượng tài nguyên.'
          : 'Đã có kế hoạch thí nghiệm. Tham số ước lượng chưa hợp lệ — bạn có thể tự nhập ở cột phải.',
      );
      return;
    }

    // Ước lượng là **công thức thuần, 0 LLM** — model chỉ cung cấp tham số (S4).
    await this.saveEstimate(version.id, inputs);
    await onProgress?.(
      2,
      2,
      'Đã có kế hoạch thí nghiệm và ước lượng tài nguyên.',
    );
  }

  async saveEstimate(specVersionId: string, inputs: EstimatorInput) {
    const result = this.estimator.estimate(inputs);
    await this.prisma.resourceEstimate.upsert({
      where: { spec_version_id: specVersionId },
      create: {
        spec_version_id: specVersionId,
        inputs: json(result.inputs),
        vram_gb: result.vram_gb,
        hours_min: result.hours_min,
        hours_max: result.hours_max,
        tokens_est: result.tokens_est,
        cost_usd: result.cost_usd,
        fits_rtx3090: result.fits_rtx3090,
        downscale_suggestion: jsonOrDbNull(result.downscale_suggestion),
      },
      update: {
        inputs: json(result.inputs),
        vram_gb: result.vram_gb,
        hours_min: result.hours_min,
        hours_max: result.hours_max,
        tokens_est: result.tokens_est,
        cost_usd: result.cost_usd,
        fits_rtx3090: result.fits_rtx3090,
        downscale_suggestion: jsonOrDbNull(result.downscale_suggestion),
      },
    });
    return result;
  }

  // ── tiện ích ──────────────────────────────────────────────────────────────

  async ensureDraftVersion(projectId: string) {
    const existing = await this.prisma.specVersion.findFirst({
      where: { project_id: projectId },
      orderBy: { version_no: 'desc' },
    });
    if (existing) return existing;
    const created = await this.prisma.specVersion.create({
      data: {
        project_id: projectId,
        version_no: 1,
        status: 'DRAFT',
        label: 'Bản nháp đầu tiên',
      },
    });
    await this.prisma.project.update({
      where: { id: projectId },
      data: { current_spec_version_id: created.id },
    });
    return created;
  }

  /** Chỉ nối `source_id` thuộc danh sách trắng — chặn ở tầng ghi, không ở tầng review code. */
  private async attachSources(
    tx: {
      cardSource: {
        createMany: (args: {
          data: { card_id: string; source_id: string }[];
          skipDuplicates?: boolean;
        }) => Promise<unknown>;
      };
    },
    cardId: string,
    sourceIds: string[],
    whitelist: Set<string>,
  ): Promise<void> {
    const valid = [...new Set(sourceIds)].filter((id) => whitelist.has(id));
    if (valid.length === 0) return;
    await tx.cardSource.createMany({
      data: valid.map((source_id) => ({ card_id: cardId, source_id })),
      skipDuplicates: true,
    });
  }

  /** Dùng ở bước gộp issue và ở B1 để nối issue với thẻ theo tiêu đề. */
  static matchCardByTitle<T extends { id: string; title: string }>(
    cards: T[],
    title: string,
    threshold = 0.85,
  ): T | null {
    if (!title.trim()) return null;
    let best: T | null = null;
    let bestScore = 0;
    for (const c of cards) {
      const score = titleSimilarity(c.title, title);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return bestScore >= threshold ? best : null;
  }
}
