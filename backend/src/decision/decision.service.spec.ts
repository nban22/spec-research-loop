import {
  applyChanges,
  DecisionService,
  OTHER_OPTION,
} from './decision.service';
import type { ReviseOutput } from '../contracts/llm-io/revise';

describe('DecisionService', () => {
  const prisma = {
    issueGroup: { findUniqueOrThrow: jest.fn() },
    decision: {
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    specVersion: { create: jest.fn(), findUnique: jest.fn() },
    specCard: { createMany: jest.fn() },
    cardSource: { findFirst: jest.fn(), update: jest.fn() },
  };
  const llm = { completeJson: jest.fn() };
  const spec = {
    buildSpecJson: jest.fn(),
    renderMarkdown: jest.fn(),
    buildMarkdown: jest.fn(),
  };
  const service = new DecisionService(
    prisma as never,
    llm as never,
    spec as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('includes OTHER_OPTION in optionsForIssueGroup', async () => {
    prisma.issueGroup.findUniqueOrThrow.mockResolvedValue({
      id: 'ig-1',
      canonical_title: 'Title',
      max_severity: 'HIGH',
      agreement_count: 2,
      judges_completed: 2,
      issues: [],
      spec_version: { id: 'v-1', project_id: 'p-1' },
    });
    spec.buildSpecJson.mockResolvedValue({ title: 'Spec' });
    llm.completeJson.mockResolvedValue({
      data: {
        question: 'Choose option',
        options: [
          { key: 'A', label: 'Option A', explain: 'Exp', example: 'Ex' },
        ],
      },
    });

    const result = await service.optionsForIssueGroup('ig-1');
    expect(result.question).toBe('Choose option');
    expect(result.options).toEqual([
      { key: 'A', label: 'Option A', explain: 'Exp', example: 'Ex' },
      OTHER_OPTION,
    ]);
  });

  it('rejects OTHER option without custom text', async () => {
    await expect(
      service.record('p-1', {
        chosenKey: 'OTHER',
        customText: '   ',
      }),
    ).rejects.toMatchObject({ code: 'OTHER_REASON_REQUIRED' });
  });

  it('rejects missing required inputs when creating decision without decisionId', async () => {
    await expect(
      service.record('p-1', {
        chosenKey: 'A',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rejects non-existent decisionId when recording', async () => {
    prisma.decision.findFirst.mockResolvedValue(null);
    await expect(
      service.record('p-1', {
        decisionId: 'd-missing',
        chosenKey: 'A',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects unknown decision options', async () => {
    prisma.decision.findFirst.mockResolvedValue({
      id: 'd-1',
      project_id: 'p-1',
      applied: false,
      options: [{ key: 'A', label: 'Option A' }],
    });

    await expect(
      service.record('p-1', {
        decisionId: 'd-1',
        chosenKey: 'INVALID_KEY',
      }),
    ).rejects.toMatchObject({ code: 'DECISION_OPTION_UNKNOWN' });
  });

  it('rejects updating an already applied decision', async () => {
    prisma.decision.findFirst.mockResolvedValue({
      id: 'd-1',
      project_id: 'p-1',
      applied: true,
      resulting_spec_version_id: 'v-2',
    });

    await expect(
      service.record('p-1', {
        decisionId: 'd-1',
        chosenKey: 'A',
      }),
    ).rejects.toMatchObject({ code: 'DECISION_ALREADY_APPLIED' });
  });

  it('creates and auto-applies a decision without an issue group', async () => {
    prisma.decision.create.mockResolvedValue({
      id: 'd-1',
      project_id: 'p-1',
      spec_version_id: 'v-1',
      step: 'S1',
      issue_group_id: null,
      options: [{ key: 'A', label: 'Option A' }],
      chosen_key: 'A',
    });
    prisma.decision.update.mockResolvedValue({ id: 'd-1', applied: true });
    prisma.decision.findUnique.mockResolvedValue({ id: 'd-1', applied: true });

    const result = await service.record('p-1', {
      specVersionId: 'v-1',
      step: 'S1',
      question: 'Question?',
      options: [{ key: 'A', label: 'Option A', explain: 'Exp', example: 'Ex' }],
      chosenKey: 'A',
    });

    expect(result.preview).toBeNull();
    expect(prisma.decision.create).toHaveBeenCalled();
  });

  it('lists pending decisions and retrieves a single decision', async () => {
    prisma.decision.findMany.mockResolvedValue([
      { id: 'd-1', project_id: 'p-1', chosen_key: '' },
    ]);
    prisma.decision.findUniqueOrThrow.mockResolvedValue({
      id: 'd-1',
      question: 'Q?',
      chosen_key: 'A',
    });

    const pending = await service.pending('p-1');
    const item = await service.get('d-1');

    expect(pending).toHaveLength(1);
    expect(item.id).toBe('d-1');
  });

  describe('gateDecision — bốn đường ra của verifier gate', () => {
    const pair = {
      id: 'cs-1',
      card: { id: 'c-1', title: 'Method generalises', spec_version_id: 'v-1' },
      source: { title: 'Some paper' },
    };

    beforeEach(() => {
      prisma.cardSource.findFirst.mockResolvedValue(pair);
      prisma.decision.create.mockResolvedValue({
        id: 'd-gate',
        project_id: 'p-1',
        spec_version_id: 'v-1',
        question: 'Q?',
        options: [],
        chosen_key: 'C',
        custom_text: null,
      });
      prisma.decision.findUnique.mockResolvedValue({ id: 'd-gate' });
      prisma.decision.findUniqueOrThrow.mockResolvedValue({ id: 'd-gate' });
      spec.buildMarkdown.mockResolvedValue('# before');
    });

    it('giữ nguyên trích dẫn mà không nêu lý do thì bị từ chối', async () => {
      await expect(
        service.gateDecision('p-1', {
          cardSourceId: 'cs-1',
          chosenKey: 'OTHER',
          customText: '  ',
        }),
      ).rejects.toMatchObject({ code: 'OTHER_REASON_REQUIRED' });
    });

    it('phương án ngoài bốn đường ra bị từ chối', async () => {
      await expect(
        service.gateDecision('p-1', {
          cardSourceId: 'cs-1',
          chosenKey: 'Z',
        }),
      ).rejects.toMatchObject({ code: 'DECISION_OPTION_UNKNOWN' });
    });

    it('hạ khẳng định xuống câu hỏi mở dựng được bản nháp mà KHÔNG gọi LLM', async () => {
      const res = await service.gateDecision('p-1', {
        cardSourceId: 'cs-1',
        chosenKey: 'C',
        actor: 'SCRIPTED',
      });

      // Đây là điều làm gate rẻ đủ để gọi là một cơ chế: nhánh được gợi ý tốn 0 token.
      expect(llm.completeJson).not.toHaveBeenCalled();
      expect(res.preview?.changes).toEqual([
        expect.objectContaining({
          operation: 'DEMOTE_TO_OPEN_QUESTION',
          target_card_title: 'Method generalises',
        }),
      ]);
      expect(prisma.decision.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'd-gate' } }),
      );
    });

    it('giữ nguyên kèm lý do thì ghi override_reason và không sinh version mới', async () => {
      const res = await service.gateDecision('p-1', {
        cardSourceId: 'cs-1',
        chosenKey: 'OTHER',
        customText: 'Tôi đã đọc bản đầy đủ của paper.',
      });

      expect(prisma.cardSource.update).toHaveBeenCalledWith({
        where: { id: 'cs-1' },
        data: { override_reason: 'Tôi đã đọc bản đầy đủ của paper.' },
      });
      // Không có gì thay đổi trong spec ⇒ không có bản nháp, không có version mới.
      expect(res.preview).toBeNull();
      expect(llm.completeJson).not.toHaveBeenCalled();
    });

    it('bản nháp của nhánh C nhắm đúng thẻ đang bị chặn', async () => {
      // Chống hồi quy cho lỗi im lặng nhất của nhánh này: nhắm sai `target_card_title` thì
      // `applyChanges` không khớp được thẻ nào, apply chạy "thành công" mà spec không đổi gì,
      // và gate chặn lại y nguyên ở vòng sau.
      const res = await service.gateDecision('p-1', {
        cardSourceId: 'cs-1',
        chosenKey: 'C',
      });
      const change = res.preview?.changes[0];
      expect(change?.target_card_title).toBe(pair.card.title);
      expect(change?.operation).toBe('DEMOTE_TO_OPEN_QUESTION');
    });

    it('không tìm thấy cặp của dự án khác thì trả 404', async () => {
      prisma.cardSource.findFirst.mockResolvedValue(null);
      await expect(
        service.gateDecision('p-1', { cardSourceId: 'cs-x', chosenKey: 'C' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });
});

describe('applyChanges — lineage của thẻ', () => {
  type InputCard = Parameters<typeof applyChanges>[0][number];

  const card = (id: string, title: string): InputCard => ({
    id,
    type: 'CLAIM',
    status: 'PROPOSED',
    title,
    body: `body of ${title}`,
    payload: null,
    origin: 'GENERATOR',
    order_index: 0,
  });

  const draft = (changes: ReviseOutput['changes']): ReviseOutput => ({
    summary: 'summary',
    changes,
  });

  it('thẻ bị đổi tiêu đề vẫn truy được về thẻ cũ, và bị đánh dấu cần kiểm lại', () => {
    // Đây đúng ca mà bản trước làm mất nguồn: nối bằng "title cũ == title mới" thì
    // thẻ này không khớp gì cả.
    const out = applyChanges(
      [card('c-1', 'Method generalises to all domains')],
      {
        ...draft([
          {
            target_card_title: 'Method generalises to all domains',
            operation: 'UPDATE',
            new_title: 'Method generalises to scientific papers',
            new_body: 'Narrowed claim.',
            rationale: 'J3 nói claim quá rộng',
          },
        ]),
      },
    );

    expect(out.cards[0].title).toBe('Method generalises to scientific papers');
    expect(out.parentIds).toEqual(['c-1']);
    expect([...out.touchedParentIds]).toEqual(['c-1']);
  });

  it('thẻ không bị change nào đụng thì không nằm trong touchedParentIds', () => {
    const out = applyChanges(
      [card('c-1', 'Kept claim'), card('c-2', 'Edited claim')],
      {
        ...draft([
          {
            target_card_title: 'Edited claim',
            operation: 'UPDATE',
            new_title: '',
            new_body: 'new body',
            rationale: '',
          },
        ]),
      },
    );

    expect(out.touchedParentIds.has('c-1')).toBe(false);
    expect(out.touchedParentIds.has('c-2')).toBe(true);
  });

  it('DELETE không làm lệch mảng lineage so với mảng thẻ', () => {
    const out = applyChanges(
      [
        card('c-1', 'Alpha claim'),
        card('c-2', 'Beta claim'),
        card('c-3', 'Gamma claim'),
      ],
      {
        ...draft([
          {
            target_card_title: 'Alpha claim',
            operation: 'DELETE',
            new_title: '',
            new_body: '',
            rationale: '',
          },
        ]),
      },
    );

    expect(out.cards).toHaveLength(2);
    expect(out.parentIds).toHaveLength(2);
    expect(out.cards.map((c) => c.title)).toEqual([
      'Beta claim',
      'Gamma claim',
    ]);
    // Lệch một ô ở đây nghĩa là nguồn của thẻ này bị gán sang thẻ khác.
    expect(out.parentIds).toEqual(['c-2', 'c-3']);
  });

  it('thẻ do ADD sinh ra không có cha nên không kế thừa nguồn nào', () => {
    const out = applyChanges([card('c-1', 'Existing claim')], {
      ...draft([
        {
          target_card_title: '',
          operation: 'ADD',
          new_type: 'OPEN_QUESTION',
          new_title: 'Does it hold for finance text?',
          new_body: 'Raised by J5.',
          rationale: '',
        },
      ]),
    });

    expect(out.cards).toHaveLength(2);
    expect(out.parentIds).toEqual(['c-1', null]);
    expect(out.touchedParentIds.size).toBe(0);
  });

  it('bản nháp của gate (nhánh C) khớp được thẻ mà nó nhắm tới', () => {
    // Ghép hai nửa lại: `gateDecision` dựng draft, `applyChanges` áp nó. Test riêng từng
    // nửa vẫn xanh khi tiêu đề hai bên lệch nhau, nên phải có một test đi qua cả hai.
    const out = applyChanges([card('c-1', 'Method generalises')], {
      ...draft([
        {
          target_card_title: 'Method generalises',
          operation: 'DEMOTE_TO_OPEN_QUESTION',
          new_title: '',
          new_body: '',
          rationale: 'citation does not support it',
        },
      ]),
    });

    expect(out.cards[0].type).toBe('OPEN_QUESTION');
    expect(out.touchedParentIds.has('c-1')).toBe(true);
  });

  it('DEMOTE_TO_OPEN_QUESTION cũng là sửa nội dung ⇒ phải kiểm lại chứng cứ', () => {
    const out = applyChanges([card('c-1', 'Overclaimed result')], {
      ...draft([
        {
          target_card_title: 'Overclaimed result',
          operation: 'DEMOTE_TO_OPEN_QUESTION',
          new_title: '',
          new_body: '',
          rationale: 'hạ xuống câu hỏi mở',
        },
      ]),
    });

    expect(out.cards[0].type).toBe('OPEN_QUESTION');
    expect([...out.touchedParentIds]).toEqual(['c-1']);
  });
});
