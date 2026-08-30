import { ErrorAnalysisService } from './error-analysis.service';

/**
 * Bốn thứ đáng khoá lại:
 *
 * 1. **Không ghi DB** — mock ném lỗi nếu ai gọi `create`/`update`/`delete`.
 * 2. **Bảng cờ đếm lần xuất hiện, không phân hoạch** — một cặp mang nhiều cờ thì được đếm ở
 *    nhiều dòng, và điều đó là đúng. Bảng nhãn thì ngược lại: tổng phải bằng số cặp.
 * 3. **`Json` được thu hẹp, không ép kiểu** — `flags` hỏng kiểu thì bỏ qua, không làm sập.
 * 4. **Mẫu số 0 trả `null`**, không `NaN`.
 */
describe('ErrorAnalysisService', () => {
  const pair = (over: Partial<Record<string, unknown>> = {}) => ({
    support_label: 'WEAK',
    flags: [],
    override_reason: null,
    card: { type: 'CLAIM' },
    ...over,
  });

  const run = (over: Partial<Record<string, unknown>> = {}) => ({
    id: 'r-1',
    created_at: new Date('2026-08-01T00:00:00Z'),
    config: { tau_low: 0.35, tau_high: 0.72, conf_min: 0.7 },
    units_total: 10,
    units_l4: 9,
    label_counts: { SUPPORTED: 2, WEAK: 5, UNSUPPORTED: 3 },
    spec_version: { id: 'v-1', version_no: 1 },
    ...over,
  });

  const build = (runs: unknown[], pairs: unknown[]) => {
    const forbidden = () => {
      throw new Error('analytics KHÔNG được ghi DB');
    };
    const findFirst = jest
      .fn<Promise<unknown>, [{ where: { id: string; user_id: string } }]>()
      .mockResolvedValue({
        id: 'p-1',
        title: 'Dự án thử',
        current_spec_version_id: 'v-1',
      });
    const prisma = {
      project: { findFirst, create: forbidden, update: forbidden },
      verifierRun: {
        findMany: jest.fn().mockResolvedValue(runs),
        create: forbidden,
        update: forbidden,
      },
      cardSource: {
        findMany: jest.fn().mockResolvedValue(pairs),
        create: forbidden,
        update: forbidden,
        updateMany: forbidden,
        deleteMany: forbidden,
      },
    };
    return { prisma, service: new ErrorAnalysisService(prisma as never) };
  };

  it('bảng cờ đếm LẦN XUẤT HIỆN — một cặp nhiều cờ được đếm ở nhiều dòng', async () => {
    const { service } = build(
      [],
      [
        pair({
          flags: ['STALE_SOURCE', 'DOI_UNVERIFIED'],
          card: { type: 'GAP' },
        }),
      ],
    );
    const out = await service.errorAnalysis('p-1', 'u-1');
    const stale = out.current.flag_by_card_type.find(
      (f) => f.flag === 'STALE_SOURCE',
    );
    const doi = out.current.flag_by_card_type.find(
      (f) => f.flag === 'DOI_UNVERIFIED',
    );
    expect(stale?.by_type.GAP).toBe(1);
    expect(doi?.by_type.GAP).toBe(1);
    // Một cặp, hai cờ ⇒ tổng các ô là 2 chứ không phải 1. Đó là bảng đếm, không phải phân hoạch.
    const sum = out.current.flag_by_card_type.reduce((a, f) => a + f.total, 0);
    expect(sum).toBe(2);
    expect(out.current.pairs_total).toBe(1);
  });

  it('luôn đủ 7 dòng cờ kể cả khi chưa cờ nào xuất hiện', async () => {
    const { service } = build([], [pair()]);
    const out = await service.errorAnalysis('p-1', 'u-1');
    expect(out.current.flag_by_card_type).toHaveLength(7);
    expect(out.current.flag_by_card_type.every((f) => f.total === 0)).toBe(
      true,
    );
  });

  it('bảng nhãn là phân hoạch — tổng bằng đúng số cặp', async () => {
    const { service } = build(
      [],
      [
        pair({ support_label: 'SUPPORTED', card: { type: 'CLAIM' } }),
        pair({ support_label: 'UNSUPPORTED', card: { type: 'CLAIM' } }),
        pair({ support_label: 'UNSUPPORTED', card: { type: 'GAP' } }),
      ],
    );
    const out = await service.errorAnalysis('p-1', 'u-1');
    const sum = out.current.label_by_card_type.reduce((a, l) => a + l.total, 0);
    expect(sum).toBe(3);
    const uns = out.current.label_by_card_type.find(
      (l) => l.label === 'UNSUPPORTED',
    );
    expect(uns?.by_type).toEqual({ CLAIM: 1, GAP: 1 });
  });

  it('flags sai kiểu thì bỏ qua, không làm sập', async () => {
    const { service } = build(
      [],
      [
        pair({ flags: 'khong-phai-mang' }),
        pair({ flags: null }),
        pair({ flags: [1, 2] }),
      ],
    );
    const out = await service.errorAnalysis('p-1', 'u-1');
    expect(out.current.flag_by_card_type.every((f) => f.total === 0)).toBe(
      true,
    );
  });

  it('mỗi lần chạy giữ ngưỡng của chính nó — đó là thứ làm việc so sánh có nghĩa', async () => {
    const { service } = build(
      [
        run({ id: 'r-1', config: { tau_low: 0.35, tau_high: 0.72 } }),
        run({
          id: 'r-2',
          config: { tau_low: 0.3, tau_high: 0.68 },
          label_counts: { SUPPORTED: 6, WEAK: 3, UNSUPPORTED: 1 },
          units_l4: 4,
        }),
      ],
      [],
    );
    const out = await service.errorAnalysis('p-1', 'u-1');
    expect(out.runs).toHaveLength(2);
    expect(out.runs[0].thresholds.tau_high).toBe(0.72);
    expect(out.runs[1].thresholds.tau_high).toBe(0.68);
    // Hạ ngưỡng ⇒ ít unit rơi xuống tầng L4 hơn, và ít UNSUPPORTED hơn.
    expect(out.runs[0].l4_ratio).toBeCloseTo(0.9, 6);
    expect(out.runs[1].l4_ratio).toBeCloseTo(0.4, 6);
    expect(out.runs[0].unsupported_ratio).toBeCloseTo(0.3, 6);
    expect(out.runs[1].unsupported_ratio).toBeCloseTo(0.1, 6);
  });

  it('units_total = 0 thì l4_ratio là null chứ không NaN', async () => {
    const { service } = build(
      [run({ units_total: 0, units_l4: 0, label_counts: {} })],
      [],
    );
    const out = await service.errorAnalysis('p-1', 'u-1');
    expect(out.runs[0].l4_ratio).toBeNull();
    expect(out.runs[0].unsupported_ratio).toBeNull();
    expect(out.runs[0].label_counts).toEqual({
      SUPPORTED: 0,
      WEAK: 0,
      UNSUPPORTED: 0,
    });
  });

  it('đếm số cặp người dùng đã ghi đè lý do ở verifier gate', async () => {
    const { service } = build(
      [],
      [pair({ override_reason: 'giữ lại, bằng chứng còn yếu' }), pair()],
    );
    const out = await service.errorAnalysis('p-1', 'u-1');
    expect(out.current.overridden).toBe(1);
  });

  it('dự án của người khác trả notFound, không phải forbidden', async () => {
    const { prisma, service } = build([], []);
    prisma.project.findFirst.mockResolvedValue(null);
    await expect(service.errorAnalysis('p-1', 'u-khac')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('mọi truy vấn đều mang user_id, không tin projectId từ URL', async () => {
    const { prisma, service } = build([], []);
    await service.errorAnalysis('p-1', 'u-1');
    const where = prisma.project.findFirst.mock.calls[0][0].where;
    expect(where.id).toBe('p-1');
    expect(where.user_id).toBe('u-1');
  });
});
