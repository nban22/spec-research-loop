import { Injectable, Logger } from '@nestjs/common';
import { json } from '../common/prisma-json';
import { PrismaService } from '../common/prisma.service';
import type { CardStatus } from '../generated/prisma/enums';
import {
  detectAmbiguity,
  topFinding,
  type AmbiguityFinding,
} from './ambiguity';
import {
  MAX_OPEN_QUESTIONS,
  buildQuestion,
  severityRanker,
  type AmbiguityQuestion,
  type QuestionRanker,
} from './clarify-questions';

export type AmbiguityFlagView = {
  id: string;
  card_id: string;
  card_title: string;
  kind: string;
  field: string | null;
  excerpt: string;
  terms: string[];
  reason: string;
  question_decision_id: string | null;
};

export type CritiqueScanResult = {
  /** `false` khi `Project.ambiguity_detector` tắt — không quét, không đổi gì. */
  enabled: boolean;
  scanned: number;
  /** Số thẻ bị gán `AMBIGUOUS`. */
  flagged: number;
  /** Số thẻ bỏ qua vì đang `MISSING` — đã có cờ nặng hơn. */
  skippedMissing: number;
  /** Số câu hỏi làm rõ thực sự tạo ra sau khi cắt cho vừa hạn mức. */
  questionsAsked: number;
  /** Số ứng viên bị cắt vì hết chỗ. Có số này thì #10 mới biết mình cải thiện được bao nhiêu. */
  questionsDropped: number;
};

/**
 * B6 · bắt thẻ mơ hồ (#12).
 *
 * §5 của đề liệt "Phát hiện ambiguity và conflict" là **chức năng bắt buộc**. `AMBIGUOUS` có
 * trong enum, có màu ở `status-style.ts`, có trong `NEEDS_ATTENTION` của `spec-cards.tsx` —
 * nhưng trước issue này **không dòng backend nào gán nó**. Service này là chỗ gán.
 *
 * Toàn bộ phát hiện là **0 token**; không có lời gọi LLM nào trong file này.
 */
