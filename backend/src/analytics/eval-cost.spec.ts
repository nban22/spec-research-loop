import {
  costByArm,
  costOf,
  costShare,
  pairedDiff,
  stats,
  type CallRow,
  type PriceTable,
} from './eval-cost';

/**
 * Năm thứ đáng khoá lại — mỗi cái tương ứng một cách bảng chi phí có thể nói dối:
 *
 * 1. **Cache-hit rẻ hơn cache-miss.** Tính bằng một giá là thổi phồng đúng arm tiết kiệm nhất.
 * 2. **Provider chưa trả trường cache thì `prompt_tokens` mới là con số đúng** — không thì mọi
 *    lời gọi cũ thành miễn phí.
 * 3. **`usd_system` phải trừ token của verifier ở vai đo**, nếu không B1/B2 bị tính tiền cái cân.
 * 4. **Hiệu theo cặp, không phải hiệu hai trung bình** — và phải tất định giữa hai lần chạy.
 * 5. **Mẫu số 0 trả `null`, không `NaN`.**
 */

const PRICES: PriceTable = {
  default: { input: 1, cached_input: 0.1, output: 2 },
  'deepseek-v4-flash': { input: 0.5, cached_input: 0.05, output: 1 },
};

const call = (over: Partial<CallRow> = {}): CallRow => ({
  model: 'deepseek-v4-pro',
  purpose: 'GAP',
  prompt_id: 'generator',
  step: 'B2',
  prompt_tokens: 1_000_000,
  completion_tokens: 0,
  cache_hit_tokens: 0,
  cache_miss_tokens: 0,
  latency_ms: 1000,
  attempts: 1,
  ok: true,
  ...over,
});

describe('costOf', () => {
  it('provider chưa trả trường cache thì tính theo prompt_tokens, không cho miễn phí', () => {
    expect(costOf(call(), PRICES)).toBeCloseTo(1, 9);
  });

  it('token ăn cache rẻ hơn token phải đọc lại', () => {
    const cached = call({
      prompt_tokens: 1_000_000,
      cache_hit_tokens: 1_000_000,
      cache_miss_tokens: 0,
    });
    expect(costOf(cached, PRICES)).toBeCloseTo(0.1, 9);
  });

  it('mỗi model một đơn giá, không gộp một giá cho cả hai tier', () => {
    expect(costOf(call({ model: 'deepseek-v4-flash' }), PRICES)).toBeCloseTo(
      0.5,
      9,
    );
  });

  it('model lạ rơi về đơn giá mặc định thay vì thành 0 đồng', () => {
    expect(costOf(call({ model: 'model-chua-tung-thay' }), PRICES)).toBeCloseTo(
      1,
      9,
    );
  });

  it('token ra tính theo giá ra', () => {
    const c = call({ prompt_tokens: 0, completion_tokens: 1_000_000 });
    expect(costOf(c, PRICES)).toBeCloseTo(2, 9);
  });
});

describe('stats', () => {
  it('giữ nguyên cả dãy giá trị thô để báo cáo in ra được', () => {
    expect(stats([3, 1, 2]).values).toEqual([3, 1, 2]);
  });

  it('trung vị và tứ phân vị, không phải trung bình — chi phí LLM lệch phải', () => {
    const s = stats([1, 2, 3, 100]);
    expect(s.median).toBeCloseTo(2.5, 9);
    expect(s.max).toBe(100);
    // Trung bình sẽ là 26.5, tức là không mô tả được 3 trong 4 lượt chạy.
    expect(s.median).toBeLessThan(26.5);
  });

  it('dãy rỗng không sinh NaN', () => {
    expect(stats([])).toEqual({
      n: 0,
      median: 0,
      p25: 0,
      p75: 0,
      min: 0,
      max: 0,
      values: [],
    });
  });
});

describe('costByArm', () => {
  const runs = [
    { arm: 'B1', calls: [call({ purpose: 'DECOMPOSE' })] },
    {
      arm: 'B2',
      calls: [call({ purpose: 'GAP' }), call({ purpose: 'ENTAILMENT' })],
    },
  ];

  it('usd_system trừ token của verifier ở vai đo, usd_total thì không', () => {
    const [b1, b2] = costByArm(runs, PRICES);
    expect(b1.arm).toBe('B1');
    expect(b2.usd_total.median).toBeCloseTo(2, 9);
    expect(b2.usd_system.median).toBeCloseTo(1, 9);
  });

  it('luôn kèm n để không ai đọc một con số mà không biết nó từ mấy lượt', () => {
    expect(costByArm(runs, PRICES).every((a) => a.n === 1)).toBe(true);
  });

  it('provider chưa trả trường cache thì cache_hit_ratio là null, không phải 0', () => {
    expect(costByArm(runs, PRICES)[0].cache_hit_ratio).toBeNull();
  });

  it('đo được tỉ lệ lời gọi phải thử lại và lời gọi hỏng', () => {
    const [arm] = costByArm(
      [
        {
          arm: 'SYS',
          calls: [call({ attempts: 3 }), call(), call({ ok: false })],
        },
      ],
      PRICES,
    );
    expect(arm.retry_ratio).toBeCloseTo(1 / 3, 9);
    expect(arm.failed_call_ratio).toBeCloseTo(1 / 3, 9);
  });

  it('arm không có lời gọi nào trả null chứ không NaN', () => {
    const [arm] = costByArm([{ arm: 'B1', calls: [] }], PRICES);
    expect(arm.retry_ratio).toBeNull();
    expect(arm.failed_call_ratio).toBeNull();
    expect(arm.usd_total.median).toBe(0);
  });
});

