/**
 * Hàm thuần cho **báo cáo chi phí của ablation** — phần làn C đóng góp vào deliverable #8.
 *
 * Đặt trong `analytics/` chỉ vì `rootDir: src` của jest — file này **không** là service, không
 * `@Injectable`, không inject Prisma, và **không được đăng ký vào `AnalyticsModule`**. Nó mượn
 * thư mục để có test, đúng cùng lý lẽ đã ghi ở đầu `verifier/metrics.ts`. Chỗ đúng nhất về ngữ
 * nghĩa là `metrics.ts`, nhưng `verifier/**` nằm ngoài phạm vi sửa của làn C.
 *
 * ## Câu hỏi mà những con số này trả lời
 *
 * Ablation 4 arm đã đo **chất lượng**. Chưa ai đo **cái giá**. Câu hỏi: *ngân sách token đi đâu,
 * và mỗi bậc kiến trúc mua được gì với giá bao nhiêu.*
 *
 * ## Ba chỗ dễ nhầm, ghi ra để đừng ai đọc sai bảng
 *
 * 1. **Chi phí verifier mang hai vai khác nhau tuỳ arm.** `harness.ts` chạy verifier ở vai *đo*
 *    cho **mọi** arm — đó là cách duy nhất có cùng một thước cho baseline. Nên với `B1`/`B2`,
 *    token `ENTAILMENT` là chi phí của **cái cân**, không phải của con cá. Với `SYS` thì verifier
 *    vừa là thước vừa là cơ chế (gate), nên nó **đúng** là chi phí hệ. Vì vậy hàm này trả **hai
 *    cột**: `usd_total` và `usd_system` (đã trừ `ENTAILMENT`). Đọc cột nào là tuỳ câu hỏi.
 * 2. **Chi phí retry đã nằm trong giá nhưng không tách ra được.** `LlmService` cộng token của mọi
 *    lần thử vào **một** dòng `LlmCall` kèm `attempts = n`. Nên đo được *tỉ lệ* lời gọi phải thử
 *    lại, **không** đo được *bao nhiêu tiền* đốt vào retry. Đừng báo con số đó.
 * 3. **Đơn giá là tham số, không phải hằng số.** Hai bản sao của `0.28`/`0.42` đã tồn tại ở
 *    `estimator.service.ts` và `analytics.service.ts`; thêm bản thứ ba ở đây là gần như bảo đảm
 *    báo cáo sẽ in ra số theo một giá trong khi code chạy theo giá khác, mà **không có gì báo**.
 *    Bảng giá truyền vào từ ngoài và được **ghi thẳng vào file kết quả**.
 */

/** Đơn giá một model, USD trên 1 triệu token. */
export type ModelPrice = {
  input: number;
  /** Giá token đọc được từ cache prefix. Không biết thì để bằng `input` — xem `costOf`. */
  cached_input: number;
  output: number;
};
export type PriceTable = Record<string, ModelPrice> & { default: ModelPrice };

/** Một lời gọi LLM, rút gọn còn đúng phần cần để tính tiền. */
export type CallRow = {
  model: string;
  purpose: string;
  prompt_id: string;
  step: string;
  prompt_tokens: number;
  completion_tokens: number;
  cache_hit_tokens: number;
  cache_miss_tokens: number;
  latency_ms: number;
  attempts: number;
  ok: boolean;
};

/**
 * Tiền của một lời gọi.
 *
 * `cache_miss_tokens` là 0 ở mọi dòng nếu provider chưa từng trả trường cache — khi đó
 * `prompt_tokens` mới là con số đúng để tính. Không có nhánh này thì mọi lời gọi cũ thành **miễn
 * phí**, và bảng chi phí trông đẹp một cách vô lý.
 */
export function costOf(row: CallRow, prices: PriceTable): number {
  const p = prices[row.model] ?? prices.default;
  const counted = row.cache_hit_tokens + row.cache_miss_tokens;
  const [hit, miss] =
    counted === 0
      ? [0, row.prompt_tokens]
      : [row.cache_hit_tokens, row.cache_miss_tokens];

  return (
    (miss * p.input + hit * p.cached_input + row.completion_tokens * p.output) /
    1_000_000
  );
}

