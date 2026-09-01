/**
 * B3 · đo bất đồng giữa các judge (#9) — **hàm thuần, 0 I/O, 0 lời gọi LLM**.
 *
 * Đặt ở `src/` chứ không ở `eval/` vì jest chỉ quét `rootDir: src` (`backend/CLAUDE.md` §0):
 * logic đặt trong `eval/` là logic không có test. Cùng lý do `verifier/metrics.ts` nằm ở đây.
 *
 * ## Hệ số này đo cái gì — và KHÔNG đo cái gì
 *
 * Năm judge dùng **năm prompt khác nhau và hai model khác nhau** (`contracts/enums.ts:92-97` —
 * J1/J3/J5 `deepseek-v4-pro`, J2/J4 `deepseek-v4-flash`), và prompt của mỗi judge **cấm lấn
 * sân**: *"Review **only the research gap**… Ignore contribution wording…"*.
 *
 * Nên đây **không** phải độ tin cậy của một thang chấm chung — giả định "người chấm thay thế
 * được cho nhau" của Fleiss/Cohen/Krippendorff không đúng ở đây. Nó đo **mức trùng lặp giữa
 * những người chấm cố tình chuyên biệt hoá**: κ thấp = năm vai đang làm đúng việc của mình;
 * κ cao = trả tiền cho năm judge mà chỉ nhận về một.
 *
 * ## Vì sao mục là THẺ, không phải nhóm issue
 *
 * Nếu mọi mục có cùng vector đếm nhãn thì κ rút gọn thành hằng số `−1/(R−1)`, **bất kể dữ liệu**.
 * Dữ liệu thật đúng là chế độ đó — phần lớn nhóm chỉ 1–2/5 judge nêu — nên κ trên nhóm issue
 * ghim quanh `−0.25` dù judge tốt hay dở. Kiểm bằng số:
 *
 *   R=5, mọi mục 1/5 nêu → −0.2500 · R=5, mọi mục 2/5 nêu → −0.2500 · R=3, 1/3 nêu → −0.5000
 *
 * Thêm nữa, `IssueGroup` là thứ **chính code mình bịa ra**: `groupRound` đọc issue không
 * `orderBy`, `groupIssues` lấy khớp *đầu tiên* và đổi `canonicalTitle` giữa chừng. Đổi thứ tự
 * lặp là ra tập mục khác ⇒ ra κ khác, tức là báo cáo tính chất của **code gộp** chứ không phải
 * của **judge**.
 *
 * Tập `Card` thì cố định **trước khi** judge chạy, không phụ thuộc bước gộp, ngưỡng 0.7 hay thứ
 * tự lặp. Và mọi judge đều thấy mọi thẻ (prompt bắt `target_card_title` chép nguyên từ
 * `SPEC_JSON.cards`), nên im lặng trên một thẻ là **phủ định thật**, không phải dữ liệu thiếu.
 */

/** Ba nhãn. **Không** tách `CRITICAL` với `MAJOR` — xem `bucketOf`. */
export type Label = 'NONE' | 'MINOR' | 'BLOCKING';

const LABELS: Label[] = ['NONE', 'MINOR', 'BLOCKING'];

/** Hạng để tính độ lệch mức có dấu. `NONE` không tham gia. */
const SEVERITY_RANK: Record<string, number> = {
  MINOR: 1,
  MAJOR: 2,
  CRITICAL: 3,
};

/**
 * Gộp `CRITICAL` và `MAJOR` về một nhãn.
 *
 * Không phải nhượng bộ cho gọn: `issue-grouping.ts:31-33` **đã** tuyên bố hai mức đó là cùng một
 * rổ, với lý do ghi ngay tại đó — *"hai judge thường mô tả cùng một lỗi mà chấm lệch một bậc"*.
 * Không thể vừa coi phân biệt đó là nhiễu lúc gộp nhóm, vừa đo nó như tín hiệu lúc chấm đồng
 * thuận. Câu hỏi `CRITICAL` vs `MAJOR` được giữ lại ở `severityBias`, nơi nó đúng chỗ.
 */
