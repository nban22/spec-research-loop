import { Injectable, Logger } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { PrismaService } from '../common/prisma.service';
import { normalizeDoi, titleSimilarity } from '../common/text';
import { CredibilityService } from './credibility.service';
import { SourceClient, type NormalizedSource } from './source.client';

export type StoredSource = {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  url: string | null;
  abstract: string | null;
  citation_count: number | null;
  retrieved_from: string;
  doi_verified: boolean | null;
};

const TITLE_DUPLICATE_THRESHOLD = 0.85;

@Injectable()
export class SourcesService {
  private readonly logger = new Logger(SourcesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: SourceClient,
    private readonly credibility: CredibilityService,
  ) {}

  /**
   * Tìm nguồn thật rồi upsert. **Chỉ sau bước này mới được gọi LLM** — thứ tự
   * "tìm nguồn thật trước, gọi LLM sau" là cả thiết kế của tính năng (C1 · F.6).
   */
  async searchAndStore(
    projectId: string,
    queries: string[],
    onProgress?: (
      done: number,
      total: number,
      message: string,
    ) => Promise<void>,
  ): Promise<{
    stored: number;
    skippedDuplicates: number;
    providersUsed: string[];
  }> {
    const cleaned = queries
      .map((q) => q.trim())
      .filter((q) => q.length > 2)
      .slice(0, 6);
    if (cleaned.length === 0) {
      throw AppError.badRequest(
        'VALIDATION_FAILED',
        'No keywords to search with yet.',
      );
    }

    const collected: NormalizedSource[] = [];
    const providersUsed = new Set<string>();
    const errors: string[] = [];

    for (let i = 0; i < cleaned.length; i++) {
      await onProgress?.(
        i,
        cleaned.length,
        `Searching sources for the keyword "${cleaned[i]}"…`,
      );
      const outcome = await this.client.search([cleaned[i]], 8);
      collected.push(...outcome.sources);
      outcome.providersUsed.forEach((p) => providersUsed.add(p));
      errors.push(...outcome.providerErrors);
    }
    await onProgress?.(
      cleaned.length,
      cleaned.length,
      'Saving the sources found…',
    );

    if (collected.length === 0) {
      throw AppError.unavailable(
        'SOURCE_PROVIDER_UNAVAILABLE',
        'No sources could be retrieved from Semantic Scholar or OpenAlex. The related-work step stops here — the system never invents papers.',
        errors.slice(0, 5),
      );
    }

    const existing = await this.prisma.source.findMany({
      where: { project_id: projectId },
      select: { id: true, title: true, doi: true, year: true },
    });

    const seenDoi = new Set(
      existing
        .map((s) => normalizeDoi(s.doi))
        .filter((d): d is string => d !== null),
    );
    const seenTitles = existing.map((s) => ({ title: s.title, year: s.year }));
    let stored = 0;
    let skippedDuplicates = 0;

    for (const s of collected) {
      // Khử trùng hai tầng: DOI chuẩn hoá trước (chắc chắn), title token-set sau (xác suất).
      const doi = normalizeDoi(s.doi);
      if (doi && seenDoi.has(doi)) {
        skippedDuplicates++;
        continue;
      }
      const dupTitle = seenTitles.some(
        (t) =>
          titleSimilarity(t.title, s.title) >= TITLE_DUPLICATE_THRESHOLD &&
          Math.abs((t.year ?? 0) - (s.year ?? 0)) <= 1,
      );
      if (dupTitle) {
        skippedDuplicates++;
        continue;
      }

      // Thiếu abstract → lấy bù từ OpenAlex; vẫn không có thì **không loại nguồn** —
      // verifier sẽ tự hạ trần nhãn xuống WEAK kèm cờ. Xử lý ở đúng một chỗ (C1 · F.7).
      let abstract = s.abstract;
      if ((!abstract || abstract.length < 50) && doi) {
        abstract = (await this.client.fetchAbstractByDoi(doi)) ?? abstract;
      }

      await this.prisma.source.upsert({
        where: {
          project_id_retrieved_from_external_id: {
            project_id: projectId,
            retrieved_from: s.retrieved_from,
            external_id: s.external_id,
          },
        },
        create: {
          project_id: projectId,
          retrieved_from: s.retrieved_from,
          external_id: s.external_id,
          title: s.title,
          authors: s.authors,
          year: s.year,
          venue: s.venue,
          doi,
          url: s.url,
          abstract,
          citation_count: s.citation_count,
          raw: s.raw as object,
        },
        update: {
          title: s.title,
          abstract: abstract ?? undefined,
          citation_count: s.citation_count,
          retrieved_at: new Date(),
        },
      });

      stored++;
      if (doi) seenDoi.add(doi);
      seenTitles.push({ title: s.title, year: s.year });
    }

    if (errors.length > 0) {
      this.logger.warn(
        `Partial provider failures: ${errors.slice(0, 3).join(' | ')}`,
      );
    }

    // #1 — chấm lại độ tin cậy ngay sau khi upsert. Luật thuần, 0 token, vài mili giây.
    // Bọc try/catch: chấm điểm là **thông tin thêm**, hỏng nó không được phép làm hỏng cả job
    // tìm nguồn mà người dùng vừa chờ xong.
    try {
      await this.credibility.rescoreProject(projectId);
    } catch (err) {
      this.logger.warn(
        `Could not score source credibility: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return { stored, skippedDuplicates, providersUsed: [...providersUsed] };
  }

  async list(projectId: string): Promise<StoredSource[]> {
    const rows = await this.prisma.source.findMany({
      where: { project_id: projectId },
      orderBy: [{ citation_count: 'desc' }, { year: 'desc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      authors: Array.isArray(r.authors) ? (r.authors as string[]) : [],
      year: r.year,
      venue: r.venue,
      doi: r.doi,
      url: r.url,
      abstract: r.abstract,
      citation_count: r.citation_count,
      retrieved_from: r.retrieved_from,
      doi_verified: r.doi_verified,
    }));
  }

  async remove(projectId: string, sourceId: string): Promise<void> {
    const found = await this.prisma.source.findFirst({
      where: { id: sourceId, project_id: projectId },
      select: { id: true },
    });
    if (!found) throw AppError.notFound('Source not found.');
    await this.prisma.source.delete({ where: { id: sourceId } });
  }

  /** Gói gọn cho prompt — bỏ `raw` để không thổi phồng context. */
  async sourcesForPrompt(projectId: string): Promise<
    {
      source_id: string;
      title: string;
      year: number | null;
      venue: string | null;
      doi: string | null;
      url: string | null;
      retrieved_from: string;
      external_id: string;
      abstract: string;
    }[]
  > {
    const rows = await this.prisma.source.findMany({
      where: { project_id: projectId },
      orderBy: [{ citation_count: 'desc' }, { year: 'desc' }],
      take: 25,
    });
    return rows.map((r) => ({
      source_id: r.id,
      title: r.title,
      year: r.year,
      venue: r.venue,
      doi: r.doi,
      url: r.url,
      retrieved_from: r.retrieved_from,
      external_id: r.external_id,
      abstract: r.abstract ?? '',
    }));
  }
}