export type ArmCost = {
  arm: string;
  /** Số lượt chạy — **luôn** đi kèm mọi con số tổng hợp. */
  n: number;
  /** USD mỗi bản spec, gồm cả token của verifier ở vai đo. */
  usd_total: Stats;
  /** USD mỗi bản spec, **trừ** `ENTAILMENT` — xem chú thích đầu file. */
  usd_system: Stats;
  tokens: Stats;
  calls: Stats;
  seconds: Stats;
  /** `null` khi provider chưa trả trường cache lần nào — khác hẳn 0 = đo được và bằng không. */
  cache_hit_ratio: number | null;
  retry_ratio: number | null;
  failed_call_ratio: number | null;
};

/**
 * `median` + `IQR` chứ không `mean ± sd`.
 *
 * Chi phí LLM lệch phải mạnh và đuôi dày: một ý tưởng đi hết ba vòng sửa tốn gấp nhiều lần một ý
 * tưởng sạch từ vòng đầu. Trên 10 mẫu, `mean ± sd` cho một khoảng tràn xuống dưới 0 và nói rất
 * ít. `values` giữ **nguyên cả 10 số** để báo cáo in ra được — bảng 10 dòng tự chứng minh phân bố
 * tốt hơn bất kỳ con số tổng hợp nào.
 */
export type Stats = {
  n: number;
  median: number;
  p25: number;
  p75: number;
  min: number;
  max: number;
  values: number[];
};

export function stats(values: number[]): Stats {
  if (values.length === 0) {
    return { n: 0, median: 0, p25: 0, p75: 0, min: 0, max: 0, values: [] };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    median: quantile(sorted, 0.5),
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    values,
  };
}

/** Nội suy tuyến tính giữa hai phần tử kề — cách `numpy.percentile` mặc định vẫn làm. */
function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi
    ? sorted[lo]
    : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Token của verifier ở vai *đo*. Xem chú thích 1 đầu file. */
const MEASUREMENT_PURPOSE = 'ENTAILMENT';

/** Gom theo arm. `runs` là các lượt chạy, mỗi lượt kèm danh sách lời gọi của nó. */
export function costByArm(
  runs: { arm: string; calls: CallRow[] }[],
  prices: PriceTable,
): ArmCost[] {
  const byArm = new Map<string, { arm: string; calls: CallRow[] }[]>();
  for (const r of runs) {
    if (!byArm.has(r.arm)) byArm.set(r.arm, []);
    byArm.get(r.arm)!.push(r);
  }

  return [...byArm.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([arm, rows]) => {
      const all = rows.flatMap((r) => r.calls);
      const cacheCounted = all.reduce(
        (s, c) => s + c.cache_hit_tokens + c.cache_miss_tokens,
        0,
      );

      return {
        arm,
        n: rows.length,
        usd_total: stats(
          rows.map((r) => sum(r.calls, (c) => costOf(c, prices))),
        ),
        usd_system: stats(
          rows.map((r) =>
            sum(
              r.calls.filter((c) => c.purpose !== MEASUREMENT_PURPOSE),
              (c) => costOf(c, prices),
            ),
          ),
        ),
        tokens: stats(
          rows.map((r) =>
            sum(r.calls, (c) => c.prompt_tokens + c.completion_tokens),
          ),
        ),
        calls: stats(rows.map((r) => r.calls.length)),
        seconds: stats(
          rows.map((r) => sum(r.calls, (c) => c.latency_ms) / 1000),
        ),
        cache_hit_ratio:
          cacheCounted === 0
            ? null
            : sum(all, (c) => c.cache_hit_tokens) / cacheCounted,
        retry_ratio:
          all.length === 0
            ? null
            : all.filter((c) => c.attempts > 1).length / all.length,
        failed_call_ratio:
          all.length === 0
            ? null
            : all.filter((c) => !c.ok).length / all.length,
      };
    });
}

/**
 * Tỉ trọng chi phí theo **bước** hoặc theo **prompt**.
 *
 * Đây là kết quả **hành động được** của cả báo cáo: *"B4 Judge chiếm 62% ngân sách"* nói cho
 * người đọc biết phải sửa chỗ nào, còn *"SYS đắt gấp 3,4 lần B2"* thì không.
 */