export function bucketOf(severity: string): Label {
  return severity === 'MINOR' ? 'MINOR' : 'BLOCKING';
}

export type KappaReason =
  /** Ma trận đếm không hợp lệ — hàng lệch độ dài hoặc không tổng bằng `raters`. */
  | 'MALFORMED_COUNTS'
  | 'NO_ITEMS'
  | 'INSUFFICIENT_ITEMS'
  | 'INSUFFICIENT_RATERS'
  | 'NO_VARIANCE';

export type KappaResult = {
  kappa: number | null;
  /** Chỉ khác `null` khi `kappa === null`. */
  reason: KappaReason | null;
  /** Luôn trả về — κ **không so được** giữa hai lần chạy khác `raters` (sàn là `−1/(R−1)`). */
  raters: number;
  items: number;
  /** Mọi người cùng một nhãn trên mọi mục. Giữ riêng vì `NO_VARIANCE` làm mất thông tin này. */
  unanimous: boolean;
  /**
   * `IDENTICAL_ROWS`: mọi mục có cùng vector đếm ⇒ κ đúng bằng `−1/(R−1)`, **không mang tin**.
   * Giao diện phải in "không có cấu trúc chồng lấn nào" thay vì một con số âm đáng sợ.
   */
  degenerate: 'IDENTICAL_ROWS' | null;
};

/**
 * Fleiss' κ trên ma trận đếm. `counts[i][k]` = số người chấm đã gán nhãn `k` cho mục `i`.
 *
 * Tách hàm riêng nhận thẳng ma trận đếm để test được bằng **ví dụ công bố** (10 mục × 14 người
 * × 5 nhãn, κ = 0.210) — ca đó chứng minh *số học* đúng, độc lập với mọi quy ước của dự án này.
 */
export function fleissKappa(counts: number[][], raters: number): KappaResult {
  const items = counts.length;
  const base = { raters, items, unanimous: false, degenerate: null } as const;

  if (raters < 2) {
    return { ...base, kappa: null, reason: 'INSUFFICIENT_RATERS' };
  }
  if (items === 0) return { ...base, kappa: null, reason: 'NO_ITEMS' };

  // Ma trận méo ⇒ trả `null` thay vì một con số trông hợp lý. `cardLabelCounts` không bao giờ
  // sinh ra hàng méo, nhưng `fleissKappa` là API export: hàng ngắn hơn hàng đầu cho `undefined`
  // ⇒ NaN lọt vào cột `Float` của Prisma, còn hàng không tổng bằng `raters` cho ra
  // `fleissKappa([[3,0,2],[3,0,2]], 4) = −0.3333` — sai mà không có gì báo.
  const width = counts[0].length;
  const wellFormed = counts.every(
    (v) => v.length === width && v.reduce((a, b) => a + b, 0) === raters,
  );
  if (!wellFormed) {
    return { ...base, kappa: null, reason: 'MALFORMED_COUNTS' };
  }

  // Đồng thuận quan sát được từng mục.
  const perItem = counts.map(
    (v) =>
      (v.reduce((s, x) => s + x * x, 0) - raters) / (raters * (raters - 1)),
  );
  const pObserved = perItem.reduce((a, b) => a + b, 0) / items;
  const unanimous = perItem.every((p) => p === 1);

  // `items < 2` **sau** khi tính `unanimous`: N=1 luôn cho hằng số `−1/(R−1)` bất kể dữ liệu,
  // nên con số đó không mang tin — nhưng "họ có đồng thuận không" thì vẫn có nghĩa.
  if (items < 2) {
    return {
      ...base,
      unanimous,
      kappa: null,
      reason: 'INSUFFICIENT_ITEMS',
    };
  }

  const total = items * raters;
  const colSums = counts[0].map((_, k) => counts.reduce((s, v) => s + v[k], 0));
  const pExpected = colSums
    .map((c) => c / total)
    .reduce((s, p) => s + p * p, 0);

  if (1 - pExpected === 0) {
    // Mọi người dồn vào **một** nhãn. Trả `1.0` ở đây là sai ngữ nghĩa — đúng lỗi mà
    // `verifier/metrics.ts:30-34` đã bác. Nhưng `null` trần thì mất mất việc họ đồng thuận
    // hoàn toàn, nên giữ lại bằng `unanimous`.
    return { ...base, unanimous, kappa: null, reason: 'NO_VARIANCE' };
  }

  // Mọi mục cùng vector đếm ⇒ κ là hằng số, cảnh báo ra ngoài.
  const first = counts[0];
  const uniform = counts.every((v) => v.every((x, k) => x === first[k]));

  return {
    raters,
    items,
    unanimous,
    kappa: (pObserved - pExpected) / (1 - pExpected),
    reason: null,
    degenerate: uniform ? 'IDENTICAL_ROWS' : null,
  };
}

