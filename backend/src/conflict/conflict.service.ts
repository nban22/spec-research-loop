import { Injectable, Logger } from '@nestjs/common';
import { json } from '../common/prisma-json';
import { PrismaService } from '../common/prisma.service';
import { entailmentOutputSchema } from '../contracts/llm-io/judge';
import { cardStatusSchema, Entailment, SupportLabel } from '../contracts/enums';
import { LlmService } from '../llm/llm.service';
import { DEFAULT_THRESHOLDS } from '../verifier/thresholds';
import { MAX_LLM_PAIRS_PER_RUN, MAX_PAIRS_PER_CARD } from './conflict-lexicon';
import {
  ConflictFinding,
  ConflictSide,
  detectCrossCardConflict,
  detectSourceConflict,
  textOf,
  topConflict,
  topicOverlap,
} from './conflict-rules';

/**
 * A3 · phát hiện nguồn mâu thuẫn nhau (#3).
 *
 * §5 của đề liệt "Phát hiện ambiguity và conflict" là **chức năng bắt buộc**. `CardStatus.CONFLICT`
 * có trong enum, có màu ở `status-style.ts`, cột `Card.conflict_with_card_id` có trong schema —
 * nhưng trước issue này **không dòng backend nào gán chúng**. Service này là chỗ gán.
 *
 * Hai phạm vi, cả hai đều bắt đầu bằng tầng luật 0 token:
 *
 * - `INTRA_CARD` — hai nguồn của **cùng một thẻ** nói ngược nhau.
 * - `CROSS_CARD` — **cùng một bài báo** được thẻ A dùng làm chứng cứ ủng hộ và thẻ B làm chứng cứ
 *   phản bác. Đây là chỗ duy nhất `conflict_with_card_id` có giá trị đúng nghĩa.
 */

export type ConflictScanResult = {
  /** `false` khi `Project.conflict_detector` tắt — đã dọn dấu vết, không quét gì thêm. */
  enabled: boolean;
  pairsCompared: number;
  intraCard: number;
  crossCard: number;
  /** Số cặp vùng xám thực sự hỏi LLM. `0` là con số bình thường. */
  llmCalls: number;
};

export type ConflictView = {
  id: string;
  card_id: string;
  card_title: string;
  scope: string;
  signal: string;
  other_card_id: string | null;
  other_card_title: string | null;
  card_source_a_id: string;
  card_source_b_id: string;
  source_a_title: string;
  source_b_title: string;
  evidence_a: string;
  evidence_b: string;
  terms: string[];
  reason: string;
  chosen_exit: string | null;
};

type UnitRow = {
  id: string;
  card_id: string;
  source_id: string;
  support_label: SupportLabel;
  entailment: Entailment | null;
  evidence_sentence: string | null;
  card: { id: string; title: string; status: string };
  source: { id: string; title: string; abstract: string | null };
};

type PendingConflict = {
  scope: 'INTRA_CARD' | 'CROSS_CARD';
  cardId: string;
  otherCardId: string | null;
  a: ConflictSide;
  b: ConflictSide;
  finding: ConflictFinding;
  llmCalls: number;
};

