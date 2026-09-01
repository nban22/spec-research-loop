/**
 * **Citation graph** — phần còn thiếu của issue #16 (Bước 3 của đề: *"Citation graph · Timeline
 * nghiên cứu · Similarity map"*).
 *
 * ## Vì sao lần này làm được mà lần trước hoãn
 *
 * Lần trước tao hoãn vì tưởng phải xin thêm trường `references` từ Semantic Scholar — mà
 * `S2_FIELDS` không xin nó, và `backend/src/sources/**` nằm ngoài phạm vi sửa của làn C.
 *
 * Nhưng truy vấn OpenAlex (`source.client.ts:204-205`) **không có tham số `select`**, nên nó trả
 * về **cả object work**, trong đó có `referenced_works`. Và `normalizeOpenAlex` lưu nguyên object
 * đó vào `Source.raw`. Nghĩa là **dữ liệu trích dẫn đã nằm sẵn trong DB từ ngày đầu**, chưa ai
 * đọc — đúng cùng một mô típ với `LlmCall` ở issue #17.
 *
 * Hệ quả: file này **chỉ đọc**, không gọi API ngoài, không đụng một dòng nào của làn khác.
 *
 * ## Giới hạn phải nói ra, không được giấu
 *
 * Chỉ nguồn lấy từ **OpenAlex** mới có `referenced_works`. Nguồn từ Semantic Scholar không có
 * trường đó, nên chúng xuất hiện trên đồ thị như **đỉnh cô lập** — và điều đó **không** có nghĩa
 * là chúng không trích dẫn ai. Vì vậy hàm này trả kèm `coverage`: tỉ lệ nguồn thật sự có dữ liệu
 * trích dẫn. Vẽ đồ thị mà giấu con số đó đi là mời người đọc kết luận sai.
 */

/** Nguồn, rút gọn còn đúng phần cần để dựng cạnh. */
export type GraphSource = {
  id: string;
  external_id: string;
  retrieved_from: string;
  title: string;
  year: number | null;
  citation_count: number | null;
  raw: unknown;
};

export type CitationEdge = {
  /** Id nội bộ của nguồn **trích dẫn**. */
  from: string;
  /** Id nội bộ của nguồn **được trích**. */
  to: string;
};

export type CitationGraph = {
  edges: CitationEdge[];
  /** Số nguồn **có** dữ liệu trích dẫn đọc được / tổng số nguồn. */
  coverage: { with_refs: number; total: number };
  /** Nguồn được trích nhiều nhất **trong chính tập nguồn của dự án** — khác `citation_count` toàn cầu. */
  most_cited: { id: string; title: string; in_degree: number }[];
};

/**
 * OpenAlex ghi id dạng URL đầy đủ (`https://openalex.org/W123`), còn `Source.external_id` đã bị
 * cắt còn `W123` (`normalizeOpenAlex`). Cắt cả hai phía về cùng một dạng trước khi so — không làm
 * bước này thì **không cạnh nào khớp**, và đồ thị rỗng trông y hệt "các paper này không trích dẫn
 * nhau", một kết luận sai hoàn toàn.
 */
function shortId(value: string): string {
  return value.replace('https://openalex.org/', '').trim();
}

/**
 * Đọc `referenced_works` ra khỏi `raw` một cách **chịu được dữ liệu lạ**.
 *
 * `raw` là `Json` của Prisma nên kiểu tĩnh là `unknown`; nó có thể là object của OpenAlex, của
 * S2, hoặc `null` với hàng cũ. Thu hẹp bằng kiểm tra thật, không `as` bừa (backend/CLAUDE.md §3).
 */
export function referencesOf(source: GraphSource): string[] | null {
  if (source.retrieved_from !== 'OPENALEX') return null;
  if (typeof source.raw !== 'object' || source.raw === null) return null;

  const refs = (source.raw as { referenced_works?: unknown }).referenced_works;
  if (!Array.isArray(refs)) return null;

  return refs.filter((r): r is string => typeof r === 'string').map(shortId);
}

/**
 * Dựng đồ thị trích dẫn **trong phạm vi tập nguồn của dự án**.
 *
 * Cố ý **không** kéo về các paper nằm ngoài tập: một paper OpenAlex trích dẫn hàng chục công
 * trình, vẽ hết thì thành một đám mây vài trăm đỉnh mà 95% trong đó người dùng chưa từng thấy và
 * không có thông tin gì ngoài một id. Thứ đáng xem là **các nguồn của chính dự án nói chuyện với
 * nhau thế nào** — cạnh giữa hai paper người dùng đang cân nhắc mới là cạnh đọc được.
 */
export function citationGraph(sources: GraphSource[]): CitationGraph {
  const byExternal = new Map<string, string>();
  for (const s of sources) byExternal.set(shortId(s.external_id), s.id);

  const edges: CitationEdge[] = [];
  const inDegree = new Map<string, number>();
  let withRefs = 0;

  for (const s of sources) {
    const refs = referencesOf(s);
    if (refs === null) continue;
    withRefs += 1;

    // `Set` vì OpenAlex thỉnh thoảng lặp id trong `referenced_works`; cạnh đôi làm sai in-degree.
    for (const ref of new Set(refs)) {
      const target = byExternal.get(ref);
      // Bỏ cạnh trỏ về chính nó: dữ liệu bẩn, và một vòng lặp tự thân không nói lên điều gì.
      if (!target || target === s.id) continue;
      edges.push({ from: s.id, to: target });
      inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
    }
  }

  const title = new Map(sources.map((s) => [s.id, s.title]));
  const most_cited = [...inDegree.entries()]
    .map(([id, in_degree]) => ({ id, title: title.get(id) ?? id, in_degree }))
    .sort((a, b) => b.in_degree - a.in_degree || a.id.localeCompare(b.id))
    .slice(0, 5);

  return {
    edges,
    coverage: { with_refs: withRefs, total: sources.length },
    most_cited,
  };
}
