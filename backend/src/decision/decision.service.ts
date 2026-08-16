import { Injectable, Logger } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { json, jsonOrDbNull } from '../common/prisma-json';
import { PrismaService } from '../common/prisma.service';
import { optionsOutputSchema } from '../contracts/llm-io/generator';
import {
  reviseOutputSchema,
  type ReviseOutput,
} from '../contracts/llm-io/revise';
import { GeneratorService } from '../generator/generator.service';
import { LlmService } from '../llm/llm.service';
import { SpecService } from '../spec/spec.service';
import type {
  CardStatus,
  CardType,
  ProjectStep,
} from '../generated/prisma/enums';

export type DecisionOption = {
  key: string;
  label: string;
  explain: string;
  example: string;
  recommended?: boolean;
};

/** Giao diện **luôn** chèn option này; backend cũng chèn để eval và API dùng chung một tập. */
export const OTHER_OPTION: DecisionOption = {
  key: 'OTHER',
  label: 'Khác — tôi tự mô tả',
  explain:
    'Bạn mô tả cách xử lý của riêng mình; hệ thống ghi lại nguyên văn lý do.',
  example: 'Ví dụ: giữ nguyên claim nhưng ghi chú rằng bằng chứng còn yếu.',
};

export type AnswerInput = {
  decisionId?: string;
  specVersionId?: string;
  step?: ProjectStep;
  issueGroupId?: string | null;
  question?: string;
  options?: DecisionOption[];
  chosenKey: string;
  customText?: string | null;
  actor?: 'USER' | 'SCRIPTED';
};

@Injectable()
export class DecisionService {
  private readonly logger = new Logger(DecisionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly spec: SpecService,
  ) {}

  /**
   * Trả **thẳng `options[]`**, không mở job: một lời gọi ~10s và người dùng đang đứng chờ ngay tại
   * chỗ — mở một job + một `EventSource` cho 10 giây là phức tạp thừa
   * (SYSTEM_DESIGN_ANALYSIS §4.4 #1, đã chốt).
   */
  async optionsForIssueGroup(issueGroupId: string): Promise<{
    question: string;
    options: DecisionOption[];
  }> {
    const group = await this.prisma.issueGroup.findUniqueOrThrow({
      where: { id: issueGroupId },
      include: {
        issues: { include: { judge_run: { select: { judge_key: true } } } },
        spec_version: { select: { id: true, project_id: true } },
      },
    });

    const specJson = await this.spec.buildSpecJson(group.spec_version.id);
    const out = await this.llm.completeJson({
      promptId: 'generator_options',
      schema: optionsOutputSchema,
      model: 'deepseek-v4-pro',
      purpose: 'OPTIONS',
      reasoningEffort: 'low',
      maxTokens: 4_000,
      variables: {
        spec_json: specJson,
        issue_json: {
          canonical_title: group.canonical_title,
          max_severity: group.max_severity,
          agreement: `${group.agreement_count}/${group.judges_completed}`,
          notes: group.issues.map((i) => ({
            judge: i.judge_run.judge_key,
            severity: i.severity,
            title: i.title,
            reason: i.reason,
            suggestion: i.suggestion,
          })),
        },
      },
      link: {
        projectId: group.spec_version.project_id,
        specVersionId: group.spec_version.id,
      },
    });

    return {
      question: out.data.question,
      // "Other" **không** để phụ thuộc vào việc model có nhớ sinh ra nó hay không (NFR-G-3).
      options: [...out.data.options, OTHER_OPTION],
    };
  }