@Injectable()
export class ConflictService {
  private readonly logger = new Logger(ConflictService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  /**
   * Xoá cờ cũ và **khôi phục `Card.status` về giá trị trước đó**.
   *
   * Phải chạy **trước** `propagateCardStatus` của verifier. Không có bước này thì một thẻ đã hết
   * mâu thuẫn sẽ kẹt `CONFLICT` vĩnh viễn, và lần quét sau đọc `CONFLICT` như "trạng thái trước"
   * khiến trạng thái thật mất hẳn — đúng con bug mà `CritiqueService` đã ghi lại cho `AMBIGUOUS`.
   */
  async clearForVersion(specVersionId: string): Promise<void> {
    const rows = await this.prisma.cardConflict.findMany({
      where: { spec_version_id: specVersionId },
      select: { card_id: true, previous_status: true },
    });
    if (rows.length === 0) return;

    const byStatus = new Map<string, string[]>();
    for (const r of rows) {
      const list = byStatus.get(r.previous_status) ?? [];
      list.push(r.card_id);
      byStatus.set(r.previous_status, list);
    }

    await this.prisma.$transaction(async (tx) => {
      for (const [status, cardIds] of byStatus) {
        // `safeParse` chứ không `as`: `previous_status` là cột `String` trần, không gì bảo đảm
        // nó là `CardStatus` hợp lệ, mà đích đến là cột enum (backend/CLAUDE.md §3).
        const parsed = cardStatusSchema.safeParse(status);
        if (!parsed.success) {
          this.logger.warn(`Bỏ qua previous_status lạ: ${status}`);
          continue;
        }
        await tx.card.updateMany({
          where: { id: { in: cardIds }, status: 'CONFLICT' },
          data: { status: parsed.data, conflict_with_card_id: null },
        });
      }
      await tx.cardConflict.deleteMany({
        where: { spec_version_id: specVersionId },
      });
    });
  }

  async scanVersion(
    specVersionId: string,
    projectId: string,
  ): Promise<ConflictScanResult> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { conflict_detector: true },
    });

    // Tắt cờ thì **dọn dấu vết của lần bật trước** rồi mới return. Ablation là gạt cờ qua lại
    // trên cùng một dữ liệu; return sớm mà không dọn thì nhánh đối chứng bị nhiễm.
    await this.clearForVersion(specVersionId);
    if (!project?.conflict_detector) {
      return {
        enabled: false,
        pairsCompared: 0,
        intraCard: 0,
        crossCard: 0,
        llmCalls: 0,
      };
    }

    const units = await this.loadUnits(specVersionId);
    const sides = units.map((u) => this.toSide(u));
    const sideById = new Map(sides.map((s) => [s.cardSourceId, s]));

    const { pending, greyZone, pairsCompared } = this.ruleTier(sides);
    const llmConfirmed = await this.llmTier(greyZone, projectId, specVersionId);
    pending.push(...llmConfirmed);

    await this.persist(specVersionId, pending, units, sideById);

    return {
      enabled: true,
      pairsCompared,
      intraCard: pending.filter((p) => p.scope === 'INTRA_CARD').length,
      crossCard: pending.filter((p) => p.scope === 'CROSS_CARD').length,
      llmCalls: pending.reduce((n, p) => n + p.llmCalls, 0),
    };
  }

  private async loadUnits(specVersionId: string): Promise<UnitRow[]> {
    const rows = await this.prisma.cardSource.findMany({
      where: { card: { spec_version_id: specVersionId } },
      select: {
        id: true,
        card_id: true,
        source_id: true,
        support_label: true,
        entailment: true,
        evidence_sentence: true,
        card: { select: { id: true, title: true, status: true } },
        source: { select: { id: true, title: true, abstract: true } },
      },
      orderBy: { id: 'asc' },
    });
    return rows as UnitRow[];
  }

  private toSide(u: UnitRow): ConflictSide {
    return {
      cardId: u.card_id,
      cardSourceId: u.id,
      sourceId: u.source_id,
      supportLabel: u.support_label,
      entailment: u.entailment,
      evidenceSentence: u.evidence_sentence,
      fallbackText: u.source.abstract ?? '',
    };
  }

  /**
   * Tầng luật — **0 token**. Trả về hai nhóm: kết luận chắc chắn, và ứng viên cho tầng LLM.
   */
  private ruleTier(sides: ConflictSide[]): {
    pending: PendingConflict[];
    greyZone: PendingConflict[];
    pairsCompared: number;
  } {
    const pending: PendingConflict[] = [];
    const greyZone: PendingConflict[] = [];
    let pairsCompared = 0;

    // ── INTRA_CARD ────────────────────────────────────────────────────────
    const byCard = new Map<string, ConflictSide[]>();
    for (const s of sides) {
      const list = byCard.get(s.cardId) ?? [];
      list.push(s);
      byCard.set(s.cardId, list);
    }

    for (const [cardId, group] of byCard) {
      if (group.length < 2) continue;
      let pairsForCard = 0;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          if (pairsForCard >= MAX_PAIRS_PER_CARD) break;
          pairsForCard += 1;
          pairsCompared += 1;
          const top = topConflict(detectSourceConflict(group[i], group[j]));
          if (!top) continue;
          const item: PendingConflict = {
            scope: 'INTRA_CARD',
            cardId,
            otherCardId: null,
            a: group[i],
            b: group[j],
            finding: top,
            llmCalls: 0,
          };
          if (top.decisive) pending.push(item);
          else greyZone.push(item);
        }
      }
    }

    // ── CROSS_CARD ────────────────────────────────────────────────────────
    const bySource = new Map<string, ConflictSide[]>();
    for (const s of sides) {
      const list = bySource.get(s.sourceId) ?? [];
      list.push(s);
      bySource.set(s.sourceId, list);
    }

    for (const group of bySource.values()) {
      if (group.length < 2) continue;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const finding = detectCrossCardConflict(group[i], group[j]);
          if (!finding) continue;
          pairsCompared += 1;
          // Thẻ đối diện chọn theo `id` nhỏ hơn ⇒ hai lần quét cho cùng một kết quả.
          const [low, high] =
            group[i].cardId < group[j].cardId
              ? [group[i], group[j]]
              : [group[j], group[i]];
          pending.push({
            scope: 'CROSS_CARD',
            cardId: low.cardId,
            otherCardId: high.cardId,
            a: low,
            b: high,
            finding,
            llmCalls: 0,
          });
        }
      }
    }

    return { pending, greyZone, pairsCompared };
  }

  /**
   * Tầng LLM — chỉ chạy trên **vùng xám**, tối đa `MAX_LLM_PAIRS_PER_RUN` cặp mỗi lần chạy.
   *
   * Dùng lại `entailmentOutputSchema` (không viết schema mới) nhưng **prompt riêng**
   * `conflict_pair`: `LlmCall.prompt_id` là cột duy nhất phân biệt các lời gọi, dùng chung prompt
   * với L4 thì token của bộ này lẫn vào token entailment trong bảng chi phí — mà đo token có
   * kiểm chứng là cả luận điểm của đồ án.
   */
  private async llmTier(
    greyZone: PendingConflict[],
    projectId: string,
    specVersionId: string,
  ): Promise<PendingConflict[]> {
    if (greyZone.length === 0) return [];

    const ranked = [...greyZone]
      .sort((x, y) => topicOverlap(y.a, y.b) - topicOverlap(x.a, x.b))
      .slice(0, MAX_LLM_PAIRS_PER_RUN);

    if (greyZone.length > ranked.length) {
      this.logger.log(
        `Vùng xám ${greyZone.length} cặp, chỉ hỏi ${ranked.length} theo trần chi phí.`,
      );
    }

    const confirmed: PendingConflict[] = [];
    for (const item of ranked) {
      try {
        const out = await this.llm.completeJson({
          promptId: 'conflict_pair',
          schema: entailmentOutputSchema,
          model: 'deepseek-v4-flash',
          purpose: 'ENTAILMENT',
          reasoningEffort: 'low',
          maxTokens: 900,
          variables: {
            statement_a: item.finding.textA,
            statement_b: item.finding.textB,
            claim_text: item.finding.reason,
          },
          link: { projectId, specVersionId },
        });
        const isConflict =
          out.data.verdict === 'CONTRADICTS' &&
          out.data.confidence >= DEFAULT_THRESHOLDS.conf_min;
        if (!isConflict) continue;
        confirmed.push({
          ...item,
          llmCalls: 1,
          finding: {
            ...item.finding,
            kind: item.finding.kind,
            decisive: true,
            reason: out.data.reason || item.finding.reason,
          },
        });
      } catch (err) {
        // Fail-closed đúng tinh thần verifier: không kiểm được thì **không** khẳng định có mâu
        // thuẫn. Bỏ qua cặp này, ghi log, không gán cờ.
        this.logger.warn(
          `Không hỏi được LLM cho một cặp vùng xám: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return confirmed;
  }

  private async persist(
    specVersionId: string,
    pending: PendingConflict[],
    units: UnitRow[],
    sideById: Map<string, ConflictSide>,
  ): Promise<void> {
    if (pending.length === 0) return;

    const cardOf = new Map(units.map((u) => [u.card_id, u.card]));

    await this.prisma.$transaction(async (tx) => {
      for (const p of pending) {
        const previous = cardOf.get(p.cardId)?.status ?? 'PROPOSED';
        await tx.cardConflict.create({
          data: {
            spec_version_id: specVersionId,
            card_id: p.cardId,
            scope: p.scope,
            other_card_id: p.otherCardId,
            card_source_a_id: p.a.cardSourceId,
            card_source_b_id: p.b.cardSourceId,
            source_a_id: p.a.sourceId,
            source_b_id: p.b.sourceId,
            signal: p.llmCalls > 0 ? 'LLM' : p.finding.kind,
            evidence_a: textOf(sideById.get(p.a.cardSourceId) ?? p.a),
            evidence_b: textOf(sideById.get(p.b.cardSourceId) ?? p.b),
            terms: json(p.finding.terms),
            reason: p.finding.reason,
            // `CONFLICT` đã gán rồi thì trạng thái "trước" là của lần gán đầu, không phải CONFLICT.
            previous_status: previous === 'CONFLICT' ? 'PROPOSED' : previous,
            llm_calls: p.llmCalls,
          },
        });

        const ids =
          p.scope === 'CROSS_CARD' && p.otherCardId
            ? [p.cardId, p.otherCardId]
            : [p.cardId];
        for (const id of ids) {
          await tx.card.update({
            where: { id },
            data: {
              status: 'CONFLICT',
              conflict_with_card_id:
                p.scope === 'CROSS_CARD'
                  ? (ids.find((x) => x !== id) ?? null)
                  : null,
            },
          });
        }
        // Ghi đè bản đồ để cặp sau của cùng thẻ không đọc `CONFLICT` làm `previous_status`.
        const card = cardOf.get(p.cardId);
        if (card) card.status = 'CONFLICT';
      }
    });
  }

  async listForVersion(specVersionId: string): Promise<ConflictView[]> {
    const rows = await this.prisma.cardConflict.findMany({
      where: { spec_version_id: specVersionId },
      orderBy: { created_at: 'asc' },
    });
    if (rows.length === 0) return [];

    const cardIds = [
      ...new Set(
        rows.flatMap((r) => [r.card_id, r.other_card_id].filter(Boolean)),
      ),
    ] as string[];
    const sourceIds = [
      ...new Set(rows.flatMap((r) => [r.source_a_id, r.source_b_id])),
    ];

    const cards = await this.prisma.card.findMany({
      where: { id: { in: cardIds } },
      select: { id: true, title: true },
    });
    const sources = await this.prisma.source.findMany({
      where: { id: { in: sourceIds } },
      select: { id: true, title: true },
    });
    const cardTitle = new Map(cards.map((c) => [c.id, c.title]));
    const sourceTitle = new Map(sources.map((s) => [s.id, s.title]));

    return rows.map((r) => ({
      id: r.id,
      card_id: r.card_id,
      card_title: cardTitle.get(r.card_id) ?? '',
      scope: r.scope,
      signal: r.signal,
      other_card_id: r.other_card_id,
      other_card_title: r.other_card_id
        ? (cardTitle.get(r.other_card_id) ?? null)
        : null,
      card_source_a_id: r.card_source_a_id,
      card_source_b_id: r.card_source_b_id,
      source_a_title: sourceTitle.get(r.source_a_id) ?? '',
      source_b_title: sourceTitle.get(r.source_b_id) ?? '',
      evidence_a: r.evidence_a,
      evidence_b: r.evidence_b,
      terms: Array.isArray(r.terms) ? (r.terms as string[]) : [],
      reason: r.reason,
      chosen_exit: r.chosen_exit,
    }));
  }

  /** Dùng cho metric `conflict_detected` của #6. */
  async countForVersion(specVersionId: string): Promise<number> {
    return this.prisma.cardConflict.count({
      where: { spec_version_id: specVersionId },
    });
  }

  /** Người dùng đã xử xong một xung đột — ghi đường ra và `Decision` đã sinh ra nó. */
  async markResolved(
    conflictId: string,
    chosenExit: string,
    decisionId: string | null,
  ): Promise<void> {
    await this.prisma.cardConflict.update({
      where: { id: conflictId },
      data: { chosen_exit: chosenExit, decision_id: decisionId },
    });
  }
}
