import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { json } from '../../common/prisma-json';
import { PrismaService } from '../../common/prisma.service';
import {
  judgeAgreement,
  type AgreementReport,
  type CardVote,
  type GroupVote,
} from './agreement';

/** Hình dạng đã lưu trong cột `Json`. Đọc lên phải `safeParse`, không `as`. */
const kappaReasonSchema = z.enum([
  'MALFORMED_COUNTS',
  'NO_ITEMS',
  'INSUFFICIENT_ITEMS',
  'INSUFFICIENT_RATERS',
  'NO_VARIANCE',
]);
const degenerateSchema = z.enum(['IDENTICAL_ROWS']);
const storedMatrixSchema = z.record(
  z.string(),
  z.record(
    z.string(),
    z.object({ value: z.number().nullable(), union: z.number() }),
  ),
);
const storedPatternsSchema = z.object({
  solo: z.array(
    z.object({
      judgeKey: z.string(),
      solo: z.number(),
      raised: z.number(),
      rate: z.number().nullable(),
    }),
  ),
  bias: z.array(
    z.object({
      judgeKey: z.string(),
      bias: z.number().nullable(),
      n: z.number(),
    }),
  ),
  leaveOneOut: z.array(
    z.object({
      judgeKey: z.string(),
      delta: z.number().nullable(),
      kappaWithout: z.number().nullable(),
    }),
  ),
  unanimousGroups: z.number(),
  raters: z.array(z.string()),
});

export type AgreementView = AgreementReport & {
  round: number;
  /** `true` khi bản ghi vừa được tính lần đầu thay vì đọc từ DB. Giao diện hiện nguồn gốc số. */
  computed: boolean;
};

export type AgreementResponse = {
  /**
   * `false` khi `Project.judge_agreement` tắt.
   *
   * Cờ **chỉ gác phần hiển thị**, không gác phần tính: số đo là bằng chứng, 0 token, và nếu gác
   * luôn thì #13 quên bật là ablation không có dữ liệu mà không ai biết. Cùng khuôn với
   * `OverclaimService.scanVersion` trả `{ enabled: false }`.
   */
  enabled: boolean;
  agreement: AgreementView | null;
};

/**
 * B3 · đo bất đồng giữa các judge (#9).
 *
 * **0 lời gọi LLM** — toàn bộ số liệu rút từ `JudgeRun` + `Issue` + `IssueGroup` đã có.
 *
 * Kết quả được **lưu** chứ không tính lại mỗi lần mở màn hình: NFR-JDG-6 nói *"điểm đồng thuận
 * phải cố định — không tính lại lúc render"*, và #13 cần bản ghi lịch sử để so κ trước/sau khi
 * bật #8. Vòng đã chạy trước khi có tính năng này thì lần đọc đầu sẽ tính-và-lưu (idempotent).
 */