/** Một issue đã join sang judge, đã gắn thẻ. Issue không gắn thẻ nằm ngoài tập mục. */
export type CardVote = {
  judgeKey: string;
  cardId: string;
  severity: string;
};

/**
 * Dựng ma trận đếm trên **tập thẻ**. Nhãn của (thẻ, judge) = mức **nặng nhất** judge đó nêu
 * nhắm vào thẻ, không nêu thì `NONE` — một judge có thể nêu nhiều issue trên cùng một thẻ.
 */
export function cardLabelCounts(
  cardIds: string[],
  raters: string[],
  votes: CardVote[],
): number[][] {
  // (cardId, judgeKey) → severity nặng nhất. Không lọc theo `raters` ở đây: vòng dựng hàng
  // dưới chỉ lặp qua `raters`, nên phiếu của người ngoài danh sách vốn đã không với tới được —
  // bản trước có một dòng `continue` cho việc đó và nó là **code chết**.
  const worst = new Map<string, string>();
  for (const v of votes) {
    const key = `${v.cardId}|${v.judgeKey}`;
    const current = worst.get(key);
    if (
      current === undefined ||
      (SEVERITY_RANK[v.severity] ?? 0) > (SEVERITY_RANK[current] ?? 0)
    ) {
      worst.set(key, v.severity);
    }
  }

  return cardIds.map((cardId) => {
    const row = LABELS.map(() => 0);
    for (const judgeKey of raters) {
      const worstSeverity = worst.get(`${cardId}|${judgeKey}`);
      // Gọi `bucketOf` thật, không cài lại inline: bản trước cài lại nên `bucketOf` thành **code
      // chết** và test của nó thành tautology — nó kiểm một hàm mà sản phẩm không bao giờ chạy.
      const label: Label =
        worstSeverity === undefined ? 'NONE' : bucketOf(worstSeverity);
      row[LABELS.indexOf(label)] += 1;
    }
    return row;
  });
}

/** Nhóm issue của một vòng, kèm mức **nặng nhất** mỗi judge đã chấm cho nhóm đó. */
export type GroupVote = {
  severityByJudge: Record<string, string>;
};

export type JaccardCell = {
  /** `null` khi hợp rỗng — hai judge cùng không nêu gì **không phải** trùng khớp 1.0. */
  value: number | null;
  /** Cỡ hợp. Giao diện làm mờ ô có `union < MIN_UNION`. */
  union: number;
};

/** Dưới ngưỡng này thì Jaccard là ngẫu nhiên: mỗi người nêu 2 issue có thể ra 1.0. */
export const MIN_UNION = 5;

/**
 * Ma trận chồng lấn **Jaccard**, không phải "đồng thuận".
 *
 * Gọi tên đúng là quan trọng: "đồng thuận" hàm ý đã hiệu chỉnh ngẫu nhiên, mà cái này thì không.
 * Và Jaccard mới đúng là phép đo trả lời câu #9 hỏi — *"cặp nào gần như luôn trùng nhau, dấu
 * hiệu một trong hai là thừa"*. Trùng lặp là câu hỏi về **giao tập hợp**, không phải về độ tin cậy.
 */
