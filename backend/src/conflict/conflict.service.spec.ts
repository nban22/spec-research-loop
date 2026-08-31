import { ConflictService } from './conflict.service';

/**
 * Mock Prisma viết tay theo khuôn `critique.service.spec.ts` — không dựng `Test.createTestingModule`.
 * Chỉ mock đúng những bảng service này chạm tới.
 */
function makePrisma() {
  const state = {
    conflicts: [] as Record<string, unknown>[],
    cards: new Map<string, { id: string; title: string; status: string }>(),
    updates: [] as { id: string; data: Record<string, unknown> }[],
    updateMany: [] as { ids: string[]; data: Record<string, unknown> }[],
    deleted: 0,
  };

  const tx = {
    card: {
      update: jest.fn(({ where, data }: never) => {
        const w = where as unknown as { id: string };
        const d = data as unknown as Record<string, unknown>;
        state.updates.push({ id: w.id, data: d });
        const card = state.cards.get(w.id);
        if (card) card.status = String(d.status);
        return Promise.resolve({});
      }),
      updateMany: jest.fn(({ where, data }: never) => {
        const w = where as unknown as { id: { in: string[] } };
        state.updateMany.push({
          ids: w.id.in,
          data: data,
        });
        return Promise.resolve({ count: w.id.in.length });
      }),
    },
    cardConflict: {
      create: jest.fn(({ data }: never) => {
        state.conflicts.push(data);
        return Promise.resolve(data);
      }),
      deleteMany: jest.fn(() => {
        state.deleted += 1;
        state.conflicts = [];
        return Promise.resolve({ count: 0 });
      }),
    },
  };

  const prisma = {
    project: { findUnique: jest.fn() },
    cardSource: { findMany: jest.fn() },
    cardConflict: {
      findMany: jest.fn(() => Promise.resolve([])),
      count: jest.fn(),
      update: jest.fn(),
    },
    card: { findMany: jest.fn() },
    source: { findMany: jest.fn() },
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<void>) => fn(tx)),
  };

  return { prisma, tx, state };
}

const CARD_A = {
  id: 'card-a',
  title: 'Hybrid retrieval helps',
  status: 'PROPOSED',
};
const CARD_B = {
  id: 'card-b',
  title: 'Dense retrieval hurts',
  status: 'PROPOSED',
};

function unit(over: Record<string, unknown> = {}) {
  return {
    id: 'cs-1',
    card_id: CARD_A.id,
    source_id: 'src-1',
    support_label: 'WEAK',
    entailment: null,
    evidence_sentence: null,
    card: { ...CARD_A },
    source: { id: 'src-1', title: 'Paper 1', abstract: '' },
    ...over,
  };
}

