import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../common/env';
import type { SourceProvider } from '../generated/prisma/enums';
import { normalizeDoi, tokenSet } from '../common/text';

export type NormalizedSource = {
  retrieved_from: SourceProvider;
  external_id: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  url: string | null;
  abstract: string | null;
  citation_count: number | null;
  raw: unknown;
};

export type SearchOutcome = {
  sources: NormalizedSource[];
  /** Provider nào thật sự trả dữ liệu — để về sau biết dòng nào đến từ đâu. */
  providersUsed: SourceProvider[];
  providerErrors: string[];
};

const S2_ENDPOINT = 'https://api.semanticscholar.org/graph/v1/paper/search';
const S2_FIELDS =
  'paperId,title,abstract,year,venue,externalIds,url,citationCount,authors.name';
const OPENALEX_ENDPOINT = 'https://api.openalex.org/works';
const CROSSREF_ENDPOINT = 'https://api.crossref.org/works';
/** DOI của arXiv/Zenodo đăng ký ở DataCite chứ không phải Crossref — xem `verifyDoi`. */
const DATACITE_ENDPOINT = 'https://api.datacite.org/dois';

/**
 * Nhịp gọi khi CÓ key: hạn mức S2 cấp là 1 req/s **cộng dồn trên mọi endpoint**, và họ yêu cầu đặt
 * nhịp *thấp hơn* ngưỡng đó. 1.100ms ⇒ ~0,91 req/s, dưới ngưỡng (SYSTEM_DESIGN_ANALYSIS §1.5).
 * "Cộng dồn mọi endpoint" là lý do mọi lời gọi S2 phải đi qua **một** gate `s2` duy nhất — thêm
 * endpoint S2 mới thì dùng lại gate này, đừng mở gate riêng.
 */
const S2_INTERVAL_WITH_KEY_MS = 1_100;
/** Nhịp gọi khi KHÔNG có key: pool chung dùng với cả thế giới ⇒ nới rộng hẳn. */
const S2_INTERVAL_NO_KEY_MS = 3_500;
const OPENALEX_INTERVAL_MS = 150;

/**
 * Client tới ba API học thuật. Throttle + retry + fallback ở đây, và lý do là **hàng xóm**
 * chứ không phải tải của ta (C1 · F.3).
 *
 * Không có key Semantic Scholar là **ràng buộc thiết kế, không phải blocker**: client tự chọn
 * chế độ lúc runtime. Key đã được cấp 2026-08-16 và điền vào `.env` — đúng như thiết kế, không
 * dòng code nào phải sửa. Nhánh không-key vẫn giữ nguyên vì người chấm clone repo sẽ chạy không key.
 */
@Injectable()
export class SourceClient {
  private readonly logger = new Logger(SourceClient.name);
  private readonly s2Key?: string;
  private readonly mailto: string;
  private readonly gates = new Map<string, Promise<void>>();
  private readonly lastCallAt = new Map<string, number>();

  constructor(config: ConfigService<Env, true>) {
    this.s2Key = config.get('SEMANTIC_SCHOLAR_API_KEY', { infer: true });
    this.mailto = config.get('OPENALEX_MAILTO', { infer: true });
    this.logger.log(
      this.s2Key
        ? 'Semantic Scholar: có API key — nhịp 1 req/s.'
        : 'Semantic Scholar: KHÔNG có API key — dùng pool chung, nhịp nới rộng, 429 thì fallback OpenAlex ngay.',
    );
  }

  get hasSemanticScholarKey(): boolean {
    return Boolean(this.s2Key);
  }

  /** Hàng đợi tuần tự theo từng provider — không cần thư viện throttle cho quy mô này. */
  private async throttle(key: string, intervalMs: number): Promise<void> {
    const prev = this.gates.get(key) ?? Promise.resolve();
    const next = prev.then(async () => {
      const last = this.lastCallAt.get(key) ?? 0;
      const wait = intervalMs - (Date.now() - last);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastCallAt.set(key, Date.now());
    });
    this.gates.set(
      key,
      next.catch(() => undefined),
    );
    await next;
  }

