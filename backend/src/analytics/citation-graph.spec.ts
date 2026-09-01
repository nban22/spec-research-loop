import {
  citationGraph,
  referencesOf,
  type GraphSource,
} from './citation-graph';

/**
 * Bốn thứ đáng khoá lại:
 *
 * 1. **Chuẩn hoá id hai phía trước khi so.** OpenAlex ghi `https://openalex.org/W1`, còn
 *    `external_id` đã bị cắt còn `W1`. Quên bước này thì **không cạnh nào khớp**, và đồ thị rỗng
 *    trông y hệt "các paper này không trích dẫn nhau" — một kết luận sai hoàn toàn.
 * 2. **Nguồn không phải OpenAlex trả `null`, không phải `[]`.** `null` = *không đọc được dữ liệu
 *    trích dẫn*; `[]` = *đọc được và nó không trích ai*. Nhập hai cái làm một là báo cáo sai
 *    `coverage`.
 * 3. **Chỉ dựng cạnh trong phạm vi tập nguồn của dự án** — không kéo về paper ngoài.
 * 4. **`raw` là `Json` nên có thể là bất cứ thứ gì** — hỏng kiểu thì bỏ qua, không làm sập.
 */

const src = (over: Partial<GraphSource> = {}): GraphSource => ({
  id: 's-1',
  external_id: 'W1',
  retrieved_from: 'OPENALEX',
  title: 'Paper 1',
  year: 2020,
  citation_count: 10,
  raw: { referenced_works: [] },
  ...over,
});

describe('referencesOf', () => {
  it('cắt tiền tố URL của OpenAlex để so được với external_id', () => {
    const s = src({
      raw: { referenced_works: ['https://openalex.org/W9', 'W8'] },
    });
    expect(referencesOf(s)).toEqual(['W9', 'W8']);
  });

  it('nguồn không phải OpenAlex trả null, KHÔNG phải mảng rỗng', () => {
    expect(
      referencesOf(src({ retrieved_from: 'SEMANTIC_SCHOLAR' })),
    ).toBeNull();
  });

  it('raw null hoặc không phải object thì trả null, không sập', () => {
    expect(referencesOf(src({ raw: null }))).toBeNull();
    expect(referencesOf(src({ raw: 'chuỗi lạ' }))).toBeNull();
    expect(referencesOf(src({ raw: 42 }))).toBeNull();
  });

  it('raw không có referenced_works thì trả null', () => {
    expect(referencesOf(src({ raw: { title: 'x' } }))).toBeNull();
  });

  it('referenced_works lẫn phần tử không phải chuỗi thì lọc bỏ, giữ phần còn lại', () => {
    const s = src({ raw: { referenced_works: ['W9', 123, null, 'W7'] } });
    expect(referencesOf(s)).toEqual(['W9', 'W7']);
  });

  it('OpenAlex trả referenced_works rỗng thì là [] — đọc được và không trích ai', () => {
    expect(referencesOf(src())).toEqual([]);
  });
});

describe('citationGraph', () => {
  it('dựng cạnh khi id khớp sau khi chuẩn hoá cả hai phía', () => {
    const g = citationGraph([
      src({
        id: 's-1',
        external_id: 'W1',
        raw: { referenced_works: ['https://openalex.org/W2'] },
      }),
      src({
        id: 's-2',
        external_id: 'https://openalex.org/W2',
        raw: { referenced_works: [] },
      }),
    ]);
    expect(g.edges).toEqual([{ from: 's-1', to: 's-2' }]);
  });

  it('bỏ tham chiếu tới paper NGOÀI tập nguồn của dự án', () => {
    const g = citationGraph([
      src({
        id: 's-1',
        external_id: 'W1',
        raw: { referenced_works: ['W999'] },
      }),
    ]);
    expect(g.edges).toEqual([]);
    // Vẫn tính là "có dữ liệu trích dẫn" — nó đọc được, chỉ là không trỏ vào ai trong tập.
    expect(g.coverage).toEqual({ with_refs: 1, total: 1 });
  });

  it('coverage phân biệt nguồn đọc được dữ liệu trích dẫn với nguồn không', () => {
    const g = citationGraph([
      src({ id: 's-1' }),
      src({
        id: 's-2',
        retrieved_from: 'SEMANTIC_SCHOLAR',
        external_id: 'p2',
        raw: {},
      }),
      src({ id: 's-3', external_id: 'W3', raw: { referenced_works: ['W1'] } }),
    ]);
    expect(g.coverage).toEqual({ with_refs: 2, total: 3 });
  });

  it('bỏ cạnh trỏ về chính nó', () => {
    const g = citationGraph([
      src({ id: 's-1', external_id: 'W1', raw: { referenced_works: ['W1'] } }),
    ]);
    expect(g.edges).toEqual([]);
  });

  it('id lặp trong referenced_works chỉ sinh một cạnh, in-degree không bị thổi', () => {
    const g = citationGraph([
      src({
        id: 's-1',
        external_id: 'W1',
        raw: { referenced_works: ['W2', 'W2', 'W2'] },
      }),
      src({ id: 's-2', external_id: 'W2' }),
    ]);
    expect(g.edges).toHaveLength(1);
    expect(g.most_cited[0]).toEqual({
      id: 's-2',
      title: 'Paper 1',
      in_degree: 1,
    });
  });

  it('xếp hạng nguồn được trích nhiều nhất TRONG tập, không theo citation_count toàn cầu', () => {
    const g = citationGraph([
      src({ id: 's-1', external_id: 'W1', raw: { referenced_works: ['W3'] } }),
      src({ id: 's-2', external_id: 'W2', raw: { referenced_works: ['W3'] } }),
      // Nổi tiếng toàn cầu nhưng không ai trong tập trích nó.
      src({
        id: 's-4',
        external_id: 'W4',
        citation_count: 99_999,
        title: 'Nổi tiếng',
      }),
      src({ id: 's-3', external_id: 'W3', title: 'Được trích trong tập' }),
    ]);
    expect(g.most_cited).toEqual([
      { id: 's-3', title: 'Được trích trong tập', in_degree: 2 },
    ]);
  });

  it('không nguồn nào thì trả đồ thị rỗng, không vỡ', () => {
    expect(citationGraph([])).toEqual({
      edges: [],
      coverage: { with_refs: 0, total: 0 },
      most_cited: [],
    });
  });

  it('mọi nguồn đều từ Semantic Scholar thì coverage bằng 0 — và đó KHÔNG phải "không ai trích ai"', () => {
    const g = citationGraph([
      src({ id: 's-1', retrieved_from: 'SEMANTIC_SCHOLAR', raw: {} }),
      src({ id: 's-2', retrieved_from: 'SEMANTIC_SCHOLAR', raw: {} }),
    ]);
    expect(g.coverage).toEqual({ with_refs: 0, total: 2 });
    expect(g.edges).toEqual([]);
  });
});
