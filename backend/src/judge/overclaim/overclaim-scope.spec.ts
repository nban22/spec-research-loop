import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assessOverclaim,
  buildNarrowing,
  extractActualScope,
  extractDeclaredScope,
} from './overclaim-scope';

/**
 * Tầng luật của B1 chạy **không cần DB, không cần LLM** — cả file này không mock gì cả.
 * Đó chính là tiêu chí "bắt được claim phóng đại rõ ràng mà không gọi LLM lần nào" của #7.
 */

type Seed = {
  plans: Record<string, unknown>;
  claims: {
    id: string;
    plan: string;
    overclaimed: boolean;
    text: string;
  }[];
};

const seed = JSON.parse(
  readFileSync(
    join(__dirname, '..', '..', '..', 'eval', 'overclaim-seed.json'),
    'utf8',
  ),
) as Seed;

const SINGLE_DOMAIN = seed.plans.single_domain;

function judge(text: string, plan: unknown, projectDomain = 'legal') {
  const actual = extractActualScope(plan, projectDomain);
  return assessOverclaim(text, extractDeclaredScope(text), actual);
}

describe('tầng luật — trường hợp rõ ràng', () => {
  it('bắt claim phổ quát khi thí nghiệm chỉ có một domain', () => {
    const v = judge(
      'Our retrieval pipeline improves answer accuracy across all domains.',
      SINGLE_DOMAIN,
    );
    expect(v.level).toBe('CRITICAL');
    expect(v.needsLlm).toBe(false);
  });

  it('bắt claim khai nhiều domain hơn số đếm được trong kế hoạch', () => {
    const v = judge(
      'We evaluate across three domains and observe consistent gains.',
      SINGLE_DOMAIN,
    );
    expect(v.level).toBe('MAJOR');
    expect(v.needsLlm).toBe(false);
  });

  it('bắt claim khai mức cải thiện khi kế hoạch không có baseline lẫn metric', () => {
    const v = judge(
      'Our method significantly reduces hallucinated statute citations.',
      seed.plans.no_baseline,
    );
    expect(v.level).toBe('MAJOR');
    expect(v.needsLlm).toBe(false);
  });

  it('không cờ claim đã tự giới hạn phạm vi', () => {
    const v = judge(
      'Hybrid retrieval improves nDCG@10 over BM25 on the ZaloLegal corpus.',
      SINGLE_DOMAIN,
    );
    expect(v.level).toBe('NONE');
    expect(v.needsLlm).toBe(false);
  });

  it('đẩy sang tầng LLM khi có dấu hiệu nhưng kế hoạch cũng có bằng chứng', () => {
    const v = judge(
      'Our method significantly improves nDCG@10 over the BM25 baseline.',
      SINGLE_DOMAIN,
    );
    expect(v.needsLlm).toBe(true);
    expect(v.level).toBe('NONE');
  });
});

describe('câu thu hẹp đề xuất', () => {
  it('thay cụm phổ quát bằng phạm vi thật đo được', () => {
    const actual = extractActualScope(SINGLE_DOMAIN, 'Vietnamese legal QA');
    const out = buildNarrowing(
      'Our retrieval pipeline improves answer accuracy across all domains.',
      actual,
    );
    expect(out).not.toBe('');
    expect(out).not.toMatch(/all domains/i);
    // Câu phải còn dùng được, không phải mảnh vụn.
    expect(out.length).toBeGreaterThan(30);
  });

  it('không bịa câu khi không có bằng chứng phạm vi nào để thay vào', () => {
    const actual = extractActualScope({}, null);
    expect(buildNarrowing('The method works for any language.', actual)).toBe(
      '',
    );
  });
});

describe('tách phạm vi khai và phạm vi thật', () => {
  it('đọc được số claim tự khai', () => {
    const d = extractDeclaredScope(
      'The technique transfers to five datasets without any modification.',
    );
    expect(d.counts.datasets).toBe(5);
  });

  it('không nhầm số không đứng trước danh từ chiều', () => {
    const d = extractDeclaredScope('The method is three times faster.');
    expect(d.counts.datasets).toBeUndefined();
    expect(d.counts.domains).toBeUndefined();
  });

  it('nhận ra kế hoạch có baseline và metric', () => {
    const a = extractActualScope(SINGLE_DOMAIN, null);
    expect(a.hasBaseline).toBe(true);
    expect(a.hasMetric).toBe(true);
  });

  it('nhận ra kế hoạch không có baseline lẫn metric', () => {
    const a = extractActualScope(seed.plans.no_baseline, null);
    expect(a.hasBaseline).toBe(false);
    expect(a.hasMetric).toBe(false);
  });
});

/**
 * Số đo trên 20 claim gieo tay + 12 claim sạch. Ngưỡng đặt **thấp hơn** kết quả thật một
 * khoảng, để test bắt được lúc tầng luật thoái hoá chứ không phải để khoe con số.
 *
 * Claim gieo cố ý không chép từ điển, nên tầng luật bắt trượt vài câu là đúng thiết kế:
 * phần trượt đó là việc của tầng LLM. `npx jest overclaim -t 'số đo'` in ra bảng để chép vào
 * `docs/evaluation_report.md`.
 */
describe('số đo trên tập gieo', () => {
  it('báo tỉ lệ bắt được và tỉ lệ báo nhầm của riêng tầng luật', () => {
    const overclaimed = seed.claims.filter((c) => c.overclaimed);
    const clean = seed.claims.filter((c) => !c.overclaimed);

    const caught = overclaimed.filter(
      (c) => judge(c.text, seed.plans[c.plan]).level !== 'NONE',
    );
    const grayZone = overclaimed.filter((c) => {
      const v = judge(c.text, seed.plans[c.plan]);
      return v.level === 'NONE' && v.needsLlm;
    });
    const falsePositives = clean.filter(
      (c) => judge(c.text, seed.plans[c.plan]).level !== 'NONE',
    );

    const catchRate = caught.length / overclaimed.length;
    const fpRate = falsePositives.length / clean.length;

    console.table({
      'claim phóng đại': overclaimed.length,
      'bắt bằng luật': caught.length,
      'đẩy sang LLM': grayZone.length,
      'trượt hẳn': overclaimed.length - caught.length - grayZone.length,
      'claim sạch': clean.length,
      'báo nhầm': falsePositives.length,
      'tỉ lệ bắt (%)': Math.round(catchRate * 100),
      'tỉ lệ báo nhầm (%)': Math.round(fpRate * 100),
    });

    expect(catchRate).toBeGreaterThanOrEqual(0.6);
    expect(fpRate).toBeLessThanOrEqual(0.25);
  });

  it('không tốn lời gọi LLM nào cho claim bắt được bằng luật', () => {
    const ruleCaught = seed.claims
      .filter((c) => c.overclaimed)
      .map((c) => judge(c.text, seed.plans[c.plan]))
      .filter((v) => v.level !== 'NONE');

    expect(ruleCaught.length).toBeGreaterThan(0);
    expect(ruleCaught.every((v) => v.needsLlm === false)).toBe(true);
  });
});
