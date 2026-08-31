import { Injectable, Logger } from '@nestjs/common';
import { json } from '../../common/prisma-json';
import { PrismaService } from '../../common/prisma.service';
import {
  judgeAgreement,
  type AgreementReport,
  type CardVote,
  type GroupVote,
} from './agreement';

export type AgreementView = AgreementReport & {
  round: number;
  /** `true` khi bản ghi vừa được tính lần đầu thay vì đọc từ DB. */
  computed: boolean;
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
      where: { spec_version_id: specVersionId },
      orderBy: { round: 'desc' },
      select: { round: true },
    });
    return run?.round ?? null;
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

  private async compute(
    specVersionId: string,
    round: number,
  ): Promise<AgreementReport> {
    // Danh sách người chấm **chỉ** từ `status = 'OK'`. Không bao giờ suy từ `union(judge_keys)`:
    // làm vậy là âm thầm bỏ mất judge hoàn thành nhưng không nêu gì, tức thiên lệch chọn mẫu
    // theo hướng có lợi cho ta.
    const runs = await this.prisma.judgeRun.findMany({
      where: { spec_version_id: specVersionId, round, status: 'OK' },
      orderBy: { judge_key: 'asc' },
      select: { judge_key: true },
    });
    const raters = runs.map((r) => r.judge_key);

    const cards = await this.prisma.card.findMany({
      where: { spec_version_id: specVersionId },
      orderBy: { order_index: 'asc' },
      select: { id: true },
    });

    // `round` và `judge_key` nằm trên `JudgeRun`, không nằm trên `Issue` — phải join.
    const issues = await this.prisma.issue.findMany({
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
    });

    const votes: CardVote[] = issues
      .filter((i) => i.target_card_id !== null)
      .map((i) => ({
        judgeKey: i.judge_run.judge_key,
        cardId: i.target_card_id as string,
        severity: i.severity,
      }));

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

  private async persist(
    specVersionId: string,
    round: number,
    report: AgreementReport,
  ): Promise<void> {
    const data = {
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
    await this.prisma.judgeAgreement.upsert({
      where: {
        spec_version_id_round: { spec_version_id: specVersionId, round },
      },
      create: { spec_version_id: specVersionId, round, ...data },
      update: data,
    });
  }

  /** Dựng lại view từ dòng đã lưu. `Json` đọc bằng cấu trúc đã biết, không `as` bừa. */
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
    const patterns = (row.patterns ?? {}) as Partial<
      Pick<
        AgreementReport,
        'solo' | 'bias' | 'leaveOneOut' | 'unanimousGroups' | 'raters'
      >
    >;
    return {
      kappa: {
        kappa: row.kappa,
        reason: row.reason as AgreementReport['kappa']['reason'],
        raters: row.raters,
        items: row.items,
        unanimous: row.unanimous,
        degenerate: row.degenerate as AgreementReport['kappa']['degenerate'],
      },
      coverage: row.coverage,
      matrix: (row.matrix ?? {}) as AgreementReport['matrix'],
      solo: patterns.solo ?? [],
      bias: patterns.bias ?? [],
      leaveOneOut: patterns.leaveOneOut ?? [],
      unanimousGroups: patterns.unanimousGroups ?? 0,
      raters: patterns.raters ?? [],
    };
  }
}
