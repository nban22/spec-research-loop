/**
 * Tiện ích xem dữ liệu thật khi nghiệm thu phase (thay Prisma Studio khi cần in ra terminal).
 *   npx tsx scripts/db-peek.ts sources <projectId>
 *   npx tsx scripts/db-peek.ts judges  <specVersionId>
 *   npx tsx scripts/db-peek.ts llm     <projectId>
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const env = readFileSync(join(__dirname, '..', '.env'), 'utf8');
const url = /DATABASE_URL=(.*)/.exec(env)?.[1].trim() ?? '';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const [cmd, id] = process.argv.slice(2);

async function main() {
  if (cmd === 'sources') {
    const rows = await prisma.source.findMany({ where: { project_id: id } });
    console.log('total sources:', rows.length);
    for (const r of rows) {
      console.log(`- [${r.retrieved_from}] ${r.title.slice(0, 62)}`);
      console.log(
        `  doi=${r.doi ?? '—'} verified=${String(r.doi_verified)} abs_len=${(r.abstract ?? '').length} year=${r.year} ext=${r.external_id}`,
      );
    }
  } else if (cmd === 'judges') {
    const rows = await prisma.judgeRun.findMany({
      where: { spec_version_id: id },
      orderBy: [{ round: 'asc' }, { judge_key: 'asc' }],
    });
    console.log('judge runs:', rows.length);
    const t0 = Math.min(...rows.map((r) => r.started_at.getTime()));
    for (const r of rows) {
      const raw = JSON.stringify(r.raw_output);
      console.log(
        `${r.judge_key} r${r.round} ${r.status.padEnd(6)} model=${r.model.padEnd(18)} digest=${r.input_digest.slice(0, 16)} raw_sha=${hash(raw).slice(0, 12)} start_offset=${r.started_at.getTime() - t0}ms attempts=${r.parse_attempts}`,
      );
    }
    console.log('distinct input_digest:', new Set(rows.map((r) => r.input_digest)).size);
    console.log(
      'distinct raw_output   :',
      new Set(rows.map((r) => JSON.stringify(r.raw_output))).size,
    );
    console.log('max start spread (ms) :', Math.max(...rows.map((r) => r.started_at.getTime() - t0)));
  } else if (cmd === 'llm') {
    const rows = await prisma.llmCall.findMany({ where: { project_id: id } });
    const byPurpose = new Map<string, { n: number; pt: number; ct: number; hit: number; ms: number }>();
    for (const r of rows) {
      const k = r.purpose;
      const acc = byPurpose.get(k) ?? { n: 0, pt: 0, ct: 0, hit: 0, ms: 0 };
      acc.n++;
      acc.pt += r.prompt_tokens;
      acc.ct += r.completion_tokens;
      acc.hit += r.cache_hit_tokens;
      acc.ms += r.latency_ms;
      byPurpose.set(k, acc);
    }
    console.log('LlmCall rows:', rows.length);
    for (const [k, v] of byPurpose) {
      console.log(
        `  ${k.padEnd(16)} n=${String(v.n).padStart(2)} prompt=${String(v.pt).padStart(7)} out=${String(v.ct).padStart(6)} cache_hit=${String(v.hit).padStart(6)} avg_ms=${Math.round(v.ms / v.n)}`,
      );
    }
    console.log('  first-try JSON validity:', `${rows.filter((r) => r.attempts === 1).length}/${rows.length}`);
  } else {
    console.log('cmd: sources | judges | llm');
  }
  await prisma.$disconnect();
}

function hash(s: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('node:crypto').createHash('sha256').update(s).digest('hex');
}

void main();
