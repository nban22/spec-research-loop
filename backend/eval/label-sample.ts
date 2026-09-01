/**
 * Xuất một **mẫu mù** các cặp claim–nguồn ra JSON để gán nhãn ngoài app, rồi nạp ngược lại.
 *
 *   npx tsx eval/label-sample.ts --export --n=30
 *   npx tsx eval/label-sample.ts --import --file=eval/results/label-sample.json --by=<ai chấm>
 *
 * Màn hình `/projects/[id]/label` của làn A đã đủ cho việc gán tay từng cặp. File này thêm hai
 * thứ mà màn hình không làm được:
 *
 * 1. **Lấy mẫu phân tầng trên toàn bộ DB**, không riêng một `SpecVersion`. Gán 30 cặp của cùng
 *    một dự án thì lưới ngưỡng chỉ học được đặc điểm của dự án đó.
 * 2. **Gán ngoại tuyến**, cho người không tiện ngồi trước app, hoặc cho một model khác chấm.
 *
 * ## Mù, và mù có kiểm được
 *
 * Bản xuất **không chứa** `support_label`, `similarity`, `entailment`, `confidence`,
 * `evidence_sentence` hay `flags`. Người (hoặc model) chấm nhìn thấy nhãn máy thì phép đo chỉ còn
 * là *"có đồng ý với chính mình không"*. `select` liệt kê tường minh, không `include` cho tiện —
 * cùng lý lẽ với `human-check.service.ts`.
 *
 * **Phân tầng thì cần biết nhãn máy, nhưng người chấm thì không.** Script đọc nhãn máy để chia
 * đều ba tầng rồi **vứt nó đi trước khi ghi file**, và xáo thứ tự bằng seed cố định để thứ tự
 * trong file không tiết lộ tầng.
 *
 * ## Ai chấm phải ghi lại
 *
 * `--by` là **bắt buộc** và được ghi vào `HumanCheck.note`. Bảng tên là `HumanCheck`, nên một
 * dòng do model sinh ra mà không ghi nguồn gốc là bằng chứng giả. Xem `docs/handover.md`.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupportLabel } from '../src/contracts/enums';
import { EVAL_DIR, boot, log } from './harness';

function arg(name: string, fallback = ''): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

/** Ba tầng để phân bổ mẫu. Lấy toàn `SUPPORTED` thì lưới ngưỡng không có gì để phân biệt. */
const STRATA: SupportLabel[] = ['SUPPORTED', 'WEAK', 'UNSUPPORTED'];

/** Cắt abstract cho vừa đọc. 1500 ký tự giữ nguyên phần verifier thật sự dùng ở L2–L4. */
const ABSTRACT_CAP = 1500;

type BlindItem = {
  card_source_id: string;
  claim_title: string;
  claim_body: string;
  source_title: string;
  source_year: number | null;
  source_abstract: string;
  /** Người/model chấm điền vào đây. Để trống là bỏ qua cặp đó khi nạp. */
  label: SupportLabel | '';
  note: string;
};

