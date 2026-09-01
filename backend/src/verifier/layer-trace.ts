import { Entailment, VerifierFlag } from '../contracts/enums';
import { VerifierThresholds } from './thresholds';

/**
 * Suy ra **tầng nào đã quyết định nhãn** của một cặp claim–nguồn — hàm thuần, 0 I/O.
 *
 * Đây là ruột của trang "vì sao nhãn này" (#5). Không thêm bảng nào để lưu tầng: đường đi của
 * `verifyUnit` là **xác định**, nên từ `similarity`/`entailment`/`flags` đã lưu là suy ngược được.
 * Thêm một cột chỉ để chứa một chữ mà mọi hàng cũ đều `null` thì đắt hơn hàm này.
 *
 * `why` viết bằng tiếng Việt vì nó hiện thẳng cho người dùng, không phải log kỹ thuật.
 */

export type VerifierLayer = 'L0' | 'L1' | 'L2' | 'L3' | 'L3b' | 'L4' | 'L4b';

export type LayerTrace = {
  layer: VerifierLayer;
  why: string;
};

export type LayerTraceInput = {
  similarity: number | null;
  entailment: Entailment | null;
  flags: VerifierFlag[];
  /** Có đoạn toàn văn nào được ghi cho cặp này không — dấu hiệu duy nhất của tầng L3b. */
  hasPassages: boolean;
};

function fmt(x: number): string {
  return x.toFixed(2);
}

export function decidingLayer(
  input: LayerTraceInput,
  th: VerifierThresholds,
): LayerTrace {
  const { similarity, entailment, flags, hasPassages } = input;

  if (flags.includes('SOURCE_NOT_FOUND')) {
    return {
      layer: 'L0',
      why: 'This source was not found in any registry, so the system stopped at the existence check.',
    };
  }

  // Placed right after L0: if the source is not real that is the primary reason, and this flag is secondary.
  if (flags.includes('CITATION_ONLY')) {
    return {
      layer: 'L2',
      why: 'This card type is not scored by entailment. A research gap asserts that nobody has done something, and a contribution asserts what the author is about to do — no single abstract can prove either. The system only confirms that the citation is real, that the DOI resolves, and that any number in the card appears in the source.',
    };
  }

  if (flags.includes('FABRICATED_QUOTE')) {
    return {
      layer: 'L4b',
      why: 'The model returned a quote that does not appear verbatim in the source, so its verdict was discarded and this pair was downgraded.',
    };
  }

  if (entailment !== null) {
    return {
      layer: hasPassages ? 'L3b' : 'L4',
      why: hasPassages
        ? 'The similarity fell in the grey zone, so the system opened the full paper, took the passages closest to the claim, and only then asked the model.'
        : 'The similarity fell in the grey zone, so the system asked the model to compare the claim against the abstract.',
    };
  }

  if (flags.includes('LLM_UNAVAILABLE')) {
    return {
      layer: 'L3',
      why: 'The similarity step or the model call could not run. What cannot be checked must not count as checked, so the label was lowered to weak.',
    };
  }

  if (similarity === null) {
    if (flags.includes('NUMBER_NOT_IN_SOURCE')) {
      return {
        layer: 'L2',
        why: 'The claim contains a number the source never mentions, and the source has no abstract to check any further.',
      };
    }
    return {
      layer: 'L1',
      why: 'The source has no abstract, so there is nothing to check against; the label stays at weak.',
    };
  }

  if (similarity < th.tau_low) {
    return {
      layer: 'L3',
      why: `The closest sentence in the source only reached ${fmt(similarity)} similarity, below the ${fmt(th.tau_low)} threshold — this source does not talk about that claim.`,
    };
  }

  if (similarity >= th.tau_high) {
    return {
      layer: 'L3',
      why: `The closest sentence in the source reached ${fmt(similarity)} similarity, above the ${fmt(th.tau_high)} threshold with no warning flags, so the system concluded without asking the model.`,
    };
  }

  // Grey zone but no verdict ⇒ a ceiling-lowering flag stopped it before L4.
  return {
    layer: 'L2',
    why: 'A warning from the number check or the abstract check capped the label at weak before the model was needed.',
  };
}