  /**
   * Ghi lựa chọn với `applied = false` và trả kèm bản nháp version mới **chưa lưu**.
   * Tách `POST /decisions` khỏi `POST /decisions/:id/apply` là cố ý — nó tạo ra điểm dừng 3
   * (xem diff rồi mới cam kết) và làm cho việc huỷ vẫn để lại dấu vết (C4 · F.4).
   */
  async record(projectId: string, input: AnswerInput) {
    if (input.chosenKey === 'OTHER' && !input.customText?.trim()) {
      throw AppError.unprocessable(
        'OTHER_REASON_REQUIRED',
        'Chọn "Khác" thì bắt buộc nhập lý do.',
      );
    }

    let decision;
    if (input.decisionId) {
      const pending = await this.prisma.decision.findFirst({
        where: { id: input.decisionId, project_id: projectId },
      });
      if (!pending)
        throw AppError.notFound('Không tìm thấy câu hỏi cần trả lời.');
      if (pending.applied) {
        throw AppError.conflict(
          'DECISION_ALREADY_APPLIED',
          'Quyết định này đã được áp dụng.',
          { resultingSpecVersionId: pending.resulting_spec_version_id },
        );
      }
      this.assertOptionExists(pending.options, input.chosenKey);
      decision = await this.prisma.decision.update({
        where: { id: pending.id },
        data: {
          chosen_key: input.chosenKey,
          custom_text: input.customText ?? null,
          actor: input.actor ?? 'USER',
        },
      });
    } else {
      if (
        !input.specVersionId ||
        !input.step ||
        !input.question ||
        !input.options
      ) {
        throw AppError.badRequest(
          'VALIDATION_FAILED',
          'Thiếu dữ liệu để tạo quyết định mới.',
        );
      }
      this.assertOptionExists(input.options, input.chosenKey);
      decision = await this.prisma.decision.create({
        data: {
          project_id: projectId,
          spec_version_id: input.specVersionId,
          step: input.step,
          issue_group_id: input.issueGroupId ?? null,
          question: input.question,
          // Snapshot: câu hỏi và phương án là **bằng chứng lịch sử**. Prompt đổi tuần sau thì
          // bản ghi cũ vẫn phải đọc đúng thứ người dùng đã thấy (C4 · F.5).
          options: json(input.options),
          chosen_key: input.chosenKey,
          custom_text: input.customText ?? null,
          actor: input.actor ?? 'USER',
        },
      });
    }

    // Quyết định gắn với một nhóm issue ⇒ sinh bản nháp version mới để người dùng xem diff.
    // Quyết định làm rõ ở B1–B3 chỉ ghi lựa chọn: nó là **đầu vào** của bước sinh kế tiếp,
    // không tự tạo version.
    let preview: {
      changes: ReviseOutput['changes'];
      summary: string;
      before_markdown: string;
      after_markdown: string;
    } | null = null;

    if (decision.issue_group_id) {
      preview = await this.buildDraft(decision.id);
    } else {
      await this.prisma.decision.update({
        where: { id: decision.id },
        data: {
          applied: true,
          resulting_spec_version_id: decision.spec_version_id,
        },
      });
    }

    return { decision: await this.get(decision.id), preview };
  }

  private assertOptionExists(options: unknown, key: string): void {
    if (key === 'OTHER') return;
    const list = Array.isArray(options) ? (options as DecisionOption[]) : [];
    if (list.length > 0 && !list.some((o) => o.key === key)) {
      throw AppError.badRequest(
        'DECISION_OPTION_UNKNOWN',
        `Phương án "${key}" không có trong danh sách đã hiện cho người dùng.`,
      );
    }
  }

