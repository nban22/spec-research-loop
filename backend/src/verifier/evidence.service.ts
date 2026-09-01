import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import {
  Entailment,
  SupportLabel,
  VerifierFlag,
  verifierFlagSchema,
} from '../contracts/enums';
import { decidingLayer, VerifierLayer } from './layer-trace';
import { DEFAULT_THRESHOLDS, VerifierThresholds } from './thresholds';

/**
 * Mô hình đọc cho trang "vì sao nhãn này" (#5). **Thuần đọc** — không endpoint ghi, không bảng mới.
 *
 * Toàn bộ dữ liệu để giải thích đã nằm sẵn trong DB từ trước: `similarity`, `entailment`,
 * `confidence`, `evidence_sentence`, `flags`, và `VerifierRun.config`. Thứ còn thiếu chỉ là một
 * chỗ ghép chúng lại và **suy ra tầng nào đã quyết định** — `decidingLayer`, hàm thuần có test.
 */

export type EvidencePassageView = {
  rank: number;
  similarity: number;
  char_start: number;
  text: string;
  is_evidence: boolean;
};

export type EvidencePairView = {
  card_source_id: string;
  card: { id: string; title: string; type: string; status: string };
  source: {
    id: string;
    title: string;
    year: number | null;
    doi: string | null;
    url: string | null;
    venue: string | null;
  };
  support_label: SupportLabel;
  similarity: number | null;
  entailment: Entailment | null;
  confidence: number | null;
  evidence_sentence: string | null;
  flags: VerifierFlag[];
  layer: VerifierLayer;
  layer_why: string;
  credibility: { tier: string; reason: string } | null;
  passages: EvidencePassageView[];
};

export type EvidenceTrace = {
  /**
   * Ngưỡng của **lần chạy đó**, đọc từ `VerifierRun.config` chứ không phải hằng số hiện tại.
   * Đây là điều kiện tường minh của #5, và là cả lý do NFR-VER-4 bắt chép ngưỡng vào mỗi lần chạy.
   */
  thresholds: VerifierThresholds;
  /** `null` khi version chưa từng chạy verifier. */
  run: {
    id: string;
    created_at: Date;
    units_total: number;
    units_l4: number;
  } | null;
  summary: Record<SupportLabel, number>;
  pairs: EvidencePairView[];
};

function parseFlags(raw: unknown): VerifierFlag[] {
  if (!Array.isArray(raw)) return [];
  // `safeParse` từng phần tử: cột là `Json?` nên không gì bảo đảm nó chứa cờ hợp lệ, và một
  // giá trị lạ không được phép làm hỏng cả trang (backend/CLAUDE.md §3).
  return raw.flatMap((x) => {
    const parsed = verifierFlagSchema.safeParse(x);
    return parsed.success ? [parsed.data] : [];
  });
}

@Injectable()
export class EvidenceService {
  constructor(private readonly prisma: PrismaService) {}

  async trace(specVersionId: string): Promise<EvidenceTrace> {
    const run = await this.prisma.verifierRun.findFirst({
      where: { spec_version_id: specVersionId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        created_at: true,
        config: true,
        units_total: true,
        units_l4: true,
      },
    });

    const thresholds: VerifierThresholds = {
      ...DEFAULT_THRESHOLDS,
      ...((run?.config as Partial<VerifierThresholds> | null) ?? {}),
    };

    const rows = await this.prisma.cardSource.findMany({
      where: { card: { spec_version_id: specVersionId } },
      include: {
        card: { select: { id: true, title: true, type: true, status: true } },
        source: {
          select: {
            id: true,
            title: true,
            year: true,
            doi: true,
            url: true,
            venue: true,
          },
        },
      },
      orderBy: { id: 'asc' },
    });

    const passages = await this.prisma.verifierPassage.findMany({
      where: { card_source_id: { in: rows.map((r) => r.id) } },
      orderBy: { rank: 'asc' },
    });
    const passagesOf = new Map<string, EvidencePassageView[]>();
    for (const p of passages) {
      const list = passagesOf.get(p.card_source_id) ?? [];
      list.push({
        rank: p.rank,
        similarity: p.similarity,
        char_start: p.char_start,
        text: p.text,
        is_evidence: p.is_evidence,
      });
      passagesOf.set(p.card_source_id, list);
    }

    // `SourceScore` không có relation tới `Source` (luật chung 4) ⇒ lọc bằng `in`.
    const scores = await this.prisma.sourceScore.findMany({
      where: { source_id: { in: rows.map((r) => r.source_id) } },
      select: { source_id: true, tier: true, reason: true },
    });
    const scoreOf = new Map(scores.map((s) => [s.source_id, s]));

    const summary: Record<SupportLabel, number> = {
      SUPPORTED: 0,
      WEAK: 0,
      UNSUPPORTED: 0,
    };

    const pairs = rows.map((r) => {
      summary[r.support_label] += 1;
      const flags = parseFlags(r.flags);
      const own = passagesOf.get(r.id) ?? [];
      const trace = decidingLayer(
        {
          similarity: r.similarity,
          entailment: r.entailment,
          flags,
          hasPassages: own.length > 0,
        },
        thresholds,
      );
      const score = scoreOf.get(r.source_id);
      return {
        card_source_id: r.id,
        card: r.card,
        source: r.source,
        support_label: r.support_label,
        similarity: r.similarity,
        entailment: r.entailment,
        confidence: r.confidence,
        evidence_sentence: r.evidence_sentence,
        flags,
        layer: trace.layer,
        layer_why: trace.why,
        credibility: score ? { tier: score.tier, reason: score.reason } : null,
        passages: own,
      };
    });

    return {
      thresholds,
      run: run
        ? {
            id: run.id,
            created_at: run.created_at,
            units_total: run.units_total,
            units_l4: run.units_l4,
          }
        : null,
      summary,
      pairs,
    };
  }
}
