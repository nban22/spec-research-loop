/**
 * Hiệu chỉnh ngưỡng verifier bằng nhãn của người (#4).
 *
 * `thresholds.ts` tự thú ngay trong comment: *"Đây là ước đoán, không phải số đo — hiệu chỉnh bằng
 * grid 3×3 trên 20 cặp human-label ở cuối phase 2 (`eval/calibrate.ts`)"*. File đó chưa từng tồn
 * tại, hằng `GRID` là export chết, và bảng `HumanCheck` không có dòng code nào đọc hay ghi. Đây là
 * file đóng cả ba lỗ hổng đó.
 *
 * **Không chạy lại verifier.** `CardSource` đã lưu `similarity`, `entailment`, `confidence`,
 * `flags`, nên nhãn ở một bộ ngưỡng khác **suy lại được** bằng `replayLabel` — hàm thuần có test.
 * Chạy thật 27 lần là 27× tiền LLM và vài giờ; replay là vài mili giây và cho đúng cùng kết quả,
 * trừ đúng một ca được đếm riêng và báo ra: ngưỡng mới đẩy cặp vào vùng xám mà lần chạy cũ không
 * gọi L4, nên không có `entailment` để suy.
 *
 *   npm run eval:build && node dist-eval/eval/calibrate.js
 */
import { replayLabel } from '../src/verifier/replay';
import {
  DEFAULT_THRESHOLDS,
  GRID,
  type VerifierThresholds,
} from '../src/verifier/thresholds';
import type { SupportLabel, VerifierFlag } from '../src/contracts/enums';
import { boot } from './harness';

const CONF_MIN_GRID = [0.6, 0.7, 0.8];

type LabelledPair = {
  human: SupportLabel;
  similarity: number | null;
  entailment: string | null;
  confidence: number | null;
  flags: VerifierFlag[];
};

type Scored = {
  th: VerifierThresholds;
  /** Nhị phân trên nhãn `SUPPORTED` — "máy có dám nói là có nguồn hỗ trợ không". */
  precision: number | null;
  recall: number | null;
  f1: number | null;
  /** Trung bình F1 của cả ba nhãn — chống việc tối ưu một nhãn rồi bỏ hai nhãn kia. */
  macroF1: number;
  accuracy: number;
  /** Số cặp không tái lập được ở bộ ngưỡng này. Càng cao thì con số càng ít đáng tin. */
  unresolved: number;
};

const LABELS: SupportLabel[] = ['SUPPORTED', 'WEAK', 'UNSUPPORTED'];