@Injectable()
export class CritiqueService {
  private readonly logger = new Logger(CritiqueService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Quét toàn bộ thẻ của một version.
   *
   * **Idempotent**: xoá cờ cũ và **khôi phục `Card.status` về giá trị trước đó** rồi mới quét
   * lại. Thiếu bước khôi phục thì lần quét thứ hai đọc được `AMBIGUOUS` như "trạng thái trước",
   * và trạng thái thật (`PROPOSED` / `CONFIRMED`) mất vĩnh viễn.
   */
  async scanVersion(
    specVersionId: string,
    ranker: QuestionRanker = severityRanker,
  ): Promise<CritiqueScanResult> {
    const version = await this.prisma.specVersion.findUniqueOrThrow({
      where: { id: specVersionId },
      include: { project: true },
    });

    if (!version.project.ambiguity_detector) {
      return {
        enabled: false,
        scanned: 0,
        flagged: 0,
        skippedMissing: 0,
        questionsAsked: 0,
        questionsDropped: 0,
      };
    }

    await this.clearForVersion(specVersionId);

    const cards = await this.prisma.card.findMany({
      where: { spec_version_id: specVersionId },
      orderBy: { order_index: 'asc' },
      select: {
        id: true,
        type: true,
        status: true,
        title: true,
        body: true,
        payload: true,
      },
    });

    const candidates: AmbiguityQuestion[] = [];
    const flagRows: {
      cardId: string;
      previousStatus: string;
      finding: AmbiguityFinding;
    }[] = [];
    let skippedMissing = 0;

    for (const card of cards) {
      if (card.status === 'MISSING') {
        skippedMissing += 1;
        continue;
      }
      const findings = detectAmbiguity(card);
      if (findings.length === 0) continue;

      for (const f of findings) {
        flagRows.push({
          cardId: card.id,
          previousStatus: card.status,
          finding: f,
        });
      }
      // Một thẻ **một** câu hỏi, lấy cờ nặng nhất — hỏi hai câu về cùng một thẻ là làm phiền.
      const top = topFinding(findings);
      if (top) candidates.push(buildQuestion(card.id, card.title, top));
    }

    // ── hạn mức câu hỏi ────────────────────────────────────────────────────
    // #12: "câu hỏi sinh ra từ đây không làm tổng số câu hỏi tăng so với hiện tại".
    // Câu hỏi làm rõ = `Decision` chưa trả lời (`chosen_key = ''`), đúng như `analyze` đang làm.
    const openNow = await this.prisma.decision.count({
      where: { project_id: version.project_id, chosen_key: '' },
    });
    const budget = Math.max(0, MAX_OPEN_QUESTIONS - openNow);
    const selected = ranker(candidates, budget);
    const dropped = candidates.length - selected.length;

    // ── ghi ────────────────────────────────────────────────────────────────
    const questionByCard = new Map<string, string>();
    for (const q of selected) {
      const decision = await this.prisma.decision.create({
        data: {
          project_id: version.project_id,
          spec_version_id: specVersionId,
          step: 'S1',
          question: q.question,
          options: json(q.options),
          chosen_key: '',
          actor: 'USER',
        },
        select: { id: true },
      });
      questionByCard.set(q.cardId, decision.id);
    }

    const flaggedCards = new Set<string>();
    for (const row of flagRows) {
      await this.prisma.ambiguityFlag.create({
        data: {
          spec_version_id: specVersionId,
          card_id: row.cardId,
          kind: row.finding.kind,
          field: row.finding.field,
          excerpt: row.finding.excerpt,
          terms: json(row.finding.terms),
          reason: row.finding.reason,
          previous_status: row.previousStatus,
          question_decision_id: questionByCard.get(row.cardId) ?? null,
        },
      });
      flaggedCards.add(row.cardId);
    }

    if (flaggedCards.size > 0) {
      await this.prisma.card.updateMany({
        where: { id: { in: [...flaggedCards] } },
        data: { status: 'AMBIGUOUS' },
      });
    }

    this.logger.log(
      `ambiguity scan ${specVersionId}: ${flaggedCards.size}/${cards.length} thẻ mơ hồ, ` +
        `hỏi ${selected.length}/${candidates.length} câu (còn ${budget} chỗ trống)`,
    );

    return {
      enabled: true,
      scanned: cards.length,
      flagged: flaggedCards.size,
      skippedMissing,
      questionsAsked: selected.length,
      questionsDropped: dropped,
    };
  }

  /**
   * Xoá cờ và **trả `Card.status` về giá trị cũ**. Câu hỏi làm rõ do lần quét trước sinh ra mà
   * người dùng **chưa trả lời** cũng bị xoá — giữ lại là để hạn mức bị chiếm bởi câu hỏi của
   * một lần quét đã lỗi thời.
   */
  async clearForVersion(specVersionId: string): Promise<void> {
    const flags = await this.prisma.ambiguityFlag.findMany({
      where: { spec_version_id: specVersionId },
      select: {
        card_id: true,
        previous_status: true,
        question_decision_id: true,
      },
    });
    if (flags.length === 0) return;

    for (const f of flags) {
      await this.prisma.card.update({
        where: { id: f.card_id },
        data: { status: f.previous_status as CardStatus },
      });
    }

    const decisionIds = flags
      .map((f) => f.question_decision_id)
      .filter((id): id is string => id !== null);
    if (decisionIds.length > 0) {
      await this.prisma.decision.deleteMany({
        where: { id: { in: decisionIds }, chosen_key: '' },
      });
    }

    await this.prisma.ambiguityFlag.deleteMany({
      where: { spec_version_id: specVersionId },
    });
  }

  async listForVersion(specVersionId: string): Promise<AmbiguityFlagView[]> {
    const flags = await this.prisma.ambiguityFlag.findMany({
      where: { spec_version_id: specVersionId },
      orderBy: { created_at: 'asc' },
    });
    if (flags.length === 0) return [];

    const cards = await this.prisma.card.findMany({
      where: { id: { in: flags.map((f) => f.card_id) } },
      select: { id: true, title: true },
    });
    const titleOf = new Map(cards.map((c) => [c.id, c.title]));

    return flags.map((f) => ({
      id: f.id,
      card_id: f.card_id,
      card_title: titleOf.get(f.card_id) ?? '',
      kind: f.kind,
      field: f.field,
      excerpt: f.excerpt,
      terms: (f.terms as string[]) ?? [],
      reason: f.reason,
      question_decision_id: f.question_decision_id,
    }));
  }
}
