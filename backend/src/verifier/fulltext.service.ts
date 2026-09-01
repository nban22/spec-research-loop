import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { detectArxivId, fullTextUrls } from './arxiv-id';
import { cosine, EmbedderService } from './embedder.service';
import {
  htmlToText,
  MIN_FULLTEXT_CHARS,
  Passage,
  toPassages,
} from './html-text';

/**
 * Lấy và cache toàn văn arXiv cho tầng L3b của verifier (#2).
 *
 * Phạm vi cố ý hẹp: **chỉ arXiv, chỉ HTML, không đụng PDF**. Đây là "đường lui" mà chính issue
 * #2 đã viết sẵn, và nó là lựa chọn đúng chứ không phải cắt bớt cho nhanh: bóc chữ từ PDF cho ra
 * text bẩn tới mức câu chứng cứ không còn khớp **nguyên văn** với nguồn, mà khớp nguyên văn là
 * đúng thứ tầng L4b đang bảo vệ. Độ phủ thấp nhưng sạch, và độ phủ đó được **báo ra thành số**.
 *
 * Cache **cả lần thất bại**: phần lớn nguồn không bao giờ có bản HTML mở, không có dòng
 * `NOT_ARXIV`/`NOT_FOUND` thì mỗi lần chạy lại đều gọi HTTP cho đúng những nguồn đó.
 */

/** Số nguồn tối đa được tải toàn văn trong **một** lần chạy verifier. */
export const MAX_FULLTEXT_SOURCES_PER_RUN = 8;

/** Số đoạn gửi lên L4. 5 × ~400 ký tự ≈ một abstract ⇒ token LLM **không tăng** so với hiện tại. */
export const TOP_PASSAGES = 5;

const FETCH_TIMEOUT_MS = 20_000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const OK_TTL_DAYS = 30;
/** Thất bại giữ ngắn hơn: arXiv sinh HTML muộn sau khi bài lên, nên đáng thử lại sớm. */
const FAIL_TTL_DAYS = 3;

export type FullTextStatus =
  'OK' | 'NOT_ARXIV' | 'NOT_FOUND' | 'TOO_SHORT' | 'FETCH_ERROR';

export type SourceLike = {
  id: string;
  retrieved_from: string;
  external_id: string;
  doi: string | null;
  url: string | null;
  raw: unknown;
};

/** Vector của đoạn sống đúng **một lần chạy** — không cache toàn cục, không có chính sách hết hạn. */
export type FullTextRunCache = Map<
  string,
  { passages: Passage[]; vectors: Float32Array[] } | null
>;

export type PassagePick = {
  passage: Passage;
  similarity: number;
  rank: number;
};

