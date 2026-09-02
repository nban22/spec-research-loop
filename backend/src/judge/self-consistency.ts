import { titleSimilarity } from '../common/text';

/**
 * B2c · #45 — tự nhất quán: chạy một judge **k lần** rồi chỉ giữ issue xuất hiện ở **≥ 2** lần.
 *
 * **Hàm thuần, 0 I/O.** Phần gọi LLM nằm ở `judge.service.ts`.
 *
 * ## Ý tưởng
 *
 * Một judge chạy một lần có thể nêu issue chỉ vì ngẫu nhiên của việc sinh văn bản. Chạy k lần và
 * giữ phần **lặp lại** thì lọc được nhiễu đó — đổi lấy chi phí gấp k.
 *
 * ## ⚠️ Ràng buộc DB làm đổi thiết kế
 *
 * `JudgeRun` có `@@unique([spec_version_id, judge_key, round])`. Ba lần chạy cùng vòng, cùng judge
 * **vi phạm ràng buộc đó**, và luật chung 2 cấm sửa ràng buộc đang có.
 *
 * Luật 2 nói luôn cách làm: *"cần trạng thái mới thì thêm bảng phụ"*. Nên k lần chạy thô nằm ở
 * `JudgeAttempt`, còn `JudgeRun` giữ **kết quả đã gộp** — vẫn đúng 5 dòng mỗi vòng. Nhờ vậy bằng
 * chứng độc lập (*"5 dòng cùng `input_digest`"*) và logic quorum `MIN_JUDGES_FOR_DONE` **không phải
 * sửa một dòng nào**.
 *
 * ## "Cùng một issue giữa các lần chạy" là gì
 *
 * Dùng lại `titleSimilarity` của `issue-grouping.ts` — **không** viết hàm so khớp thứ hai. Hai hàm
 * so khớp cho cùng một khái niệm là loại lỗi review PR #32 đã bắt: chúng lệch nhau rồi không gì
 * phát hiện. Hệ quả có ý thức: ngưỡng ở đây và ngưỡng gộp nhóm **cùng một con số**, nên đổi một chỗ
 * là đổi cả hai — đó là điều mong muốn, không phải đánh đổi.
 *
 * Thêm một chốt mà gộp nhóm không cần: hai issue chỉ được coi là **cùng một** nếu chúng nhắm
 * **cùng một thẻ**. Trong một lần chạy của **một** judge, hai issue trên hai thẻ khác nhau là hai
 * phát hiện khác nhau, dù tiêu đề giống.
 */

/** Cùng ngưỡng với `issue-grouping.ts`. Xem docblock trên về việc vì sao không tách hai ngưỡng. */
export const ATTEMPT_TITLE_THRESHOLD = 0.7;

/** Số lần lặp tối thiểu để một issue được giữ. */
export const MIN_OCCURRENCES = 2;

/**
 * Hình dạng **tối thiểu** mà phép gộp cần đọc. Tên trường khớp đúng schema output của judge
 * (`contracts/llm-io/judge.ts`) để issue đi qua **nguyên vẹn**, không phải dựng lại — dựng lại là
 * làm rộng kiểu (`severity` thành `string`) rồi phải `as` để nhét về, tức mất đúng chỗ compiler
 * đang bảo vệ.
 */
export type AttemptIssue = {
  title: string;
  severity: string;
  target_card_title?: string | null;
};

export type ConsensusIssue<T extends AttemptIssue> = T & {
  /** Số lần chạy đã nêu issue này. Luôn `>= MIN_OCCURRENCES`. */
  occurrences: number;
  /** Tổng số lần chạy thành công — mẫu số để đọc `occurrences`. */
  attempts: number;
};

export type ConsensusResult<T extends AttemptIssue> = {
  issues: ConsensusIssue<T>[];
  /** Số lần chạy thành công. `1` ⇒ không lọc được gì, xem `filtered`. */
  attempts: number;
  /** Số issue bị loại vì chỉ xuất hiện một lần. Con số để báo cáo cơ chế có tác dụng hay không. */
  dropped: number;
  /**
   * `false` khi chỉ có một lần chạy thành công — lúc đó **không lọc gì cả** và mọi issue đi qua.
   * Lọc với k=1 là loại sạch mọi issue, tức một lỗi hạ tầng biến thành *"judge không tìm ra gì"*.
   */
  filtered: boolean;
};

