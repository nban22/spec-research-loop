import { Injectable, Logger } from '@nestjs/common';
import { json } from '../../common/prisma-json';
import { PrismaService } from '../../common/prisma.service';
import {
  overclaimOutputSchema,
  type OverclaimExit,
} from '../../contracts/llm-io/overclaim';
import { LlmService } from '../../llm/llm.service';
import {
  assessOverclaim,
  cardText,
  extractActualScope,
  extractDeclaredScope,
  type ActualScope,
  type OverclaimLevel,
} from './overclaim-scope';

const PROMPT_ID = 'judge_overclaim';

/**
 * Cùng hình dạng với `DecisionOption` của `decision.service.ts`. Khai lại tại chỗ chứ không
 * import chéo: backend/CLAUDE.md §2 cấm feature import lẫn nhau, và làn B không được thêm file
 * vào `contracts/` chỉ để dùng chung một type nhãn hiển thị.
 */
export type OverclaimOption = {
  key: string;
  label: string;
  explain: string;
  example: string;
  recommended?: boolean;
};

/**
 * Ba đường ra của Bước 10, dạng nhãn hiển thị cho người dùng — cùng khuôn với `GATE_OPTIONS`
 * của verifier gate. Đây **không** phải prompt: chúng không đi vào lời gọi LLM nào.
 */
export const OVERCLAIM_OPTIONS: OverclaimOption[] = [
  {
    key: 'NARROW_CLAIM',
    label: 'Thu hẹp khẳng định về đúng phạm vi đã chứng minh',
    explain:
      'Giữ kết quả, sửa câu chữ cho khớp thứ thí nghiệm thật sự đo được. Rẻ nhất và gần như luôn dùng được.',
    example:
      'Ví dụ: "phương pháp hoạt động trên mọi domain" → "phương pháp hoạt động trên domain văn bản pháp luật".',
    recommended: true,
  },
  {
    key: 'EXPAND_EXPERIMENT',
    label: 'Giữ khẳng định, mở rộng thí nghiệm cho đủ phạm vi',
    explain:
      'Khẳng định đáng giữ nguyên độ rộng. Bạn phải thêm domain hoặc dataset vào kế hoạch thí nghiệm.',
    example: 'Ví dụ: thêm một domain thứ hai để câu "nhiều domain" có chỗ dựa.',
  },
  {
    key: 'TO_RESEARCH_QUESTION',
    label: 'Hạ xuống câu hỏi nghiên cứu',
    explain:
      'Không bằng chứng nào chống lưng nổi ở phạm vi đáng nói. Giữ ý tưởng dưới dạng câu hỏi mở thay vì khẳng định.',
    example:
      'Ví dụ: "phương pháp tổng quát hoá được" → "phương pháp có tổng quát hoá sang domain khác không?".',
  },
];