export function jaccardMatrix(
  raters: string[],
  groups: GroupVote[],
): Record<string, Record<string, JaccardCell>> {
  const raised = new Map<string, Set<number>>();
  for (const r of raters) raised.set(r, new Set());
  groups.forEach((g, i) => {
    for (const judgeKey of Object.keys(g.severityByJudge)) {
      raised.get(judgeKey)?.add(i);
    }
  });

  const out: Record<string, Record<string, JaccardCell>> = {};
  for (const a of raters) {
    out[a] = {};
    for (const b of raters) {
      const sa = raised.get(a) ?? new Set<number>();
      const sb = raised.get(b) ?? new Set<number>();
      let inter = 0;
      for (const i of sa) if (sb.has(i)) inter += 1;
      const union = sa.size + sb.size - inter;
      out[a][b] = { value: union === 0 ? null : inter / union, union };
    }
  }
  return out;
}

export type SoloRate = {
  judgeKey: string;
  /** Nhóm chỉ mình judge này nêu. */
  solo: number;
  /** Tổng nhóm judge này nêu — mẫu số, để không xếp hạng theo độ nói nhiều. */
  raised: number;
  rate: number | null;
};

/**
 * Tỉ lệ "nêu một mình" **đã chuẩn hoá theo khối lượng của chính judge đó**.
 *
 * Đếm thô sẽ xếp hạng theo độ nói nhiều: judge nêu nhiều nhất tự động đứng đầu. Chia cho tổng
 * số nhóm judge đó nêu mới ra được "judge này có xu hướng đứng một mình" thật.
 */
export function soloRates(raters: string[], groups: GroupVote[]): SoloRate[] {
  return raters
    .map((judgeKey) => {
      let solo = 0;
      let raised = 0;
      for (const g of groups) {
        const keys = Object.keys(g.severityByJudge);
        if (!keys.includes(judgeKey)) continue;
        raised += 1;
        if (keys.length === 1) solo += 1;
      }
      return {
        judgeKey,
        solo,
        raised,
        rate: raised === 0 ? null : solo / raised,
      };
    })
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.solo - a.solo);
}

export type SeverityBias = {
  judgeKey: string;
  /** Trung bình chênh hạng so với các judge cùng nêu. Dương = nặng tay hơn. */
  bias: number | null;
  /** Số nhóm tham gia tính (nhóm có ≥2 người nêu và judge này có nêu). */
  n: number;
};

/**
 * Độ lệch mức **có dấu** trên nhóm ≥2 người nêu. Đây là chỗ duy nhất phân biệt `CRITICAL` với
 * `MAJOR` được giữ lại, và nó **không** làm bẩn hệ số chính. #8 cần đúng con số này để biết
 * judge nào nặng tay / nhẹ tay.
 */
export function severityBias(
  raters: string[],
  groups: GroupVote[],
): SeverityBias[] {
  return raters
    .map((judgeKey) => {
      const deltas: number[] = [];
      for (const g of groups) {
        const entries = Object.entries(g.severityByJudge);
        if (entries.length < 2) continue;
        const mine = g.severityByJudge[judgeKey];
        // Judge không nêu nhóm này thì không có gì để so. Bỏ chốt này là sinh ra **judge ma**:
        // người không chấm gì lại bị xếp là nhẹ tay nhất.
        if (mine === undefined) continue;
        // So với trung bình **cả nhóm**, không phải trung bình "những người khác".
        //
        // Lấy trung bình những người khác là một bộ khuếch đại phụ thuộc cỡ nhóm:
        //   r_j − mean(khác) = m/(m−1) · (r_j − mean(cả nhóm))
        // nên nhóm 2 người nhân 2×, nhóm 5 người chỉ 1.25×. Hệ quả: một judge lệch +0.8 trong
        // nhóm 5 và một judge lệch +0.5 trong nhóm 2 **ra cùng một số**, tức là độ lớn không so
        // được giữa các judge — mà giao diện lại xếp hạng theo đúng con số đó.
        const groupMean =
          entries.reduce((s, [, sev]) => s + (SEVERITY_RANK[sev] ?? 0), 0) /
          entries.length;
        deltas.push((SEVERITY_RANK[mine] ?? 0) - groupMean);
      }
      return {
        judgeKey,
        n: deltas.length,
        bias:
          deltas.length === 0
            ? null
            : deltas.reduce((a, b) => a + b, 0) / deltas.length,
      };
    })
    .sort((a, b) => (b.bias ?? 0) - (a.bias ?? 0));
}

