import { jaccard } from '../common/text';
import { Entailment, SupportLabel } from '../contracts/enums';
import { extractNumbers } from '../verifier/numeric-guard';
import {
  DIRECTION_PAIRS,
  METRIC_NAMES,
  MIN_TOPIC_OVERLAP,
  NEGATION_BEFORE,
  NUMERIC_REL_TOLERANCE,
  PolarPair,
} from './conflict-lexicon';

/**
 * Tầng luật của bộ phát hiện nguồn mâu thuẫn (#3) — **hàm thuần, 0 token, 0 I/O**.
 *
 * §5 đề bài liệt "Phát hiện ambiguity và conflict" là chức năng **bắt buộc**. `CardStatus.CONFLICT`
 * đã có trong enum, đã có màu ở `status-style.ts`, cột `Card.conflict_with_card_id` đã khai trong
 * schema — nhưng trước file này **không một dòng backend nào gán chúng**.
 *
 * Ba tín hiệu, và chỉ tín hiệu đầu là `decisive`. Hai tín hiệu sau chỉ **đề cử** cặp cho tầng LLM,
 * vì cả hai đều có thể trúng nhầm và một cái cờ `CONFLICT` sai làm người dùng mất niềm tin nhanh
 * hơn nhiều so với việc bỏ sót.
 */

export type ConflictSide = {
  cardId: string;
  cardSourceId: string;
  sourceId: string;
  supportLabel: SupportLabel;
  entailment: Entailment | null;
  /** Câu chứng cứ L4 chọn; `null` khi cặp dừng ở L3 ⇒ rơi về `fallbackText`. */
  evidenceSentence: string | null;
  /** Abstract của nguồn — chỉ dùng khi không có câu chứng cứ. */
  fallbackText: string;
};

export type ConflictKind = 'POLARITY' | 'NUMERIC' | 'DIRECTION';

export type ConflictFinding = {
  kind: ConflictKind;
  /** `true` ⇒ luật đủ chắc, **không** hỏi LLM. `false` ⇒ ứng viên cho tầng vùng xám. */
  decisive: boolean;
  terms: string[];
  reason: string;
  textA: string;
  textB: string;
};

export type Polarity = 'PRO' | 'CON' | 'NEUTRAL';

/** Câu đem ra đối chiếu: ưu tiên câu chứng cứ, không có thì lấy abstract. */
export function textOf(side: ConflictSide): string {
  const evidence = side.evidenceSentence?.trim();
  return evidence && evidence.length > 0 ? evidence : side.fallbackText;
}

/**
 * **Không đọc thẳng `entailment`.**
 *
 * Cặp đi đường tắt L3 (`simMax >= tau_high`, không cờ) trả về `SUPPORTED` với
 * `entailment: null` — không bao giờ gọi LLM. Nếu chỉ so `ENTAILS` với `CONTRADICTS` thì ca kinh
 * điển "nguồn A rõ ràng ủng hộ, nguồn B phản bác" sẽ **không bao giờ** bị bắt, vì phía A không có
 * `entailment` để so.
 *
 * `NOT_ENTAILED` cố ý là `NEUTRAL`: thiếu bằng chứng **không phải** mâu thuẫn.
 */
export function polarityOf(side: ConflictSide): Polarity {
  if (side.entailment === 'CONTRADICTS') return 'CON';
  if (side.entailment === 'ENTAILS') return 'PRO';
  if (side.entailment === null && side.supportLabel === 'SUPPORTED')
    return 'PRO';
  return 'NEUTRAL';
}

type Pole = 'POS' | 'NEG' | null;

/**
 * Cực của một câu theo **một** cặp trái nghĩa, đã chuẩn hoá phủ định.
 * `null` = câu không nhắc tới cặp này.
 */
function poleOf(text: string, pair: PolarPair): Pole {
  const posMatch = pair.pos.exec(text);
  const negMatch = pair.neg.exec(text);

  // Cực âm tường minh ("underperforms") thắng cực dương bị phủ định, vì nó rõ nghĩa hơn.
  if (negMatch) {
    return NEGATION_BEFORE.test(text.slice(0, negMatch.index)) ? 'POS' : 'NEG';
  }
  if (posMatch) {
    return NEGATION_BEFORE.test(text.slice(0, posMatch.index)) ? 'NEG' : 'POS';
  }
  return null;
}

function metricsIn(text: string): string[] {
  return METRIC_NAMES.filter((m) => m.pattern.test(text)).map((m) => m.label);
}

/** Cổng cùng chủ đề — hai câu không nói về cùng một thứ thì không có gì để mâu thuẫn. */
function sameTopic(a: string, b: string): boolean {
  return jaccard(a, b) >= MIN_TOPIC_OVERLAP;
}

