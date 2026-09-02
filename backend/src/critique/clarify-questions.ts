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
            question: `What is the claim "${short}" being compared against?`,
            options: [
              {
                key: 'A',
                label: 'Against the best published method',
                explain: 'Name a specific published method to compare against.',
                example:
                  'For example: against BM25, or against the dense retriever from paper X.',
                recommended: true,
              },
              {
                key: 'B',
                label:
                  'Against this same system with the proposed component removed',
                explain:
                  'An ablation — keep everything, switch off only your contribution.',
                example:
                  'For example: the same pipeline without the rerank step.',
              },
            ],
          }
        : {
            cardId,
            cardTitle,
            finding,
            question: `Which quantity measures the claim "${short}"?`,
            options: [
              {
                key: 'A',
                label: 'Output quality',
                explain:
                  'A metric with a clear formula that can be recomputed.',
                example: 'For example: accuracy, F1, nDCG@10, recall@50.',
                recommended: true,
              },
              {
                key: 'B',
                label: 'Operating cost',
                explain: 'A resource quantity, also measurable as a number.',
                example:
                  'For example: latency per query, VRAM, tokens consumed.',
              },
            ],
          };

    case 'GAP_FIELD_VAGUE':
      return finding.field === 'testable_experiment'
        ? {
            cardId,
            cardTitle,
            finding,
            question: `Which experiment would test the gap "${short}"?`,
            options: [
              {
                key: 'A',
                label: 'Compare against prior work on the same dataset',
                explain:
                  'Run the old method and yours on the same data, with the same metric.',
                example:
                  'For example: run both on ZaloLegal and report nDCG@10.',
                recommended: true,
              },
              {
                key: 'B',
                label: 'Remove the proposed component and measure again',
                explain:
                  'An ablation — proof that the contribution actually does something.',
                example:
                  'For example: switch off the rerank step and see how far nDCG@10 falls.',
              },
            ],
          }
        : {
            cardId,
            cardTitle,
            finding,
            question: `The \`${finding.field}\` field of "${short}" is still generic. How do you want to sharpen it?`,
            options: [
              {
                key: 'A',
                label: 'Replace it with a number or a measurable threshold',
                explain:
                  'Turn a qualitative statement into something checkable.',
                example:
                  'For example: "poor accuracy" → "recall@50 below 0.4".',
                recommended: true,
              },
              {
                key: 'B',
                label: 'Name a specific method or dataset',
                explain:
                  'Anchor the wording to a real object that can be looked up.',
                example: 'For example: "prior methods" → "BM25 and SBERT".',
              },
            ],
          };

    case 'DANGLING_PRONOUN':
      return {
        cardId,
        cardTitle,
        finding,
        question: `The opening sentence of "${short}" uses an unclear pronoun. What does "it" refer to?`,
        options: [
          {
            key: 'A',
            label: 'The method I am proposing',
            explain: 'The sentence is about your contribution.',
            example:
              'For example: "It improves…" → "The hybrid retriever improves…".',
            recommended: true,
          },
          {
            key: 'B',
            label: 'The problem or phenomenon being described',
            explain: 'The sentence is about the context, not about the method.',
            example:
              'For example: "It degrades…" → "Retrieval quality degrades…".',
          },
        ],
      };

    case 'VAGUE_TERM':
    default:
      return {
        cardId,
        cardTitle,
        finding,
        question: `Card "${short}" uses qualitative wording (${finding.terms.join(', ')}). How do you want to handle it?`,
        options: [
          {
            key: 'A',
            label: 'Replace it with a measurable quantity',
            explain:
              'The qualitative wording becomes something an experiment can test.',
            example:
              'For example: "more effective" → "nDCG@10 higher by 3 points".',
            recommended: true,
          },
          {
            key: 'B',
            label: 'Leave it — this is description, not a claim',
            explain:
              'This sentence promises nothing that needs proving, so it needs no measurement.',
            example:
              'For example: an introductory sentence describing general context.',
          },
        ],
      };
  }
}
