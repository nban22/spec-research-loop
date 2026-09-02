import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { AppError } from '../common/app-error';
import { json } from '../common/prisma-json';
import { PrismaService } from '../common/prisma.service';
import {
  JUDGE_DEFS,
  MAX_JUDGE_ROUNDS,
  MIN_JUDGES_FOR_DONE,
} from '../contracts/enums';
import { judgeOutputSchema } from '../contracts/llm-io/judge';
import {
  canonicalDigest,
  legacyDigest,
  seedFor,
  shuffleForJudge,
} from './card-shuffle';
import { GeneratorService } from '../generator/generator.service';
import { LlmService, type CompleteJsonResult } from '../llm/llm.service';
import type { LlmModel } from '../llm/llm-provider.interface';
import { SourcesService } from '../sources/sources.service';
import { SpecService } from '../spec/spec.service';
import { AgreementService } from './agreement/agreement.service';
import { groupIssues, type RankOf, type RawIssue } from './issue-grouping';
import { calibratedRank, groupScale, judgeStats } from './severity-calibration';
import { consensusOf, judgeToRepeat } from './self-consistency';
import type { JudgeKey } from './judge.types';

type Progress = (done: number, total: number, message: string) => Promise<void>;

/** Kiểu trả về của `completeJson` cho schema judge — tránh `as` khi dựng lại object. */
type JudgeCall = CompleteJsonResult<z.infer<typeof judgeOutputSchema>>;

/**
 * Số lần chạy của cơ chế tự nhất quán (#45). `3` là con số đề bài #8 đặt.
 *
 * Chỉ áp cho **một** judge, không cả 5 — xem `judgeToRepeat`.
 */
export const SELF_CONSISTENCY_K = 3;

/** Đọc `nullTest.disruptive` từ cột `JudgeAgreement.patterns` (Json) — `safeParse`, không `as`. */
const disruptiveSchema = z.object({
  nullTest: z
    .object({
      disruptive: z
        .object({ judgeKey: z.string(), significant: z.boolean() })
        .nullable(),
    })
    .optional(),
});

export type JudgeRoundResult = {
  round: number;
  completed: JudgeKey[];
  failed: { key: JudgeKey; error: string }[];
  inputDigest: string;
  groupCount: number;
};

/**
 * 5 judge chạy **độc lập**: 5 lời gọi riêng, context sạch, không truyền output judge này sang
 * judge kia (STACK §1 ràng buộc 3). Ba dấu hiệu chứng minh điều đó đọc được thẳng từ dữ liệu:
 * 5 `JudgeRun` **cùng `input_digest`** · **khác `raw_output`** · `started_at` chênh dưới một giây.
 */
@Injectable()
export class JudgeService {
  private readonly logger = new Logger(JudgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly spec: SpecService,
    private readonly sources: SourcesService,
    private readonly agreement: AgreementService,
  ) {}

