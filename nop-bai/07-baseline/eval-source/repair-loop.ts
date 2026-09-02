/**
 * Vòng sửa spec do **kịch bản** điều khiển — hiện thực Bước 10 của đề trong eval:
 *
 *   Judge ra issue → hệ thống đưa lựa chọn → chọn → sửa spec → chạy lại verifier liên quan
 *   → Judge kiểm tra lại → chốt.
 *
 * Vì sao file này tồn tại: trước nó, `runArm` chỉ chạy **một** vòng judge rồi dừng. Hệ quả là
 * `B2→SYS` không đo được gì (judge nêu issue nhưng spec không bao giờ được sửa), và
 * `SYS` với `SYS_NO_VERIFY` đi qua **đúng cùng một đường code** — `verifier_gate` chỉ tác động
 * ở nút xuất bản, mà eval không xuất bản bao giờ. Bảng ablation của báo cáo vì thế đo con số 0.
 *
 * Mọi thứ ở đây đi qua **đúng service của app thật**: `optionsForIssueGroup` → `record` →
 * `apply` → `verifySpecVersion`. Không có nhánh code riêng cho eval, nên không có chuyện
 * "eval chạy một đằng, app chạy một nẻo" (NFR-EVL-4).
 */
import { MAX_JUDGE_ROUNDS } from '../src/contracts/enums';
import { GATE_OPTIONS } from '../src/decision/decision.service';
import { ExportService } from '../src/spec/export.service';
import { scriptedChoice, type Services } from './harness';
import type { Arm } from '../src/generated/prisma/enums';

/**
 * Số issue xử mỗi vòng. **Đây là một cái van chi phí, không phải con số tuỳ ý:** mỗi issue tốn
 * một lời gọi `generator_options` cộng một `generator_revise` (`reasoning_effort: high`,
 * 10k token). 2 issue × 3 vòng = 6 lượt revise cho mỗi ý tưởng, cộng 15 lượt judge.
 *
 * Đánh đổi phải ghi vào báo cáo: kết quả là **cận dưới** của những gì vòng sửa làm được —
 * một người dùng thật xử hết mọi issue sẽ đi xa hơn.
 */
export const TOP_K_ISSUES_PER_ROUND = 2;

export type RepairStats = {
  rounds_run: number;
  decisions_applied: number;
  gate_decisions_applied: number;
  stopped_by:
    | 'NO_BLOCKING_ISSUE'
    | 'MAX_ROUNDS'
    | 'JUDGE_FAILED'
    | 'ROUND_LIMIT';
  error?: string;
};