export type OverclaimFlagView = {
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

export type OverclaimScanResult = {
  /** `false` khi `Project.overclaim_detector` tắt — không quét, không tốn gì. */
  enabled: boolean;
  scanned: number;
  flagged: number;
  /** Số claim tầng luật kết luận một mình. Con số đi thẳng vào báo cáo của #13. */
  byRule: number;
  /** Số claim phải nhờ tầng LLM. */
  byLlm: number;
};

/**
 * B1 · bắt claim bị phóng đại (#7).
 *
 * Hai tầng, theo đúng mô típ của verifier: **tầng luật 0 token** chặn trường hợp rõ ràng, **tầng
 * LLM chỉ chạy cho vùng xám**. Tỉ lệ `byRule / flagged` chính là thứ chứng minh cơ chế này rẻ.
 */
@Injectable()
export class OverclaimService {
  private readonly logger = new Logger(OverclaimService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  /**
   * Quét toàn bộ `Card(CLAIM)` của một version. Idempotent: xoá cờ cũ của version rồi ghi lại,
   * vì cờ là **hàm của nội dung version**, không phải lịch sử.
   */
  async scanVersion(
    specVersionId: string,
    opts: { evalRunId?: string | null } = {},
  ): Promise<OverclaimScanResult> {
    const version = await this.prisma.specVersion.findUniqueOrThrow({
      where: { id: specVersionId },
      include: { project: true, experiment_plan: true },
    });

    if (!version.project.overclaim_detector) {
      return { enabled: false, scanned: 0, flagged: 0, byRule: 0, byLlm: 0 };
    }

    const claims = await this.prisma.card.findMany({
      where: { spec_version_id: specVersionId, type: 'CLAIM' },
      select: { id: true, title: true, body: true, payload: true },
    });

    const actual = extractActualScope(
      version.experiment_plan?.plan ?? null,
      version.project.domain,
    );

    await this.clearForVersion(specVersionId);

    let byRule = 0;
    let byLlm = 0;
    let flagged = 0;

    for (const card of claims) {
      const text = cardText(card);
      const declared = extractDeclaredScope(text);
      // Phát hiện đọc **cả thẻ** (title + body + payload), nhưng câu thu hẹp chỉ được dựng từ
      // `body` — tức là đúng câu khẳng định. Truyền cả `text` vào thì tiêu đề thẻ bị dán lên
      // đầu câu đề xuất và nó hết "dán được ngay" (thấy khi chạy app thật).
      const verdict = assessOverclaim(card.body, declared, actual);

      if (verdict.level !== 'NONE') {
        // Tầng luật kết luận dứt khoát — **không** gọi LLM.
        await this.persist({
          specVersionId,
          cardId: card.id,
          detector: 'RULE',
          level: verdict.level,
          matchedTerms: verdict.matchedTerms,
          declared,
          actual,
          rationale: verdict.rationale,
          suggestedNarrowing: verdict.suggestedNarrowing,
          recommendedExit: this.ruleExit(
            verdict.level,
            verdict.suggestedNarrowing,
          ),
          llmCalls: 0,
        });
        byRule += 1;
        flagged += 1;
        continue;
      }

      if (!verdict.needsLlm) continue;

      const out = await this.judgeGrayZone(
        card,
        version.experiment_plan?.plan ?? null,
        { declared, actual, matched: verdict.matchedTerms },
        {
          projectId: version.project_id,
          specVersionId,
          evalRunId: opts.evalRunId,
        },
      );
      byLlm += 1;
      if (!out || out.level === 'NONE') continue;

      await this.persist({
        specVersionId,
        cardId: card.id,
        detector: 'LLM',
        level: out.level,
        matchedTerms: out.offending_phrases,
        declared,
        actual,
        rationale: out.rationale,
        suggestedNarrowing: out.suggested_narrowing,
        recommendedExit: out.recommended_exit,
        llmCalls: 1,
      });
      flagged += 1;
    }

    this.logger.log(
      `overclaim scan ${specVersionId}: ${flagged}/${claims.length} bị cờ (${byRule} bằng luật, ${byLlm} lời gọi LLM)`,
    );
    return {
      enabled: true,
      scanned: claims.length,
      flagged,
      byRule,
      byLlm,
    };
  }

  /**
   * Tầng LLM. Lỗi ở đây **không** làm hỏng cả lượt quét: cờ của các claim khác đã đúng và đã
   * ghi. Trả `null` và đi tiếp, cùng lý lẽ với `Promise.allSettled` ở `JudgeService`.
   */
  private async judgeGrayZone(
    card: { id: string; title: string; body: string; payload: unknown },
    plan: unknown,
    signals: {
      declared: ReturnType<typeof extractDeclaredScope>;
      actual: ActualScope;
      matched: string[];
    },
    link: {
      projectId: string;
      specVersionId: string;
      evalRunId?: string | null;
    },
  ) {
    try {
      const out = await this.llm.completeJson({
        promptId: PROMPT_ID,
        schema: overclaimOutputSchema,
        model: 'deepseek-v4-pro',
        // `LlmPurpose` là enum Prisma; luật chung 2 cấm thêm giá trị vào enum đang có, nên
        // dùng lại `JUDGE`. Phân biệt bằng `prompt_id` khi đọc số ở #13.
        purpose: 'JUDGE',
        reasoningEffort: 'low',
        maxTokens: 2_000,
        variables: {
          claim_json: JSON.stringify({
            title: card.title,
            body: card.body,
            payload: card.payload,
          }),
          plan_json: JSON.stringify(plan),
          rule_signals_json: JSON.stringify({
            matched_terms: signals.matched,
            declared_counts: signals.declared.counts,
            evidenced_counts: signals.actual.counts,
            evidenced_names: signals.actual.names,
            plan_has_baseline: signals.actual.hasBaseline,
            plan_has_metric: signals.actual.hasMetric,
          }),
        },
        link: {
          projectId: link.projectId,
          specVersionId: link.specVersionId,
          evalRunId: link.evalRunId ?? null,
        },
      });
      return out.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`overclaim LLM lỗi trên card ${card.id}: ${message}`);
      return null;
    }
  }

  /**
   * Đường ra mặc định do luật chọn. `CRITICAL` mà không dựng nổi câu thu hẹp nghĩa là không còn
   * phạm vi nào để lùi về — lúc đó hạ xuống câu hỏi nghiên cứu mới là đường ra thật.
   */
  private ruleExit(level: OverclaimLevel, narrowing: string): OverclaimExit {
    if (level === 'CRITICAL' && narrowing.length === 0) {
      return 'TO_RESEARCH_QUESTION';
    }
    return 'NARROW_CLAIM';
  }

  private async persist(row: {
    specVersionId: string;
    cardId: string;
    detector: 'RULE' | 'LLM';
    level: OverclaimLevel;
    matchedTerms: string[];
    declared: unknown;
    actual: unknown;
    rationale: string;
    suggestedNarrowing: string;
    recommendedExit: OverclaimExit;
    llmCalls: number;
  }): Promise<void> {
    await this.prisma.overclaimFlag.create({
      data: {
        spec_version_id: row.specVersionId,
        card_id: row.cardId,
        detector: row.detector,
        level: row.level,
        matched_terms: json(row.matchedTerms),
        declared_scope: json(row.declared),
        actual_scope: json(row.actual),
        rationale: row.rationale,
        suggested_narrowing: row.suggestedNarrowing,
        recommended_exit: row.recommendedExit,
        llm_calls: row.llmCalls,
      },
    });
  }

  /**
   * `OverclaimFlag` không khai relation Prisma (luật chung 4 không cho thêm field ngược vào
   * `Card` / `SpecVersion`), nên **không có cascade** — phải xoá tay.
   */
  async clearForVersion(specVersionId: string): Promise<void> {
    await this.prisma.overclaimFlag.deleteMany({
      where: { spec_version_id: specVersionId },
    });
  }

  async listForVersion(specVersionId: string): Promise<OverclaimFlagView[]> {
    const flags = await this.prisma.overclaimFlag.findMany({
      where: { spec_version_id: specVersionId },
      orderBy: { created_at: 'asc' },
    });
    if (flags.length === 0) return [];

    const cards = await this.prisma.card.findMany({
      where: { id: { in: flags.map((f) => f.card_id) } },
      select: { id: true, title: true },
    });
    const titleOf = new Map(cards.map((c) => [c.id, c.title]));

    const rank = { CRITICAL: 3, MAJOR: 2, MINOR: 1, NONE: 0 } as const;
    return flags
      .map((f) => ({
        id: f.id,
        card_id: f.card_id,
        card_title: titleOf.get(f.card_id) ?? '',
        detector: f.detector as 'RULE' | 'LLM',
        level: f.level as OverclaimLevel,
        matched_terms: (f.matched_terms as string[]) ?? [],
        rationale: f.rationale,
        suggested_narrowing: f.suggested_narrowing,
        recommended_exit: f.recommended_exit as OverclaimExit,
        chosen_exit: f.chosen_exit,
        llm_calls: f.llm_calls,
      }))
      .sort((a, b) => rank[b.level] - rank[a.level]);
  }

  /**
   * Người dùng chọn một trong ba đường ra của Bước 10. Lựa chọn được ghi thành `Decision` —
   * đúng tiêu chí hoàn thành của #7 — và cờ trỏ ngược về `Decision` đó.
   *
   * `Decision` ghi thẳng bằng Prisma chứ không qua `DecisionService`: đường ra của cờ phóng đại
   * không sinh version mới ngay (`applied = false`), khác hẳn vòng đời của quyết định gate.
   * Việc áp thật sự vào spec là của bước apply, không phải của chỗ này.
   */
  async chooseExit(
    flagId: string,
    chosenExit: OverclaimExit,
    customText?: string,
  ): Promise<{ decision_id: string }> {
    const flag = await this.prisma.overclaimFlag.findUniqueOrThrow({
      where: { id: flagId },
    });
    const version = await this.prisma.specVersion.findUniqueOrThrow({
      where: { id: flag.spec_version_id },
      select: { id: true, project_id: true },
    });

    const decision = await this.prisma.decision.create({
      data: {
        project_id: version.project_id,
        spec_version_id: version.id,
        step: 'S4',
        question: `Khẳng định "${flag.rationale}" — bạn muốn xử lý thế nào?`,
        options: json(OVERCLAIM_OPTIONS),
        chosen_key: chosenExit,
        custom_text: customText ?? null,
        actor: 'USER',
        draft: json({
          overclaim_flag_id: flag.id,
          card_id: flag.card_id,
          suggested_narrowing: flag.suggested_narrowing,
        }),
      },
      select: { id: true },
    });

    await this.prisma.overclaimFlag.update({
      where: { id: flagId },
      data: { chosen_exit: chosenExit, decision_id: decision.id },
    });
    return { decision_id: decision.id };
  }
}
