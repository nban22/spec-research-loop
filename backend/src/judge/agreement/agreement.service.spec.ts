import { AgreementService } from './agreement.service';

/**
 * Tầng đọc–ghi của B3. Trước file này nó có **0 test**, và mutation testing cho thấy xoá thẳng
 * lời gọi `recompute` ở cuối `runRound`, hoặc bỏ `orderBy` của `groupRound`, vẫn để suite xanh.
 *
 * Bốn hành vi ở đây đều là loại "sai thì sai vĩnh viễn", vì bản ghi được lưu và trước đây không
 * có đường sửa.
 */

type Row = Record<string, unknown>;

/**
 * Mock được **tham số hoá kiểu** để `mock.calls[0][0]` không phải `any` — `jest.fn()` trần trả
 * `any`, và đọc thành viên trên `any` bị `no-unsafe-member-access` chặn.
 */
type UpsertArg = { create: Row; update: Row };
type WhereArg = { where: Row };

function makePrisma(opts: {
  flagOn?: boolean;
  rounds?: { round: number }[];
  saved?: Row | null;
  cards?: { id: string }[];
  issues?: unknown[];
  runs?: { judge_key: string }[];
}) {
  const upsert = jest.fn<unknown, [UpsertArg]>();
  const prisma = {
    specVersion: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        project: { judge_agreement: opts.flagOn ?? true },
      }),
    },
    judgeRun: {
      findFirst: jest
        .fn<Promise<unknown>, [WhereArg]>()
        .mockResolvedValue(opts.rounds?.[0] ?? null),
      findMany: jest
        .fn<Promise<unknown>, [WhereArg]>()
        .mockResolvedValue(opts.runs ?? []),
    },
    card: { findMany: jest.fn().mockResolvedValue(opts.cards ?? []) },
    issue: { findMany: jest.fn().mockResolvedValue(opts.issues ?? []) },
    judgeAgreement: {
      findUnique: jest.fn().mockResolvedValue(opts.saved ?? null),
      upsert,
    },
    // `$transaction` nhận **mảng** promise ở `compute`; gọi thật để đường ghi chạy.
    $transaction: jest.fn<Promise<unknown[]>, [Promise<unknown>[]]>((ops) =>
      Promise.all(ops),
    ),
  };
  return { prisma, upsert };
}

const savedRow = (over: Row = {}): Row => ({
  raters: 5,
  items: 11,
  kappa: 0.18,
  reason: null,
  unanimous: false,
  degenerate: null,
  coverage: 1,
  matrix: {},
  patterns: {
    solo: [],
    bias: [],
    leaveOneOut: [],
    unanimousGroups: 1,
    raters: ['J1'],
  },
  ...over,
});

describe('AgreementService — cờ chỉ gác HIỂN THỊ', () => {
  it('cờ tắt ⇒ enabled false, KHÔNG trả số, và không đọc gì thêm', async () => {
    const { prisma } = makePrisma({ flagOn: false });
    const res = await new AgreementService(prisma as never).forDisplay('v-1');

    expect(res).toEqual({ enabled: false, agreement: null });
    // Không đi tìm vòng — cờ tắt là dừng ngay.
    expect(prisma.judgeRun.findFirst).not.toHaveBeenCalled();
  });

  it('cờ bật ⇒ trả bản đã lưu, computed = false', async () => {
    const { prisma } = makePrisma({
      flagOn: true,
      rounds: [{ round: 2 }],
      saved: savedRow(),
    });
    const res = await new AgreementService(prisma as never).forDisplay('v-1');

    expect(res.enabled).toBe(true);
    expect(res.agreement?.round).toBe(2);
    expect(res.agreement?.computed).toBe(false);
    expect(res.agreement?.kappa.kappa).toBe(0.18);
  });
});

describe('AgreementService — đường ĐỌC không được ghi đè', () => {
  it('chưa có bản ghi ⇒ chỉ ĐIỀN VÀO CHỖ TRỐNG (update rỗng)', async () => {
    // Lost update thật: job judge tạo JudgeRun dần dần nên `latestRound` đã trả về N trước khi
    // `groupRound` chạy. Một GET rơi vào lúc đó tính ra báo cáo KHÔNG có nhóm nào rồi ghi xuống,
    // đè lên bản đầy đủ mà `runRound` vừa chốt.
    const { prisma, upsert } = makePrisma({
      rounds: [{ round: 1 }],
      saved: null,
      runs: [{ judge_key: 'J1' }, { judge_key: 'J2' }],
      cards: [{ id: 'c1' }, { id: 'c2' }],
      issues: [],
    });
    await new AgreementService(prisma as never).forDisplay('v-1');

    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = upsert.mock.calls[0][0];
    expect(arg.update).toEqual({});
  });

  it('recomputeLatest thì GHI ĐÈ — đây là đường sửa bản ghi lỗi thời', async () => {
    const { prisma, upsert } = makePrisma({
      rounds: [{ round: 1 }],
      saved: savedRow(),
      runs: [{ judge_key: 'J1' }, { judge_key: 'J2' }],
      cards: [{ id: 'c1' }, { id: 'c2' }],
      issues: [],
    });
    const res = await new AgreementService(prisma as never).recomputeLatest(
      'v-1',
    );

    expect(res?.computed).toBe(true);
    const arg = upsert.mock.calls[0][0];
    expect(Object.keys(arg.update).length).toBeGreaterThan(0);
    // Không đọc bản đã lưu — tính lại từ dữ liệu gốc.
    expect(prisma.judgeAgreement.findUnique).not.toHaveBeenCalled();
  });
});

