import { AnalyticsService } from './analytics.service';

/**
 * Ba thứ đáng khoá lại bằng test ở module này:
 *
 * 1. **Không ghi DB.** Ràng buộc trung tâm của issue #17 — kiểm bằng cách để mock ném lỗi nếu
 *    có ai gọi `create`/`update`/`delete`.
 * 2. **Chi phí tính đúng công thức** và dùng **cùng đơn giá** với bộ ước lượng, nếu không thì
 *    con số "sai số ước lượng" đo lẫn cả chênh đơn giá.
 * 3. **Mẫu số 0 trả `null`, không trả `NaN`/`Infinity`.** Dự án chưa chạy lời gọi nào là
 *    trường hợp thường gặp nhất khi vừa tạo.
 */
describe('AnalyticsService', () => {
  const call = (over: Partial<Record<string, unknown>> = {}) => ({
    purpose: 'DECOMPOSE',
    model: 'deepseek-v4-pro',
    prompt_id: 'generator',
    prompt_tokens: 1_000_000,
    completion_tokens: 1_000_000,
    cache_hit_tokens: 0,
    cache_miss_tokens: 0,
    latency_ms: 100,
    attempts: 1,
    ok: true,
    ...over,
  });

  const build = (rows: unknown[], estimate: unknown = null) => {
    const forbidden = () => {
      throw new Error('analytics KHÔNG được ghi DB');
    };
    /* Khai kiểu tường minh cho mock: `jest.fn()` trần cho ra `any`, mà `backend/CLAUDE.md` §3
       cấm `any` — thu hẹp từ `unknown` thì test cũng phải theo luật đó. */
    const findFirst = jest
      .fn<Promise<unknown>, [{ where: { id: string; user_id: string } }]>()
      .mockResolvedValue({
        id: 'p-1',
        title: 'Dự án thử',
        current_spec_version_id: 'v-1',
      });
    const prisma = {
      project: {
        findFirst,
        create: forbidden,
        update: forbidden,
        delete: forbidden,
      },
      llmCall: {
        findMany: jest.fn().mockResolvedValue(rows),
        create: forbidden,
        createMany: forbidden,
        update: forbidden,
        deleteMany: forbidden,
      },
      resourceEstimate: {
        findUnique: jest.fn().mockResolvedValue(estimate),
        upsert: forbidden,
        update: forbidden,
      },
    };
    return {
      prisma,
      service: new AnalyticsService(prisma as never),
    };
  };

  it('tính chi phí đúng đơn giá của bộ ước lượng (0.28 vào / 0.42 ra mỗi 1M token)', async () => {
    const { service } = build([call()]);
    const out = await service.costOverview('p-1', 'u-1');
    // 1M prompt × 0.28 + 1M completion × 0.42 = 0.70
    expect(out.totals.cost_usd).toBeCloseTo(0.7, 6);
    expect(out.totals.total_tokens).toBe(2_000_000);
  });

  it('gom theo bước, giữ thứ tự B1→B5 chứ không sắp theo tiền', async () => {
    const { service } = build([
      call({
        purpose: 'JUDGE',
        prompt_tokens: 10_000_000,
        completion_tokens: 0,
      }),
      call({ purpose: 'DECOMPOSE', prompt_tokens: 1000, completion_tokens: 0 }),
    ]);
    const out = await service.costOverview('p-1', 'u-1');
    // B4 tốn nhiều tiền hơn nhưng B1 vẫn phải đứng trước.
    expect(out.by_step.map((b) => b.key)).toEqual([
      'S1 · Paraphrase & decompose',
      'S4 · Judges & spec fixes',
    ]);
  });

  it('đếm lần thử lại và lời gọi hỏng', async () => {
    const { service } = build([
      call({ attempts: 3 }),
      call({ ok: false }),
      call(),
    ]);
    const out = await service.costOverview('p-1', 'u-1');
    expect(out.totals.retried_calls).toBe(1);
    expect(out.totals.failed_calls).toBe(1);
    expect(out.reliability.retry_ratio).toBeCloseTo(1 / 3, 6);
    expect(out.reliability.failure_ratio).toBeCloseTo(1 / 3, 6);
  });

  it('tỉ lệ ăn cache tính trên hit + miss', async () => {
    const { service } = build([
      call({ cache_hit_tokens: 300, cache_miss_tokens: 700 }),
    ]);
    const out = await service.costOverview('p-1', 'u-1');
    expect(out.cache.hit_ratio).toBeCloseTo(0.3, 6);
  });

  it('không có lời gọi nào thì trả null chứ không NaN', async () => {
    const { service } = build([]);
    const out = await service.costOverview('p-1', 'u-1');
    expect(out.totals.calls).toBe(0);
    expect(out.cache.hit_ratio).toBeNull();
    expect(out.reliability.retry_ratio).toBeNull();
    expect(out.reliability.failure_ratio).toBeNull();
  });

  it('so ước lượng với thực tế; dự toán bằng 0 thì tỉ lệ là null, không phải Infinity', async () => {
    const { service } = build([call()], { cost_usd: 0, tokens_est: 0 });
    const out = await service.costOverview('p-1', 'u-1');
    expect(out.estimate_vs_actual?.diff_usd).toBeCloseTo(0.7, 6);
    expect(out.estimate_vs_actual?.diff_ratio).toBeNull();
  });

  it('có dự toán thì tính được tỉ lệ sai số', async () => {
    const { service } = build([call()], { cost_usd: 0.5, tokens_est: 1000 });
    const out = await service.costOverview('p-1', 'u-1');
    expect(out.estimate_vs_actual?.estimated_usd).toBe(0.5);
    expect(out.estimate_vs_actual?.diff_ratio).toBeCloseTo(
      (0.7 - 0.5) / 0.5,
      6,
    );
  });

  it('dự án của người khác trả notFound, không phải forbidden', async () => {
    const { prisma, service } = build([]);
    prisma.project.findFirst.mockResolvedValue(null);
    await expect(service.costOverview('p-1', 'u-khac')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('mọi truy vấn đều mang user_id, không tin projectId từ URL', async () => {
    const { prisma, service } = build([]);
    await service.costOverview('p-1', 'u-1');
    const where = prisma.project.findFirst.mock.calls[0][0].where;
    expect(where.id).toBe('p-1');
    expect(where.user_id).toBe('u-1');
  });
});