export function costShare(
  calls: CallRow[],
  by: 'step' | 'prompt_id',
  prices: PriceTable,
): { key: string; usd: number; share: number; calls: number }[] {
  const total = sum(calls, (c) => costOf(c, prices));
  const bucket = new Map<string, { usd: number; calls: number }>();
  for (const c of calls) {
    const k = c[by];
    const b = bucket.get(k) ?? { usd: 0, calls: 0 };
    b.usd += costOf(c, prices);
    b.calls += 1;
    bucket.set(k, b);
  }
  return [...bucket.entries()]
    .map(([key, v]) => ({
      key,
      usd: v.usd,
      calls: v.calls,
      share: total === 0 ? 0 : v.usd / total,
    }))
    .sort((a, b) => b.usd - a.usd);
}

export type PairedDiff = {
  from: string;
  to: string;
  /** Số ý tưởng có mặt ở **cả hai** arm — chỉ những ý tưởng đó mới ghép cặp được. */
  n: number;
  median_diff_usd: number;
  /** Khoảng tin cậy 95% của trung vị, bằng bootstrap. `null` khi n quá nhỏ để nói gì. */
  ci95: [number, number] | null;
  /** Bao nhiêu cặp cùng dấu với trung vị. Đây là con số quyết định kết luận có được rút hay không. */
  same_sign: number;
};

/**
 * Hiệu **theo cặp ý tưởng**, không phải hiệu của hai trung bình.
 *
 * Thiết kế này là paired: cùng 10 ý tưởng chạy qua cả 4 arm. So hai trung bình độc lập là vứt đi
 * thông tin ghép cặp và làm phương sai to lên vô cớ. Với n = 10 thì đó là khác biệt giữa "nói
 * được điều gì" và "không nói được gì".
 *
 * Bootstrap chứ không t-test: phân bố chi phí lệch phải, giả định chuẩn của t-test không đứng.
 * `seed` cố định để hai lần chạy ra cùng một khoảng — báo cáo mà đổi số mỗi lần build thì không
 * ai kiểm lại được.
 */
export function pairedDiff(
  runs: { arm: string; idea_id: string; calls: CallRow[] }[],
  from: string,
  to: string,
  prices: PriceTable,
  opts: { iterations?: number; seed?: number } = {},
): PairedDiff {
  const costOfRun = (r: { calls: CallRow[] }) =>
    sum(r.calls, (c) => costOf(c, prices));
  const pick = (arm: string) =>
    new Map(
      runs.filter((r) => r.arm === arm).map((r) => [r.idea_id, costOfRun(r)]),
    );

  const a = pick(from);
  const b = pick(to);
  const diffs = [...b.entries()]
    .filter(([idea]) => a.has(idea))
    .map(([idea, cost]) => cost - a.get(idea)!)
    .sort((x, y) => x - y);

  if (diffs.length === 0) {
    return { from, to, n: 0, median_diff_usd: 0, ci95: null, same_sign: 0 };
  }

  const median = quantile(diffs, 0.5);
  const sign = Math.sign(median);
  return {
    from,
    to,
    n: diffs.length,
    median_diff_usd: median,
    // Dưới 3 cặp thì bootstrap chỉ lặp lại đúng mấy con số đang có — khoảng đó là giả.
    ci95:
      diffs.length < 3
        ? null
        : bootstrapCi(diffs, opts.iterations ?? 10_000, opts.seed ?? 42),
    same_sign:
      sign === 0 ? 0 : diffs.filter((d) => Math.sign(d) === sign).length,
  };
}

/** LCG 32-bit — đủ cho bootstrap, và **tất định** theo `seed`, khác hẳn `Math.random()`. */
function bootstrapCi(
  values: number[],
  iterations: number,
  seed: number,
): [number, number] {
  let state = seed >>> 0;
  const next = () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };

  const medians: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const sample: number[] = [];
    for (let k = 0; k < values.length; k++) {
      sample.push(values[Math.floor(next() * values.length)]);
    }
    sample.sort((a, b) => a - b);
    medians.push(quantile(sample, 0.5));
  }
  medians.sort((a, b) => a - b);
  return [quantile(medians, 0.025), quantile(medians, 0.975)];
}

function sum<T>(items: T[], of: (item: T) => number): number {
  return items.reduce((s, item) => s + of(item), 0);
}