describe('AgreementService — chọn vòng', () => {
  it('CHỈ nhận vòng có ít nhất một judge OK', async () => {
    // Vòng mà cả 5 judge đều FAILED không đo được gì. Nhận nó thì một lượt GET ghi vĩnh viễn
    // `raters=0` làm bản ghi chính thức, mà vòng đó lại không chạy lại được.
    const { prisma } = makePrisma({ rounds: [{ round: 1 }] });
    await new AgreementService(prisma as never).forDisplay('v-1');

    const where = prisma.judgeRun.findFirst.mock.calls[0][0].where;
    expect(where).toEqual({ spec_version_id: 'v-1', status: 'OK' });
  });

  it('không vòng nào OK ⇒ agreement null, không ghi gì', async () => {
    const { prisma, upsert } = makePrisma({ rounds: [] });
    const res = await new AgreementService(prisma as never).forDisplay('v-1');

    expect(res.agreement).toBeNull();
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('AgreementService — đọc dữ liệu', () => {
  it('người chấm lấy từ JudgeRun status OK, không suy từ judge_keys của nhóm', async () => {
    const { prisma } = makePrisma({
      rounds: [{ round: 1 }],
      runs: [{ judge_key: 'J1' }, { judge_key: 'J2' }],
      cards: [{ id: 'c1' }, { id: 'c2' }],
      issues: [],
    });
    await new AgreementService(prisma as never).forDisplay('v-1');

    const where = prisma.judgeRun.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      spec_version_id: 'v-1',
      round: 1,
      status: 'OK',
    });
  });

  it('ba lệnh đọc nằm trong MỘT transaction — ảnh chụp không bị xé', async () => {
    const { prisma } = makePrisma({
      rounds: [{ round: 1 }],
      runs: [{ judge_key: 'J1' }],
      cards: [{ id: 'c1' }],
      issues: [],
    });
    await new AgreementService(prisma as never).forDisplay('v-1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction.mock.calls[0][0].length).toBe(3);
  });

  it('coverage lấy mẫu số là TỔNG issue, kể cả issue chưa gắn thẻ', async () => {
    const { prisma, upsert } = makePrisma({
      rounds: [{ round: 1 }],
      runs: [{ judge_key: 'J1' }, { judge_key: 'J2' }],
      cards: [{ id: 'c1' }, { id: 'c2' }],
      issues: [
        {
          severity: 'MAJOR',
          target_card_id: 'c1',
          issue_group_id: 'g1',
          judge_run: { judge_key: 'J1' },
        },
        {
          severity: 'MAJOR',
          target_card_id: null,
          issue_group_id: 'g1',
          judge_run: { judge_key: 'J2' },
        },
      ],
    });
    await new AgreementService(prisma as never).forDisplay('v-1');

    const created = upsert.mock.calls[0][0].create;
    expect(created.coverage).toBeCloseTo(0.5, 10);
  });

  it('mức từng judge lấy NẶNG NHẤT khi một judge nêu hai issue cùng nhóm', async () => {
    const { prisma, upsert } = makePrisma({
      rounds: [{ round: 1 }],
      runs: [{ judge_key: 'J1' }, { judge_key: 'J2' }],
      cards: [{ id: 'c1' }, { id: 'c2' }],
      issues: [
        {
          severity: 'MINOR',
          target_card_id: 'c1',
          issue_group_id: 'g1',
          judge_run: { judge_key: 'J1' },
        },
        {
          severity: 'CRITICAL',
          target_card_id: 'c1',
          issue_group_id: 'g1',
          judge_run: { judge_key: 'J1' },
        },
        {
          severity: 'CRITICAL',
          target_card_id: 'c1',
          issue_group_id: 'g1',
          judge_run: { judge_key: 'J2' },
        },
      ],
    });
    await new AgreementService(prisma as never).forDisplay('v-1');

    const created = upsert.mock.calls[0][0].create;
    const patterns = created.patterns as { bias: { bias: number | null }[] };
    // Cả hai judge đều CRITICAL cho nhóm ⇒ không ai lệch.
    expect(patterns.bias.every((b) => b.bias === 0 || b.bias === null)).toBe(
      true,
    );
  });
});

describe('AgreementService — dữ liệu lưu lệch hình', () => {
  it('patterns lệch hình ⇒ hiện thiếu nhưng KHÔNG nổ', async () => {
    const { prisma } = makePrisma({
      rounds: [{ round: 1 }],
      saved: savedRow({ patterns: { rác: true } }),
    });
    const res = await new AgreementService(prisma as never).forDisplay('v-1');

    expect(res.agreement?.solo).toEqual([]);
    expect(res.agreement?.raters).toEqual([]);
    // κ vẫn đọc được vì nó là cột riêng, không nằm trong Json.
    expect(res.agreement?.kappa.kappa).toBe(0.18);
  });

  it('reason lạ trong DB ⇒ null, không lọt ra ngoài thành union sai', async () => {
    const { prisma } = makePrisma({
      rounds: [{ round: 1 }],
      saved: savedRow({ kappa: null, reason: 'CHUYỆN_GÌ_ĐÂY' }),
    });
    const res = await new AgreementService(prisma as never).forDisplay('v-1');
    expect(res.agreement?.kappa.reason).toBeNull();
  });
});