describe('costShare', () => {
  it('gom theo bước và cho biết mỗi bước chiếm bao nhiêu phần ngân sách', () => {
    const rows = costShare(
      [call({ step: 'B4' }), call({ step: 'B4' }), call({ step: 'B1' })],
      'step',
      PRICES,
    );
    expect(rows[0]).toMatchObject({ key: 'B4', calls: 2 });
    expect(rows[0].share).toBeCloseTo(2 / 3, 9);
  });

  it('sắp theo tiền giảm dần — chỗ đốt nhiều nhất phải nằm đầu bảng', () => {
    const rows = costShare(
      [
        call({ prompt_id: 'a' }),
        call({ prompt_id: 'b' }),
        call({ prompt_id: 'b' }),
      ],
      'prompt_id',
      PRICES,
    );
    expect(rows.map((r) => r.key)).toEqual(['b', 'a']);
  });

  it('không có lời gọi nào thì trả mảng rỗng, không chia cho 0', () => {
    expect(costShare([], 'step', PRICES)).toEqual([]);
  });
});

describe('pairedDiff', () => {
  const run = (arm: string, idea: string, tokens: number) => ({
    arm,
    idea_id: idea,
    calls: [call({ prompt_tokens: tokens })],
  });

  it('ghép cặp theo ý tưởng, không so hai trung bình độc lập', () => {
    const runs = [
      run('B2', 'I1', 1_000_000),
      run('SYS', 'I1', 3_000_000),
      run('B2', 'I2', 2_000_000),
      run('SYS', 'I2', 4_000_000),
    ];
    const d = pairedDiff(runs, 'B2', 'SYS', PRICES);
    expect(d.n).toBe(2);
    expect(d.median_diff_usd).toBeCloseTo(2, 9);
    expect(d.same_sign).toBe(2);
  });

  it('bỏ qua ý tưởng chỉ có mặt ở một arm — cặp thiếu vế thì không phải cặp', () => {
    const runs = [
      run('B2', 'I1', 1_000_000),
      run('SYS', 'I1', 2_000_000),
      run('SYS', 'I2', 9_000_000),
    ];
    expect(pairedDiff(runs, 'B2', 'SYS', PRICES).n).toBe(1);
  });

  it('đếm số cặp cùng dấu — đó là con số quyết định kết luận có được rút không', () => {
    const runs = [
      run('B2', 'I1', 1_000_000),
      run('SYS', 'I1', 3_000_000),
      run('B2', 'I2', 5_000_000),
      run('SYS', 'I2', 1_000_000), // ngược dấu
      run('B2', 'I3', 1_000_000),
      run('SYS', 'I3', 2_000_000),
    ];
    const d = pairedDiff(runs, 'B2', 'SYS', PRICES);
    expect(d.n).toBe(3);
    expect(d.same_sign).toBe(2);
  });

  it('khoảng tin cậy tất định giữa hai lần chạy — báo cáo không được đổi số mỗi lần build', () => {
    const runs = ['I1', 'I2', 'I3', 'I4'].flatMap((idea, i) => [
      run('B2', idea, 1_000_000 * (i + 1)),
      run('SYS', idea, 1_000_000 * (i + 3)),
    ]);
    const a = pairedDiff(runs, 'B2', 'SYS', PRICES, { iterations: 500 });
    const b = pairedDiff(runs, 'B2', 'SYS', PRICES, { iterations: 500 });
    expect(a.ci95).toEqual(b.ci95);
    expect(a.ci95).not.toBeNull();
  });

  it('dưới 3 cặp thì không dựng khoảng tin cậy — bootstrap trên 2 số là khoảng giả', () => {
    const runs = [run('B2', 'I1', 1_000_000), run('SYS', 'I1', 2_000_000)];
    expect(pairedDiff(runs, 'B2', 'SYS', PRICES).ci95).toBeNull();
  });

  it('không cặp nào chung thì trả 0 và null, không vỡ', () => {
    const d = pairedDiff([run('B2', 'I1', 1)], 'B2', 'SYS', PRICES);
    expect(d).toMatchObject({
      n: 0,
      median_diff_usd: 0,
      ci95: null,
      same_sign: 0,
    });
  });
});
