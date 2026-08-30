import { KIND_PRIORITY, type AmbiguityFinding } from './ambiguity';

/**
 * Sinh câu hỏi làm rõ cho thẻ mơ hồ (#12) — **0 token, tất định**.
 *
 * Tiêu chí hoàn thành của #12 nói rõ: *"Câu hỏi sinh ra từ đây không làm tổng số câu hỏi tăng
 * so với hiện tại"*. Nên phần khó **không** phải sinh câu hỏi, mà là **hạn mức** và **thứ tự ưu
 * tiên** khi số thẻ mơ hồ nhiều hơn số chỗ còn trống.
 */

/** Nhãn hiển thị cho người dùng — tiếng Việt (frontend/CLAUDE.md §6). `Other` do UI tự chèn. */
export type ClarifyOption = {
  key: 'A' | 'B';
  label: string;
  explain: string;
  example: string;
  recommended?: boolean;
};

export type AmbiguityQuestion = {
  cardId: string;
  cardTitle: string;
  finding: AmbiguityFinding;
  question: string;
  options: ClarifyOption[];
};

/**
 * Trần số câu hỏi làm rõ **chưa trả lời** của một project.
 *
 * Bằng đúng `.max(4)` của `clarifying_questions` trong `analyzeOutputSchema` — tức là hạn mức
 * hệ thống vốn đã tự đặt cho mình ở bước 1. #12 đòi tổng **không tăng**, nên B6 không được cấp
 * thêm chỗ; nó **giành chỗ** trong cùng ngần ấy slot.
 */
export const MAX_OPEN_QUESTIONS = 4;

/**
 * Chọn câu hỏi nào được hỏi khi chỗ trống ít hơn số ứng viên.
 *
 * Đây là **chỗ nối** cho #10 (B4 — chọn câu hỏi theo giá trị thông tin). Bản hiện tại không
 * phải placeholder: nó là một hiện thực đầy đủ, tất định, có test. #10 sẽ thay bằng một hiện
 * thực khác **cùng chữ ký**, thông minh hơn, chứ không phải lấp một chỗ trống.
 */
export type QuestionRanker = (
  candidates: AmbiguityQuestion[],
  budget: number,
) => AmbiguityQuestion[];

/**
 * Hiện thực mặc định: xếp theo mức nghiêm trọng của cờ, hoà thì giữ nguyên thứ tự thẻ.
 * `CLAIM` thiếu baseline/metric luôn thắng — thiếu nó thì không thí nghiệm nào chạy được.
 */
export const severityRanker: QuestionRanker = (candidates, budget) => {
  if (budget <= 0) return [];
  return [...candidates]
    .map((q, i) => ({ q, i }))
    .sort(
      (a, b) =>
        KIND_PRIORITY[b.q.finding.kind] - KIND_PRIORITY[a.q.finding.kind] ||
        a.i - b.i,
    )
    .slice(0, budget)
    .map((x) => x.q);
};

/**
 * Một thẻ chỉ hỏi **một** câu — hỏi hai câu về cùng một thẻ là làm phiền người dùng.
 *
 * Câu hỏi mở đầu bằng chính `finding.reason`, tức **lý do thẻ bị cờ**. Không có nó thì người
 * dùng chỉ thấy thẻ mang nhãn `AMBIGUOUS` và một câu hỏi trống ngữ cảnh — `reason` nằm trong
 * `AmbiguityFlag` nhưng không đường nào ra tới giao diện, vì `Decision` chỉ có `question` và
 * `options`. Ghép vào đây là chỗ duy nhất nó tới được người dùng.
 */
export function buildQuestion(
  cardId: string,
  cardTitle: string,
  finding: AmbiguityFinding,
): AmbiguityQuestion {
  const q = buildQuestionCore(cardId, cardTitle, finding);
  return { ...q, question: `${finding.reason} ${q.question}` };
}

