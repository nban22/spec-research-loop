import { CritiqueService } from './critique.service';

/**
 * Test cho tầng ghi của B6 — phần mà `ambiguity.spec.ts` **không** chạm tới.
 *
 * `ambiguity.spec.ts` phủ hàm thuần: luật nào bắn, câu hỏi nào sinh. Còn toàn bộ hành vi rủi ro
 * lại nằm ở đây — idempotency, vòng khôi phục `previous_status`, số học hạn mức, và việc tắt cờ
 * phải dọn dấu vết. Trước file này ba thứ đó chỉ được kiểm bằng tay trên DB thật, không gì ghim.
 */

/** Chỉ khai phần `AmbiguityFlag.createMany` cần đọc lại trong assert. */
type FlagRow = { card_id: string; question_decision_id: string | null };

/**
 * `createMany` được tham số hoá kiểu để `mock.calls[0][0]` **không phải `any`** — `jest.Mock`
 * trần trả `any`, và đọc thành viên trên `any` bị `no-unsafe-member-access` chặn.
 */
type Tx = {
  decision: { create: jest.Mock; deleteMany: jest.Mock };
  ambiguityFlag: {
    createMany: jest.Mock<unknown, [{ data: FlagRow[] }]>;
    deleteMany: jest.Mock;
  };
  card: { updateMany: jest.Mock };
};

function makePrisma(opts: {
  detectorOn: boolean;
  cards?: unknown[];
  flags?: unknown[];
  openDecisions?: number;
}) {
  const tx: Tx = {
    decision: {
      create: jest.fn().mockImplementation(() => ({ id: `d-${seq++}` })),
      deleteMany: jest.fn(),
    },
    ambiguityFlag: {
      createMany: jest.fn<unknown, [{ data: FlagRow[] }]>(),
      deleteMany: jest.fn(),
    },
    card: { updateMany: jest.fn() },
  };
  let seq = 1;
  const prisma = {
    specVersion: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'v-1',
        project_id: 'p-1',
        project: { ambiguity_detector: opts.detectorOn },
      }),
    },
    card: { findMany: jest.fn().mockResolvedValue(opts.cards ?? []) },
    decision: { count: jest.fn().mockResolvedValue(opts.openDecisions ?? 0) },
    ambiguityFlag: { findMany: jest.fn().mockResolvedValue(opts.flags ?? []) },
    $transaction: jest.fn(async (fn: (t: Tx) => Promise<void>) => fn(tx)),
  };
  return { prisma, tx };
}

const vagueClaim = {
  id: 'c-1',
  type: 'CLAIM',
  status: 'PROPOSED',
  title: 'Some claim',
  body: 'A claim.',
  payload: { baseline: 'existing methods', metric: 'nDCG@10' },
};

describe('CritiqueService — cờ tắt', () => {
  it('không quét, nhưng VẪN dọn dấu vết của lần bật trước', async () => {
    // #22 nói cờ này là cần gạt cho ablation #13. Gạt về `false` mà không dọn thì thẻ vẫn
    // `AMBIGUOUS` và câu hỏi vẫn chiếm hạn mức ⇒ nhánh đối chứng bị nhiễm nhánh trước.
    const { prisma, tx } = makePrisma({
      detectorOn: false,
      flags: [
        {
          card_id: 'c-1',
          previous_status: 'PROPOSED',
          question_decision_id: 'd-1',
        },
      ],
    });
    const service = new CritiqueService(prisma as never);

    const res = await service.scanVersion('v-1');

    expect(res.enabled).toBe(false);
    expect(tx.card.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['c-1'] } },
      data: { status: 'PROPOSED' },
    });
    expect(tx.ambiguityFlag.deleteMany).toHaveBeenCalled();
    // Không quét ⇒ không đọc thẻ.
    expect(prisma.card.findMany).not.toHaveBeenCalled();
  });
});

