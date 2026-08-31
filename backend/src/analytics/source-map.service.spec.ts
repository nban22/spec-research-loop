import { SourceMapService } from './source-map.service';

/**
 * Bốn thứ đáng khoá lại:
 *
 * 1. **Không ghi DB** — mock ném lỗi nếu ai gọi `create`/`update`/`delete`.
 * 2. **Dự án của người khác trả 404**, không 403 (backend/CLAUDE.md §5).
 * 3. **Timeline không điền khoảng trống**, và cột "không rõ năm" luôn nằm cuối.
 * 4. **Bản đồ không vỡ khi thiếu dữ liệu** — không nguồn nào, hoặc nguồn không có abstract.
 */
describe('SourceMapService', () => {
  type SourceRow = {
    id: string;
    title: string;
    abstract: string | null;
    year: number | null;
    venue: string | null;
    citation_count: number | null;
    doi_verified: boolean | null;
    _count: { card_sources: number };
  };

  const src = (over: Partial<SourceRow> = {}): SourceRow => ({
    id: 's-1',
    title: 'Neural machine translation with attention',
    abstract:
      'We propose an attention based neural translation model for low resource pairs.',
    year: 2020,
    venue: 'ACL',
    citation_count: 120,
    doi_verified: true,
    _count: { card_sources: 1 },
    ...over,
  });

  const build = (sources: SourceRow[], projectFound = true) => {
    const forbidden = () => {
      throw new Error('analytics KHÔNG được ghi DB');
    };
    const prisma = {
      project: {
        findFirst: jest
          .fn<Promise<unknown>, [{ where: { id: string; user_id: string } }]>()
          .mockResolvedValue(projectFound ? { id: 'p-1' } : null),
        create: forbidden,
        update: forbidden,
        delete: forbidden,
      },
      source: {
        findMany: jest
          .fn<Promise<SourceRow[]>, []>()
          .mockResolvedValue(sources),
        create: forbidden,
        update: forbidden,
        updateMany: forbidden,
        deleteMany: forbidden,
      },
    };
    return { prisma, service: new SourceMapService(prisma as never) };
  };

  it('trả 404 khi project thuộc user khác', async () => {
    const { service } = build([], false);
    await expect(service.sourceMap('p-1', 'u-khac')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('lọc theo user_id chứ không tin id truyền vào', async () => {
    const { prisma, service } = build([]);
    await service.sourceMap('p-1', 'u-1');
    expect(prisma.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p-1', user_id: 'u-1' } }),
    );
  });

  it('dự án chưa có nguồn nào thì trả bản đồ rỗng, không vỡ', async () => {
    const { service } = build([]);
    await expect(service.sourceMap('p-1', 'u-1')).resolves.toEqual({
      nodes: [],
      timeline: [],
      weak_text_count: 0,
    });
  });

  it('không gọi một lệnh ghi nào', async () => {
    const { service } = build([
      src(),
      src({ id: 's-2', title: 'Bridge crack detection' }),
    ]);
    await expect(service.sourceMap('p-1', 'u-1')).resolves.toBeDefined();
  });

  it('đếm cited_by từ số CardSource, và timeline đếm riêng nguồn đang được trích', async () => {
    const { service } = build([
      src({ id: 's-1', year: 2019, _count: { card_sources: 0 } }),
      src({ id: 's-2', year: 2019, _count: { card_sources: 2 } }),
      src({ id: 's-3', year: 2023, _count: { card_sources: 1 } }),
    ]);
    const map = await service.sourceMap('p-1', 'u-1');

    expect(map.nodes.map((n) => n.cited_by)).toEqual([0, 2, 1]);
    // 2019 có 2 nguồn nhưng chỉ 1 đang được trích; năm 2020–2022 không chèn cột rỗng.
    expect(map.timeline).toEqual([
      { year: 2019, count: 2, cited: 1 },
      { year: 2023, count: 1, cited: 1 },
    ]);
  });

  it('nguồn không rõ năm gom vào cột riêng ở cuối trục', async () => {
    const { service } = build([
      src({ id: 's-1', year: null }),
      src({ id: 's-2', year: 2021 }),
      src({ id: 's-3', year: null }),
    ]);
    const map = await service.sourceMap('p-1', 'u-1');
    expect(map.timeline).toEqual([
      { year: 2021, count: 1, cited: 1 },
      { year: null, count: 2, cited: 2 },
    ]);
  });

  it('đếm nguồn thiếu abstract để cảnh báo bản đồ mỏng', async () => {
    const { service } = build([
      src({ id: 's-1', abstract: null }),
      src({ id: 's-2', abstract: 'quá ngắn' }),
      src({ id: 's-3' }),
    ]);
    const map = await service.sourceMap('p-1', 'u-1');
    expect(map.weak_text_count).toBe(2);
  });

  it('nguồn lạc chủ đề có sparsity cao nhất và không nhận nearest bừa', async () => {
    const { service } = build([
      src({
        id: 's-1',
        title: 'Neural machine translation attention',
        abstract: null,
      }),
      src({
        id: 's-2',
        title: 'Attention neural translation transformer',
        abstract: null,
      }),
      src({
        id: 's-3',
        title: 'Concrete bridge crack drone survey',
        abstract: null,
      }),
    ]);
    const map = await service.sourceMap('p-1', 'u-1');
    const byId = Object.fromEntries(map.nodes.map((n) => [n.id, n]));

    expect(byId['s-3'].sparsity).toBeGreaterThan(byId['s-1'].sparsity);
    expect(byId['s-1'].nearest?.id).toBe('s-2');
    // Không chung một từ khoá nào với ai ⇒ thà không hiện còn hơn hiện một cái tên ngẫu nhiên.
    expect(byId['s-3'].nearest).toBeNull();
  });

  it('cùng dữ liệu cho cùng toạ độ giữa hai lần gọi', async () => {
    const rows = [
      src({ id: 's-1', title: 'Neural machine translation attention' }),
      src({ id: 's-2', title: 'Attention transformer translation' }),
      src({ id: 's-3', title: 'Concrete bridge crack drone survey' }),
    ];
    const first = await build(rows).service.sourceMap('p-1', 'u-1');
    const second = await build(rows).service.sourceMap('p-1', 'u-1');
    expect(first.nodes.map((n) => [n.x, n.y])).toEqual(
      second.nodes.map((n) => [n.x, n.y]),
    );
  });
});
