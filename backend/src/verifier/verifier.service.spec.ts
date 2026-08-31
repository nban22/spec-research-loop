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

  const service = new VerifierService(
    prisma as never,
    embedder as never,
    llm as never,
    sourceClient as never,
    conflict as never,
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
        card: { id: 'c-1', title: 'Claim Title', body: 'Claim text' },
        source: {
          id: 's-1',
          title: 'Source Title',
          abstract: 'Short abstract text.',
          doi: null,
          doi_verified: null,
        },
      },
    ]);

    prisma.verifierRun.create.mockResolvedValue({ id: 'vr-1' });
    prisma.card.findMany.mockResolvedValue([]);

    embedder.embed.mockResolvedValue([0.1, 0.2, 0.3]);

    const result = await service.verifySpecVersion('v-1');

    expect(result.verifierRunId).toBe('vr-1');
    expect(result.unitsTotal).toBe(1);
    expect(prisma.verifierRun.create).toHaveBeenCalled();
    expect(prisma.verifierRun.update).toHaveBeenCalled();
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
