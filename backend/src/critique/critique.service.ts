import { Injectable, Logger } from '@nestjs/common';
import { json } from '../common/prisma-json';
import { PrismaService } from '../common/prisma.service';
import { cardStatusSchema } from '../contracts/enums';
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
      // Tắt cờ thì phải **dọn dấu vết của lần bật trước**, không chỉ return.
      //
      // #22 nói cờ này chính là cần gạt để chạy ablation ở #13. Ablation là gạt qua gạt lại
      // trên **cùng một dữ liệu**; return sớm mà không dọn thì thẻ vẫn `AMBIGUOUS` và câu hỏi
      // vẫn chiếm hạn mức, nên nhánh đối chứng bị nhiễm bởi nhánh trước và số đo vô nghĩa.
      // Đo tay ngày 2026-08-30 thấy đúng như vậy: tắt cờ xong vẫn còn 5 thẻ và 5 cờ.
      await this.clearForVersion(specVersionId);
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
      /** Cờ nặng nhất của thẻ — **chỉ** cờ này được gắn câu hỏi làm rõ. */
      isTop: boolean;
    }[] = [];
    let skippedMissing = 0;

    for (const card of cards) {
      if (card.status === 'MISSING') {
        skippedMissing += 1;
        continue;
      }
      const findings = detectAmbiguity(card);
      if (findings.length === 0) continue;

      // Một thẻ **một** câu hỏi, lấy cờ nặng nhất — hỏi hai câu về cùng một thẻ là làm phiền.
      const top = topFinding(findings);
      for (const f of findings) {
        flagRows.push({
          cardId: card.id,
          previousStatus: card.status,
          finding: f,
          isTop: f === top,
        });
      }
      if (top) candidates.push(buildQuestion(card.id, card.title, top));
    }

    // ── hạn mức câu hỏi ────────────────────────────────────────────────────
    // #12: "câu hỏi sinh ra từ đây không làm tổng số câu hỏi tăng so với hiện tại".
    // Câu hỏi làm rõ = `Decision` chưa trả lời (`chosen_key = ''`), đúng như `analyze` đang làm.
    const openNow = await this.prisma.decision.count({
      // Phải lọc `step: 'S1'` — trần 4 câu lấy từ `analyzeOutputSchema.clarifying_questions`,
      // vốn là hạn mức **của riêng S1**. Đếm cả mọi step thì một `Decision` S2 còn treo
      // (`gap()` luôn để lại đúng một câu "chọn hướng nghiên cứu") sẽ ăn mất một slot của S1.
      where: { project_id: version.project_id, step: 'S1', chosen_key: '' },
    });
    const budget = Math.max(0, MAX_OPEN_QUESTIONS - openNow);
    const selected = ranker(candidates, budget);
    const dropped = candidates.length - selected.length;

    // ── ghi ────────────────────────────────────────────────────────────────
    /**
     * Ba lệnh ghi phải **nguyên tử**.
     *
     * Chết giữa bước tạo `Decision` và bước tạo `AmbiguityFlag` thì còn lại những câu hỏi
     * **không cờ nào trỏ tới**. `clearForVersion` chỉ xoá được decision với tới qua
     * `question_decision_id`, nên chúng nằm mãi ở `chosen_key = ''` và vẫn bị đếm vào `openNow`.
     * Hạn mức chỉ có 4 ⇒ vài câu mồ côi là B6 **câm vĩnh viễn** với project đó, không lỗi,
     * không log. Các thứ tự khác đều tự lành, riêng chỗ này thì không.
     */
    const flaggedCards = new Set(flagRows.map((r) => r.cardId));
    await this.prisma.$transaction(async (tx) => {
      const questionByCard = new Map<string, string>();
      for (const q of selected) {
        const decision = await tx.decision.create({
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

      await tx.ambiguityFlag.createMany({
        data: flagRows.map((row) => ({
          spec_version_id: specVersionId,
          card_id: row.cardId,
          kind: row.finding.kind,
          field: row.finding.field,
          excerpt: row.finding.excerpt,
          terms: json(row.finding.terms),
          reason: row.finding.reason,
          previous_status: row.previousStatus,
          // Chỉ cờ **nặng nhất** của thẻ mới trỏ về câu hỏi. Gắn cho mọi cờ thì cờ `metric`
          // lại trỏ vào một câu hỏi chỉ nói về `baseline` — sai với chính mô tả cột trong
          // `schema.prisma` ("Decision chứa câu hỏi làm rõ sinh từ cờ này").
          question_decision_id: row.isTop
            ? (questionByCard.get(row.cardId) ?? null)
            : null,
        })),
      });

      if (flaggedCards.size > 0) {
        await tx.card.updateMany({
          where: { id: { in: [...flaggedCards] } },
          data: { status: 'AMBIGUOUS' },
        });
      }
    });

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

    // Gom theo trạng thái cũ rồi `updateMany` mỗi nhóm một lần, thay vì N lượt `update`.
    // `CardStatus` chỉ có 6 giá trị nên nhiều nhất 6 truy vấn, không phụ thuộc số thẻ.
    const byStatus = new Map<string, string[]>();
    for (const f of flags) {
      const list = byStatus.get(f.previous_status) ?? [];
      list.push(f.card_id);
      byStatus.set(f.previous_status, list);
    }

    const decisionIds = flags
      .map((f) => f.question_decision_id)
      .filter((id): id is string => id !== null);

    // Nguyên tử: khôi phục dở dang thì một số thẻ về trạng thái cũ, một số kẹt `AMBIGUOUS`,
    // mà cờ giữ `previous_status` thì có thể đã bị xoá — không còn đường lần lại.
    await this.prisma.$transaction(async (tx) => {
      for (const [status, cardIds] of byStatus) {
        // `safeParse` chứ không `as`: `previous_status` là cột `String` trần nên không gì
        // bảo đảm nó là một `CardStatus` hợp lệ, mà đích đến lại là cột enum
        // (backend/CLAUDE.md §3). Giá trị lạ ⇒ bỏ qua nhóm đó, không làm hỏng cả transaction.
        const parsed = cardStatusSchema.safeParse(status);
        if (!parsed.success) {
          this.logger.warn(
            `previous_status không hợp lệ (${status}) trên ${cardIds.length} thẻ — bỏ qua khôi phục.`,
          );
          continue;
        }
        await tx.card.updateMany({
          // Chỉ khôi phục thẻ **đang** `AMBIGUOUS`. Thiếu điều kiện này thì sửa tay của người
          // dùng bị ghi đè: quét → thẻ thành `AMBIGUOUS` → người dùng `PATCH` đặt `CONFIRMED`
          // → quét lại hoặc chỉ cần tắt cờ là thẻ bị ép về `previous_status` cũ, mất quyết
          // định của người dùng mà không báo gì.
          where: { id: { in: cardIds }, status: 'AMBIGUOUS' },
          data: { status: parsed.data },
        });
      }

      if (decisionIds.length > 0) {
        await tx.decision.deleteMany({
          where: { id: { in: decisionIds }, chosen_key: '' },
        });
      }

      await tx.ambiguityFlag.deleteMany({
        where: { spec_version_id: specVersionId },
      });
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

    // Bỏ **cờ ma**: `analyze` / `gaps` / `contributions` chạy lại sẽ `deleteMany` rồi tạo lại
    // thẻ với uuid mới, mà `card_id` là scalar trần không FK nên cờ cũ vẫn còn và trỏ vào hư
    // không. Trả chúng ra thì giao diện hiện cờ với `card_title` rỗng. Lượt quét sau tự dọn.
    return flags
      .filter((f) => titleOf.has(f.card_id))
      .map((f) => ({
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