/** Phần khung câu hỏi theo từng loại cờ, chưa gắn lý do. */
function buildQuestionCore(
  cardId: string,
  cardTitle: string,
  finding: AmbiguityFinding,
): AmbiguityQuestion {
  const short =
    cardTitle.length > 60 ? `${cardTitle.slice(0, 60)}…` : cardTitle;

  switch (finding.kind) {
    case 'CLAIM_FIELD_VAGUE':
      return finding.field === 'baseline'
        ? {
            cardId,
            cardTitle,
            finding,
            question: `Khẳng định "${short}" đang so với cái gì?`,
            options: [
              {
                key: 'A',
                label: 'So với phương pháp tốt nhất hiện có',
                explain:
                  'Bạn nêu tên một phương pháp cụ thể đã công bố để đối chiếu.',
                example:
                  'Ví dụ: so với BM25, so với dense retrieval của paper X.',
                recommended: true,
              },
              {
                key: 'B',
                label: 'So với chính hệ thống này khi bỏ thành phần đề xuất',
                explain:
                  'Ablation — giữ nguyên mọi thứ, chỉ tắt phần bạn đóng góp.',
                example: 'Ví dụ: cùng pipeline nhưng không có bước rerank.',
              },
            ],
          }
        : {
            cardId,
            cardTitle,
            finding,
            question: `Đo khẳng định "${short}" bằng đại lượng nào?`,
            options: [
              {
                key: 'A',
                label: 'Chất lượng đầu ra',
                explain: 'Một metric có công thức rõ ràng, tính lại được.',
                example: 'Ví dụ: accuracy, F1, nDCG@10, recall@50.',
                recommended: true,
              },
              {
                key: 'B',
                label: 'Chi phí vận hành',
                explain: 'Đại lượng về tài nguyên, cũng đo được bằng số.',
                example: 'Ví dụ: độ trễ mỗi truy vấn, VRAM, số token tiêu thụ.',
              },
            ],
          };

    case 'GAP_FIELD_VAGUE':
      return finding.field === 'testable_experiment'
        ? {
            cardId,
            cardTitle,
            finding,
            question: `Thí nghiệm nào kiểm được khoảng trống "${short}"?`,
            options: [
              {
                key: 'A',
                label: 'So sánh với prior work trên cùng một dataset',
                explain:
                  'Chạy phương pháp cũ và phương pháp của bạn trên cùng dữ liệu, cùng metric.',
                example: 'Ví dụ: chạy cả hai trên ZaloLegal, báo nDCG@10.',
                recommended: true,
              },
              {
                key: 'B',
                label: 'Bỏ thành phần đề xuất rồi đo lại',
                explain:
                  'Ablation — chứng minh phần đóng góp thật sự có tác dụng.',
                example: 'Ví dụ: tắt bước rerank, xem nDCG@10 tụt bao nhiêu.',
              },
            ],
          }
        : {
            cardId,
            cardTitle,
            finding,
            question: `Trường \`${finding.field}\` của "${short}" còn chung chung. Bạn muốn làm rõ thế nào?`,
            options: [
              {
                key: 'A',
                label: 'Thay bằng một con số hoặc mốc đo được',
                explain: 'Biến nhận định định tính thành thứ kiểm lại được.',
                example: 'Ví dụ: "kém chính xác" → "recall@50 dưới 0.4".',
                recommended: true,
              },
              {
                key: 'B',
                label: 'Nêu tên phương pháp hoặc dataset cụ thể',
                explain: 'Neo câu chữ vào một đối tượng có thật, tra lại được.',
                example: 'Ví dụ: "các phương pháp trước" → "BM25 và SBERT".',
              },
            ],
          };

    case 'DANGLING_PRONOUN':
      return {
        cardId,
        cardTitle,
        finding,
        question: `Câu mở đầu của thẻ "${short}" dùng đại từ không rõ. "Nó" ở đây là gì?`,
        options: [
          {
            key: 'A',
            label: 'Phương pháp tôi đề xuất',
            explain: 'Câu đang nói về đóng góp của bạn.',
            example:
              'Ví dụ: "It improves…" → "The hybrid retriever improves…".',
            recommended: true,
          },
          {
            key: 'B',
            label: 'Vấn đề hoặc hiện tượng đang mô tả',
            explain: 'Câu đang nói về bối cảnh, không phải về phương pháp.',
            example: 'Ví dụ: "It degrades…" → "Retrieval quality degrades…".',
          },
        ],
      };

    case 'VAGUE_TERM':
    default:
      return {
        cardId,
        cardTitle,
        finding,
        question: `Thẻ "${short}" dùng từ định tính (${finding.terms.join(', ')}). Bạn muốn xử lý thế nào?`,
        options: [
          {
            key: 'A',
            label: 'Thay bằng một đại lượng đo được',
            explain: 'Từ định tính trở thành thứ thí nghiệm kiểm được.',
            example: 'Ví dụ: "hiệu quả hơn" → "nDCG@10 cao hơn 3 điểm".',
            recommended: true,
          },
          {
            key: 'B',
            label: 'Giữ nguyên — đây chỉ là mô tả, không phải khẳng định',
            explain:
              'Câu này không hứa hẹn gì cần chứng minh, nên không cần đo.',
            example: 'Ví dụ: câu dẫn nhập mô tả bối cảnh chung.',
          },
        ],
      };
  }
}