function f1Of(
  pairs: { pred: SupportLabel; gold: SupportLabel }[],
  target: SupportLabel,
): { precision: number | null; recall: number | null; f1: number | null } {
  const tp = pairs.filter((p) => p.pred === target && p.gold === target).length;
  const fp = pairs.filter((p) => p.pred === target && p.gold !== target).length;
  const fn = pairs.filter((p) => p.pred !== target && p.gold === target).length;
  const precision = tp + fp === 0 ? null : tp / (tp + fp);
  const recall = tp + fn === 0 ? null : tp / (tp + fn);
  const f1 =
    precision === null || recall === null || precision + recall === 0
      ? null
      : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

function score(pairs: LabelledPair[], th: VerifierThresholds): Scored {
  const resolved: { pred: SupportLabel; gold: SupportLabel }[] = [];
  let unresolved = 0;

  for (const p of pairs) {
    const r = replayLabel(
      {
        similarity: p.similarity,
        entailment: p.entailment as never,
        confidence: p.confidence,
        flags: p.flags,
      },
      th,
    );
    if (r.label === null) {
      unresolved += 1;
      continue;
    }
    resolved.push({ pred: r.label, gold: p.human });
  }

  const binary = f1Of(resolved, 'SUPPORTED');
  const perLabel = LABELS.map((l) => f1Of(resolved, l).f1 ?? 0);
  return {
    th,
    precision: binary.precision,
    recall: binary.recall,
    f1: binary.f1,
    macroF1: perLabel.reduce((a, b) => a + b, 0) / LABELS.length,
    accuracy:
      resolved.length === 0
        ? 0
        : resolved.filter((x) => x.pred === x.gold).length / resolved.length,
    unresolved,
  };
}

function fmt(x: number | null): string {
  return x === null ? '  —  ' : x.toFixed(3);
}

async function main(): Promise<void> {
  const s = await boot();
  try {
    const checks = await s.prisma.humanCheck.findMany({
      select: { card_source_id: true, human_label: true },
    });
    if (checks.length === 0) {
      console.log(
        'Bảng HumanCheck trống. Gán nhãn ở /projects/<id>/label trước đã.',
      );
      return;
    }

    const units = await s.prisma.cardSource.findMany({
      where: { id: { in: checks.map((c) => c.card_source_id) } },
      select: {
        id: true,
        similarity: true,
        entailment: true,
        confidence: true,
        flags: true,
      },
    });
    const unitOf = new Map(units.map((u) => [u.id, u]));

    const pairs: LabelledPair[] = checks.flatMap((c) => {
      const u = unitOf.get(c.card_source_id);
      if (!u) return [];
      return [
        {
          human: c.human_label,
          similarity: u.similarity,
          entailment: u.entailment,
          confidence: u.confidence,
          flags: Array.isArray(u.flags) ? (u.flags as VerifierFlag[]) : [],
        },
      ];
    });

    const dist = LABELS.map(
      (l) => `${l}=${pairs.filter((p) => p.human === l).length}`,
    ).join(' · ');
    console.log(`\n${pairs.length} cặp đã gán nhãn tay — phân bố: ${dist}`);
    if (pairs.length < 30) {
      console.log(
        `⚠ Dưới 30 cặp. #4 đòi ít nhất 30 trải đều ba nhãn; số dưới đây chỉ để tham khảo.`,
      );
    }

    const results: Scored[] = [];
    for (const tau_low of GRID.tau_low) {
      for (const tau_high of GRID.tau_high) {
        for (const conf_min of CONF_MIN_GRID) {
          if (tau_low >= tau_high) continue;
          results.push(
            score(pairs, {
              ...DEFAULT_THRESHOLDS,
              tau_low,
              tau_high,
              conf_min,
            }),
          );
        }
      }
    }

    console.log(
      '\nτ_low  τ_high conf   precision recall  F1     macroF1 accuracy  không tái lập',
    );
    console.log('─'.repeat(84));
    const current = results.find(
      (r) =>
        r.th.tau_low === DEFAULT_THRESHOLDS.tau_low &&
        r.th.tau_high === DEFAULT_THRESHOLDS.tau_high &&
        r.th.conf_min === DEFAULT_THRESHOLDS.conf_min,
    );
    for (const r of results) {
      const mark = r === current ? ' ← đang dùng' : '';
      console.log(
        `${r.th.tau_low.toFixed(2)}   ${r.th.tau_high.toFixed(2)}   ${r.th.conf_min.toFixed(2)}   ` +
          `${fmt(r.precision)}     ${fmt(r.recall)}   ${fmt(r.f1)}  ${fmt(r.macroF1)}   ${fmt(r.accuracy)}     ${String(r.unresolved).padStart(3)}${mark}`,
      );
    }

    // Xếp theo macroF1: tối ưu riêng nhãn SUPPORTED sẽ đẻ ra bộ ngưỡng gán SUPPORTED cho tất cả.
    // Phạt nhẹ theo số cặp không tái lập được, để không chọn bộ "đẹp" chỉ vì nó bỏ qua nhiều cặp.
    const best = [...results].sort(
      (a, b) =>
        b.macroF1 -
        b.unresolved / pairs.length / 10 -
        (a.macroF1 - a.unresolved / pairs.length / 10),
    )[0];

    console.log('\n── Kết luận ──');
    if (current) {
      console.log(
        `bộ đang dùng : τ_low=${current.th.tau_low} τ_high=${current.th.tau_high} conf=${current.th.conf_min} → macroF1=${fmt(current.macroF1)} F1(SUPPORTED)=${fmt(current.f1)}`,
      );
    }
    console.log(
      `bộ đề xuất   : τ_low=${best.th.tau_low} τ_high=${best.th.tau_high} conf=${best.th.conf_min} → macroF1=${fmt(best.macroF1)} F1(SUPPORTED)=${fmt(best.f1)}`,
    );
    if (current && best.macroF1 <= current.macroF1 + 1e-9) {
      console.log(
        'Bộ hiện tại đã tốt nhất trong lưới — **không đổi** `DEFAULT_THRESHOLDS`. Đây cũng là một kết quả đáng báo cáo.',
      );
    } else {
      console.log(
        'Bộ đề xuất tốt hơn ⇒ đổi `DEFAULT_THRESHOLDS` trong `src/verifier/thresholds.ts` và ghi lý do vào commit.',
      );
    }
  } finally {
    await s.app.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