  async runRound(
    specVersionId: string,
    opts: { evalRunId?: string | null; onProgress?: Progress } = {},
  ): Promise<JudgeRoundResult> {
    const version = await this.prisma.specVersion.findUniqueOrThrow({
      where: { id: specVersionId },
      include: { project: true },
    });
    const round = version.project.judge_round + 1;
    // Giới hạn đọc từ `judge_rounds_total`, **không** từ `judge_round`: `apply` reset
    // `judge_round` về 0 cho version mới (bắt buộc, vì `JudgeRun` unique theo
    // `(spec_version_id, judge_key, round)`), nên đếm bằng nó thì giới hạn
    // "tối đa 3 vòng mỗi dự án" của ARCHITECTURE §1.2 không bao giờ tới.
    if (version.project.judge_rounds_total >= MAX_JUDGE_ROUNDS) {
      throw AppError.conflict(
        'JUDGE_ROUND_LIMIT',
        `Đã chạy hết ${MAX_JUDGE_ROUNDS} vòng judge cho dự án này.`,
      );
    }
    const existing = await this.prisma.judgeRun.count({
      where: { spec_version_id: specVersionId, round },
    });
    if (existing > 0) {
      throw AppError.conflict(
        'JUDGE_ROUND_EXISTS',
        `Vòng judge ${round} đã chạy trên phiên bản này.`,
      );
    }

    // Dựng `spec_json` **đúng một lần**, băm nó, rồi đưa cho cả 5 lời gọi.
    // Nếu mỗi judge tự dựng đầu vào riêng thì `input_digest` khác nhau và bằng chứng độc lập
    // biến mất — không phải vì hệ thống sai, mà vì không còn cách nào chứng minh nó đúng (C3 · F.6).
    const specJson = await this.spec.buildSpecJson(specVersionId);
    const sourcesJson = await this.sources.sourcesForPrompt(version.project_id);

    // Làn B · #43 — khử lệch vị trí: xáo thứ tự thẻ riêng cho từng judge.
    //
    // ⚠️ **"0 token thêm" đúng về SỐ LỜI GỌI, không đúng về GIÁ.** `spec_json` được nhúng vào khối
    // `## SYSTEM` của prompt judge, và DeepSeek chỉ cache theo **prefix** — nên khi bật cờ, 5 judge
    // có 5 khối SYSTEM khác nhau và **mất prefix cache** mà chính cách xếp khối đó sinh ra để ăn.
    // Đo được ở B2: cache hit 12,7% prompt token. Cờ tắt thì không mất gì.
    // Muốn có cả hai thì phải chuyển `spec_json` xuống khối USER — đổi cấu trúc 5 prompt, ngoài
    // phạm vi #43, và phải đo lại cache hit trước/sau.
    //
    // Cờ **tắt** là đường cũ **từng byte**: `legacyDigest` băm đúng chuỗi gốc như trước, và cả 5
    // judge nhận cùng một `specJson`. Đây là điều kiện để mọi `input_digest` đã ghi trước đây vẫn
    // đối chiếu được — không có nó thì tính năng mới âm thầm làm dữ liệu cũ thành vô dụng.
    //
    // Cờ **bật**: digest băm dạng **chuẩn hoá thứ tự**, nên 5 judge vẫn cùng digest dù thấy 5 thứ
    // tự khác nhau; thứ tự của từng judge sinh từ seed suy tất định từ `(digest, judge_key, round)`
    // và được ghi vào `shuffle_seed`. Xem `card-shuffle.ts` để biết vì sao cách này làm bằng chứng
    // **mạnh hơn** chứ không yếu đi.
    const debias = version.project.judge_debias;
    const inputDigest = debias
      ? canonicalDigest(specJson, sourcesJson)
      : legacyDigest(specJson, sourcesJson);

    // Làn B · #45 — chọn **một** judge chạy k lần. Không bật cho cả 5: job dài nhất ~90 giây, và
    // 5 × 3 = 15 lời gọi có thể vượt. Judge được chọn là judge gây nhiễu nhất theo Δκ của #9 —
    // con số **đã qua kiểm định null hoán vị** nên không buộc tội oan. Chưa có số đo ⇒ không bật
    // cho ai, vì đoán sai là trả giá gấp ba cho một judge không có vấn đề.
    const repeatKey = debias
      ? judgeToRepeat(await this.disruptiveJudge(specVersionId))
      : null;
    if (repeatKey) {
      this.logger.log(
        `#45 tự nhất quán: chạy ${repeatKey} ${SELF_CONSISTENCY_K} lần (các judge khác 1 lần)`,
      );
    }

    await opts.onProgress?.(0, JUDGE_DEFS.length, 'Đang chạy 5 judge độc lập…');

    let done = 0;
    // `Promise.allSettled`, **không phải** `Promise.all`: một judge ném lỗi không được làm rơi
    // bốn kết quả kia — chúng đã tốn tiền thật và đã xong (C3 · F.7).
    const settled = await Promise.allSettled(
      JUDGE_DEFS.map(async (def) => {
        const startedAt = new Date();
        // Seed **suy ra được**, không sinh ngẫu nhiên rồi lưu: người kiểm chứng tự tính lại và
        // đối chiếu được, nên không thể chọn seed có lợi rồi khai khống.
        const shuffleSeed = debias
          ? seedFor(inputDigest, def.key, round)
          : null;
        const judgeSpecJson = shuffleSeed
          ? shuffleForJudge(specJson, shuffleSeed)
          : specJson;
        const k = def.key === repeatKey ? SELF_CONSISTENCY_K : 1;
        try {
          // k = 1 là **đúng đường cũ**: một lời gọi, `attempts` không được ghi, `raw_output` là
          // đầu ra thô. k > 1 thì `out.data.issues` bị thay bằng tập đã lọc nhất quán.
          const { out, attempts } = await this.runAttempts(k, {
            promptId: def.promptId,
            model: def.model,
            variables: {
              spec_json: judgeSpecJson,
              sources_json: sourcesJson,
            },
            link: {
              projectId: version.project_id,
              specVersionId,
              evalRunId: opts.evalRunId ?? null,
            },
          });

          const run = await this.prisma.judgeRun.create({
            data: {
              spec_version_id: specVersionId,
              judge_key: def.key,
              round,
              model: def.model,
              prompt_id: def.promptId,
              prompt_hash: out.promptHash,
              input_digest: inputDigest,
              shuffle_seed: shuffleSeed,
              raw_output: json(out.data),
              parse_attempts: out.attempts,
              status: 'OK',
              started_at: startedAt,
              finished_at: new Date(),
            },
            select: { id: true },
          });

          // #45 — lưu **từng lần chạy thô**: đó là bằng chứng cho việc lọc nhất quán đã lọc cái gì.
          // Chỉ ghi khi thật sự chạy nhiều lần; k = 1 không sinh bản ghi nào, nên bảng này rỗng ở
          // chế độ cũ và không ai phải giải thích một bảng đầy dữ liệu vô nghĩa.
          if (attempts.length > 1) {
            await this.prisma.judgeAttempt.createMany({
              data: attempts.map((a, idx) => ({
                judge_run_id: run.id,
                attempt_no: idx + 1,
                status: a.ok ? ('OK' as const) : ('FAILED' as const),
                error_code: a.errorCode,
                raw_output: json(a.raw),
                latency_ms: a.latencyMs,
              })),
            });
          }

          await this.prisma.issue.createMany({
            data: out.data.issues.map((i) => ({
              judge_run_id: run.id,
              severity: i.severity,
              title: i.title,
              reason: i.reason,
              suggestion: i.suggestion,
            })),
          });

          // Nối issue với thẻ theo tiêu đề, sau khi đã ghi — tách khỏi createMany cho gọn.
          await this.linkIssueTargets(run.id, specVersionId, out.data.issues);

          done += 1;
          await opts.onProgress?.(
            done,
            JUDGE_DEFS.length,
            `${def.key} xong (${out.data.issues.length} vấn đề).`,
          );
          return def.key;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          // Bản ghi thất bại **cũng là dữ liệu** — ghi lại chứ không nuốt.
          await this.prisma.judgeRun
            .create({
              data: {
                spec_version_id: specVersionId,
                judge_key: def.key,
                round,
                model: def.model,
                prompt_id: def.promptId,
                prompt_hash: this.safePromptHash(def.promptId),
                input_digest: inputDigest,
                shuffle_seed: shuffleSeed,
                raw_output: json({ error: message }),
                parse_attempts: 0,
                status: 'FAILED',
                error_code: 'LLM_UNAVAILABLE',
                started_at: startedAt,
                finished_at: new Date(),
              },
            })
            .catch(() => undefined);
          done += 1;
          await opts.onProgress?.(done, JUDGE_DEFS.length, `${def.key} lỗi.`);
          throw new Error(`${def.key}: ${message}`);
        }
      }),
    );

    const completed = settled
      .filter(
        (s): s is PromiseFulfilledResult<JudgeKey> => s.status === 'fulfilled',
      )
      .map((s) => s.value);
    const failed = settled
      .map((s, i) => ({ s, def: JUDGE_DEFS[i] }))
      .filter((x) => x.s.status === 'rejected')
      .map((x) => ({
        key: x.def.key,
        error: String((x.s as PromiseRejectedResult).reason),
      }));

    if (completed.length < MIN_JUDGES_FOR_DONE) {
      throw AppError.unavailable(
        'JUDGE_QUORUM_NOT_MET',
        `Chỉ ${completed.length}/5 judge chạy được — dưới ngưỡng ${MIN_JUDGES_FOR_DONE}, "đồng thuận" mất nghĩa. Hãy chạy lại.`,
        failed,
      );
    }

    const groupCount = await this.groupRound(
      specVersionId,
      round,
      completed.length,
      debias,
    );
    await this.prisma.project.update({
      where: { id: version.project_id },
      data: { judge_round: round, judge_rounds_total: { increment: 1 } },
    });
    await this.prisma.specVersion.update({
      where: { id: specVersionId },
      data: { status: 'UNDER_REVIEW' },
    });

    // Chốt số đo bất đồng **ngay lúc chạy**, không để lần đầu ai đó mở màn hình mới chốt
    // (NFR-JDG-6). Lỗi ở đây không được làm rơi cả vòng judge vừa tốn tiền thật — cùng lý lẽ
    // với `Promise.allSettled` ở trên.
    await this.agreement
      .recompute(specVersionId, round)
      .catch((err: unknown) => {
        this.logger.warn(
          `không chốt được số đo bất đồng vòng ${round}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    return { round, completed, failed, inputDigest, groupCount };
  }

  private safePromptHash(promptId: string): string {
    try {
      return this.llm.buildMessages(promptId, {}).promptHash;
    } catch {
      return 'unknown';
    }
  }

  private async linkIssueTargets(
    judgeRunId: string,
    specVersionId: string,
    issues: { title: string; target_card_title?: string }[],
  ): Promise<void> {
    const withTarget = issues.filter(
      (i) => (i.target_card_title ?? '').trim().length > 0,
    );
    if (withTarget.length === 0) return;

    const cards = await this.prisma.card.findMany({
      where: { spec_version_id: specVersionId },
      select: { id: true, title: true },
    });
    const rows = await this.prisma.issue.findMany({
      where: { judge_run_id: judgeRunId },
      select: { id: true, title: true },
    });

    for (const issue of withTarget) {
      const card = GeneratorService.matchCardByTitle(
        cards,
        issue.target_card_title ?? '',
      );
      if (!card) continue;
      const row = rows.find((r) => r.title === issue.title);
      if (!row) continue;
      await this.prisma.issue.update({
        where: { id: row.id },
        data: { target_card_id: card.id },
      });
    }
  }

  /**
   * Judge gây nhiễu nhất theo #9, **chỉ khi kiểm định null nói nó đáng kể**.
   *
   * Đọc từ bản ghi `JudgeAgreement` đã lưu chứ không tính lại: số đo phải cố định (NFR-JDG-6), và
   * tính lại ở đây là để một vòng judge tự chọn ai bị chạy ba lần dựa trên dữ liệu của chính nó.
   */
  private async disruptiveJudge(
    specVersionId: string,
  ): Promise<{ judgeKey: string; significant: boolean } | null> {
    const row = await this.prisma.judgeAgreement.findFirst({
      where: { spec_version_id: specVersionId },
      orderBy: { round: 'desc' },
      select: { patterns: true },
    });
    if (!row) return null;
    const parsed = disruptiveSchema.safeParse(row.patterns);
    if (!parsed.success) return null;
    return parsed.data.nullTest?.disruptive ?? null;
  }

  /**
   * Chạy một judge `k` lần rồi gộp bằng `consensusOf`.
   *
   * `k = 1` là **đúng đường cũ từng byte**: một lời gọi, trả nguyên `out`, không lọc gì.
   *
   * `Promise.allSettled` chứ không `Promise.all`, cùng lý do như 5 judge: một lần chạy lỗi không
   * được làm rơi hai lần kia — chúng **đã tốn tiền thật**. Và mẫu số của phép lọc chỉ đếm lần chạy
   * **thành công**; tính cả lần lỗi thì một sự cố mạng đẩy mọi issue trượt ngưỡng `≥ 2`.
   */
  private async runAttempts(
    k: number,
    req: {
      promptId: string;
      model: LlmModel;
      variables: Record<string, unknown>;
      link: {
        projectId: string;
        specVersionId: string;
        evalRunId: string | null;
      };
    },
  ): Promise<{
    out: JudgeCall;
    attempts: {
      ok: boolean;
      errorCode: string | null;
      raw: unknown;
      latencyMs: number;
    }[];
  }> {
    const call = async () => {
      const t0 = Date.now();
      const out = await this.llm.completeJson({
        promptId: req.promptId,
        schema: judgeOutputSchema,
        model: req.model,
        purpose: 'JUDGE',
        reasoningEffort: 'low',
        maxTokens: 8_000,
        variables: req.variables,
        link: req.link,
      });
      return { out, latencyMs: Date.now() - t0 };
    };

    if (k <= 1) {
      const { out, latencyMs } = await call();
      return {
        out,
        attempts: [{ ok: true, errorCode: null, raw: out.data, latencyMs }],
      };
    }

    const settled = await Promise.allSettled(
      Array.from({ length: k }, () => call()),
    );
    const attempts = settled.map((r) =>
      r.status === 'fulfilled'
        ? {
            ok: true,
            errorCode: null,
            raw: r.value.out.data,
            latencyMs: r.value.latencyMs,
          }
        : {
            ok: false,
            // Cùng mã lỗi với đường `FAILED` của cả judge — không thêm mã mới cho một tình
            // huống đã có mã.
            errorCode: 'LLM_UNAVAILABLE',
            raw: { error: String(r.reason) },
            latencyMs: 0,
          },
    );

    const okRuns = settled.flatMap((r) =>
      r.status === 'fulfilled' ? [r.value.out] : [],
    );
    // Cả k lần đều lỗi ⇒ ném lại lỗi đầu tiên để judge này vào đường `FAILED` như trước.
    if (okRuns.length === 0) {
      const first = settled.find((r) => r.status === 'rejected');
      throw first && first.status === 'rejected'
        ? first.reason
        : new Error('JUDGE_ALL_ATTEMPTS_FAILED');
    }

    // Truyền issue **nguyên vẹn**: `consensusOf` là generic nên kiểu chặt của `severity` và
    // `target_card_title` đi xuyên qua, không cần dựng lại và không cần `as`.
    const consensus = consensusOf(okRuns.map((o) => o.data.issues));
    this.logger.log(
      `#45 ${req.promptId}: ${consensus.attempts}/${k} lần chạy được · giữ ${consensus.issues.length} issue · loại ${consensus.dropped} (chỉ xuất hiện 1 lần)`,
    );

    // Trả về theo hình dạng của **một** lời gọi, với tập issue đã lọc. `promptHash` và `attempts`
    // lấy từ lần chạy đầu thành công — chúng nói về prompt và số lần sửa JSON, không về k.
    const base = okRuns[0];
    return {
      out: {
        ...base,
        data: { ...base.data, issues: consensus.issues },
      },
      attempts,
    };
  }

  /**
   * Dựng hàm bậc-đã-hiệu-chỉnh cho #44, và **lưu lại** thống kê đã dùng.
   *
   * Lưu chứ không tính lại: nhóm issue đã chốt phải giải thích được bằng thống kê **lúc đó**. Lịch
   * sử dài thêm một vòng là mọi trung bình đổi, và tính lại thì một nhóm cũ sẽ được biện minh bằng
   * con số nó chưa từng thấy — cùng lý lẽ NFR-JDG-6 của `JudgeAgreement`.
   *
   * Lịch sử **chỉ lấy từ `JudgeRun.status = 'OK'`**: nhận cả vòng `FAILED` là đưa nhiễu của một lỗi
   * hạ tầng vào thống kê về thói quen chấm điểm.
   */
  private async calibrationRankOf(
    specVersionId: string,
    round: number,
  ): Promise<RankOf | undefined> {
    const history = await this.prisma.issue.findMany({
      where: { judge_run: { status: 'OK' } },
      select: {
        severity: true,
        judge_run: {
          select: { judge_key: true, spec_version_id: true, round: true },
        },
      },
    });

    const stats = judgeStats(
      history.map((h) => ({
        judgeKey: h.judge_run.judge_key,
        severity: h.severity,
        roundKey: `${h.judge_run.spec_version_id}:${h.judge_run.round}`,
      })),
    );
    const scale = groupScale(stats);
    const byJudge = new Map(stats.map((s) => [s.judgeKey, s]));

    await this.prisma.$transaction(
      stats.map((st) =>
        this.prisma.judgeCalibration.upsert({
          where: {
            spec_version_id_round_judge_key: {
              spec_version_id: specVersionId,
              round,
              judge_key: st.judgeKey as JudgeKey,
            },
          },
          create: {
            spec_version_id: specVersionId,
            round,
            judge_key: st.judgeKey as JudgeKey,
            rounds: st.rounds,
            n: st.n,
            mean_rank: st.mean,
            sd_rank: st.sd,
            usable: st.usable,
            reason: st.reason,
          },
          update: {},
        }),
      ),
    );

    const usable = stats.filter((s) => s.usable).length;
    this.logger.log(
      `#44 hiệu chỉnh thang điểm: ${usable}/${stats.length} judge dùng được` +
        (usable === 0 ? ' — chưa đủ lịch sử, mọi mức đi qua nguyên vẹn' : ''),
    );
    // Không judge nào dùng được ⇒ trả `undefined` để `groupIssues` đi đúng đường bậc thô, thay vì
    // gọi một hàm luôn trả bậc thô. Rẻ hơn, và log ở trên nói rõ vì sao.
    if (usable === 0) return undefined;

    return (issue) =>
      calibratedRank(issue.severity, byJudge.get(issue.judgeKey), scale).rank;
  }

  /**
   * Gộp một lần lúc chạy và **lưu lại** — không tính lại lúc render, vì `agreement_count`
   * là con số đi vào báo cáo (NFR-JDG-6).
   */
  private async groupRound(
    specVersionId: string,
    round: number,
    judgesCompleted: number,
    debias: boolean,
  ): Promise<number> {
    const issues = await this.prisma.issue.findMany({
      where: {
        judge_run: { spec_version_id: specVersionId, round, status: 'OK' },
      },
      // `orderBy` là **bắt buộc**, không phải cho đẹp. `groupIssues` gộp tham lam: nó lấy khớp
      // *đầu tiên* và đổi `canonicalTitle` giữa chừng, nên đổi thứ tự đầu vào là ra tập nhóm
      // khác — và `agreement_count` là con số đi vào báo cáo. Không có `orderBy` thì Postgres
      // trả thứ tự nào cũng được, tức NFR-JDG-6 ("không tính lại ra hai số") chỉ là lời khẳng
      // định chứ chưa phải sự thật.
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      include: { judge_run: { select: { judge_key: true } } },
    });

    const raw: RawIssue[] = issues.map((i) => ({
      id: i.id,
      judgeKey: i.judge_run.judge_key,
      title: i.title,
      severity: i.severity,
      targetCardId: i.target_card_id,
    }));

    // Làn B · #44 — bậc dùng để chọn ai thắng nhóm, hiệu chỉnh theo thói quen chấm của từng judge.
    // Cờ tắt ⇒ `rankOf` là `undefined` ⇒ `groupIssues` dùng bậc thô, hành vi giống hệt trước #44.
    const rankOf = debias
      ? await this.calibrationRankOf(specVersionId, round)
      : undefined;
    const groups = groupIssues(raw, rankOf);

    for (const g of groups) {
      const created = await this.prisma.issueGroup.create({
        data: {
          spec_version_id: specVersionId,
          round,
          canonical_title: g.canonicalTitle,
          max_severity: g.maxSeverity,
          judge_keys: json(g.judgeKeys),
          agreement_count: g.judgeKeys.length,
          // Mẫu số là **số judge đã xong**, không phải hằng số 5 (C3 · F.7).
          judges_completed: judgesCompleted,
          disagreement_score:
            1 - g.judgeKeys.length / Math.max(1, judgesCompleted),
          status: 'OPEN',
        },
        select: { id: true },
      });
      await this.prisma.issue.updateMany({
        where: { id: { in: g.issueIds } },
        data: { issue_group_id: created.id },
      });
    }
    return groups.length;
  }

  async listIssueGroups(specVersionId: string) {
    const groups = await this.prisma.issueGroup.findMany({
      where: { spec_version_id: specVersionId },
      orderBy: [{ round: 'desc' }, { created_at: 'asc' }],
      include: {
        issues: {
          include: { judge_run: { select: { judge_key: true } } },
        },
      },
    });

    const rank = { CRITICAL: 3, MAJOR: 2, MINOR: 1 } as const;
    return groups
      .sort((a, b) => rank[b.max_severity] - rank[a.max_severity])
      .map((g) => ({
        id: g.id,
        round: g.round,
        canonical_title: g.canonical_title,
        max_severity: g.max_severity,
        judge_keys: (g.judge_keys as string[]) ?? [],
        agreement_count: g.agreement_count,
        judges_completed: g.judges_completed,
        disagreement_score: g.disagreement_score,
        status: g.status,
        issues: g.issues.map((i) => ({
          id: i.id,
          judge_key: i.judge_run.judge_key,
          severity: i.severity,
          title: i.title,
          reason: i.reason,
          suggestion: i.suggestion,
          target_card_id: i.target_card_id,
        })),
      }));
  }

  /** Endpoint bằng chứng, không phải endpoint debug (C3 · F.4). */
  async listJudgeRuns(specVersionId: string) {
    const runs = await this.prisma.judgeRun.findMany({
      where: { spec_version_id: specVersionId },
      orderBy: [{ round: 'asc' }, { judge_key: 'asc' }],
      select: {
        id: true,
        judge_key: true,
        round: true,
        model: true,
        prompt_id: true,
        prompt_hash: true,
        input_digest: true,
        // #43 — phải trả ra, không thì `shuffle_seed` chỉ là một chuỗi trong DB chứ không phải
        // bằng chứng: người kiểm chứng cần nó để tự tính lại và đối chiếu với
        // `seedFor(digest, judge_key, round)`.
        shuffle_seed: true,
        raw_output: true,
        parse_attempts: true,
        status: true,
        error_code: true,
        started_at: true,
        finished_at: true,
      },
    });
    return runs.map((r) => ({
      ...r,
      raw_output_sha256: createHash('sha256')
        .update(JSON.stringify(r.raw_output))
        .digest('hex'),
    }));
  }
}