export async function runRepairLoop(
  s: Services,
  projectId: string,
  arm: Arm,
  opts: { evalRunId?: string | null } = {},
): Promise<RepairStats> {
  const stats: RepairStats = {
    rounds_run: 0,
    decisions_applied: 0,
    gate_decisions_applied: 0,
    stopped_by: 'MAX_ROUNDS',
  };
  const evalRunId = opts.evalRunId ?? null;

  for (let round = 1; round <= MAX_JUDGE_ROUNDS; round++) {
    let version = await s.spec.currentVersionOf(projectId);

    try {
      await s.judge.runRound(version.id, { evalRunId });
    } catch (err) {
      // Quorum dưới 3/5, hoặc dự án đã tiêu hết số vòng cho phép. Dừng **ý tưởng này**,
      // không để rơi cả batch — 9 lượt còn lại đã tốn tiền thật.
      stats.stopped_by = isRoundLimit(err) ? 'ROUND_LIMIT' : 'JUDGE_FAILED';
      stats.error = err instanceof Error ? err.message : String(err);
      return stats;
    }
    stats.rounds_run = round;

    const groups = (await s.judge.listIssueGroups(version.id))
      .filter((g) => g.status === 'OPEN' && g.max_severity !== 'MINOR')
      .slice(0, TOP_K_ISSUES_PER_ROUND);

    for (const group of groups) {
      const { question, options } = await s.decision.optionsForIssueGroup(
        group.id,
      );
      const { decision } = await s.decision.record(projectId, {
        specVersionId: version.id,
        step: 'S4',
        issueGroupId: group.id,
        question,
        options,
        chosenKey: scriptedChoice(options),
        actor: 'SCRIPTED',
      });

      const applied = await s.decision.apply(projectId, decision.id);
      stats.decisions_applied += 1;

      // "Chạy lại verifier **liên quan**": chỉ những thẻ mà bản nháp có sửa. Thẻ không đụng
      // tới đã mang sang nhãn cũ nguyên vẹn, kiểm lại chúng là đốt token vô ích.
      await s.verifier.verifySpecVersion(applied.version.id, {
        projectId,
        evalRunId,
        cardIds: applied.revalidateCardIds,
      });
      version = applied.version;
    }

    /**
     * Chỗ **duy nhất** `SYS` khác `SYS_NO_VERIFY` — nên nó phải chạy **trước** mọi đường
     * thoát khỏi vòng lặp, kể cả đường "hội đồng không còn issue chặn nào".
     *
     * Bản đầu `break` ngay khi hết issue, và vì hội đồng thường sạch từ vòng 1, gate gần như
     * không bao giờ chạy — đúng cái lỗi mà file này được viết ra để sửa.
     */
    if (arm === 'SYS') {
      stats.gate_decisions_applied += await resolveGate(
        s,
        projectId,
        (await s.spec.currentVersionOf(projectId)).id,
        evalRunId,
      );
    }

    if (groups.length === 0) {
      // Hết issue chặn: đây là kết cục **tốt**, không phải lỗi. Ghi lại để báo cáo phân biệt
      // được "hội đồng đã hài lòng" với "hết vòng mà vẫn còn issue".
      stats.stopped_by = 'NO_BLOCKING_ISSUE';
      break;
    }
  }

  return stats;
}

/**
 * Xử mọi cặp (khẳng định, nguồn) mà verifier gate còn chặn. `ScriptedDecisionPolicy` luôn rơi
 * vào phương án được gợi ý — ở đây là "hạ xuống câu hỏi mở", một **luật, 0 token**.
 *
 * Nhờ vậy con số đưa vào báo cáo nói được đúng điều cần nói: gate hạ `unsupported_rate`
 * với chi phí LLM thêm gần bằng không.
 */
async function resolveGate(
  s: Services,
  projectId: string,
  specVersionId: string,
  evalRunId: string | null,
): Promise<number> {
  const exporter = s.app.get(ExportService);
  let applied = 0;
  let currentVersionId = specVersionId;

  /**
   * Mỗi lần áp dụng sinh một version mới, nên `card_source_id` của lần chặn trước không còn
   * thuộc version hiện tại — phải hỏi lại gate mỗi lượt thay vì lặp trên danh sách cũ.
   *
   * Trần lặp là số cặp bị chặn ở lượt đầu: mỗi lượt phải làm giảm số cặp đi ít nhất một,
   * nên vượt trần nghĩa là có gì đó không giảm, và lúc đó dừng đúng hơn là quay vòng.
   */
  const first = await exporter.checkGate(currentVersionId);
  if (!first.blocked || first.reason !== 'UNSUPPORTED_CITATION') return 0;
  const maxPasses = first.offenders.length;

  for (let pass = 0; pass < maxPasses; pass++) {
    const gate = await exporter.checkGate(currentVersionId);
    if (!gate.blocked || gate.offenders.length === 0) break;

    const { decision } = await s.decision.gateDecision(projectId, {
      cardSourceId: gate.offenders[0].card_source_id,
      // Cùng một `scriptedChoice` với vòng judge — không arm nào, không nhánh nào được
      // "người dùng thông minh hơn". Với `GATE_OPTIONS` nó luôn rơi vào C (0 token).
      chosenKey: scriptedChoice(GATE_OPTIONS),
      actor: 'SCRIPTED',
    });
    const result = await s.decision.apply(projectId, decision.id);
    applied += 1;

    await s.verifier.verifySpecVersion(result.version.id, {
      projectId,
      evalRunId,
      cardIds: result.revalidateCardIds,
    });
    currentVersionId = result.version.id;
  }

  return applied;
}

function isRoundLimit(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'JUDGE_ROUND_LIMIT'
  );
}
