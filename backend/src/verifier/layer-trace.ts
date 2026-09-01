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
      why: 'Không tra ra nguồn này ở bất kỳ registry nào, nên hệ thống dừng ngay ở bước kiểm tồn tại.',
    };
  }

  // Đặt ngay sau L0: nguồn không có thật thì đó mới là lý do chính, cờ này chỉ là thứ yếu.
  if (flags.includes('CITATION_ONLY')) {
    return {
      layer: 'L2',
      why: 'Loại thẻ này không được kiểm bằng phép kéo theo. Một khoảng trống nghiên cứu khẳng định điều gì đó chưa ai làm, còn một đóng góp khẳng định điều tác giả sắp làm — không tóm tắt đơn lẻ nào chứng minh được hai chuyện đó. Hệ thống chỉ xác nhận trích dẫn có thật, DOI tra được, và con số trong thẻ có mặt trong nguồn.',
    };
  }

  if (flags.includes('FABRICATED_QUOTE')) {
    return {
      layer: 'L4b',
      why: 'Mô hình trả về một câu trích không nằm nguyên văn trong nguồn, nên phán quyết của nó bị huỷ và cặp này bị hạ nhãn.',
    };
  }

  if (entailment !== null) {
    return {
      layer: hasPassages ? 'L3b' : 'L4',
      why: hasPassages
        ? 'Độ tương đồng nằm trong vùng xám nên hệ thống mở toàn văn bài báo, lấy các đoạn gần khẳng định nhất rồi mới hỏi mô hình.'
        : 'Độ tương đồng nằm trong vùng xám nên hệ thống hỏi mô hình để đối chiếu khẳng định với tóm tắt.',
    };
  }

  if (flags.includes('LLM_UNAVAILABLE')) {
    return {
      layer: 'L3',
      why: 'Bước tính độ tương đồng hoặc bước hỏi mô hình không chạy được. Không kiểm được thì không được coi là đã kiểm, nên nhãn bị hạ xuống mức yếu.',
    };
  }

  if (similarity === null) {
    if (flags.includes('NUMBER_NOT_IN_SOURCE')) {
      return {
        layer: 'L2',
        why: 'Khẳng định có con số mà nguồn không hề nhắc tới, và nguồn cũng không có tóm tắt để đối chiếu tiếp.',
      };
    }
    return {
      layer: 'L1',
      why: 'Nguồn không có tóm tắt nên không có gì để đối chiếu; nhãn bị giữ ở mức yếu.',
    };
  }

  if (similarity < th.tau_low) {
    return {
      layer: 'L3',
      why: `Câu gần nhất trong nguồn chỉ đạt độ tương đồng ${fmt(similarity)}, dưới ngưỡng ${fmt(th.tau_low)} — nguồn này không nói về khẳng định đó.`,
    };
  }

  if (similarity >= th.tau_high) {
    return {
      layer: 'L3',
      why: `Câu gần nhất trong nguồn đạt độ tương đồng ${fmt(similarity)}, vượt ngưỡng ${fmt(th.tau_high)} và không có cờ cảnh báo nào, nên hệ thống kết luận luôn mà không cần hỏi mô hình.`,
    };
  }

  // Vùng xám nhưng không có phán quyết ⇒ một cờ hạ trần đã chặn trước khi tới L4.
  return {
    layer: 'L2',
    why: 'Một cảnh báo ở bước kiểm số liệu hoặc kiểm tóm tắt đã hạ trần nhãn xuống mức yếu trước khi cần tới mô hình.',
  };
}
