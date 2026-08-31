import { decidingLayer } from './layer-trace';
import { ReplayInput, replayLabel } from './replay';
import { DEFAULT_THRESHOLDS, VerifierThresholds } from './thresholds';

const TH = DEFAULT_THRESHOLDS;

function pair(over: Partial<ReplayInput> = {}): ReplayInput {
  return {
    similarity: 0.5,
    entailment: null,
    confidence: null,
    flags: [],
    ...over,
  };
}

describe('chấm lại nhãn ở bộ ngưỡng khác', () => {
  it('dưới tau_low thì không có nguồn hỗ trợ, bất kể L4 nói gì', () => {
    const r = replayLabel(
      pair({ similarity: 0.2, entailment: 'ENTAILS', confidence: 0.99 }),
      TH,
    );
    expect(r.label).toBe('UNSUPPORTED');
  });

  it('vượt tau_high và không cờ thì kết luận luôn, không cần L4', () => {
    const r = replayLabel(pair({ similarity: 0.9 }), TH);
    expect(r.label).toBe('SUPPORTED');
  });

  it('cờ cảnh báo thuần không chặn đường tắt L3', () => {
    // STALE_SOURCE và DOI_UNVERIFIED cố ý không hạ nhãn — đúng như verifyUnit làm.
    const r = replayLabel(
      pair({ similarity: 0.9, flags: ['STALE_SOURCE', 'DOI_UNVERIFIED'] }),
      TH,
    );
    expect(r.label).toBe('SUPPORTED');
  });

  it('cờ thiếu số liệu hạ trần xuống mức yếu dù mô hình nói ENTAILS', () => {
    const r = replayLabel(
      pair({
        similarity: 0.6,
        entailment: 'ENTAILS',
        confidence: 0.95,
        flags: ['NUMBER_NOT_IN_SOURCE'],
      }),
      TH,
    );
    expect(r.label).toBe('WEAK');
  });

  it('báo không tái lập được khi ngưỡng mới đòi L4 mà lần chạy cũ chưa gọi', () => {
    // Đây là giới hạn thật của cách replay, và calibrate.ts phải in nó ra thành một cột.
    const wider: VerifierThresholds = { ...TH, tau_high: 0.95 };
    const r = replayLabel(pair({ similarity: 0.9, entailment: null }), wider);
    expect(r.label).toBeNull();
    expect(r.why).toBe('NO_L4_DATA');
  });

  it('đổi ngưỡng thì đổi nhãn — nếu không thì cả việc hiệu chỉnh là vô nghĩa', () => {
    const p = pair({ similarity: 0.75 });
    expect(replayLabel(p, { ...TH, tau_high: 0.72 }).label).toBe('SUPPORTED');
    expect(replayLabel(p, { ...TH, tau_high: 0.8 }).why).toBe('NO_L4_DATA');
  });

  it('nguồn không tồn tại và LLM chết đều cho kết quả cố định', () => {
    expect(replayLabel(pair({ flags: ['SOURCE_NOT_FOUND'] }), TH).label).toBe(
      'UNSUPPORTED',
    );
    expect(replayLabel(pair({ flags: ['LLM_UNAVAILABLE'] }), TH).label).toBe(
      'WEAK',
    );
  });
});

describe('truy tầng đã quyết định nhãn', () => {
  const trace = (over: Parameters<typeof decidingLayer>[0]) =>
    decidingLayer(over, TH);

  it('nguồn không tra ra được thì dừng ở L0', () => {
    expect(
      trace({
        similarity: null,
        entailment: null,
        flags: ['SOURCE_NOT_FOUND'],
        hasPassages: false,
      }).layer,
    ).toBe('L0');
  });

  it('câu trích bịa thì tầng quyết định là L4b', () => {
    expect(
      trace({
        similarity: 0.6,
        entailment: 'NOT_ENTAILED',
        flags: ['FABRICATED_QUOTE'],
        hasPassages: false,
      }).layer,
    ).toBe('L4b');
  });

  it('phân biệt L4 đọc tóm tắt với L3b đọc toàn văn', () => {
    const base = {
      similarity: 0.6,
      entailment: 'ENTAILS' as const,
      flags: [],
    };
    expect(trace({ ...base, hasPassages: false }).layer).toBe('L4');
    expect(trace({ ...base, hasPassages: true }).layer).toBe('L3b');
  });

  it('đường tắt trên và dưới ngưỡng đều là L3, và nói ra con số', () => {
    const low = trace({
      similarity: 0.1,
      entailment: null,
      flags: [],
      hasPassages: false,
    });
    const high = trace({
      similarity: 0.95,
      entailment: null,
      flags: [],
      hasPassages: false,
    });
    expect(low.layer).toBe('L3');
    expect(high.layer).toBe('L3');
    expect(high.why).toContain('0.95');
  });

  it('abstract rỗng thì dừng ở L1', () => {
    expect(
      trace({
        similarity: null,
        entailment: null,
        flags: ['EMPTY_ABSTRACT'],
        hasPassages: false,
      }).layer,
    ).toBe('L1');
  });

  it('mọi lời giải thích đều là câu tiếng Việt đọc được', () => {
    const t = trace({
      similarity: 0.5,
      entailment: null,
      flags: ['NUMBER_NOT_IN_SOURCE'],
      hasPassages: false,
    });
    expect(t.why.length).toBeGreaterThan(20);
  });
});