  /** Dựng bản nháp và **lưu vào `Decision.draft`**, để apply ghi đúng thứ đã hiện trong diff. */
  private async buildDraft(decisionId: string) {
    const decision = await this.prisma.decision.findUniqueOrThrow({
      where: { id: decisionId },
      include: {
        issue_group: {
          include: {
            issues: { include: { judge_run: { select: { judge_key: true } } } },
          },
        },
      },
    });

    const specJson = await this.spec.buildSpecJson(decision.spec_version_id);
    const chosen = pickOption(decision.options, decision.chosen_key);

    const out = await this.llm.completeJson({
      promptId: 'generator_revise',
      schema: reviseOutputSchema,
      model: 'deepseek-v4-pro',
      purpose: 'OPTIONS',
      reasoningEffort: 'high',
      maxTokens: 10_000,
      variables: {
        spec_json: specJson,
        issue_json: decision.issue_group
          ? {
              canonical_title: decision.issue_group.canonical_title,
              max_severity: decision.issue_group.max_severity,
              notes: decision.issue_group.issues.map((i) => ({
                judge: i.judge_run.judge_key,
                title: i.title,
                reason: i.reason,
                suggestion: i.suggestion,
              })),
            }
          : null,
        decision_json: {
          question: decision.question,
          chosen_key: decision.chosen_key,
          chosen_label: chosen?.label ?? decision.chosen_key,
          chosen_explain: chosen?.explain ?? '',
          custom_text: decision.custom_text ?? '',
        },
      },
      link: {
        projectId: decision.project_id,
        specVersionId: decision.spec_version_id,
      },
    });

    await this.prisma.decision.update({
      where: { id: decision.id },
      data: { draft: json(out.data) },
    });

    const beforeMarkdown = await this.spec.buildMarkdown(
      decision.spec_version_id,
    );
    const afterMarkdown = await this.projectMarkdown(
      decision.spec_version_id,
      out.data,
    );

    return {
      changes: out.data.changes,
      summary: out.data.summary,
      before_markdown: beforeMarkdown,
      after_markdown: afterMarkdown,
    };
  }

