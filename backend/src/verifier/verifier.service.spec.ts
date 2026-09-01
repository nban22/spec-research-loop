import { decideLabel, VerifierService } from './verifier.service';

describe('VerifierService', () => {
  const prisma = {
    cardSource: { findMany: jest.fn(), update: jest.fn() },
    verifierRun: { create: jest.fn(), update: jest.fn() },
    card: { update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
    source: { update: jest.fn() },
  };

  const embedder = { embed: jest.fn() };
  const llm = { completeJson: jest.fn() };
  const sourceClient = { verifyDoi: jest.fn() };
  // #3 — bộ phát hiện xung đột chỉ chạy khi `opts.projectId` có mặt. Test này gọi
  // `verifySpecVersion('v-1')` không kèm opts, nên hai hàm dưới không bao giờ bị chạm;
  // vẫn mock cho đủ arity thay vì dựa vào chỗ hở đó.
  const conflict = { clearForVersion: jest.fn(), scanVersion: jest.fn() };
  // #2 — cùng lý do: `isEnabled` chỉ được gọi khi có `opts.projectId`.
  const fulltext = { isEnabled: jest.fn(), beginRun: jest.fn() };

  const service = new VerifierService(
    prisma as never,
    embedder as never,
    llm as never,
    sourceClient as never,
    conflict as never,
    fulltext as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('verifies spec version and stores verifierRun results', async () => {
    prisma.cardSource.findMany.mockResolvedValue([
      {
        id: 'cs-1',
        card_id: 'c-1',
        source_id: 's-1',
        // `type` là bắt buộc: nó quyết định cặp có được hỏi bằng phép kéo theo hay không
        // (`ENTAILMENT_CARD_TYPES`). Thiếu nó thì `undefined` rơi vào nhánh "không kéo theo"
        // và test này xanh vì một lý do khác hẳn lý do ta nghĩ.
        card: {
          id: 'c-1',
          type: 'CLAIM',
          title: 'Claim Title',
          body: 'Claim text',
        },
        source: {
          id: 's-1',
          title: 'Source Title',
          // `external_id` rỗng ⇒ L0 trả UNSUPPORTED ngay và cả pipeline không chạy. Fixture cũ
          // thiếu nó nên test này xanh mà chưa bao giờ đi qua nổi tầng đầu tiên.
          external_id: 's2-1',
          // Đủ dài để không dính `EMPTY_ABSTRACT`, nếu không cờ đó hạ trần và đường tắt L3
          // không bao giờ chạy.
          abstract:
            'Hybrid retrieval improves recall on legal corpora. '.repeat(6),
          doi: null,
          doi_verified: null,
        },
      },
    ]);

    prisma.verifierRun.create.mockResolvedValue({ id: 'vr-1' });
    prisma.card.findMany.mockResolvedValue([]);

    // Một vector cho MỖI đầu vào (1 khẳng định + n câu của abstract), tất cả giống hệt nhau
    // ⇒ cosine = 1, vượt `tau_high` ⇒ đường tắt L3, không gọi mô hình.
    embedder.embed.mockImplementation((texts: string[]) =>
      Promise.resolve(texts.map(() => new Float32Array([1, 0, 0]))),
    );

    const result = await service.verifySpecVersion('v-1');

    expect(result.verifierRunId).toBe('vr-1');
    expect(result.unitsTotal).toBe(1);
    expect(prisma.verifierRun.create).toHaveBeenCalled();
    expect(prisma.verifierRun.update).toHaveBeenCalled();
    // Thẻ CLAIM phải đi tới tầng nhúng — không có dòng này thì nhánh cắt theo loại thẻ có
    // bắn nhầm cả CLAIM cũng không ai biết.
    expect(embedder.embed).toHaveBeenCalled();
    expect(result.results[0].label).toBe('SUPPORTED');
    expect(result.results[0].flags).not.toContain('CITATION_ONLY');
  });

  /**
   * GAP khẳng định một sự vắng mặt, CONTRIBUTION khẳng định việc tác giả sắp làm — không tóm
   * tắt đơn lẻ nào kéo theo được hai thứ đó. Đo trên dữ liệu thật của dự án: 0/315 cặp GAP và
   * 0/130 cặp CONTRIBUTION từng đạt SUPPORTED, trong khi CLAIM có 4/67.
   *
   * Ba tính chất phải đúng cùng lúc, và tính chất thứ ba là chỗ tiết kiệm thật: hai loại thẻ
   * này chiếm 445/512 cặp của cả dự án, nên bỏ L3–L4 cho chúng là bỏ phần lớn chi phí LLM.
   */
  it.each(['GAP', 'CONTRIBUTION'])(
    'thẻ %s dừng sau L2: WEAK + CITATION_ONLY, không nhúng, không gọi mô hình',
    async (cardType) => {
      prisma.cardSource.findMany.mockResolvedValue([
        {
          id: 'cs-1',
          card_id: 'c-1',
          source_id: 's-1',
          card: {
            id: 'c-1',
            type: cardType,
            title: 'No prior work evaluates X',
            body: 'No retrieved work evaluates a cross-encoder reranker on Vietnamese statutes.',
          },
          source: {
            id: 's-1',
            title: 'Source Title',
            abstract: 'A'.repeat(400),
            doi: null,
            doi_verified: null,
            external_id: 's2-1',
          },
        },
      ]);
      prisma.verifierRun.create.mockResolvedValue({ id: 'vr-1' });
      prisma.card.findMany.mockResolvedValue([]);

      const result = await service.verifySpecVersion('v-1');

      expect(result.results[0].label).toBe('WEAK');
      expect(result.results[0].flags).toContain('CITATION_ONLY');
      expect(result.results[0].entailment).toBeNull();
      expect(result.results[0].similarity).toBeNull();
      expect(result.unitsL4).toBe(0);
      expect(embedder.embed).not.toHaveBeenCalled();
      expect(llm.completeJson).not.toHaveBeenCalled();
    },
  );

  it('nguồn không tra ra vẫn UNSUPPORTED kể cả với thẻ GAP — L0 chạy trước', async () => {
    // Chốt chặn theo loại thẻ đặt SAU L0–L2 chính là để giữ tuyến chống bịa trích dẫn này.
    prisma.cardSource.findMany.mockResolvedValue([
      {
        id: 'cs-1',
        card_id: 'c-1',
        source_id: 's-1',
        card: { id: 'c-1', type: 'GAP', title: 'Gap', body: 'No prior work.' },
        source: {
          id: 's-1',
          title: 'Bịa',
          abstract: 'A'.repeat(400),
          doi: null,
          doi_verified: null,
          external_id: '',
        },
      },
    ]);
    prisma.verifierRun.create.mockResolvedValue({ id: 'vr-1' });
    prisma.card.findMany.mockResolvedValue([]);

    const result = await service.verifySpecVersion('v-1');

    expect(result.results[0].label).toBe('UNSUPPORTED');
    expect(result.results[0].flags).toEqual(['SOURCE_NOT_FOUND']);
  });

  it('getVerification aggregates cardSource pairs and support label counts', async () => {
    prisma.cardSource.findMany.mockResolvedValue([
      {
        id: 'cs-1',
        support_label: 'SUPPORTED',
        similarity: 0.9,
        entailment: 'ENTAILS',
        confidence: 0.95,
        evidence_sentence: 'Evidence',
        flags: [],
        card: {
          id: 'c-1',
          title: 'Card 1',
          type: 'PROBLEM',
          status: 'CONFIRMED',
        },
        source: {
          id: 's-1',
          title: 'Source 1',
          year: 2024,
          doi: '10.1/1',
          url: null,
          venue: 'NeurIPS',
        },
      },
      {
        id: 'cs-2',
        support_label: 'UNSUPPORTED',
        similarity: 0.1,
        entailment: 'NOT_ENTAILED',
        confidence: 0.2,
        evidence_sentence: null,
        flags: ['ABSTRACT_SHORT'],
        card: {
          id: 'c-2',
          title: 'Card 2',
          type: 'PROBLEM',
          status: 'UNVERIFIED',
        },
        source: {
          id: 's-2',
          title: 'Source 2',
          year: 2023,
          doi: null,
          url: null,
          venue: null,
        },
      },
    ]);

    const result = await service.getVerification('v-1');
    expect(result.pairs).toHaveLength(2);
    expect(result.summary).toEqual({ SUPPORTED: 1, WEAK: 0, UNSUPPORTED: 1 });
  });

  describe('decideLabel', () => {
    const th = { conf_min: 0.7, sim_min: 0.6, abs_min_words: 30 };

    it('returns UNSUPPORTED for CONTRADICTS or NOT_ENTAILED', () => {
      expect(
        decideLabel({
          verdict: 'CONTRADICTS',
          confidence: 0.9,
          capWeak: false,
          th,
        }),
      ).toBe('UNSUPPORTED');
      expect(
        decideLabel({
          verdict: 'NOT_ENTAILED',
          confidence: 0.9,
          capWeak: false,
          th,
        }),
      ).toBe('UNSUPPORTED');
    });

    it('returns WEAK when capWeak is true or verdict is PARTIAL', () => {
      expect(
        decideLabel({ verdict: 'ENTAILS', confidence: 0.9, capWeak: true, th }),
      ).toBe('WEAK');
      expect(
        decideLabel({
          verdict: 'PARTIAL',
          confidence: 0.9,
          capWeak: false,
          th,
        }),
      ).toBe('WEAK');
    });

    it('returns WEAK when ENTAILS has low confidence', () => {
      expect(
        decideLabel({
          verdict: 'ENTAILS',
          confidence: 0.5,
          capWeak: false,
          th,
        }),
      ).toBe('WEAK');
    });

    it('returns SUPPORTED for high confidence ENTAILS without weak caps', () => {
      expect(
        decideLabel({
          verdict: 'ENTAILS',
          confidence: 0.95,
          capWeak: false,
          th,
        }),
      ).toBe('SUPPORTED');
    });
  });
});