const RANK: Record<string, number> = { CRITICAL: 3, MAJOR: 2, MINOR: 1 };

function sameIssue(a: AttemptIssue, b: AttemptIssue): boolean {
  // Khác thẻ ⇒ khác phát hiện, kể cả tiêu đề giống.
  if ((a.target_card_title ?? null) !== (b.target_card_title ?? null)) {
    return false;
  }
  return titleSimilarity(a.title, b.title) >= ATTEMPT_TITLE_THRESHOLD;
}

/**
 * Gộp k lần chạy của **một** judge thành một tập issue.
 *
 * Quy ước khi hai lần chạy mô tả cùng một issue với mức khác nhau: lấy mức **nặng nhất**, cùng luật
 * với `groupIssues`. Hai chỗ dùng hai luật khác nhau cho cùng một tình huống là mời gọi một lỗi
 * không ai tìm ra.
 *
 * `attempts` chỉ đếm lần chạy **thành công**. Lần chạy lỗi không được tính vào mẫu số — nếu tính
 * thì một lỗi mạng làm mọi issue trượt ngưỡng `≥ 2`.
 */
export function consensusOf<T extends AttemptIssue>(
  attempts: T[][],
): ConsensusResult<T> {
  const n = attempts.length;
  if (n === 0) {
    return { issues: [], attempts: 0, dropped: 0, filtered: false };
  }
  // Một lần chạy ⇒ không có gì để so. Trả nguyên vẹn và nói rõ là **chưa lọc**.
  if (n === 1) {
    return {
      issues: attempts[0].map((i) => ({ ...i, occurrences: 1, attempts: 1 })),
      attempts: 1,
      dropped: 0,
      filtered: false,
    };
  }

  const buckets: { rep: T; seenIn: Set<number> }[] = [];
  attempts.forEach((issues, attemptIdx) => {
    for (const issue of issues) {
      const hit = buckets.find((b) => sameIssue(b.rep, issue));
      if (hit) {
        hit.seenIn.add(attemptIdx);
        // Mức nặng nhất thắng, cùng luật `groupIssues`.
        if ((RANK[issue.severity] ?? 0) > (RANK[hit.rep.severity] ?? 0)) {
          hit.rep = issue;
        }
      } else {
        buckets.push({ rep: issue, seenIn: new Set([attemptIdx]) });
      }
    }
  });

  const kept = buckets.filter((b) => b.seenIn.size >= MIN_OCCURRENCES);
  return {
    issues: kept
      .map((b) => ({ ...b.rep, occurrences: b.seenIn.size, attempts: n }))
      .sort(
        (a, b) =>
          b.occurrences - a.occurrences ||
          (RANK[b.severity] ?? 0) - (RANK[a.severity] ?? 0) ||
          a.title.localeCompare(b.title),
      ),
    attempts: n,
    dropped: buckets.length - kept.length,
    filtered: true,
  };
}

/**
 * Chọn judge nào được chạy k lần.
 *
 * **Không bật cho cả 5.** Job dài nhất hiện ~90 giây; 5 judge × 3 lần = 15 lời gọi có thể vượt.
 * Đường lui đã ghi ở epic #22: *"chỉ bật tự nhất quán cho judge có phương sai cao nhất — biết được
 * từ #9"*.
 *
 * Con số đó là `leaveOneOut` Δκ của #9, và nó **đã qua kiểm định null hoán vị** nên không buộc tội
 * oan. `null` ⇒ **không bật cho ai**: chưa có số đo thì không đoán, vì đoán sai là trả giá gấp ba
 * cho một judge không có vấn đề.
 */
export function judgeToRepeat(
  disruptive: { judgeKey: string; significant: boolean } | null | undefined,
): string | null {
  if (!disruptive) return null;
  if (!disruptive.significant) return null;
  return disruptive.judgeKey;
}