  private async fetchJson(
    url: string,
    headers: Record<string, string>,
    timeoutMs = 20_000,
  ): Promise<{ status: number; body: unknown }> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers, signal: ctrl.signal });
      const text = await res.text();
      let body: unknown = null;
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = text;
      }
      return { status: res.status, body };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Tìm nguồn: Semantic Scholar trước, lỗi hoặc rỗng thì OpenAlex.
   * Cả hai chết ⇒ `sources` rỗng và caller phải chặn bước B2 — thà tắc còn hơn bịa (NFR-G-2).
   */
  async search(queries: string[], limitPerQuery = 8): Promise<SearchOutcome> {
    const collected: NormalizedSource[] = [];
    const providersUsed = new Set<SourceProvider>();
    const providerErrors: string[] = [];

    for (const query of queries) {
      const s2 = await this.searchSemanticScholar(query, limitPerQuery);
      if (s2.ok && s2.sources.length > 0) {
        providersUsed.add('SEMANTIC_SCHOLAR');
        collected.push(...s2.sources);
        continue;
      }
      if (!s2.ok) providerErrors.push(`Semantic Scholar: ${s2.error}`);

      const oa = await this.searchOpenAlex(query, limitPerQuery);
      if (oa.ok && oa.sources.length > 0) {
        providersUsed.add('OPENALEX');
        collected.push(...oa.sources);
      } else if (!oa.ok) {
        providerErrors.push(`OpenAlex: ${oa.error}`);
      }
    }

    return {
      sources: collected,
      providersUsed: [...providersUsed],
      providerErrors,
    };
  }

  async searchSemanticScholar(
    query: string,
    limit: number,
  ): Promise<
    { ok: true; sources: NormalizedSource[] } | { ok: false; error: string }
  > {
    const interval = this.s2Key
      ? S2_INTERVAL_WITH_KEY_MS
      : S2_INTERVAL_NO_KEY_MS;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.s2Key) headers['x-api-key'] = this.s2Key;

    const url = `${S2_ENDPOINT}?query=${encodeURIComponent(query)}&limit=${limit}&fields=${S2_FIELDS}`;
    const maxAttempts = this.s2Key ? 3 : 1; // không key ⇒ gặp 429 là bỏ sang OpenAlex ngay

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this.throttle('s2', interval);
      try {
        const { status, body } = await this.fetchJson(url, headers);
        if (status === 429) {
          if (attempt === maxAttempts)
            return { ok: false, error: 'rate limit (429)' };
          await new Promise((r) => setTimeout(r, 2_000 * attempt));
          continue;
        }
        if (status >= 400) return { ok: false, error: `HTTP ${status}` };
        const data = (body as { data?: unknown[] })?.data ?? [];
        return {
          ok: true,
          sources: data.map((d) => this.normalizeS2(d)).filter(isReal),
        };
      } catch (err) {
        if (attempt === maxAttempts) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }
    }
    return { ok: false, error: 'không rõ nguyên nhân' };
  }

  async searchOpenAlex(
    query: string,
    limit: number,
  ): Promise<
    { ok: true; sources: NormalizedSource[] } | { ok: false; error: string }
  > {
    // `search=` khớp lỏng theo kiểu OR trên cả cụm dài — với truy vấn 4–6 từ nó trả về những
    // paper không liên quan gì (đã thấy Landsat-8 và điện mặt trời mái nhà cho một truy vấn về
    // RAG pháp luật). `filter=title_and_abstract.search:` khớp chặt hơn hẳn.
    // Dấu phẩy và gạch đứng là ký tự đặc biệt trong `filter` của OpenAlex — bỏ trước khi gửi.
    const safeQuery = query.replace(/[,|]/g, ' ').replace(/\s+/g, ' ').trim();
    const url =
      `${OPENALEX_ENDPOINT}?filter=${encodeURIComponent(`title_and_abstract.search:${safeQuery}`)}` +
      `&per-page=${limit}&sort=relevance_score:desc&mailto=${encodeURIComponent(this.mailto)}`;
    for (let attempt = 1; attempt <= 3; attempt++) {
      await this.throttle('openalex', OPENALEX_INTERVAL_MS);
      try {
        const { status, body } = await this.fetchJson(url, {
          Accept: 'application/json',
          'User-Agent': `SpecResearchLoop/1.0 (mailto:${this.mailto})`,
        });
        if (status >= 400) {
          if (attempt === 3) return { ok: false, error: `HTTP ${status}` };
          await new Promise((r) => setTimeout(r, 1_000 * attempt));
          continue;
        }
        const results = (body as { results?: unknown[] })?.results ?? [];
        return {
          ok: true,
          sources: results
            .map((r) => this.normalizeOpenAlex(r))
            .filter(isReal)
            .filter((s) => isRelevant(query, s)),
        };
      } catch (err) {
        if (attempt === 3) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }
    }
    return { ok: false, error: 'không rõ nguyên nhân' };
  }

  /**
   * Verify DOI ở tầng L0 của verifier.
   * `true` = tra ra · `false` = không registry nào biết · `null` = **không hỏi được registry**.
   * Phân biệt `false` với `null` là cả điểm của hàm này: registry chết thì fail-**open** kèm cờ
   * `DOI_UNVERIFIED`, vì một nguồn có hai bằng chứng tồn tại độc lập (SYSTEM_DESIGN_ANALYSIS §3.4).
   *
   * **Phải hỏi cả DataCite, không chỉ Crossref.** DOI của arXiv (`10.48550/arxiv.*`), Zenodo và
   * nhiều repository khác đăng ký ở DataCite; hỏi mỗi Crossref thì chúng trả 404 và verifier sẽ
   * gắn nhãn `SOURCE_NOT_FOUND` cho những paper hoàn toàn có thật — đúng loại dương tính giả làm
   * hỏng chính metric `citation_validity` của báo cáo. Phát hiện khi chạy thật ở phase 2.
   */
  async verifyDoi(doi: string): Promise<boolean | null> {
    const normalized = normalizeDoi(doi);
    if (!normalized) return false;

    const crossref = await this.probeDoi(
      'crossref',
      `${CROSSREF_ENDPOINT}/${encodeURIComponent(normalized)}`,
    );
    if (crossref === true) return true;

    const datacite = await this.probeDoi(
      'datacite',
      `${DATACITE_ENDPOINT}/${encodeURIComponent(normalized)}`,
    );
    if (datacite === true) return true;

    // Chỉ kết luận "không tồn tại" khi **cả hai** registry đều trả lời và đều nói không có.
    if (crossref === false && datacite === false) return false;
    return null;
  }

  private async probeDoi(gate: string, url: string): Promise<boolean | null> {
    await this.throttle(gate, 200);
    try {
      const { status } = await this.fetchJson(
        url,
        {
          Accept: 'application/json',
          'User-Agent': `SpecResearchLoop/1.0 (mailto:${this.mailto})`,
        },
        12_000,
      );
      if (status === 200) return true;
      if (status === 404) return false;
      return null;
    } catch {
      return null;
    }
  }

  /** Lấy bù abstract từ OpenAlex khi Semantic Scholar thiếu (C1 · F.7). */
  async fetchAbstractByDoi(doi: string): Promise<string | null> {
    const normalized = normalizeDoi(doi);
    if (!normalized) return null;
    await this.throttle('openalex', OPENALEX_INTERVAL_MS);
    try {
      const { status, body } = await this.fetchJson(
        `${OPENALEX_ENDPOINT}/doi:${encodeURIComponent(normalized)}?mailto=${encodeURIComponent(this.mailto)}`,
        { Accept: 'application/json' },
        12_000,
      );
      if (status !== 200) return null;
      return invertedIndexToText(
        (body as { abstract_inverted_index?: Record<string, number[]> })
          ?.abstract_inverted_index,
      );
    } catch {
      return null;
    }
  }

  private normalizeS2(raw: unknown): NormalizedSource | null {
    const p = raw as {
      paperId?: string;
      title?: string;
      abstract?: string | null;
      year?: number | null;
      venue?: string | null;
      url?: string | null;
      citationCount?: number | null;
      externalIds?: { DOI?: string; ArXiv?: string } | null;
      authors?: { name?: string }[] | null;
    };
    if (!p?.paperId || !p.title) return null;
    return {
      retrieved_from: 'SEMANTIC_SCHOLAR',
      external_id: p.paperId,
      title: p.title,
      authors: (p.authors ?? []).map((a) => a?.name ?? '').filter(Boolean),
      year: p.year ?? null,
      venue: p.venue ?? null,
      doi: normalizeDoi(p.externalIds?.DOI),
      url:
        p.url ??
        (p.externalIds?.ArXiv
          ? `https://arxiv.org/abs/${p.externalIds.ArXiv}`
          : null),
      abstract: p.abstract ?? null,
      citation_count: p.citationCount ?? null,
      raw,
    };
  }

  private normalizeOpenAlex(raw: unknown): NormalizedSource | null {
    const w = raw as {
      id?: string;
      display_name?: string;
      title?: string;
      publication_year?: number | null;
      doi?: string | null;
      cited_by_count?: number | null;
      abstract_inverted_index?: Record<string, number[]> | null;
      primary_location?: { source?: { display_name?: string } | null } | null;
      authorships?: { author?: { display_name?: string } | null }[] | null;
    };
    const title = w?.display_name ?? w?.title;
    if (!w?.id || !title) return null;
    const externalId = w.id.replace('https://openalex.org/', '');
    return {
      retrieved_from: 'OPENALEX',
      external_id: externalId,
      title,
      authors: (w.authorships ?? [])
        .map((a) => a?.author?.display_name ?? '')
        .filter(Boolean),
      year: w.publication_year ?? null,
      venue: w.primary_location?.source?.display_name ?? null,
      doi: normalizeDoi(w.doi),
      url: w.doi ? `https://doi.org/${normalizeDoi(w.doi)}` : w.id,
      abstract: invertedIndexToText(w.abstract_inverted_index ?? undefined),
      citation_count: w.cited_by_count ?? null,
      raw,
    };
  }
}

