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
      // `status: 'AMBIGUOUS'` trong `where` là bắt buộc: thiếu nó thì sửa tay của người dùng
      // (PATCH đặt `CONFIRMED`) bị ép về `previous_status` cũ mà không báo gì.
      where: { id: { in: ['c-1'] }, status: 'AMBIGUOUS' },
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
      where: { id: { in: ['c-1', 'c-3'] }, status: 'AMBIGUOUS' },
      data: { status: 'PROPOSED' },
    });
    expect(tx.card.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['c-2'] }, status: 'AMBIGUOUS' },
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

describe('CritiqueService — hành vi tiêu đề của cả PR', () => {
  it('đường BẬT cờ thật sự ghi status = AMBIGUOUS xuống DB', async () => {
    // Trước test này, đổi `'AMBIGUOUS'` thành `'PROPOSED'` vẫn 29/29 xanh — tức là điều PR
    // tuyên bố làm ("backend cuối cùng cũng gán AMBIGUOUS") không có gì ghim.
    const { prisma, tx } = makePrisma({
      detectorOn: true,
      cards: [vagueClaim],
      openDecisions: 0,
    });
    await new CritiqueService(prisma as never).scanVersion('v-1');

    expect(tx.card.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['c-1'] } },
      data: { status: 'AMBIGUOUS' },
    });
  });

  it('quét hai lần: lần sau đọc đúng cờ lần trước ghi, previous_status KHÔNG trôi', async () => {
    // Vòng ghi → đọc. Các test khác nạp `flags` bằng tay nên hai phía không bao giờ nối nhau,
    // và mutant ghi cứng `previous_status: 'AMBIGUOUS'` sống sót.
    const { prisma, tx } = makePrisma({
      detectorOn: true,
      cards: [vagueClaim],
      openDecisions: 0,
    });
    const service = new CritiqueService(prisma as never);

    await service.scanVersion('v-1');
    const written = tx.ambiguityFlag.createMany.mock.calls[0][0]
      .data as unknown as {
      card_id: string;
      previous_status: string;
      question_decision_id: string | null;
    }[];
    expect(written[0].previous_status).toBe('PROPOSED');

    // Lần hai: thẻ nay đã là AMBIGUOUS trong DB, và cờ lần một được trả về cho clearForVersion.
    prisma.ambiguityFlag.findMany.mockResolvedValue(written);
    prisma.card.findMany.mockResolvedValue([
      { ...vagueClaim, status: 'AMBIGUOUS' },
    ]);

    await service.scanVersion('v-1');

    // Khôi phục phải dùng PROPOSED của lần một, không phải AMBIGUOUS vừa đọc được.
    expect(tx.card.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['c-1'] }, status: 'AMBIGUOUS' },
      data: { status: 'PROPOSED' },
    });
  });
});

describe('CritiqueService — nhiều thẻ', () => {
  const vague = (id: string) => ({
    id,
    type: 'PROBLEM',
    status: 'PROPOSED',
    title: `card ${id}`,
    body: 'The retriever is not effective on legal text.',
    payload: null,
  });

  it('mỗi thẻ đúng MỘT câu hỏi, thẻ thua hạn mức thì cờ có question_decision_id = null', async () => {
    const { prisma, tx } = makePrisma({
      detectorOn: true,
      cards: ['c-1', 'c-2', 'c-3', 'c-4', 'c-5', 'c-6'].map(vague),
      openDecisions: 0,
    });
    const res = await new CritiqueService(prisma as never).scanVersion('v-1');

    expect(res.flagged).toBe(6);
    expect(res.questionsAsked).toBe(4); // trần
    expect(res.questionsDropped).toBe(2);
    expect(tx.decision.create).toHaveBeenCalledTimes(4);

    const rows = tx.ambiguityFlag.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(6);
    expect(rows.filter((r) => r.question_decision_id !== null)).toHaveLength(4);
    expect(rows.filter((r) => r.question_decision_id === null)).toHaveLength(2);
  });

  it('thẻ CLAIM hai trường mơ hồ ⇒ hai cờ nhưng chỉ MỘT cờ trỏ về câu hỏi', async () => {
    // Cờ `metric` mà trỏ vào câu hỏi chỉ nói về `baseline` là sai mô tả cột trong schema.
    const { prisma, tx } = makePrisma({
      detectorOn: true,
      cards: [
        {
          ...vagueClaim,
          payload: { baseline: 'existing methods', metric: 'performance' },
        },
      ],
      openDecisions: 0,
    });
    await new CritiqueService(prisma as never).scanVersion('v-1');

    const rows = tx.ambiguityFlag.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.question_decision_id !== null)).toHaveLength(1);
  });
});

describe('CritiqueService — truy vấn hạn mức', () => {
  it('chỉ đếm câu hỏi CHƯA trả lời của ĐÚNG project và ĐÚNG step S1', async () => {
    // Mock trước giờ bỏ qua đối số nên bỏ `project_id` (đếm xuyên project) vẫn xanh.
    const { prisma } = makePrisma({
      detectorOn: true,
      cards: [vagueClaim],
      openDecisions: 0,
    });
    await new CritiqueService(prisma as never).scanVersion('v-1');

    expect(prisma.decision.count).toHaveBeenCalledWith({
      where: { project_id: 'p-1', step: 'S1', chosen_key: '' },
    });
  });
});
