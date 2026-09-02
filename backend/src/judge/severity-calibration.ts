/**
 * B2b · #44 — chuẩn hoá thang điểm mức độ theo từng judge.
 *
 * **Hàm thuần, 0 I/O, 0 lời gọi LLM.**
 *
 * ## Vấn đề
 *
 * `CRITICAL` / `MAJOR` / `MINOR` là thang **chủ quan**. `groupIssues` lấy **mức nặng nhất** trong
 * nhóm (`issue-grouping.ts`), nên nếu J4 quen chấm nặng tay thì J4 quyết mức của **mọi nhóm nó
 * tham gia** — không phải vì lỗi nặng hơn, mà vì J4 chấm nặng hơn. Panel của #9 đo được đúng độ
 * lệch đó (`Chấm nặng tay nhất`).
 *
 * ## Chỉ hiệu chỉnh cho việc GỘP NHÓM, không ghi đè `Issue.severity`
 *
 * Mức mà judge đã chấm là **bằng chứng thô** — nó nằm trong `raw_output` và trong `Issue.severity`,
 * và cả hai là thứ người chấm đồ án đối chiếu được. Sửa nó là xoá dữ liệu gốc để làm đẹp dữ liệu
 * dẫn xuất. Nên hàm này chỉ trả ra mức **dùng để gộp**; `Issue.severity` giữ nguyên.
 *
 * ## ⚠️ Ngưỡng mẫu tối thiểu — chốt bắt buộc, không phải tuỳ chọn
 *
 * z-score cần trung bình và độ lệch chuẩn **của chính judge đó**. Với lịch sử mỏng, hai đại lượng
 * này vô nghĩa: một lần chấm lệch làm cả phân phối lệch theo, và "khử lệch" sẽ **tự tạo ra lệch**
 * — tệ hơn là không làm gì.
 *
 * Ba chốt, mỗi chốt chặn một cách hỏng khác nhau:
 *
 * | chốt | chặn cái gì |
 * |---|---|
 * | `rounds < MIN_ROUNDS_FOR_CALIBRATION` | lịch sử quá mỏng để nói về "thói quen" của judge |
 * | `sd < SD_FLOOR` | judge luôn chấm một mức ⇒ chia cho ~0 ⇒ hiệu chỉnh nổ |
 * | kẹp về `[1, 3]` | z lớn đẩy mức ra ngoài thang ba bậc |
 *
 * Khi bất kỳ chốt nào chặn, hàm trả **mức gốc** và ghi lý do — im lặng bỏ qua là cách để một hệ
 * thống "có tính năng" mà không ai biết nó chưa từng chạy.
 */

/** Thang bậc của ba mức. Phải khớp `SEVERITY_RANK` ở `issue-grouping.ts`. */
export const RANK: Record<string, number> = {
  CRITICAL: 3,
  MAJOR: 2,
  MINOR: 1,
};

/** Bậc → tên mức. Dùng khi map ngược sau khi hiệu chỉnh. */
const RANK_TO_SEVERITY: Record<number, string> = {
  3: 'CRITICAL',
  2: 'MAJOR',
  1: 'MINOR',
};

/**
 * Số **vòng judge** tối thiểu của một judge trước khi được hiệu chỉnh.
 *
 * Đếm theo vòng chứ không theo số issue: một judge nêu 20 issue trong **một** vòng vẫn chỉ cho ta
 * biết về một lần chấm. Con số 5 là chọn, không phải đo — và nó phải được ghi vào báo cáo như một
 * tham số, không phải một sự thật.
 */
export const MIN_ROUNDS_FOR_CALIBRATION = 5;

/**
 * Sàn của độ lệch chuẩn. Dưới sàn thì coi như judge không có phương sai.
 *
 * Không phải `0`: với thang ba bậc và ít quan sát, `sd` có thể ra `0.0001` do dấu phẩy động, và
 * chia cho nó thì z bay lên hàng nghìn. Sàn `0.25` = một phần tư bậc, tức nhỏ hơn mọi độ lệch có
 * ý nghĩa trên thang này.
 */
