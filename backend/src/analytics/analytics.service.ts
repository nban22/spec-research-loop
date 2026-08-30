import { Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { PrismaService } from '../common/prisma.service';
import type { LlmPurpose } from '../generated/prisma/enums';

/**
 * Đọc `LlmCall` và `ResourceEstimate` để trả lời một câu: **mỗi bước tốn bao nhiêu tiền thật.**
 *
 * Ràng buộc của module này, kiểm được bằng grep: **không một lệnh ghi DB nào**, không gọi LLM.
 * Mọi thứ ở đây là `findMany` / `findUnique` rồi cộng lại trong bộ nhớ.
 *
 * Bảng `LlmCall` đã ghi đủ cho **mọi** lời gọi từ ngày đầu (`LlmService.recordCall`) mà chưa màn
 * hình nào đọc — issue #17 chỉ là mở mắt cho phần dữ liệu đã nằm sẵn đó.
 */

/**
 * `LlmPurpose` → bước người dùng nhìn thấy. Ánh xạ theo **chỗ người dùng đứng khi lời gọi xảy
 * ra**, không theo tên module sinh ra nó — người đọc bảng chi phí đang hỏi "bước 2 tốn bao nhiêu",
 * không hỏi "service nào gọi".
 */
const PURPOSE_STEP: Record<LlmPurpose, string> = {
  PARAPHRASE: 'B1 · Diễn giải & phân rã',
  DECOMPOSE: 'B1 · Diễn giải & phân rã',
  RELATED_WORK: 'B2 · Nghiên cứu liên quan & gap',
  GAP: 'B2 · Nghiên cứu liên quan & gap',
  CLAIM: 'B3 · Contribution & thí nghiệm',
  EXPERIMENT: 'B3 · Contribution & thí nghiệm',
  JUDGE: 'B4 · Judge & sửa spec',
  OPTIONS: 'B4 · Judge & sửa spec',
  ENTAILMENT: 'B5 · Kiểm chứng cứ',
  // Hai cái này chỉ xuất hiện khi chạy `eval/`, không nằm trong luồng người dùng.
  AUDITOR: 'Ngoài quy trình · eval',
  B1_SINGLE_SHOT: 'Ngoài quy trình · eval',
};

/** Thứ tự hiển thị cố định — sắp theo tiền thì bảng nhảy lung tung giữa hai lần xem. */
const STEP_ORDER = [
  'B1 · Diễn giải & phân rã',
  'B2 · Nghiên cứu liên quan & gap',
  'B3 · Contribution & thí nghiệm',
  'B4 · Judge & sửa spec',
  'B5 · Kiểm chứng cứ',
  'Ngoài quy trình · eval',
];

/**
 * Đơn giá **chép lại** từ `estimator.service.ts` — hai hằng số ở đó không export, và
 * `backend/src/estimator/**` nằm ngoài phạm vi được sửa của issue #17.
 *
 * Cố ý dùng **đúng cùng một đơn giá** với bộ ước lượng, kể cả khi token cache hit thực tế rẻ hơn:
 * mục tiêu của màn hình này là đo **sai số của phép ước lượng**, nên hai vế phải cùng thước.
 * Tính chi phí thật bằng đơn giá khác thì con số sai lệch đo lẫn cả chênh đơn giá.
 *
 * ⚠️ Sửa đơn giá ở `estimator.service.ts` thì sửa cả ở đây, cùng một commit.
 */
const USD_PER_1M_PROMPT_TOKENS = 0.28;
const USD_PER_1M_OUTPUT_TOKENS = 0.42;

type CallRow = {
  purpose: LlmPurpose;
  model: string;
  prompt_id: string;
  prompt_tokens: number;
  completion_tokens: number;
  cache_hit_tokens: number;
  cache_miss_tokens: number;
  latency_ms: number;
  attempts: number;
  ok: boolean;
};

export type CostBucket = {
  key: string;
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
  cost_usd: number;
  retried_calls: number;
  failed_calls: number;
};

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Chi phí một lời gọi, theo đúng công thức của bộ ước lượng. */
  private static costOf(c: CallRow): number {
    return (
      (c.prompt_tokens * USD_PER_1M_PROMPT_TOKENS) / 1e6 +
      (c.completion_tokens * USD_PER_1M_OUTPUT_TOKENS) / 1e6
    );
  }

  private static bucketize(
    rows: CallRow[],
    keyOf: (c: CallRow) => string,
  ): CostBucket[] {
    const map = new Map<string, CostBucket>();
    for (const c of rows) {
      const key = keyOf(c);
      const b = map.get(key) ?? {
        key,
        calls: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        latency_ms: 0,
        cost_usd: 0,
        retried_calls: 0,
        failed_calls: 0,
      };
      b.calls += 1;
      b.prompt_tokens += c.prompt_tokens;
      b.completion_tokens += c.completion_tokens;
      b.total_tokens += c.prompt_tokens + c.completion_tokens;
      b.latency_ms += c.latency_ms;
      b.cost_usd += AnalyticsService.costOf(c);
      if (c.attempts > 1) b.retried_calls += 1;
      if (!c.ok) b.failed_calls += 1;
      map.set(key, b);
    }
    return [...map.values()];
  }

  /**
   * Quyền: `where` mang **cả** `id` lẫn `user_id`, và trả `notFound` chứ không `forbidden` —
   * 403 là xác nhận dự án đó tồn tại (backend/CLAUDE.md §5).
   */
  async costOverview(projectId: string, userId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, user_id: userId },
      select: { id: true, title: true, current_spec_version_id: true },
    });
    if (!project) throw AppError.notFound('Không tìm thấy dự án.');

    const rows = (await this.prisma.llmCall.findMany({
      where: { project_id: projectId },
      select: {
        purpose: true,
        model: true,
        prompt_id: true,
        prompt_tokens: true,
        completion_tokens: true,
        cache_hit_tokens: true,
        cache_miss_tokens: true,
        latency_ms: true,
        attempts: true,
        ok: true,
      },
      orderBy: { created_at: 'asc' },
    })) as CallRow[];

    const sum = <K extends keyof CallRow>(k: K) =>
      rows.reduce((acc, c) => acc + (c[k] as number), 0);

    const cacheHit = sum('cache_hit_tokens');
    const cacheMiss = sum('cache_miss_tokens');
    const cacheTotal = cacheHit + cacheMiss;
    const retried = rows.filter((c) => c.attempts > 1).length;
    const failed = rows.filter((c) => !c.ok).length;
    const actualUsd = rows.reduce(
      (acc, c) => acc + AnalyticsService.costOf(c),
      0,
    );

    const byStep = AnalyticsService.bucketize(
      rows,
      (c) => PURPOSE_STEP[c.purpose],
    ).sort((a, b) => STEP_ORDER.indexOf(a.key) - STEP_ORDER.indexOf(b.key));
    const byPrompt = AnalyticsService.bucketize(rows, (c) => c.prompt_id).sort(
      (a, b) => b.cost_usd - a.cost_usd,
    );
    const byModel = AnalyticsService.bucketize(rows, (c) => c.model).sort(
      (a, b) => b.cost_usd - a.cost_usd,
    );

    return {
      project: { id: project.id, title: project.title },
      totals: {
        calls: rows.length,
        failed_calls: failed,
        retried_calls: retried,
        prompt_tokens: sum('prompt_tokens'),
        completion_tokens: sum('completion_tokens'),
        total_tokens: sum('prompt_tokens') + sum('completion_tokens'),
        latency_ms: sum('latency_ms'),
        cost_usd: actualUsd,
      },
      /**
       * Tỉ lệ ăn cache prefix — con số chứng minh việc đặt phần dùng chung ở **đầu** prompt
       * là có hiệu quả (STACK §2.5). `null` khi provider chưa trả trường cache lần nào.
       */
      cache: {
        hit_tokens: cacheHit,
        miss_tokens: cacheMiss,
        hit_ratio: cacheTotal > 0 ? cacheHit / cacheTotal : null,
      },
      /** `attempts > 1` là dấu hiệu prompt nào hay trả JSON sai schema. */
      reliability: {
        retry_ratio: rows.length > 0 ? retried / rows.length : null,
        failure_ratio: rows.length > 0 ? failed / rows.length : null,
      },
      by_step: byStep,
      by_prompt: byPrompt,
      by_model: byModel,
      estimate_vs_actual: await this.estimateVsActual(
        project.current_spec_version_id,
        actualUsd,
      ),
    };
  }

  /**
   * Sai số giữa chi phí **ước lượng** và chi phí **thật**.
   *
   * Hai vế đo hai thứ khác nhau về bản chất và phải nói rõ khi đọc: `ResourceEstimate.cost_usd`
   * là dự toán cho **thí nghiệm sẽ chạy**, còn tổng `LlmCall` là tiền đã tiêu để **dựng bản
   * đặc tả**. Con số này vì thế là *thước đo mức lạc quan của bộ ước lượng*, không phải một
   * phép trừ hai đại lượng cùng loại.
   */
  private async estimateVsActual(
    specVersionId: string | null,
    actualUsd: number,
  ) {
    if (!specVersionId) return null;
    const est = await this.prisma.resourceEstimate.findUnique({
      where: { spec_version_id: specVersionId },
      select: { cost_usd: true, tokens_est: true },
    });
    if (!est) return null;
    return {
      estimated_usd: est.cost_usd,
      estimated_tokens: est.tokens_est,
      actual_usd: actualUsd,
      diff_usd: actualUsd - est.cost_usd,
      /** `null` khi dự toán bằng 0 — chia cho 0 thì con số vô nghĩa, không phải `Infinity`. */
      diff_ratio:
        est.cost_usd > 0 ? (actualUsd - est.cost_usd) / est.cost_usd : null,
    };
  }
}