function isReal(s: NormalizedSource | null): s is NormalizedSource {
  return s !== null;
}

/**
 * Chốt chặn quan hệ **bằng rule, 0 token**: giữ lại nguồn chỉ khi title + abstract của nó thật sự
 * chứa các từ khoá đã tìm. Provider xếp hạng theo điểm liên quan của riêng nó và đôi khi trả về
 * những paper lạc đề hẳn; để chúng vào kho thì bảng related work và mọi metric citation đều nhiễu.
 *
 * Cố ý nới tay: đòi 2 từ khoá (hoặc tất cả, nếu truy vấn ngắn hơn 2 từ) — chặn thứ lạc đề mà
 * không bóp mất nguồn chỉ liên quan một phần.
 */
function isRelevant(query: string, source: NormalizedSource): boolean {
  const queryTokens = [...tokenSet(query)];
  if (queryTokens.length === 0) return true;
  const haystack = tokenSet(`${source.title} ${source.abstract ?? ''}`);
  const hits = queryTokens.filter((t) => haystack.has(t)).length;
  return hits >= Math.min(2, queryTokens.length);
}

/** OpenAlex trả abstract dạng inverted index — dựng lại thành văn bản. */
function invertedIndexToText(
  index: Record<string, number[]> | undefined | null,
): string | null {
  if (!index) return null;
  const slots: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const pos of positions) slots[pos] = word;
  }
  const text = slots
    .filter((w) => typeof w === 'string')
    .join(' ')
    .trim();
  return text.length > 0 ? text : null;
}