export type LeaveOneOut = {
  judgeKey: string;
  /** `κ(bỏ judge này) − κ(đủ)`. Dương lớn = bỏ ra thì đồng thuận tăng ⇒ gây nhiễu nhất. */
  delta: number | null;
  kappaWithout: number | null;
};

/**
 * Δκ bỏ-một-judge — câu trả lời cho *"judge có phương sai cao nhất"* mà #8 cần
 * (epic #22, mục "đường lui").
 *
 * Vì sao **không** dùng "tỉ lệ lệch so với nhãn phổ biến": với 5 judge và phần lớn nhóm 1–2
 * người nêu, nhãn phổ biến gần như luôn là `NONE`, nên con số đó rút gọn thành *"judge nào nêu
 * nhiều nhất"*. #8 khi đó sẽ luôn dồn tài nguyên đắt vào judge chăm chỉ nhất — có khi ngược hẳn
 * với điều đúng, vì judge nêu nhiều mà nhất quán không phải judge bất ổn.
 *
 * Mọi phép bỏ đều còn `R−1` người chấm nên các Δ so được với nhau trong cùng một vòng.
 */
export function leaveOneOut(
  cardIds: string[],
  raters: string[],
  votes: CardVote[],
): LeaveOneOut[] {
  const full = fleissKappa(
    cardLabelCounts(cardIds, raters, votes),
    raters.length,
  );
  return raters
    .map((judgeKey) => {
      const rest = raters.filter((r) => r !== judgeKey);
      const without = fleissKappa(
        cardLabelCounts(cardIds, rest, votes),
        rest.length,
      );
      return {
        judgeKey,
        kappaWithout: without.kappa,
        delta:
          full.kappa === null || without.kappa === null
            ? null
            : without.kappa - full.kappa,
      };
    })
    .sort((a, b) => (b.delta ?? -Infinity) - (a.delta ?? -Infinity));
}

/* ------------------------------------------------------------------ null hoán vị */

/**
 * PRNG có seed. **Bắt buộc phải có seed**, không được dùng `Math.random`: NFR-JDG-6 đòi số đo cố
 * định, mà p-value tính bằng mô phỏng thì mỗi lần chạy ra một số khác nếu nguồn ngẫu nhiên tự do.
 * Seed suy từ `(spec_version_id, round)` ⇒ cùng một vòng luôn ra cùng một p.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a — chỉ cần ổn định và tản đều, không cần chống đối kháng. */