@Injectable()
export class FullTextService {
  private readonly logger = new Logger(FullTextService.name);
  /** Đếm theo lần chạy, reset bằng `beginRun()`. Chặn cứng để demo không bao giờ treo. */
  private fetchedThisRun = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embedder: EmbedderService,
  ) {}

  async isEnabled(projectId: string): Promise<boolean> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { evidence_fulltext: true },
    });
    return project?.evidence_fulltext ?? false;
  }

  beginRun(): void {
    this.fetchedThisRun = 0;
  }

  /**
   * Toàn văn của một nguồn, đọc cache trước.
   *
   * `null` ⇒ không dùng được toàn văn cho nguồn này. Bên gọi phân biệt hai lý do qua `status`:
   * `NOT_ARXIV` là chuyện thường (không gắn cờ), còn `FETCH_ERROR`/`NOT_FOUND` là chẩn đoán.
   */
  async textFor(
    source: SourceLike,
  ): Promise<{ text: string; status: FullTextStatus }> {
    const cached = await this.prisma.sourceFullText.findUnique({
      where: { source_id: source.id },
    });
    if (cached && cached.expires_at > new Date()) {
      return { text: cached.text, status: cached.status as FullTextStatus };
    }

    const ref = detectArxivId({
      retrieved_from: source.retrieved_from,
      external_id: source.external_id,
      doi: source.doi,
      url: source.url,
      raw: source.raw,
    });
    if (!ref) {
      await this.remember(source.id, 'NOT_ARXIV', '', '', '');
      return { text: '', status: 'NOT_ARXIV' };
    }

    if (this.fetchedThisRun >= MAX_FULLTEXT_SOURCES_PER_RUN) {
      // **Không** ghi cache: đây là giới hạn của lần chạy này, không phải thuộc tính của nguồn.
      this.logger.log(
        `Đã đạt trần ${MAX_FULLTEXT_SOURCES_PER_RUN} nguồn toàn văn cho lần chạy này.`,
      );
      return { text: '', status: 'FETCH_ERROR' };
    }
    this.fetchedThisRun += 1;

    for (const candidate of fullTextUrls(ref)) {
      const html = await this.fetchHtml(candidate.url);
      if (html === null) continue;
      const text = htmlToText(html);
      if (text.length < MIN_FULLTEXT_CHARS) continue;
      await this.remember(
        source.id,
        'OK',
        text,
        candidate.url,
        candidate.provider,
      );
      return { text, status: 'OK' };
    }

    await this.remember(source.id, 'NOT_FOUND', '', '', '');
    return { text: '', status: 'NOT_FOUND' };
  }

  private async fetchHtml(url: string): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'text/html',
          'User-Agent': `SpecResearchLoop/1.0 (${process.env.OPENALEX_MAILTO ?? 'mailto:unknown'})`,
        },
        signal: controller.signal,
        redirect: 'follow',
      });
      if (!res.ok) return null;
      // ar5iv chuyển hướng về trang `/abs/…` khi không convert được — đó là **trượt**, không phải hit.
      if (res.url.includes('/abs/')) return null;
      const length = Number(res.headers.get('content-length') ?? '0');
      if (length > MAX_BODY_BYTES) return null;
      const body = await res.text();
      return body.length > MAX_BODY_BYTES ? null : body;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private async remember(
    sourceId: string,
    status: FullTextStatus,
    text: string,
    url: string,
    provider: string,
  ): Promise<void> {
    const days = status === 'OK' ? OK_TTL_DAYS : FAIL_TTL_DAYS;
    const data = {
      provider,
      url,
      status,
      text,
      char_count: text.length,
      fetched_at: new Date(),
      expires_at: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
    };
    await this.prisma.sourceFullText.upsert({
      where: { source_id: sourceId },
      create: { source_id: sourceId, ...data },
      update: data,
    });
  }

  /**
   * Top-k đoạn gần khẳng định nhất.
   *
   * Cache **theo nguồn, không theo cặp**: nhiều thẻ thường trích cùng một bài, và nhúng lại 150
   * đoạn cho từng cặp là chỗ duy nhất khiến tính năng này vỡ mốc "không quá 2× thời gian".
   */
  async topPassages(
    sourceId: string,
    text: string,
    claimText: string,
    cache: FullTextRunCache,
  ): Promise<PassagePick[]> {
    let entry = cache.get(sourceId);
    if (entry === undefined) {
      const passages = toPassages(text);
      if (passages.length === 0) {
        cache.set(sourceId, null);
        return [];
      }
      const vectors = await this.embedder.embed(passages.map((p) => p.text));
      entry = { passages, vectors };
      cache.set(sourceId, entry);
    }
    if (entry === null) return [];

    const [claimVec] = await this.embedder.embed([claimText]);
    return entry.passages
      .map((passage, i) => ({
        passage,
        similarity: cosine(claimVec, entry.vectors[i]),
        rank: 0,
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, TOP_PASSAGES)
      .map((x, rank) => ({ ...x, rank }));
  }

  /** Ghi lại đúng những đoạn đã gửi lên L4, và đoạn nào chứa câu chứng cứ cuối cùng. */
  async recordPassages(
    verifierRunId: string,
    cardSourceId: string,
    picks: PassagePick[],
    evidenceSentence: string | null,
  ): Promise<void> {
    if (picks.length === 0) return;
    const needle = evidenceSentence?.trim().toLowerCase() ?? null;
    // Các đoạn **chồng lấn nhau một câu**, nên câu chứng cứ có thể nằm trong hai đoạn liền kề.
    // Chỉ đánh dấu đoạn xếp hạng cao nhất: giao diện cần **một** chỗ để nhảy tới, không phải hai.
    const evidenceRank =
      needle === null
        ? -1
        : (picks.find((p) => p.passage.text.toLowerCase().includes(needle))
            ?.rank ?? -1);

    await this.prisma.verifierPassage.deleteMany({
      where: { card_source_id: cardSourceId },
    });
    await this.prisma.verifierPassage.createMany({
      data: picks.map((p) => ({
        verifier_run_id: verifierRunId,
        card_source_id: cardSourceId,
        rank: p.rank,
        similarity: p.similarity,
        char_start: p.passage.charStart,
        text: p.passage.text,
        is_evidence: p.rank === evidenceRank,
      })),
    });
  }

  /** Dùng cho metric `fulltext_hit_rate` của #6. `null` = project chưa có nguồn nào. */
  async hitRate(projectId: string): Promise<number | null> {
    const sources = await this.prisma.source.findMany({
      where: { project_id: projectId },
      select: { id: true },
    });
    if (sources.length === 0) return null;
    const ok = await this.prisma.sourceFullText.count({
      where: { source_id: { in: sources.map((s) => s.id) }, status: 'OK' },
    });
    return ok / sources.length;
  }
}
