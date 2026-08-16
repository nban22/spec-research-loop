/**
 * Chạy batch đánh giá 3+1 arm — deliverable #7.
 *
 *   npx tsx eval/run-eval.ts --batch=<uuid> --arms=B1,B2,SYS,SYS_NO_VERIFY --limit=10 --resume
 *
 * Hai luật chống sai lệch âm thầm (SYSTEM_DESIGN_ANALYSIS C5 · F.7):
 *
 * 1. **Chạy xen kẽ theo ý tưởng, không theo arm**, và **hoán vị thứ tự arm** theo chỉ số ý tưởng.
 *    Nếu chạy hết 10 ý tưởng của B2 rồi mới sang SYS thì SYS thấy `Source` đã nằm sẵn trong DB →
 *    nhanh hơn, ít lỗi rate limit hơn → cột "thời gian" của SYS đẹp **một cách giả tạo**.
 * 2. **`--resume` đi bằng ràng buộc DB** `UNIQUE(batch_id, arm, idea_id)`, không bằng file trạng
 *    thái riêng — cùng một mô típ với idempotency ở C1 và C3.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { json } from '../src/common/prisma-json';
import type { Arm } from '../src/generated/prisma/enums';
import { EVAL_DIR, PROMPT_IDS, boot, ensureEvalUser, log, runArm, type Idea } from './harness';
import { join } from 'node:path';

function arg(name: string, fallback = ''): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const batchId = arg('batch', randomUUID());
  const arms = arg('arms', 'B1,B2,SYS,SYS_NO_VERIFY').split(',') as Arm[];
  const limit = Number(arg('limit', '10'));
  const resume = hasFlag('resume');

  const ideas = (
    JSON.parse(readFileSync(join(EVAL_DIR, 'ideas.json'), 'utf8')) as Idea[]
  ).slice(0, limit);

  const s = await boot();
  const userId = await ensureEvalUser(s.prisma);

  // `prompt_hash` của TỪNG prompt vào config — dữ liệu làm cho kiểm tra ở `score.ts` chạy được.
  const promptHashes: Record<string, string> = {};
  for (const id of PROMPT_IDS) {
    try {
      promptHashes[id] = s.prompts.hashOf(id);
    } catch {
      promptHashes[id] = 'missing';
    }
  }

  log(`batch=${batchId} · ${ideas.length} ý tưởng × ${arms.length} arm = ${ideas.length * arms.length} lượt`);

  let done = 0;
  for (const [i, idea] of ideas.entries()) {
    // Hoán vị thứ tự arm theo chỉ số ý tưởng — không arm nào luôn được chạy sau.
    const order = arms.map((_, k) => arms[(k + i) % arms.length]);

    for (const arm of order) {
      done += 1;
      const existing = await s.prisma.evalRun.findUnique({
        where: { batch_id_arm_idea_id: { batch_id: batchId, arm, idea_id: idea.id } },
      });
      if (existing && resume) {
        log(`[${done}/${ideas.length * arms.length}] bỏ qua ${idea.id}/${arm} (đã có)`);
        continue;
      }

      log(`[${done}/${ideas.length * arms.length}] chạy ${idea.id}/${arm}…`);
      const result = await runArm(s, userId, idea, arm);

      const tokens = await s.prisma.llmCall.aggregate({
        where: { project_id: result.projectId },
        _sum: { prompt_tokens: true, completion_tokens: true },
      });

      await s.prisma.evalRun.upsert({
        where: { batch_id_arm_idea_id: { batch_id: batchId, arm, idea_id: idea.id } },
        create: {
          batch_id: batchId,
          arm,
          idea_id: idea.id,
          project_id: result.projectId,
          config: json({
            model_generator: 'deepseek-v4-pro',
            model_flash: 'deepseek-v4-flash',
            temperature: 0,
            prompt_hashes: promptHashes,
            note: 'DeepSeek không có tham số seed — xem limitation trong evaluation_report.md',
          }),
          total_tokens:
            (tokens._sum.prompt_tokens ?? 0) + (tokens._sum.completion_tokens ?? 0),
          wall_ms: result.wallMs,
          ok: !result.error,
          error_text: result.error ?? null,
        },
        update: {
          project_id: result.projectId,
          total_tokens:
            (tokens._sum.prompt_tokens ?? 0) + (tokens._sum.completion_tokens ?? 0),
          wall_ms: result.wallMs,
          ok: !result.error,
          error_text: result.error ?? null,
        },
      });

      log(
        result.error
          ? `   ✗ ${idea.id}/${arm}: ${result.error.slice(0, 120)}`
          : `   ✓ ${idea.id}/${arm} — ${(result.wallMs / 1000).toFixed(1)}s`,
      );
    }
  }

  log(`Xong. batch=${batchId}`);
  log(`Bước tiếp: npx tsx eval/score.ts --batch=${batchId}`);
  await s.app.close();
}

void main();