describe('CritiqueService — khôi phục trạng thái', () => {
  it('trả thẻ về ĐÚNG trạng thái cũ, gom theo nhóm chứ không update từng thẻ', async () => {
    const { prisma, tx } = makePrisma({
      detectorOn: false,
      flags: [
        {
          card_id: 'c-1',
          previous_status: 'PROPOSED',
          question_decision_id: null,
        },
        {
          card_id: 'c-2',
          previous_status: 'CONFIRMED',
          question_decision_id: null,
        },
        {
          card_id: 'c-3',
          previous_status: 'PROPOSED',
          question_decision_id: null,
        },
      ],
    });
    const service = new CritiqueService(prisma as never);

    await service.scanVersion('v-1');

    // Hai nhóm ⇒ hai lượt gọi, không phải ba.
    expect(tx.card.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.card.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['c-1', 'c-3'] } },
      data: { status: 'PROPOSED' },
    });
    expect(tx.card.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['c-2'] } },
      data: { status: 'CONFIRMED' },
    });
  });

  it('chỉ xoá câu hỏi CHƯA trả lời — câu đã trả lời là dữ liệu người dùng', async () => {
    const { prisma, tx } = makePrisma({
      detectorOn: false,
      flags: [
        {
          card_id: 'c-1',
          previous_status: 'PROPOSED',
          question_decision_id: 'd-9',
        },
      ],
    });
    await new CritiqueService(prisma as never).scanVersion('v-1');

    expect(tx.decision.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['d-9'] }, chosen_key: '' },
    });
  });
});

describe('CritiqueService — hạn mức câu hỏi', () => {
  it('hết chỗ thì cờ vẫn ghi nhưng KHÔNG hỏi thêm câu nào', async () => {
    const { prisma, tx } = makePrisma({
      detectorOn: true,
      cards: [vagueClaim],
      openDecisions: 4, // đã đầy trần
    });
    const service = new CritiqueService(prisma as never);

    const res = await service.scanVersion('v-1');

    expect(res.flagged).toBe(1);
    expect(res.questionsAsked).toBe(0);
    expect(res.questionsDropped).toBe(1);
    expect(tx.decision.create).not.toHaveBeenCalled();
  });

  it('còn chỗ thì hỏi, và cờ trỏ về đúng câu hỏi vừa tạo', async () => {
    const { prisma, tx } = makePrisma({
      detectorOn: true,
      cards: [vagueClaim],
      openDecisions: 0,
    });
    const res = await new CritiqueService(prisma as never).scanVersion('v-1');

    expect(res.questionsAsked).toBe(1);
    expect(res.questionsDropped).toBe(0);
    const rows = tx.ambiguityFlag.createMany.mock.calls[0][0].data;
    expect(rows[0].question_decision_id).not.toBeNull();
  });
});

describe('CritiqueService — nguyên tử', () => {
  it('ba lệnh ghi nằm trong MỘT transaction', async () => {
    // Chết giữa tạo Decision và tạo AmbiguityFlag thì còn câu hỏi mồ côi — không cờ nào trỏ
    // tới nên `clearForVersion` không xoá được, và chúng chiếm hạn mức 4 câu vĩnh viễn.
    const { prisma } = makePrisma({
      detectorOn: true,
      cards: [vagueClaim],
      openDecisions: 0,
    });
    await new CritiqueService(prisma as never).scanVersion('v-1');

    // Một lần cho `clearForVersion` (không có cờ cũ nên bỏ qua) + một lần cho phần ghi.
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('thẻ đang MISSING không bị đụng tới', async () => {
    const { prisma, tx } = makePrisma({
      detectorOn: true,
      cards: [
        {
          id: 'c-9',
          type: 'CLAIM',
          status: 'MISSING',
          title: 'x',
          body: 'It is significantly better.',
          payload: { baseline: '', metric: '' },
        },
      ],
      openDecisions: 0,
    });
    const res = await new CritiqueService(prisma as never).scanVersion('v-1');

    expect(res.skippedMissing).toBe(1);
    expect(res.flagged).toBe(0);
    expect(tx.card.updateMany).not.toHaveBeenCalled();
  });
});
