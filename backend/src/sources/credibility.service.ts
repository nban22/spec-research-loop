import { Injectable, Logger } from '@nestjs/common';
import { GATED_CARD_TYPES } from '../contracts/card';
import { PrismaService } from '../common/prisma.service';
import { CredibilityTier, scoreSource } from './credibility';

/**
 * Ghi và đọc điểm tin cậy của nguồn (#1).
 *
 * Chấm điểm là `scoreSource` — hàm thuần, 0 token, 0 mạng. Service này chỉ lo phần I/O: đọc
 * `Source`, ghi `SourceScore`, và trả lời hai câu hỏi của giao diện bước 2.
 */

export type ScoredSource = {
  source_id: string;
  tier: CredibilityTier;
  reason: string;
  /** Chỉ để **sắp xếp** ở client. Giao diện không được hiện con số này (tiêu chí #1). */
  total: number;
};

export type LowCredibilityCard = {
  card_id: string;
  title: string;
  type: string;
  source_count: number;
};

export type CredibilityOverview = {
  enabled: boolean;
  sources: ScoredSource[];
  low_credibility_cards: LowCredibilityCard[];
};

const REVIEW: CredibilityTier = 'REVIEW';

@Injectable()
export class CredibilityService {
  private readonly logger = new Logger(CredibilityService.name);

  constructor(private readonly prisma: PrismaService) {}

  async isEnabled(projectId: string): Promise<boolean> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { source_credibility: true },
    });
    return project?.source_credibility ?? false;
  }

  /**
   * Chấm lại **toàn bộ** nguồn của project.
   *
   * Chấm lại tất cả chứ không chỉ nguồn mới: `doi_verified` được verifier ghi ngược lại vào
   * `Source` ở tầng L0 **sau** khi tìm nguồn, nên điểm của một nguồn cũ vẫn đổi được. Chấm lại
   * cả bảng là 0 token và vài mili giây, rẻ hơn nhiều so với việc suy luận xem cái nào đã cũ.
   */
  async rescoreProject(
    projectId: string,
    now: Date = new Date(),
  ): Promise<number> {
    const sources = await this.prisma.source.findMany({
      where: { project_id: projectId },
      select: {
        id: true,
        citation_count: true,
        year: true,
        doi_verified: true,
        abstract: true,
        venue: true,
        retrieved_from: true,
      },
    });

    for (const s of sources) {
      const result = scoreSource(
        {
          citation_count: s.citation_count,
          year: s.year,
          doi_verified: s.doi_verified,
          abstract: s.abstract,
          venue: s.venue,
          retrieved_from: s.retrieved_from,
        },
        now,
      );
      const data = {
        total: result.total,
        tier: result.tier,
        reason: result.reason,
        components: result.components,
        scored_at: now,
      };
      await this.prisma.sourceScore.upsert({
        where: { source_id: s.id },
        create: { source_id: s.id, ...data },
        update: data,
      });
    }
    return sources.length;
  }

  /**
   * Điểm của từng nguồn, cộng danh sách thẻ **chỉ** được chống lưng bởi nguồn mức thấp.
   *
   * Cảnh báo đó mới là phần có giá trị của #1: biết một nguồn yếu thì dễ, biết một khẳng định
   * đang đứng hoàn toàn trên nguồn yếu mới là thứ không ai tự nhìn ra khi lướt danh sách.
   */
  async overview(projectId: string): Promise<CredibilityOverview> {
    const enabled = await this.isEnabled(projectId);
    const scores = await this.scoresOf(projectId);

    return {
      enabled,
      sources: scores.map((s) => ({
        source_id: s.source_id,
        tier: s.tier as CredibilityTier,
        reason: s.reason,
        total: s.total,
      })),
      low_credibility_cards: await this.lowCredibilityCards(projectId, scores),
    };
  }

  /**
   * `SourceScore` cố ý **không có relation** tới `Source` (luật chung 4 — xem docblock của model),
   * nên không lọc lồng `where: { source: … }` được. Lấy id nguồn của project trước, rồi lọc `in`.
   */
  private async scoresOf(
    projectId: string,
  ): Promise<
    { source_id: string; tier: string; reason: string; total: number }[]
  > {
    const sources = await this.prisma.source.findMany({
      where: { project_id: projectId },
      select: { id: true },
    });
    if (sources.length === 0) return [];
    return this.prisma.sourceScore.findMany({
      where: { source_id: { in: sources.map((s) => s.id) } },
      select: { source_id: true, tier: true, reason: true, total: true },
      orderBy: { total: 'desc' },
    });
  }

  private async lowCredibilityCards(
    projectId: string,
    scores: { source_id: string; tier: string }[],
  ): Promise<LowCredibilityCard[]> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { current_spec_version_id: true },
    });
    const versionId = project?.current_spec_version_id;
    if (!versionId) return [];

    const tierOf = new Map(scores.map((s) => [s.source_id, s.tier]));

    const cards = await this.prisma.card.findMany({
      where: {
        spec_version_id: versionId,
        type: { in: [...GATED_CARD_TYPES] },
      },
      select: {
        id: true,
        title: true,
        type: true,
        card_sources: { select: { source_id: true } },
      },
    });

    return cards
      .filter((c) => {
        if (c.card_sources.length === 0) return false;
        // Chưa chấm điểm thì **không** coi là mức thấp — thiếu dữ liệu khác hẳn dữ liệu xấu.
        return c.card_sources.every(
          (cs) => tierOf.get(cs.source_id) === REVIEW,
        );
      })
      .map((c) => ({
        card_id: c.id,
        title: c.title,
        type: c.type,
        source_count: c.card_sources.length,
      }));
  }

  /** Dùng cho metric `low_credibility_claim_rate` của #6. `null` = không có thẻ nào để đo. */
  async lowCredibilityRate(projectId: string): Promise<number | null> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { current_spec_version_id: true },
    });
    const versionId = project?.current_spec_version_id;
    if (!versionId) return null;

    const total = await this.prisma.card.count({
      where: {
        spec_version_id: versionId,
        type: { in: [...GATED_CARD_TYPES] },
        card_sources: { some: {} },
      },
    });
    if (total === 0) return null;

    const low = await this.lowCredibilityCards(
      projectId,
      await this.scoresOf(projectId),
    );
    return low.length / total;
  }
}
