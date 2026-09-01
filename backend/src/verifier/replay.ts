import { Entailment, SupportLabel, VerifierFlag } from '../contracts/enums';
import { VerifierThresholds } from './thresholds';
import { decideLabel } from './verifier.service';

/**
 * Chấm lại nhãn của một cặp claim–nguồn ở **bộ ngưỡng khác**, dùng dữ liệu đã lưu — **0 token**.
 *
 * Đây là thứ làm cho `eval/calibrate.ts` khả thi. `thresholds.ts` tự thú trong comment rằng
 * 0.35 / 0.72 / 0.7 *"là ước đoán, không phải số đo"*; muốn đo thì phải quét lưới 27 bộ ngưỡng
 * trên tập human-label. Chạy lại verifier thật 27 lần là 27× tiền LLM và vài giờ. Nhưng
 * `CardSource` đã lưu đủ `similarity`, `entailment`, `confidence`, `flags` — nên nhãn ở ngưỡng
 * khác **suy lại được**, miễn là suy đúng đường đi của `verifyUnit`.
 *
 * Giới hạn phải nói thẳng: nếu ngưỡng mới đẩy một cặp vào vùng xám mà lần chạy cũ **không** gọi
 * L4, thì không có `entailment` để suy — trả `NO_L4_DATA` và **đếm riêng**, không đoán bừa.
 * `calibrate.ts` in cột đó ra để người đọc biết mỗi bộ ngưỡng dựa trên bao nhiêu cặp thật.
 */

export type ReplayInput = {
  similarity: number | null;
  entailment: Entailment | null;
  confidence: number | null;
  flags: VerifierFlag[];
};

export type ReplayResult =
  { label: SupportLabel; why: 'REPLAYED' } | { label: null; why: 'NO_L4_DATA' };

/** Cờ hạ trần nhãn xuống WEAK bất kể L3/L4 nói gì (ARCHITECTURE §6.4). */
const CAP_WEAK_FLAGS: VerifierFlag[] = [
  'EMPTY_ABSTRACT',
  'NUMBER_NOT_IN_SOURCE',
];

/**
 * Cờ **thuần chẩn đoán** — có mặt cũng không hạ nhãn, đúng như `verifyUnit` làm.
 *
 * `STALE_SOURCE`: cảnh báo nguồn cũ. `DOI_UNVERIFIED`: L0 cố ý không hạ nhãn khi registry không
 * tra được. `FULLTEXT_USED` / `FULLTEXT_UNAVAILABLE`: chỉ kể lại verifier đã đi đường nào.
 *
 * Thiếu hai cờ toàn văn ở đây thì replay đọc chúng như cờ chặn, và một cặp đi đường toàn văn sẽ
 * được chấm lại khác hẳn lúc chạy thật — hỏng đúng thứ `calibrate.ts` dựa vào.
 */
const NON_BLOCKING_FLAGS: VerifierFlag[] = [
  'STALE_SOURCE',
  'DOI_UNVERIFIED',
  'FULLTEXT_USED',
  'FULLTEXT_UNAVAILABLE',
];

export function replayLabel(
  input: ReplayInput,
  th: VerifierThresholds,
): ReplayResult {
  const { similarity, entailment, confidence, flags } = input;

  // L0 — nguồn không tồn tại thì mọi ngưỡng đều cho cùng một kết quả.
  if (flags.includes('SOURCE_NOT_FOUND')) {
    return { label: 'UNSUPPORTED', why: 'REPLAYED' };
  }

  // Loại thẻ không hỏi bằng phép kéo theo ⇒ pipeline dừng sau L2, mọi ngưỡng cho cùng kết quả.
  // Nhánh `similarity === null` bên dưới cũng ra WEAK, nhưng viết tường minh ở đây để ý định
  // không phụ thuộc vào một nhánh khác tình cờ đúng.
  if (flags.includes('CITATION_ONLY')) {
    return { label: 'WEAK', why: 'REPLAYED' };
  }

  // L3 hỏng hoặc L4 hỏng ⇒ pipeline ép WEAK, không phụ thuộc ngưỡng ("không kiểm được thì
  // không được coi là đã kiểm" — SYSTEM_DESIGN_ANALYSIS C2 · F.8).
  if (flags.includes('LLM_UNAVAILABLE')) {
    return { label: 'WEAK', why: 'REPLAYED' };
  }

  const capWeak = CAP_WEAK_FLAGS.some((f) => flags.includes(f));

  // Không có `similarity` ⇒ lần chạy cũ dừng trước L3 (abstract rỗng). Ngưỡng không đổi được điều đó.
  if (similarity === null) {
    return { label: 'WEAK', why: 'REPLAYED' };
  }

  if (similarity < th.tau_low) {
    return { label: 'UNSUPPORTED', why: 'REPLAYED' };
  }

  const blocking = flags.filter((f) => !NON_BLOCKING_FLAGS.includes(f));
  if (similarity >= th.tau_high && blocking.length === 0) {
    return { label: 'SUPPORTED', why: 'REPLAYED' };
  }

  // Vùng xám ⇒ cần phán quyết của L4. Không có thì thành thật báo không tái lập được.
  if (entailment === null) {
    return { label: null, why: 'NO_L4_DATA' };
  }

  return {
    label: decideLabel({
      verdict: entailment,
      confidence: confidence ?? 0,
      capWeak,
      th,
    }),
    why: 'REPLAYED',
  };
}