export const SD_FLOOR = 0.25;

export type CalibrationReason =
  'OK' | 'NOT_ENOUGH_ROUNDS' | 'NO_VARIANCE' | 'NO_HISTORY';

export type JudgeStats = {
  judgeKey: string;
  /** Số vòng judge riêng biệt có dữ liệu. */
  rounds: number;
  /** Số issue đã quan sát. */
  n: number;
  mean: number;
  sd: number;
  /** `false` ⇒ mọi mức của judge này đi qua nguyên vẹn. */
  usable: boolean;
  reason: CalibrationReason;
};

export type Observation = {
  judgeKey: string;
  severity: string;
  /** Khoá vòng — `${spec_version_id}:${round}`. Dùng để đếm số vòng riêng biệt. */
  roundKey: string;
};

/** Trung bình và độ lệch chuẩn **quần thể** (chia n, không phải n−1) — ta có toàn bộ lịch sử, không lấy mẫu. */
function meanSd(values: number[]): { mean: number; sd: number } {
  if (values.length === 0) return { mean: 0, sd: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const varSum = values.reduce((s, v) => s + (v - mean) ** 2, 0);
  return { mean, sd: Math.sqrt(varSum / values.length) };
}

/**
 * Thống kê từng judge từ lịch sử.
 *
 * Đầu vào **chỉ nên** là issue của các `JudgeRun` có `status = 'OK'`. Nhận cả vòng `FAILED` là đưa
 * nhiễu của một lỗi hạ tầng vào thống kê về thói quen chấm điểm.
 */
export function judgeStats(history: Observation[]): JudgeStats[] {
  const byJudge = new Map<string, { ranks: number[]; rounds: Set<string> }>();
  for (const o of history) {
    const rank = RANK[o.severity];
    // Mức lạ (enum đổi, dữ liệu cũ) bị bỏ qua chứ không tính là 0 — 0 không phải một mức.
    if (rank === undefined) continue;
    let e = byJudge.get(o.judgeKey);
    if (!e) byJudge.set(o.judgeKey, (e = { ranks: [], rounds: new Set() }));
    e.ranks.push(rank);
    e.rounds.add(o.roundKey);
  }

  return [...byJudge.entries()]
    .map(([judgeKey, e]) => {
      const { mean, sd } = meanSd(e.ranks);
      const rounds = e.rounds.size;
      const reason: CalibrationReason =
        rounds < MIN_ROUNDS_FOR_CALIBRATION
          ? 'NOT_ENOUGH_ROUNDS'
          : sd < SD_FLOOR
            ? 'NO_VARIANCE'
            : 'OK';
      return {
        judgeKey,
        rounds,
        n: e.ranks.length,
        mean,
        sd,
        usable: reason === 'OK',
        reason,
      };
    })
    .sort((a, b) => a.judgeKey.localeCompare(b.judgeKey));
}

/** Thang chung để map z về — trung bình và độ lệch của **các judge dùng được**. */
export function groupScale(stats: JudgeStats[]): { mean: number; sd: number } {
  const usable = stats.filter((s) => s.usable);
  if (usable.length === 0) return { mean: 0, sd: 0 };
  return {
    mean: usable.reduce((s, x) => s + x.mean, 0) / usable.length,
    sd: usable.reduce((s, x) => s + x.sd, 0) / usable.length,
  };
}

export type CalibratedSeverity = {
  /** Mức dùng để **gộp nhóm**. Bằng mức gốc khi không hiệu chỉnh được. */
  severity: string;
  /** `true` khi hiệu chỉnh thật sự đổi mức — để đếm được cơ chế có tác dụng hay không. */
  changed: boolean;
  reason: CalibrationReason;
};

/**
 * Bậc **đã hiệu chỉnh**, giá trị **liên tục** — dịch tâm về thang chung:
 *
 *     rank_mới = rank − mean_judge + mean_nhóm
 *
 * Đọc bằng lời: *"nếu judge này chấm trên thang của một judge trung bình thì mức này ở đâu"*.
 *
 * ## ⚠️ Vì sao KHÔNG dùng z-score, dù #44 ghi là z-score
 *
 * Đề bài #44 (tôi viết) nói *"tính z-score mức độ trên lịch sử của chính judge đó"*. **Số liệu cho
 * thấy đó là công cụ sai cho thang 3 bậc**, và sai đúng ở hướng quan trọng:
 *
 * | | judge **nặng tay** | judge **nhẹ tay** |
 * |---|---|---|
 * | z-score đầy đủ (chia `sd`) | **không bao giờ hạ** | nâng được |
 * | chỉ dịch tâm | **hạ được** | không nâng |
 *
 * Judge chấm nặng thường dùng **dải hẹp** (chỉ `MAJOR`/`CRITICAL`) nên `sd` nhỏ. Chia cho `sd` nhỏ
 * **phóng đại** độ lệch, đúng bằng lượng mà việc dịch tâm vừa trừ đi — hai phép triệt tiêu nhau.
 * Đo trên `J4 mean=2.75 sd=0.433`, mức `CRITICAL`:
 *
 *     z-score đầy đủ : 2.604 → CRITICAL   (không đổi)
 *     chỉ dịch tâm   : 2.438 → MAJOR      ← đổi
 *
 * Và **hướng cần là hướng hạ**: `groupIssues` lấy `max_severity`, nên judge nặng tay quyết mức của
 * **mọi nhóm nó tham gia**. Đó chính là vấn đề #44 sinh ra để giải.
 *
 * ## Vì sao trả số LIÊN TỤC, không trả tên mức
 *
 * Thang chỉ có 3 bậc, nên làm tròn **xoá sạch mọi hiệu chỉnh nhỏ hơn 0,5 bậc**: lệch 0,375 bậc thì
 * `2.625` làm tròn về `3` và không đổi gì. Trả số liên tục cho `groupIssues` so trực tiếp thì một
 * độ lệch 0,375 bậc **vẫn đổi được ai thắng nhóm**, và `max_severity` lưu **mức thô của người
 * thắng** — không mức nào bị bịa ra.
 */
export type CalibratedRank = { rank: number; reason: CalibrationReason };

export function calibratedRank(
  severity: string,
  stats: JudgeStats | undefined,
  scale: { mean: number; sd: number },
): CalibratedRank {
  const rank = RANK[severity];
  // Mức lạ: `0` là "thấp hơn mọi mức", đúng ý — nó không được thắng nhóm.
  if (rank === undefined) return { rank: 0, reason: 'NO_HISTORY' };
  if (!stats) return { rank, reason: 'NO_HISTORY' };
  if (!stats.usable) return { rank, reason: stats.reason };
  // `sd` chỉ còn dùng làm **chốt**, không dùng để chia: judge không có phương sai thì "thói quen
  // chấm" của nó chưa quan sát được, hiệu chỉnh sẽ là suy diễn từ một điểm dữ liệu.
  if (scale.sd < SD_FLOOR) return { rank, reason: 'NO_VARIANCE' };

  return { rank: rank - stats.mean + scale.mean, reason: 'OK' };
}

/**
 * Tên mức sau hiệu chỉnh — **chỉ để hiển thị và ghi log**, không dùng để gộp nhóm.
 *
 * Gộp nhóm dùng `calibratedRank` (liên tục). Hàm này làm tròn, nên nó thừa hưởng đúng vách 0,5 bậc
 * nói ở trên; dùng nó để quyết định là quay lại đúng vấn đề vừa tránh.
 */
export function calibratedSeverity(
  severity: string,
  stats: JudgeStats | undefined,
  scale: { mean: number; sd: number },
): CalibratedSeverity {
  const { rank, reason } = calibratedRank(severity, stats, scale);
  if (reason !== 'OK') return { severity, changed: false, reason };
  const clamped = Math.min(3, Math.max(1, Math.round(rank)));
  const out = RANK_TO_SEVERITY[clamped] ?? severity;
  return { severity: out, changed: out !== severity, reason: 'OK' };
}