function polarityFinding(
  a: ConflictSide,
  b: ConflictSide,
): ConflictFinding | null {
  const pa = polarityOf(a);
  const pb = polarityOf(b);
  const opposed =
    (pa === 'PRO' && pb === 'CON') || (pa === 'CON' && pb === 'PRO');
  if (!opposed) return null;
  return {
    kind: 'POLARITY',
    decisive: true,
    terms: [pa, pb],
    reason:
      'Một nguồn được verifier chấm là hỗ trợ khẳng định, nguồn còn lại bị chấm là phản bác chính khẳng định đó.',
    textA: textOf(a),
    textB: textOf(b),
  };
}

function numericFinding(
  a: ConflictSide,
  b: ConflictSide,
): ConflictFinding | null {
  const textA = textOf(a);
  const textB = textOf(b);
  const shared = metricsIn(textA).filter((m) => metricsIn(textB).includes(m));
  if (shared.length === 0) return null;

  const numsA = extractNumbers(textA);
  const numsB = extractNumbers(textB);

  let worst: { x: number; y: number; unit: string | null; rel: number } | null =
    null;
  for (const x of numsA) {
    for (const y of numsB) {
      if ((x.unit ?? null) !== (y.unit ?? null)) continue;
      const denom = Math.max(Math.abs(x.value), Math.abs(y.value));
      if (denom === 0) continue;
      const rel = Math.abs(x.value - y.value) / denom;
      if (rel <= NUMERIC_REL_TOLERANCE) continue;
      if (!worst || rel > worst.rel)
        worst = { x: x.value, y: y.value, unit: x.unit ?? null, rel };
    }
  }
  if (!worst) return null;

  const unit = worst.unit ?? '';
  return {
    kind: 'NUMERIC',
    decisive: false,
    terms: [shared[0], `${worst.x}${unit}`, `${worst.y}${unit}`],
    reason: `Hai nguồn cùng báo cáo ${shared[0]} nhưng đưa ra hai con số khác nhau: ${worst.x}${unit} và ${worst.y}${unit}.`,
    textA,
    textB,
  };
}

function directionFinding(
  a: ConflictSide,
  b: ConflictSide,
): ConflictFinding | null {
  const textA = textOf(a);
  const textB = textOf(b);
  if (!sameTopic(textA, textB)) return null;

  for (const pair of DIRECTION_PAIRS) {
    const poleA = poleOf(textA, pair);
    const poleB = poleOf(textB, pair);
    if (poleA === null || poleB === null || poleA === poleB) continue;
    return {
      kind: 'DIRECTION',
      decisive: false,
      terms: [pair.label, poleA, poleB],
      reason: `Hai nguồn nói ngược chiều nhau về cùng một điểm (${pair.label}).`,
      textA,
      textB,
    };
  }
  return null;
}

/**
 * Hai nguồn của **cùng một** thẻ. Trả về mọi tín hiệu bắt được — bên gọi dùng `topConflict`
 * để chọn cái mạnh nhất, và dùng `decisive` để quyết có hỏi LLM hay không.
 */
export function detectSourceConflict(
  a: ConflictSide,
  b: ConflictSide,
): ConflictFinding[] {
  if (a.cardSourceId === b.cardSourceId) return [];
  return [
    polarityFinding(a, b),
    numericFinding(a, b),
    directionFinding(a, b),
  ].filter((f): f is ConflictFinding => f !== null);
}

/**
 * **Cùng một nguồn**, hai thẻ khác nhau: thẻ A tựa vào paper này theo cực dương, thẻ B theo cực âm.
 *
 * Đây là chỗ duy nhất `Card.conflict_with_card_id` có nghĩa thật — mâu thuẫn giữa hai *thẻ*, chứ
 * không phải giữa hai nguồn của một thẻ. Chỉ chạy tầng POLARITY: dữ liệu đã có sẵn trong
 * `CardSource`, tốn 0 token.
 */
export function detectCrossCardConflict(
  a: ConflictSide,
  b: ConflictSide,
): ConflictFinding | null {
  if (a.sourceId !== b.sourceId) return null;
  if (a.cardId === b.cardId) return null;
  const finding = polarityFinding(a, b);
  if (!finding) return null;
  return {
    ...finding,
    reason:
      'Hai thẻ cùng dựa vào một bài báo nhưng theo hai chiều ngược nhau: một thẻ coi bài này là chứng cứ ủng hộ, thẻ kia coi nó là chứng cứ phản bác.',
  };
}

const KIND_PRIORITY: Record<ConflictKind, number> = {
  POLARITY: 0,
  NUMERIC: 1,
  DIRECTION: 2,
};

/** Tín hiệu chắc nhất thắng: `decisive` trước, rồi POLARITY > NUMERIC > DIRECTION. */
export function topConflict(
  findings: ConflictFinding[],
): ConflictFinding | null {
  if (findings.length === 0) return null;
  return [...findings].sort((x, y) => {
    if (x.decisive !== y.decisive) return x.decisive ? -1 : 1;
    return KIND_PRIORITY[x.kind] - KIND_PRIORITY[y.kind];
  })[0];
}

/** Độ trùng chủ đề — bên gọi dùng để xếp hạng ứng viên trước khi cắt theo trần LLM. */
export function topicOverlap(a: ConflictSide, b: ConflictSide): number {
  return jaccard(textOf(a), textOf(b));
}