describe('ConflictService', () => {
  it('tắt cờ thì dọn dấu vết của lần bật trước rồi mới dừng', async () => {
    const { prisma, state } = makePrisma();
    prisma.project.findUnique.mockResolvedValue({ conflict_detector: false });
    prisma.cardConflict.findMany.mockResolvedValue([
      { card_id: CARD_A.id, previous_status: 'PROPOSED' },
    ]);
    const service = new ConflictService(prisma as never, {} as never);

    const res = await service.scanVersion('v-1', 'p-1');

    expect(res.enabled).toBe(false);
    // Không chỉ return: phải khôi phục trạng thái và xoá cờ, nếu không ablation bị nhiễm.
    expect(state.updateMany[0].data).toMatchObject({
      status: 'PROPOSED',
      conflict_with_card_id: null,
    });
    expect(state.deleted).toBe(1);
    expect(prisma.cardSource.findMany).not.toHaveBeenCalled();
  });

  it('gán CONFLICT cho thẻ có hai nguồn chỏi nhau, không tốn lời gọi LLM nào', async () => {
    const { prisma, state } = makePrisma();
    prisma.project.findUnique.mockResolvedValue({ conflict_detector: true });
    prisma.cardSource.findMany.mockResolvedValue([
      unit({
        id: 'cs-1',
        source_id: 'src-1',
        support_label: 'SUPPORTED',
        source: {
          id: 'src-1',
          title: 'P1',
          abstract: 'Hybrid retrieval outperforms BM25.',
        },
      }),
      unit({
        id: 'cs-2',
        source_id: 'src-2',
        entailment: 'CONTRADICTS',
        source: {
          id: 'src-2',
          title: 'P2',
          abstract: 'Hybrid retrieval does not outperform BM25.',
        },
      }),
    ]);
    const llm = { completeJson: jest.fn() };
    const service = new ConflictService(prisma as never, llm as never);

    const res = await service.scanVersion('v-1', 'p-1');

    expect(res.intraCard).toBe(1);
    expect(res.llmCalls).toBe(0);
    expect(llm.completeJson).not.toHaveBeenCalled();
    expect(state.conflicts[0]).toMatchObject({
      scope: 'INTRA_CARD',
      signal: 'POLARITY',
      previous_status: 'PROPOSED',
      other_card_id: null,
    });
    expect(state.updates[0].data).toMatchObject({ status: 'CONFLICT' });
  });

  it('ghi conflict_with_card_id lên **cả hai** thẻ khi chúng dùng chung một bài báo ngược cực', async () => {
    const { prisma, state } = makePrisma();
    prisma.project.findUnique.mockResolvedValue({ conflict_detector: true });
    prisma.cardSource.findMany.mockResolvedValue([
      unit({
        id: 'cs-1',
        card_id: CARD_A.id,
        source_id: 'shared',
        support_label: 'SUPPORTED',
        card: { ...CARD_A },
        source: { id: 'shared', title: 'Shared paper', abstract: 'x' },
      }),
      unit({
        id: 'cs-2',
        card_id: CARD_B.id,
        source_id: 'shared',
        entailment: 'CONTRADICTS',
        card: { ...CARD_B },
        source: { id: 'shared', title: 'Shared paper', abstract: 'x' },
      }),
    ]);
    const service = new ConflictService(
      prisma as never,
      {
        completeJson: jest.fn(),
      } as never,
    );

    const res = await service.scanVersion('v-1', 'p-1');

    expect(res.crossCard).toBe(1);
    expect(state.conflicts[0]).toMatchObject({ scope: 'CROSS_CARD' });
    // Cột `conflict_with_card_id` trước issue này chưa bao giờ được ghi — đây là chỗ ghi nó.
    const byCard = new Map(state.updates.map((u) => [u.id, u.data]));
    expect(byCard.get(CARD_A.id)).toMatchObject({
      status: 'CONFLICT',
      conflict_with_card_id: CARD_B.id,
    });
    expect(byCard.get(CARD_B.id)).toMatchObject({
      status: 'CONFLICT',
      conflict_with_card_id: CARD_A.id,
    });
  });

  it('không gán gì khi các nguồn không chỏi nhau', async () => {
    const { prisma, state } = makePrisma();
    prisma.project.findUnique.mockResolvedValue({ conflict_detector: true });
    prisma.cardSource.findMany.mockResolvedValue([
      unit({ id: 'cs-1', source_id: 'src-1', support_label: 'SUPPORTED' }),
      unit({ id: 'cs-2', source_id: 'src-2', support_label: 'SUPPORTED' }),
    ]);
    const service = new ConflictService(
      prisma as never,
      {
        completeJson: jest.fn(),
      } as never,
    );

    const res = await service.scanVersion('v-1', 'p-1');

    expect(res.intraCard + res.crossCard).toBe(0);
    expect(state.conflicts).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });

  it('vùng xám mới hỏi LLM, và LLM nói không mâu thuẫn thì không gán cờ', async () => {
    const { prisma, state } = makePrisma();
    prisma.project.findUnique.mockResolvedValue({ conflict_detector: true });
    prisma.cardSource.findMany.mockResolvedValue([
      unit({
        id: 'cs-1',
        source_id: 'src-1',
        source: {
          id: 'src-1',
          title: 'P1',
          abstract: 'The method improves recall@50 by 12% on legal statutes.',
        },
      }),
      unit({
        id: 'cs-2',
        source_id: 'src-2',
        source: {
          id: 'src-2',
          title: 'P2',
          abstract: 'The method reduces recall@50 by 4% on legal statutes.',
        },
      }),
    ]);
    const llm = {
      completeJson: jest.fn().mockResolvedValue({
        data: {
          verdict: 'NOT_ENTAILED',
          confidence: 0.9,
          evidence_sentence: null,
          reason: '',
        },
      }),
    };
    const service = new ConflictService(prisma as never, llm as never);

    const res = await service.scanVersion('v-1', 'p-1');

    expect(llm.completeJson).toHaveBeenCalledTimes(1);
    // Prompt riêng, không dùng lại `verifier_entailment` — nếu không thì token của bộ này
    // lẫn vào token L4 trong bảng chi phí.
    const [call] = llm.completeJson.mock.calls as [{ promptId: string }][];
    expect(call[0]).toMatchObject({ promptId: 'conflict_pair' });
    expect(res.intraCard).toBe(0);
    expect(state.conflicts).toHaveLength(0);
  });

  it('LLM hỏng thì bỏ qua cặp đó chứ không khẳng định có mâu thuẫn', async () => {
    const { prisma, state } = makePrisma();
    prisma.project.findUnique.mockResolvedValue({ conflict_detector: true });
    prisma.cardSource.findMany.mockResolvedValue([
      unit({
        id: 'cs-1',
        source_id: 'src-1',
        source: {
          id: 'src-1',
          title: 'P1',
          abstract: 'The method improves recall@50 by 12% on legal statutes.',
        },
      }),
      unit({
        id: 'cs-2',
        source_id: 'src-2',
        source: {
          id: 'src-2',
          title: 'P2',
          abstract: 'The method reduces recall@50 by 4% on legal statutes.',
        },
      }),
    ]);
    const llm = { completeJson: jest.fn().mockRejectedValue(new Error('502')) };
    const service = new ConflictService(prisma as never, llm as never);

    const res = await service.scanVersion('v-1', 'p-1');

    expect(res.intraCard).toBe(0);
    expect(state.conflicts).toHaveLength(0);
  });
});