@Injectable()
export class AgreementService {
  private readonly logger = new Logger(AgreementService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Vòng judge mới nhất của version. `null` khi chưa chạy judge lần nào. */
  private async latestRound(specVersionId: string): Promise<number | null> {
    const run = await this.prisma.judgeRun.findFirst({
      // **Phải** lọc `status: 'OK'`. Vòng mà cả 5 judge đều `FAILED` (key LLM sai, provider
      // chết) không đo được gì, nhưng nếu nhận nó thì một lượt GET sẽ ghi vĩnh viễn
      // `raters=0, reason=INSUFFICIENT_RATERS` làm bản ghi chính thức của vòng đó — mà vòng đó
      // lại không chạy lại được (`JUDGE_ROUND_EXISTS`). Thành ra một lỗi tạm biến thành một
      // "số đo" chết cứng.
      where: { spec_version_id: specVersionId, status: 'OK' },
      orderBy: { round: 'desc' },
      select: { round: true },
    });
    return run?.round ?? null;
  }

  /**
   * Đọc cho giao diện. Tính **vẫn chạy** khi cờ tắt (bản ghi lúc `runRound` đã có sẵn), chỉ là
   * không trả về — nên bật cờ lên là thấy ngay số của các vòng đã chạy, không phải chạy lại.
   */
  async forDisplay(specVersionId: string): Promise<AgreementResponse> {
    const version = await this.prisma.specVersion.findUniqueOrThrow({
      where: { id: specVersionId },
      select: { project: { select: { judge_agreement: true } } },
    });
    if (!version.project.judge_agreement) {
      return { enabled: false, agreement: null };
    }
    return {
      enabled: true,
      agreement: await this.forLatestRound(specVersionId),
    };
  }

  async forLatestRound(specVersionId: string): Promise<AgreementView | null> {
    const round = await this.latestRound(specVersionId);
    if (round === null) return null;

    const saved = await this.prisma.judgeAgreement.findUnique({
      where: {
        spec_version_id_round: { spec_version_id: specVersionId, round },
      },
    });
    if (saved) return { ...this.fromRow(saved), round, computed: false };

    // Đường **đọc** chỉ được *điền vào chỗ trống*, không được ghi đè.
    //
    // Lost update thật: job judge tạo `JudgeRun` dần dần, nên `latestRound` đã trả về N trước
    // khi `groupRound` chạy. Một GET rơi vào lúc đó sẽ tính ra báo cáo **không có nhóm nào**
    // (mọi `issue_group_id` còn null) rồi ghi xuống — sau khi `runRound` đã kịp ghi bản đầy đủ.
    // Kết quả: bản ghi chính thức bị thay bằng bản khuyết, và trước khi có `recompute` qua HTTP
    // thì **không gì sửa lại được**.
    const report = await this.compute(specVersionId, round);
    await this.fillIfAbsent(specVersionId, round, report);
    return { ...report, round, computed: true };
  }

  /** Tính lại vòng mới nhất và **ghi đè** — đường sửa chữa cho bản ghi đã lỗi thời. */
  async recomputeLatest(specVersionId: string): Promise<AgreementView | null> {
    const round = await this.latestRound(specVersionId);
    if (round === null) return null;
    const report = await this.compute(specVersionId, round);
    await this.persist(specVersionId, round, report);
    return { ...report, round, computed: true };
  }

  /**
   * Tính lại và ghi đè. Gọi ở cuối `runRound` để con số được chốt ngay lúc chạy, đúng tinh thần
   * NFR-JDG-6 — chứ không phải chốt vào lần đầu ai đó mở màn hình.
   */
  async recompute(specVersionId: string, round: number): Promise<void> {
    const report = await this.compute(specVersionId, round);
    await this.persist(specVersionId, round, report);
    this.logger.log(
      `agreement ${specVersionId} vòng ${round}: κ=${report.kappa.kappa ?? report.kappa.reason} ` +
        `(${report.kappa.raters} judge, ${report.kappa.items} thẻ)`,
    );
  }

  /**
   * Đọc trong **một** transaction: `runRound` ghi `Issue` rồi mới gán `issue_group_id` ở một
   * lệnh khác, nên đọc rời rạc có thể bắt được ảnh chụp bị xé — 5 judge `OK` nhưng issue đang
   * `createMany` dở, hoặc issue mới gán nhóm một nửa. Bản bị xé đó sẽ được lưu thành bản ghi
   * vĩnh viễn.
   */
  private async compute(
    specVersionId: string,
    round: number,
  ): Promise<AgreementReport> {
    // Danh sách người chấm **chỉ** từ `status = 'OK'`. Không bao giờ suy từ `union(judge_keys)`:
    // làm vậy là âm thầm bỏ mất judge hoàn thành nhưng không nêu gì, tức thiên lệch chọn mẫu
    // theo hướng có lợi cho ta.
    const [runs, cards, issues] = await this.prisma.$transaction([
      this.prisma.judgeRun.findMany({
        where: { spec_version_id: specVersionId, round, status: 'OK' },
        orderBy: { judge_key: 'asc' },
        select: { judge_key: true },
      }),
      this.prisma.card.findMany({
        where: { spec_version_id: specVersionId },
        orderBy: { order_index: 'asc' },
        select: { id: true },
      }),
      // `round` và `judge_key` nằm trên `JudgeRun`, không nằm trên `Issue` — phải join.
      this.prisma.issue.findMany({
        where: {
          judge_run: { spec_version_id: specVersionId, round, status: 'OK' },
        },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        select: {
          severity: true,
          target_card_id: true,
          issue_group_id: true,
          judge_run: { select: { judge_key: true } },
        },
      }),
    ]);
    const raters = runs.map((r) => r.judge_key);

    // `flatMap` thay vì `filter().map()` + `as string`: TS không thu hẹp được qua `.filter`
    // nếu không có type predicate, và `backend/CLAUDE.md` §3 cấm `as` để qua mặt compiler.
    const votes: CardVote[] = issues.flatMap((i) =>
      i.target_card_id === null
        ? []
        : [
            {
              judgeKey: i.judge_run.judge_key,
              cardId: i.target_card_id,
              severity: i.severity,
            },
          ],
    );

    // Nhóm: mức **nặng nhất** mỗi judge chấm cho nhóm đó. Đọc từ `Issue.severity`, **không** từ
    // `IssueGroup.max_severity` — cột đó chỉ có một giá trị cho cả nhóm nên dùng nó là biến mọi
    // judge thành cùng một nhãn, ba nhãn thu về một.
    const RANK: Record<string, number> = { MINOR: 1, MAJOR: 2, CRITICAL: 3 };
    const byGroup = new Map<string, Record<string, string>>();
    for (const i of issues) {
      if (i.issue_group_id === null) continue;
      const bucket = byGroup.get(i.issue_group_id) ?? {};
      const key = i.judge_run.judge_key;
      const current = bucket[key];
      if (current === undefined || RANK[i.severity] > RANK[current]) {
        bucket[key] = i.severity;
      }
      byGroup.set(i.issue_group_id, bucket);
    }
    const groups: GroupVote[] = [...byGroup.values()].map(
      (severityByJudge) => ({
        severityByJudge,
      }),
    );

    return judgeAgreement({
      raters,
      cardIds: cards.map((c) => c.id),
      votes,
      totalIssues: issues.length,
      groups,
    });
  }

  /**
   * Ghi **chỉ khi chưa có**. `update: {}` biến `upsert` thành no-op khi đã có dòng, nên đường
   * đọc không bao giờ đè lên bản đã chốt lúc chạy.
   */
  private async fillIfAbsent(
    specVersionId: string,
    round: number,
    report: AgreementReport,
  ): Promise<void> {
    await this.prisma.judgeAgreement.upsert({
      where: {
        spec_version_id_round: { spec_version_id: specVersionId, round },
      },
      create: {
        spec_version_id: specVersionId,
        round,
        ...this.toRow(report),
      },
      update: {},
    });
  }

  private async persist(
    specVersionId: string,
    round: number,
    report: AgreementReport,
  ): Promise<void> {
    await this.prisma.judgeAgreement.upsert({
      where: {
        spec_version_id_round: { spec_version_id: specVersionId, round },
      },
      create: { spec_version_id: specVersionId, round, ...this.toRow(report) },
      update: this.toRow(report),
    });
  }

  private toRow(report: AgreementReport) {
    return {
      raters: report.kappa.raters,
      items: report.kappa.items,
      kappa: report.kappa.kappa,
      reason: report.kappa.reason,
      unanimous: report.kappa.unanimous,
      degenerate: report.kappa.degenerate,
      coverage: report.coverage,
      matrix: json(report.matrix),
      patterns: json({
        solo: report.solo,
        bias: report.bias,
        leaveOneOut: report.leaveOneOut,
        unanimousGroups: report.unanimousGroups,
        raters: report.raters,
      }),
    };
  }

  /**
   * Dựng lại view từ dòng đã lưu, **kiểm bằng zod** thay vì `as`.
   *
   * `reason` và `degenerate` là cột `String` trần (luật chung 2 cấm thêm enum), nên giá trị đọc
   * lên **thật sự chưa được kiểm** — `as` ở đây là đúng ca `backend/CLAUDE.md` §3 cấm. Và bản
   * trước có comment nói "không `as` bừa" ngay trên 30 dòng làm đúng điều ngược lại.
   *
   * Dữ liệu lệch hình thì **báo ra**, không im lặng thoái hoá thành `[]`: một dòng thiếu
   * `raters` sẽ làm cả ma trận và mọi mẫu hình biến mất trong khi κ vẫn hiện đầy tự tin.
   */
  private fromRow(row: {
    raters: number;
    items: number;
    kappa: number | null;
    reason: string | null;
    unanimous: boolean;
    degenerate: string | null;
    coverage: number | null;
    matrix: unknown;
    patterns: unknown;
  }): AgreementReport {
    const parsed = storedPatternsSchema.safeParse(row.patterns);
    if (!parsed.success) {
      this.logger.warn(
        `JudgeAgreement.patterns lệch hình — số đo sẽ hiện thiếu. Chạy lại POST để sửa.`,
      );
    }
    const patterns = parsed.success ? parsed.data : null;
    const matrix = storedMatrixSchema.safeParse(row.matrix);

    return {
      kappa: {
        kappa: row.kappa,
        reason: kappaReasonSchema.safeParse(row.reason).data ?? null,
        raters: row.raters,
        items: row.items,
        unanimous: row.unanimous,
        degenerate: degenerateSchema.safeParse(row.degenerate).data ?? null,
      },
      coverage: row.coverage,
      matrix: matrix.success ? matrix.data : {},
      solo: patterns?.solo ?? [],
      bias: patterns?.bias ?? [],
      leaveOneOut: patterns?.leaveOneOut ?? [],
      unanimousGroups: patterns?.unanimousGroups ?? 0,
      raters: patterns?.raters ?? [],
    };
  }
}
