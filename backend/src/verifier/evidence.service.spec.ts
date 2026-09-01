import { EvidenceService } from './evidence.service';

/**
 * Thứ được khoá ở đây là **ranh giới giữa "chưa kiểm" và "kiểm rồi, yếu"**.
 *
 * `CardSource.support_label` có mặc định `WEAK` ngay từ lúc generator tạo cặp, nên một phiên bản
 * spec vừa sinh xong đã có sẵn một bảng toàn WEAK trong khi verifier chưa chạy lần nào. Tín hiệu
 * thật duy nhất là `verifier_run_id`, và ba hệ quả của nó phải đúng cùng lúc:
 *
 * 1. `summary` **chỉ** đếm cặp đã kiểm — nếu không thì "chưa đo" bị báo cáo thành "đo rồi, yếu".
 * 2. `unverified` đếm phần còn lại, và tổng hai thứ bằng số cặp.
 * 3. `layer` là `null` cho cặp chưa kiểm — `decidingLayer` vẫn trả về một tầng nghe hợp lý trên
 *    dữ liệu toàn `null`, và trang giải trình sẽ khẳng định một tầng đã quyết định cái nhãn mà
 *    thật ra không tầng nào từng chạm vào.
 */
describe('EvidenceService.trace — cặp chưa qua verifier', () => {
  const prisma = {
    verifierRun: { findFirst: jest.fn() },
    cardSource: { findMany: jest.fn() },
    verifierPassage: { findMany: jest.fn() },
    sourceScore: { findMany: jest.fn() },
  };

  const service = new EvidenceService(prisma as never);

  const card = { id: 'c-1', title: 'Claim', type: 'CLAIM', status: 'PROPOSED' };
  const source = {
    id: 's-1',
    title: 'Paper',
    year: 2024,
    doi: null,
    url: null,
    venue: null,
  };

  const row = (over: Record<string, unknown>) => ({
    id: 'cs-1',
    source_id: 's-1',
    card,
    source,
    support_label: 'WEAK',
    verifier_run_id: null,
    similarity: null,
    entailment: null,
    confidence: null,
    evidence_sentence: null,
    flags: null,
    ...over,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.verifierRun.findFirst.mockResolvedValue(null);
    prisma.verifierPassage.findMany.mockResolvedValue([]);
    prisma.sourceScore.findMany.mockResolvedValue([]);
  });

  it('không đếm cặp chưa kiểm vào summary, và tổng luôn khớp số cặp', async () => {
    prisma.cardSource.findMany.mockResolvedValue([
      row({ id: 'cs-1' }),
      row({ id: 'cs-2' }),
      row({
        id: 'cs-3',
        verifier_run_id: 'vr-1',
        support_label: 'SUPPORTED',
        similarity: 0.81,
      }),
    ]);

    const out = await service.trace('v-1');

    expect(out.summary).toEqual({ SUPPORTED: 1, WEAK: 0, UNSUPPORTED: 0 });
    expect(out.unverified).toBe(2);
    const counted =
      Object.values(out.summary).reduce((a, b) => a + b, 0) + out.unverified;
    expect(counted).toBe(out.pairs.length);
  });

  it('cặp chưa kiểm không được gán tầng, và nói thẳng WEAK là mặc định của DB', async () => {
    prisma.cardSource.findMany.mockResolvedValue([row({})]);

    const [pair] = (await service.trace('v-1')).pairs;

    expect(pair.verified).toBe(false);
    expect(pair.layer).toBeNull();
    expect(pair.layer_why).toMatch(/mặc định của cơ sở dữ liệu/);
  });

  it('cặp đã kiểm vẫn suy ra tầng như cũ', async () => {
    prisma.cardSource.findMany.mockResolvedValue([
      row({
        verifier_run_id: 'vr-1',
        support_label: 'SUPPORTED',
        similarity: 0.81,
        flags: [],
      }),
    ]);

    const [pair] = (await service.trace('v-1')).pairs;

    expect(pair.verified).toBe(true);
    expect(pair.layer).not.toBeNull();
    expect(pair.layer_why.length).toBeGreaterThan(0);
  });
});