export function seedFrom(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Fisher–Yates, tại chỗ trên **bản sao** của lời gọi. */
export function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export type NullVerdict = {
  judgeKey: string;
  /** Giá trị quan sát được của judge dẫn đầu. */
  value: number;
  /**
   * `P(thống kê lớn nhất dưới null ≥ giá trị quan sát)`, dạng cộng-một nên **không bao giờ bằng 0**
   * — `0/1000` không có nghĩa là "không thể", chỉ nghĩa là "chưa thấy trong 1000 lượt".
   * Thống kê là **max trên các judge**, không phải từng judge riêng: panel chỉ in ra người dẫn
   * đầu, nên phải hiệu chỉnh cho việc đã chọn ra người lớn nhất trong 5 người.
   */
  p: number;
  /** `p < 0.05`. Sai thì panel **không được** nêu tên ai. */
  significant: boolean;
};

export type NullTest = {
  draws: number;
  seed: number;
  /** `null` khi không tính được (thiếu mục, thiếu người chấm, mọi Δ đều `null`). */
  disruptive: NullVerdict | null;
  harsh: NullVerdict | null;
};

export const NULL_DRAWS = 1000;
export const NULL_ALPHA = 0.05;

/**
 * Hai dòng "gây nhiễu nhất" và "chấm nặng tay nhất" **luôn tìm ra một người** — cực đại của năm
 * số thực gần như chắc chắn dương kể cả khi năm judge giống nhau hoàn toàn. Tôi đã đo: dưới null
 * năm judge thống kê đồng nhất (11 thẻ, p_nêu = 0.35, 2000 lượt), dòng thứ nhất bắn **100%** lượt
 * và dòng thứ hai **98.2%**. Nghĩa là nếu in thẳng, panel luôn chỉ ra một kẻ có tội — và #8 sẽ
 * dồn tài nguyên đắt vào đó, kể cả khi không có ai đáng bị chỉ.
 *
 * Null đúng ở đây là **danh tính judge có thể đổi chỗ cho nhau**:
 * - Δκ: trong **mỗi thẻ**, xáo việc ai giữ nhãn nào. Vector đếm của từng thẻ **không đổi**, nên
 *   `κ(đủ)` là bất biến và chỉ các số hạng bỏ-một-người thay đổi — đúng thứ đang được kiểm.
 * - Độ lệch mức: trong **mỗi nhóm**, xáo việc ai chấm mức nào. Cỡ nhóm và tập mức giữ nguyên,
 *   chỉ "ai nặng tay" bị phá.
 *
 * 0 lời gọi LLM, chạy một lần lúc lưu.
 */
export function permutationNull(
  input: AgreementInput,
  draws: number = NULL_DRAWS,
  seedKey = '',
): NullTest {
  const { raters, cardIds, votes, groups } = input;
  const seed = seedFrom(seedKey);
  const rnd = mulberry32(seed);

  const obsLoo = leaveOneOut(cardIds, raters, votes);
  const obsBias = severityBias(raters, groups);
  const topLoo = obsLoo.find((l) => l.delta !== null) ?? null;
  const topBias = obsBias.find((b) => b.bias !== null && b.bias > 0) ?? null;

  // Nhãn theo (thẻ → judge). Judge không nêu thẻ nào thì khuyết, và `cardLabelCounts` coi là NONE.
  const byCard = new Map<string, Map<string, string>>();
  for (const v of votes) {
    let m = byCard.get(v.cardId);
    if (!m) {
      // Type argument tường minh: `new Map()` trần suy ra `Map<any, any>`, và `any` len vào đây là
      // mất luôn chỗ compiler bắt được lỗi hoán vị gán sai kiểu nhãn.
      m = new Map<string, string>();
      byCard.set(v.cardId, m);
    }
    const cur = m.get(v.judgeKey);
    // Cùng luật `cardLabelCounts`: một judge nêu hai issue trên một thẻ ⇒ lấy nặng nhất.
    if (cur === undefined || SEVERITY_RANK[v.severity] > SEVERITY_RANK[cur]) {
      m.set(v.judgeKey, v.severity);
    }
  }

  let looHits = 0;
  let biasHits = 0;
  const needLoo = topLoo?.delta != null;
  const needBias = topBias?.bias != null;

  for (let d = 0; d < draws; d++) {
    if (needLoo) {
      const permuted: CardVote[] = [];
      for (const cardId of cardIds) {
        const m = byCard.get(cardId);
        if (!m) continue;
        // Danh sách nhãn dài đúng R (khuyết = không nêu), rồi xáo cho cả R judge.
        const slots = raters.map((r) => m.get(r));
        const shuffled = shuffle(slots, rnd);
        raters.forEach((judgeKey, i) => {
          const sev = shuffled[i];
          if (sev !== undefined)
            permuted.push({ cardId, judgeKey, severity: sev });
        });
      }
      const best = leaveOneOut(cardIds, raters, permuted).find(
        (l) => l.delta !== null,
      );
      if (best?.delta != null && best.delta >= topLoo.delta!) looHits++;
    }

    if (needBias) {
      const permGroups: GroupVote[] = groups.map((g) => {
        const keys = Object.keys(g.severityByJudge);
        const sevs = shuffle(Object.values(g.severityByJudge), rnd);
        const severityByJudge: Record<string, string> = {};
        keys.forEach((k, i) => (severityByJudge[k] = sevs[i]));
        return { ...g, severityByJudge };
      });
      const best = severityBias(raters, permGroups).find(
        (b) => b.bias !== null,
      );
      if (best?.bias != null && best.bias >= topBias.bias!) biasHits++;
    }
  }

  const pOf = (hits: number) => (1 + hits) / (1 + draws);
  return {
    draws,
    seed,
    disruptive:
      needLoo && topLoo?.delta != null
        ? {
            judgeKey: topLoo.judgeKey,
            value: topLoo.delta,
            p: pOf(looHits),
            significant: pOf(looHits) < NULL_ALPHA,
          }
        : null,
    harsh:
      needBias && topBias?.bias != null
        ? {
            judgeKey: topBias.judgeKey,
            value: topBias.bias,
            p: pOf(biasHits),
            significant: pOf(biasHits) < NULL_ALPHA,
          }
        : null,
  };
}

export type AgreementReport = {
  kappa: KappaResult;
  /** Tỉ lệ issue có gắn thẻ. Issue không gắn thẻ nằm ngoài tập mục — và tỉ lệ đó là hành vi judge. */
  coverage: number | null;
  matrix: Record<string, Record<string, JaccardCell>>;
  solo: SoloRate[];
  bias: SeverityBias[];
  leaveOneOut: LeaveOneOut[];
  /** Nhóm mà **mọi** judge hoàn thành đều nêu. */
  unanimousGroups: number;
  raters: string[];
  /** Kiểm định null cho hai dòng buộc tội. Xem `permutationNull`. */
  nullTest: NullTest;
};

export type AgreementInput = {
  /** **Chỉ** từ `JudgeRun.status = 'OK'`. Không bao giờ suy từ `union(judge_keys)` — làm vậy là
   * âm thầm bỏ mất judge im lặng, tức thiên lệch chọn mẫu theo hướng có lợi cho ta. */
  raters: string[];
  cardIds: string[];
  /** Issue **đã gắn thẻ**. */
  votes: CardVote[];
  /** Tổng số issue của vòng, kể cả chưa gắn thẻ — mẫu số của `coverage`. */
  totalIssues: number;
  groups: GroupVote[];
  /** Khoá sinh seed — truyền `${spec_version_id}:${round}` để p cố định theo vòng (NFR-JDG-6). */
  seedKey?: string;
};

export function judgeAgreement(input: AgreementInput): AgreementReport {
  const { raters, cardIds, votes, groups, totalIssues } = input;
  return {
    kappa: fleissKappa(cardLabelCounts(cardIds, raters, votes), raters.length),
    coverage: totalIssues === 0 ? null : votes.length / totalIssues,
    matrix: jaccardMatrix(raters, groups),
    solo: soloRates(raters, groups),
    bias: severityBias(raters, groups),
    leaveOneOut: leaveOneOut(cardIds, raters, votes),
    unanimousGroups: groups.filter(
      (g) => Object.keys(g.severityByJudge).length === raters.length,
    ).length,
    raters,
    nullTest: permutationNull(input, NULL_DRAWS, input.seedKey ?? ''),
  };
}