  /**
   * Áp dụng: một transaction, chép thẻ bằng **một** lệnh ghi hàng loạt.
   *
   * Hai khoá bảo vệ, cả hai **miễn phí** ở tầng DB (C4 · F.7):
   * - `UNIQUE(project_id, version_no)` là optimistic lock → hai tab cùng apply thì tab thứ hai
   *   nhận `409 VERSION_CONFLICT`, không sinh nhánh version.
   * - `Decision.applied` **chính là** khoá idempotency → bấm đúp nhận `409` kèm
   *   `resultingSpecVersionId` để FE điều hướng thay vì báo lỗi.
   */
  async apply(projectId: string, decisionId: string) {
    const decision = await this.prisma.decision.findFirst({
      where: { id: decisionId, project_id: projectId },
    });
    if (!decision) throw AppError.notFound('Không tìm thấy quyết định.');
    if (decision.applied) {
      throw AppError.conflict(
        'DECISION_ALREADY_APPLIED',
        'Quyết định này đã được áp dụng rồi.',
        { resultingSpecVersionId: decision.resulting_spec_version_id },
      );
    }
    const parsedDraft = reviseOutputSchema.safeParse(decision.draft);
    if (!parsedDraft.success) {
      throw AppError.badRequest(
        'VALIDATION_FAILED',
        'Quyết định này chưa có bản nháp để áp dụng.',
      );
    }

    const parent = await this.prisma.specVersion.findUniqueOrThrow({
      where: { id: decision.spec_version_id },
      include: {
        cards: { include: { card_sources: true } },
        related_work_rows: true,
        experiment_plan: true,
        resource_estimate: true,
      },
    });

    const nextCards = applyChanges(parent.cards, parsedDraft.data);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const version = await tx.specVersion.create({
          data: {
            project_id: projectId,
            version_no: parent.version_no + 1,
            parent_version_id: parent.id,
            created_by_decision_id: decision.id,
            status: 'DRAFT',
            label: `Sau quyết định: ${parsedDraft.data.summary.slice(0, 60)}`,
            meta: jsonOrDbNull(parent.meta),
          },
        });

        // Chép thẻ bằng **một** lệnh ghi hàng loạt trong transaction — không dùng vòng lặp,
        // để không bao giờ tồn tại một version "đầy một nửa".
        await tx.card.createMany({
          data: nextCards.map((c, i) => ({
            id: undefined,
            spec_version_id: version.id,
            type: c.type,
            status: c.status,
            title: c.title,
            body: c.body,
            payload: jsonOrDbNull(c.payload),
            order_index: i,
            origin: c.origin,
          })),
        });

        // Nối lại nguồn cho các thẻ giữ nguyên tiêu đề.
        const created = await tx.card.findMany({
          where: { spec_version_id: version.id },
          select: { id: true, title: true },
        });
        const byTitle = new Map(created.map((c) => [c.title, c.id]));
        const links: { card_id: string; source_id: string }[] = [];
        for (const old of parent.cards) {
          const newId = byTitle.get(old.title);
          if (!newId) continue;
          for (const cs of old.card_sources) {
            links.push({ card_id: newId, source_id: cs.source_id });
          }
        }
        if (links.length > 0) {
          await tx.cardSource.createMany({ data: links, skipDuplicates: true });
        }

        if (parent.related_work_rows.length > 0) {
          await tx.relatedWorkRow.createMany({
            data: parent.related_work_rows.map((r) => ({
              spec_version_id: version.id,
              source_id: r.source_id,
              what_done: r.what_done,
              feedback_type: r.feedback_type,
              what_missing: r.what_missing,
              order_index: r.order_index,
            })),
          });
        }
        if (parent.experiment_plan) {
          await tx.experimentPlan.create({
            data: {
              spec_version_id: version.id,
              plan: json(parent.experiment_plan.plan),
            },
          });
        }
        if (parent.resource_estimate) {
          const e = parent.resource_estimate;
          await tx.resourceEstimate.create({
            data: {
              spec_version_id: version.id,
              inputs: json(e.inputs),
              vram_gb: e.vram_gb,
              hours_min: e.hours_min,
              hours_max: e.hours_max,
              tokens_est: e.tokens_est,
              cost_usd: e.cost_usd,
              fits_rtx3090: e.fits_rtx3090,
              downscale_suggestion: jsonOrDbNull(e.downscale_suggestion),
            },
          });
        }

        // Cập nhật con trỏ **trong cùng** transaction — ra ngoài là con trỏ sẽ lệch.
        await tx.project.update({
          where: { id: projectId },
          data: { current_spec_version_id: version.id, judge_round: 0 },
        });

        // `applied = false` là điều kiện của lệnh cập nhật ⇒ lần thứ hai không đổi được dòng nào.
        const updated = await tx.decision.updateMany({
          where: { id: decision.id, applied: false },
          data: { applied: true, resulting_spec_version_id: version.id },
        });
        if (updated.count === 0) {
          throw AppError.conflict(
            'DECISION_ALREADY_APPLIED',
            'Quyết định này vừa được áp dụng ở nơi khác.',
          );
        }

        if (decision.issue_group_id) {
          await tx.issueGroup.update({
            where: { id: decision.issue_group_id },
            data: { status: 'RESOLVED' },
          });
        }

        return version;
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw AppError.conflict(
          'VERSION_CONFLICT',
          'Spec đã thay đổi ở nơi khác. Tải lại rồi chọn lại.',
        );
      }
      throw err;
    }
  }

  async list(projectId: string) {
    return this.prisma.decision.findMany({
      where: { project_id: projectId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        step: true,
        question: true,
        options: true,
        chosen_key: true,
        custom_text: true,
        actor: true,
        applied: true,
        issue_group_id: true,
        spec_version_id: true,
        resulting_spec_version_id: true,
        created_at: true,
      },
    });
  }

  /** Câu hỏi đang chờ trả lời = `chosen_key` rỗng. Đây là "điểm dừng" của bước hiện tại. */
  async pending(projectId: string, step?: ProjectStep) {
    return this.prisma.decision.findMany({
      where: {
        project_id: projectId,
        chosen_key: '',
        ...(step ? { step } : {}),
      },
      orderBy: { created_at: 'asc' },
      select: {
        id: true,
        step: true,
        question: true,
        options: true,
        spec_version_id: true,
        issue_group_id: true,
      },
    });
  }

  async get(id: string) {
    return this.prisma.decision.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        step: true,
        question: true,
        options: true,
        chosen_key: true,
        custom_text: true,
        actor: true,
        applied: true,
        issue_group_id: true,
        spec_version_id: true,
        resulting_spec_version_id: true,
        created_at: true,
      },
    });
  }

  /** Markdown của bản nháp — dựng trong bộ nhớ, không ghi DB. */
  private async projectMarkdown(
    specVersionId: string,
    draft: ReviseOutput,
  ): Promise<string> {
    const before = await this.spec.buildMarkdown(specVersionId);
    // Diff hữu ích nhất ở mức thẻ; nối phần tóm tắt thay đổi vào cuối để người đọc thấy ngay.
    const changed = draft.changes
      .map(
        (c) =>
          `- \`${c.operation}\` ${c.target_card_title || c.new_title}\n  - ${c.rationale}`,
      )
      .join('\n');
    return `${applyToMarkdown(before, draft)}\n\n---\n\n### Proposed changes\n\n${changed}\n`;
  }
}