/** LCG tất định — hai lần xuất cùng tham số ra cùng một mẫu, để ai cũng kiểm lại được. */
function shuffle<T>(items: T[], seed: number): T[] {
  let state = seed >>> 0;
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function doExport() {
  const n = Number(arg('n', '30'));
  const seed = Number(arg('seed', '42'));
  const perStratum = Math.ceil(n / STRATA.length);

  const s = await boot();
  const done = new Set(
    (await s.prisma.humanCheck.findMany({ select: { card_source_id: true } })).map(
      (d) => d.card_source_id,
    ),
  );

  /**
   * Lấy mẫu phân tầng **có bù**: gom sẵn từng tầng rồi rút vòng tròn cho tới khi đủ `n`.
   *
   * Bù là bắt buộc chứ không phải tiện tay: phân bố thật lệch nặng (ở lần chạy này
   * `SUPPORTED` chỉ có **1** cặp trên 473). Chia cứng `n/3` thì mẫu hụt hẳn một phần ba và
   * không ai biết vì sao. Rút vòng tròn lấy đều nhất có thể, hết tầng nào thì tầng còn lại gánh.
   */
  const pools: BlindItem[][] = [];
  for (const stratum of STRATA) {
    const rows = await s.prisma.cardSource.findMany({
      where: {
        support_label: stratum,
        // `entailment` phải có: `calibrate.ts` suy lại nhãn ở ngưỡng khác từ nó. Cặp dừng ở L2
        // không suy được, gán nó chỉ tốn công mà lưới ngưỡng không dùng được.
        entailment: { not: null },
      },
      select: {
        id: true,
        card: { select: { title: true, body: true } },
        source: { select: { title: true, year: true, abstract: true } },
      },
      orderBy: { id: 'asc' },
    });

    pools.push(
      shuffle(rows, seed)
        .filter((r) => !done.has(r.id))
        .map((r) => ({
          card_source_id: r.id,
          claim_title: r.card.title,
          claim_body: r.card.body,
          source_title: r.source.title,
          source_year: r.source.year,
          source_abstract: (r.source.abstract ?? '').slice(0, ABSTRACT_CAP),
          label: '' as const,
          note: '',
        })),
    );
  }

  const picked: BlindItem[] = [];
  const seen = new Set<string>();
  for (let round = 0; picked.length < n; round++) {
    let tookAny = false;
    for (const pool of pools) {
      const item = pool[round];
      if (!item || seen.has(item.card_source_id) || picked.length >= n) continue;
      seen.add(item.card_source_id);
      picked.push(item);
      tookAny = true;
    }
    // Mọi tầng đều cạn ⇒ dừng, đừng lặp vô hạn khi DB ít cặp hơn `n`.
    if (!tookAny) break;
  }

  // Xáo lần cuối: thứ tự trong file KHÔNG được tiết lộ tầng của cặp.
  const items = shuffle(picked, seed + 1).slice(0, n);

  const outDir = join(EVAL_DIR, 'results');
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, 'label-sample.json');
  writeFileSync(
    out,
    JSON.stringify(
      {
        _huong_dan:
          'Điền "label" cho từng mục: SUPPORTED (abstract có đoạn đỡ cho claim) · WEAK (liên quan nhưng không đủ đỡ) · UNSUPPORTED (không đỡ hoặc mâu thuẫn). Để trống thì bỏ qua.',
        exported_at: new Date().toISOString(),
        seed,
        items,
      },
      null,
      2,
    ),
  );
  log(`Đã xuất ${items.length} cặp mù ra ${out}`);
  await s.app.close();
}

async function doImport() {
  const file = arg('file', join(EVAL_DIR, 'results', 'label-sample.json'));
  const by = arg('by');
  if (!by) {
    throw new Error(
      'Thiếu --by=<ai chấm>. Bắt buộc: một dòng trong bảng `HumanCheck` mà không ghi ai sinh ra ' +
        'nó là bằng chứng giả.',
    );
  }
  if (!existsSync(file)) throw new Error(`Không thấy ${file}`);

  const items = (JSON.parse(readFileSync(file, 'utf8')) as { items: BlindItem[] }).items;
  const s = await boot();

  let written = 0;
  let skipped = 0;
  for (const item of items) {
    if (!item.label) {
      skipped += 1;
      continue;
    }
    const pair = await s.prisma.cardSource.findUnique({
      where: { id: item.card_source_id },
      select: { id: true, support_label: true },
    });
    if (!pair) {
      skipped += 1;
      continue;
    }

    const note = [`chấm bởi: ${by}`, item.note].filter(Boolean).join(' · ');
    await s.prisma.humanCheck.upsert({
      where: { id: item.card_source_id },
      create: {
        id: randomUUID(),
        card_source_id: pair.id,
        human_label: item.label,
        auto_label: pair.support_label,
        match: item.label === pair.support_label,
        note,
      },
      update: {},
    });
    written += 1;
  }

  log(`Đã ghi ${written} nhãn, bỏ qua ${skipped}. Nguồn gốc ghi vào HumanCheck.note: "${by}"`);
  log('Bước tiếp: npm run eval:build && node dist-eval/eval/calibrate.js');
  await s.app.close();
}

async function main() {
  if (hasFlag('export')) return doExport();
  if (hasFlag('import')) return doImport();
  throw new Error('Cần --export hoặc --import');
}

void main();
