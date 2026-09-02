import { Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { PrismaService } from '../common/prisma.service';
import { citationGraph, type CitationGraph } from './citation-graph';
import { cosine, mds2d, sparsity, tfidf } from './similarity';

/**
 * Hai bản đồ của issue #16 — **timeline** và **similarity map** — dựng từ bảng `Source` đang có.
 *
 * Cùng ràng buộc với `AnalyticsService`: **không một lệnh ghi DB nào**, không gọi LLM, không gọi
 * API ngoài. Toàn bộ là `findMany` rồi tính trong bộ nhớ.
 *
 * **Citation graph: đã làm được, không cần đụng `sources/**`.** Truy vấn OpenAlex không có tham
 * số `select` nên nó trả về cả object work, và `normalizeOpenAlex` lưu nguyên object đó vào
 * `Source.raw` — tức là `referenced_works` đã nằm sẵn trong DB từ ngày đầu. Xem `citation-graph.ts`.
 */

export type SourceNode = {
  id: string;
  title: string;
  year: number | null;
  venue: string | null;
  citation_count: number | null;
  doi_verified: boolean | null;
  /** Số claim đang trích nguồn này. `0` = tìm về rồi nhưng chưa ai dùng. */
  cited_by: number;
  /** Toạ độ trên similarity map, trong hộp [-1, 1]. */
  x: number;
  y: number;
  /** 0 = giữa cụm dày, 1 = cô lập nhất bản đồ. Gợi ý gap, **không phải** kết luận gap. */
  sparsity: number;
  /** Nguồn gần nhất về chủ đề — để người đọc kiểm lại bản đồ có hợp lý không. */
  nearest: { id: string; title: string; score: number } | null;
};

export type SourceMap = {
  nodes: SourceNode[];
  /** Cột năm cho timeline. `year: null` gom vào một cột riêng ở cuối trục. */
  timeline: { year: number | null; count: number; cited: number }[];
  /** Nguồn thiếu abstract thì vector TF-IDF rất mỏng — cảnh báo để đừng đọc bản đồ quá tin. */
  weak_text_count: number;
  /** Đồ thị trích dẫn giữa chính các nguồn của dự án. `coverage` cho biết đọc được bao nhiêu phần. */
  citations: CitationGraph;
};

@Injectable()
export class SourceMapService {
  constructor(private readonly prisma: PrismaService) {}

  async sourceMap(projectId: string, userId: string): Promise<SourceMap> {
    // `where` kèm `user_id`: dự án của người khác trả 404 chứ không 403 (backend/CLAUDE.md §5).
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, user_id: userId },
      select: { id: true },
    });
    if (!project) throw AppError.notFound('Project not found.');

    const sources = await this.prisma.source.findMany({
      where: { project_id: projectId },
      select: {
        id: true,
        title: true,
        abstract: true,
        year: true,
        venue: true,
        citation_count: true,
        doi_verified: true,
        // `raw` chỉ để đọc `referenced_works` — xem `citation-graph.ts`. Không trả nó ra FE.
        external_id: true,
        retrieved_from: true,
        raw: true,
        _count: { select: { card_sources: true } },
      },
      // Thứ tự cố định: MDS tất định, nhưng chỉ khi đầu vào cũng vào theo cùng một thứ tự.
      orderBy: [{ year: 'asc' }, { id: 'asc' }],
    });

    if (sources.length === 0) {
      return {
        nodes: [],
        timeline: [],
        weak_text_count: 0,
        citations: {
          edges: [],
          coverage: { with_refs: 0, total: 0 },
          most_cited: [],
        },
      };
    }

    const vectors = tfidf(sources.map((s) => `${s.title} ${s.abstract ?? ''}`));
    const n = sources.length;

    const sim: number[][] = Array.from({ length: n }, () =>
      new Array<number>(n).fill(0),
    );
    for (let i = 0; i < n; i++) {
      sim[i][i] = 1;
      for (let j = i + 1; j < n; j++) {
        const s = cosine(vectors[i], vectors[j]);
        sim[i][j] = s;
        sim[j][i] = s;
      }
    }
    const dist = sim.map((row) => row.map((s) => 1 - s));

    const points = mds2d(dist);
    const spread = sparsity(dist);

    const nodes: SourceNode[] = sources.map((s, i) => ({
      id: s.id,
      title: s.title,
      year: s.year,
      venue: s.venue,
      citation_count: s.citation_count,
      doi_verified: s.doi_verified,
      cited_by: s._count.card_sources,
      x: points[i].x,
      y: points[i].y,
      sparsity: spread[i],
      nearest: nearestOf(sim, sources, i),
    }));

    return {
      nodes,
      timeline: buildTimeline(nodes),
      // 40 ký tự là ngưỡng thô: dưới đó gần như chắc chắn chỉ có tiêu đề, không có abstract.
      weak_text_count: sources.filter((s) => (s.abstract ?? '').length < 40)
        .length,
      citations: citationGraph(
        sources.map((s) => ({
          id: s.id,
          external_id: s.external_id,
          retrieved_from: String(s.retrieved_from),
          title: s.title,
          year: s.year,
          citation_count: s.citation_count,
          raw: s.raw,
        })),
      ),
    };
  }
}

/**
 * Nguồn giống nhất với `i`. Bỏ qua điểm tương đồng bằng 0 — hai paper **không chung một từ khoá
 * nào** thì "gần nhất" là con số vô nghĩa, thà không hiện còn hơn hiện một cái tên ngẫu nhiên.
 */
function nearestOf(
  sim: number[][],
  sources: { id: string; title: string }[],
  i: number,
): SourceNode['nearest'] {
  let best = -1;
  let bestScore = 0;
  for (let j = 0; j < sim.length; j++) {
    if (j !== i && sim[i][j] > bestScore) {
      bestScore = sim[i][j];
      best = j;
    }
  }
  return best === -1
    ? null
    : { id: sources[best].id, title: sources[best].title, score: bestScore };
}

/**
 * Gom nguồn theo năm. **Không** điền khoảng trống: một chỗ trống giữa 2019 và 2023 là thông tin
 * thật (không tìm được paper giai đoạn đó), nhưng chèn cột rỗng cho từng năm lại kéo trục dài
 * vô ích khi dữ liệu trải hai chục năm.
 */
function buildTimeline(nodes: SourceNode[]): SourceMap['timeline'] {
  const byYear = new Map<number | null, { count: number; cited: number }>();
  for (const node of nodes) {
    const bucket = byYear.get(node.year) ?? { count: 0, cited: 0 };
    bucket.count += 1;
    if (node.cited_by > 0) bucket.cited += 1;
    byYear.set(node.year, bucket);
  }

  return [...byYear.entries()]
    .map(([year, v]) => ({ year, ...v }))
    .sort((a, b) => {
      if (a.year === null) return 1; // "không rõ năm" luôn nằm cuối trục
      if (b.year === null) return -1;
      return a.year - b.year;
    });
}
