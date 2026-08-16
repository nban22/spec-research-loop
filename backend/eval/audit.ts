/**
 * Chấm **blind** bằng auditor độc lập — deliverable #8, rủi ro #4 của kim-chỉ-nam.
 *
 *   npx tsx eval/audit.ts --batch=<uuid>
 *
 * Ba việc bắt buộc, làm đủ cả ba (STACK §2.6):
 * 1. Auditor chạy `deepseek-v4-pro` với `reasoning_effort: max` — khác tier với 5 judge.
 * 2. Prompt `prompts/auditor.md` viết độc lập, không import gì từ 5 file judge.
 * 3. **Chấm blind**: chỉ đưa nội dung 14 mục đã bóc sạch metadata (không decision log, không
 *    trace judge, không số version), gắn nhãn giả X/Y/Z, và **xáo thứ tự** theo từng ý tưởng.
 *
 * Limitation còn sót, phải ghi vào báo cáo: **độ dài văn bản là tín hiệu còn sót và không che
 * được** — B1 ngắn hơn hẳn các arm khác.
 */
import { auditorOutputSchema } from '../src/contracts/llm-io/judge';
import { json } from '../src/common/prisma-json';
import { boot, log } from './harness';

function arg(name: string, fallback = ''): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

/** Xáo deterministic theo `seed` — chạy lại cho ra đúng thứ tự cũ (NFR-EVL-2). */
function shuffleDeterministic<T>(items: T[], seed: string): T[] {
  const out = [...items];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function main() {
  const batchId = arg('batch');
  if (!batchId) throw new Error('cần --batch=<uuid>');

  const s = await boot();
  const runs = await s.prisma.evalRun.findMany({ where: { batch_id: batchId } });
  if (runs.length === 0) throw new Error(`batch ${batchId} không có lượt nào`);

  const byIdea = new Map<string, typeof runs>();
  for (const r of runs) {
    if (!byIdea.has(r.idea_id)) byIdea.set(r.idea_id, []);
    byIdea.get(r.idea_id)!.push(r);
  }

  const LABELS = ['X', 'Y', 'Z', 'W'];
  let n = 0;

  for (const [ideaId, group] of byIdea) {
    // Xáo thứ tự **theo từng ý tưởng** rồi mới gắn nhãn giả — auditor không suy ra được arm
    // từ vị trí trong danh sách.
    const shuffled = shuffleDeterministic(group, `${batchId}:${ideaId}`);

    for (const [i, run] of shuffled.entries()) {
      const blindLabel = LABELS[i] ?? `L${i}`;
      const version = await s.prisma.specVersion.findFirst({
        where: { project_id: run.project_id },
        orderBy: { version_no: 'desc' },
      });
      if (!version) continue;

      // Bóc sạch metadata: chỉ giữ nội dung 14 mục, bỏ tiêu đề dự án, số version, decision log.
      const sections = await s.spec.buildSections(version.id);
      const specText = sections
        .filter((sec) => sec.key !== 'decision_history')
        .map((sec) => `## ${sec.no}. ${sec.title}\n\n${sec.body || '(empty)'}`)
        .join('\n\n');

      try {
        const out = await s.llm.completeJson({
          promptId: 'auditor',
          schema: auditorOutputSchema,
          model: 'deepseek-v4-pro',
          purpose: 'AUDITOR',
          reasoningEffort: 'max',
          maxTokens: 8_000,
          variables: { spec_text: specText },
          link: { evalRunId: run.id },
        });

        const counts = { CRITICAL: 0, MAJOR: 0, MINOR: 0 };
        for (const issue of out.data.issues) counts[issue.severity] += 1;

        await s.prisma.auditorScore.create({
          data: {
            eval_run_id: run.id,
            blind_label: blindLabel,
            severity_counts: json(counts),
            raw: json(out.data),
          },
        });
        n += 1;
        log(
          `${ideaId} · nhãn ${blindLabel} (thật: ${run.arm}) → C${counts.CRITICAL}/M${counts.MAJOR}/m${counts.MINOR}`,
        );
      } catch (err) {
        log(`${ideaId} · ${blindLabel}: lỗi — ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  log(`\nĐã chấm ${n} bản. Nhãn thật chỉ được ghép lại lúc tổng hợp, không đưa cho auditor.`);
  await s.app.close();
}

void main();