type CardLike = {
  type: CardType;
  status: CardStatus;
  title: string;
  body: string;
  payload: unknown;
  origin: 'GENERATOR' | 'USER' | 'JUDGE_FIX';
  order_index: number;
};

/** Áp bản nháp lên tập thẻ — hàm thuần, dùng cho cả preview lẫn apply. */
export function applyChanges(
  cards: {
    type: CardType;
    status: CardStatus;
    title: string;
    body: string;
    payload: unknown;
    origin: 'GENERATOR' | 'USER' | 'JUDGE_FIX';
    order_index: number;
  }[],
  draft: ReviseOutput,
): CardLike[] {
  const out: CardLike[] = cards.map((c) => ({ ...c }));

  for (const change of draft.changes) {
    if (change.operation === 'ADD') {
      out.push({
        type: change.new_type ?? 'OPEN_QUESTION',
        status: change.new_status ?? 'PROPOSED',
        title: change.new_title,
        body: change.new_body,
        payload: change.new_payload ?? null,
        origin: 'JUDGE_FIX',
        order_index: out.length,
      });
      continue;
    }

    const match = GeneratorService.matchCardByTitle(
      out.map((c, i) => ({ id: String(i), title: c.title })),
      change.target_card_title,
      0.8,
    );
    if (!match) continue;
    const idx = Number(match.id);

    if (change.operation === 'DELETE') {
      out.splice(idx, 1);
      continue;
    }
    if (change.operation === 'DEMOTE_TO_OPEN_QUESTION') {
      out[idx] = {
        ...out[idx],
        type: 'OPEN_QUESTION',
        status: 'PROPOSED',
        title: change.new_title || out[idx].title,
        body: change.new_body || out[idx].body,
        payload: null,
        origin: 'JUDGE_FIX',
      };
      continue;
    }
    out[idx] = {
      ...out[idx],
      type: change.new_type ?? out[idx].type,
      status: change.new_status ?? out[idx].status,
      title: change.new_title || out[idx].title,
      body: change.new_body || out[idx].body,
      payload: change.new_payload ?? out[idx].payload,
      origin: 'JUDGE_FIX',
    };
  }

  return out;
}

function applyToMarkdown(before: string, draft: ReviseOutput): string {
  let text = before;
  for (const c of draft.changes) {
    if (!c.target_card_title || !c.new_title) continue;
    text = text.split(c.target_card_title).join(c.new_title);
    if (c.new_body) {
      // Thay phần thân nếu tìm thấy tiêu đề mới đứng đầu dòng bullet.
      text = text.replace(
        new RegExp(`(\\*\\*${escapeRegExp(c.new_title)}\\*\\* — )[^\\n]*`),
        `$1${c.new_body.replace(/\n+/g, ' ')}`,
      );
    }
  }
  return text;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pickOption(options: unknown, key: string): DecisionOption | null {
  if (!Array.isArray(options)) return null;
  return (options as DecisionOption[]).find((o) => o.key === key) ?? null;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'P2002'
  );
}
