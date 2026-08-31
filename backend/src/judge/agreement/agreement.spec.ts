import {
  bucketOf,
  cardLabelCounts,
  fleissKappa,
  jaccardMatrix,
  judgeAgreement,
  leaveOneOut,
  severityBias,
  soloRates,
  type CardVote,
  type GroupVote,
} from './agreement';

/**
 * Toàn bộ B3 là hàm thuần — file này không mock gì cả.
 *
 * Mọi giá trị kỳ vọng dưới đây được **tính tay và kiểm bằng số** trước khi viết code, không phải
 * chép lại đầu ra của cài đặt. Đó là khác biệt giữa test chứng minh và test ghi chép.
 */

describe('fleissKappa — sàn phụ thuộc số người chấm', () => {
  it('R=5, mọi mục đúng 1 người nêu ⇒ κ = −0.25 CHÍNH XÁC, bất kể dữ liệu', () => {
    // Khi mọi mục cùng vector đếm, κ rút gọn thành hằng số −1/(R−1). Đây là lý do B3 KHÔNG
    // tính κ trên nhóm issue: dữ liệu thật phần lớn là 1–2/5 judge nêu, nên κ trên nhóm sẽ
    // ghim quanh −0.25 dù judge tốt hay dở.
    const counts = [
      [4, 0, 1],
      [4, 0, 1],
      [4, 0, 1],
      [4, 0, 1],
    ];
    const r = fleissKappa(counts, 5);
    expect(r.kappa).toBeCloseTo(-0.25, 10);
    expect(r.degenerate).toBe('UNIFORM_MARGINALS');
    expect(r.raters).toBe(5);
    expect(r.items).toBe(4);
  });

  it('R=5, mọi mục đúng 2 người nêu ⇒ VẪN −0.25 — sàn không phụ thuộc dữ liệu', () => {
    const counts = [
      [3, 0, 2],
      [3, 0, 2],
      [3, 0, 2],
    ];
    expect(fleissKappa(counts, 5).kappa).toBeCloseTo(-0.25, 10);
  });

  it('R=3 ⇒ sàn là −0.5, nên κ KHÔNG so được giữa hai lần chạy khác số người chấm', () => {
    // Ca này là bằng chứng cho luật "cấm so κ khi `raters` khác nhau". Một vòng mất một judge
    // vì FAILED sẽ làm κ dịch chỉ vì số người chấm đổi.
    const counts = [
      [2, 0, 1],
      [2, 0, 1],
      [2, 0, 1],
    ];
    expect(fleissKappa(counts, 3).kappa).toBeCloseTo(-0.5, 10);
  });
});

describe('fleissKappa — ví dụ công bố', () => {
  it('bảng Fleiss kinh điển 10 mục × 14 người × 5 nhãn ⇒ κ = 0.210', () => {
    // Ca duy nhất chứng minh **số học** đúng, độc lập với mọi quy ước của dự án này — và trích
    // được từ tài liệu ngoài, nên nó kết thúc luôn hướng chất vấn "công thức của anh đúng chưa".
    const counts = [
      [0, 0, 0, 0, 14],
      [0, 2, 6, 4, 2],
      [0, 0, 3, 5, 6],
      [0, 3, 9, 2, 0],
      [2, 2, 8, 1, 1],
      [7, 7, 0, 0, 0],
      [3, 2, 6, 3, 0],
      [2, 5, 3, 2, 2],
      [6, 5, 2, 1, 0],
      [0, 2, 2, 3, 7],
    ];
    const r = fleissKappa(counts, 14);
    expect(r.kappa).toBeCloseTo(0.21, 3);
    expect(r.degenerate).toBeNull();
  });
});

describe('fleissKappa — đồng thuận hoàn hảo và các ca suy biến', () => {
  it('hai nhãn, đồng thuận hoàn hảo ⇒ κ = 1.0', () => {
    const r = fleissKappa(
      [
        [0, 0, 5],
        [5, 0, 0],
      ],
      5,
    );
    expect(r.kappa).toBe(1);
    expect(r.unanimous).toBe(true);
  });

  it('mọi mục dồn vào MỘT nhãn ⇒ null NO_VARIANCE, KHÔNG phải 1.0, nhưng giữ unanimous', () => {
    // Trả 1.0 ở đây là sai ngữ nghĩa — đúng lỗi `verifier/metrics.ts` đã bác. Nhưng null trần
    // thì mất mất việc họ đồng thuận hoàn toàn.
    const r = fleissKappa(
      [
        [5, 0, 0],
        [5, 0, 0],
        [5, 0, 0],
      ],
      5,
    );
    expect(r.kappa).toBeNull();
    expect(r.reason).toBe('NO_VARIANCE');
    expect(r.unanimous).toBe(true);
  });

  it('một mục duy nhất ⇒ null INSUFFICIENT_ITEMS, vì N=1 luôn cho hằng số −1/(R−1)', () => {
    const r = fleissKappa([[2, 0, 3]], 5);
    expect(r.kappa).toBeNull();
    expect(r.reason).toBe('INSUFFICIENT_ITEMS');
  });

  it('0 mục ⇒ null NO_ITEMS', () => {
    expect(fleissKappa([], 5).reason).toBe('NO_ITEMS');
  });

  it('dưới 2 người chấm ⇒ null INSUFFICIENT_RATERS', () => {
    expect(fleissKappa([[1, 0, 0]], 1).reason).toBe('INSUFFICIENT_RATERS');
  });

  it('tất định — gọi hai lần ra cùng kết quả (NFR-JDG-6)', () => {
    const counts = [
      [3, 1, 1],
      [1, 2, 2],
    ];
    expect(JSON.stringify(fleissKappa(counts, 5))).toBe(
      JSON.stringify(fleissKappa(counts, 5)),
    );
  });
});

describe('bucketOf — CRITICAL và MAJOR là MỘT nhãn', () => {
  it('gộp CRITICAL với MAJOR, giữ MINOR riêng', () => {
    // Không phải để cho gọn: `issue-grouping.ts` đã tuyên bố hai mức đó cùng một rổ vì
    // "hai judge thường chấm lệch một bậc". Không thể coi đó là nhiễu lúc gộp rồi đo như
    // tín hiệu lúc chấm.
    expect(bucketOf('CRITICAL')).toBe('BLOCKING');
    expect(bucketOf('MAJOR')).toBe('BLOCKING');
    expect(bucketOf('MINOR')).toBe('MINOR');
  });
});

describe('cardLabelCounts — nhãn trên tập thẻ', () => {
  const raters = ['J1', 'J2', 'J3'];

  it('judge không nêu gì trên thẻ ⇒ NONE, không phải dữ liệu thiếu', () => {
    const counts = cardLabelCounts(['c1'], raters, [
      { judgeKey: 'J1', cardId: 'c1', severity: 'MAJOR' },
    ]);
    // [NONE, MINOR, BLOCKING]
    expect(counts).toEqual([[2, 0, 1]]);
  });

  it('một judge nêu hai issue trên cùng thẻ ⇒ lấy mức NẶNG NHẤT, tính một phiếu', () => {
    const counts = cardLabelCounts(
      ['c1'],
      ['J1'],
      [
        { judgeKey: 'J1', cardId: 'c1', severity: 'MINOR' },
        { judgeKey: 'J1', cardId: 'c1', severity: 'CRITICAL' },
      ],
    );
    expect(counts).toEqual([[0, 0, 1]]);
  });

  it('…và ĐÚNG NHƯ VẬY khi thứ tự đảo lại — nặng nhất, không phải cái cuối', () => {
    // Ca này do mutation testing tìm ra: chỉ thử một thứ tự thì cài đặt "lấy cái cuối" cũng
    // cho cùng kết quả, nên mutant sống sót. Phải có cả hai chiều mới ghim được `Math.max`.
    const counts = cardLabelCounts(
      ['c1'],
      ['J1'],
      [
        { judgeKey: 'J1', cardId: 'c1', severity: 'CRITICAL' },
        { judgeKey: 'J1', cardId: 'c1', severity: 'MINOR' },
      ],
    );
    expect(counts).toEqual([[0, 0, 1]]);
  });

  it('bỏ qua judge không nằm trong danh sách người chấm (ví dụ judge FAILED)', () => {
    const counts = cardLabelCounts(
      ['c1'],
      ['J1'],
      [{ judgeKey: 'J2', cardId: 'c1', severity: 'CRITICAL' }],
    );
    expect(counts).toEqual([[1, 0, 0]]);
  });
});

describe('jaccardMatrix — chồng lấn, KHÔNG gọi là đồng thuận', () => {
  const g = (...judges: string[]): GroupVote => ({
    severityByJudge: Object.fromEntries(judges.map((j) => [j, 'MAJOR'])),
  });

  it('J1={g1,g2,g3}, J2={g2,g3,g4} ⇒ 2/4 = 0.5', () => {
    const groups = [g('J1'), g('J1', 'J2'), g('J1', 'J2'), g('J2')];
    const m = jaccardMatrix(['J1', 'J2'], groups);
    expect(m.J1.J2.value).toBeCloseTo(0.5, 10);
    expect(m.J1.J2.union).toBe(4);
  });

  it('khối lượng lệch hẳn ⇒ 1/10, KHÔNG phải 1.0 (chặn cài đặt chia cho min)', () => {
    // `titleSimilarity` của dự án chia cho min và vì thế cho 1.0 với tập con — Jaccard không
    // được mắc lỗi đó.
    const groups = [g('J1', 'J2'), ...Array.from({ length: 9 }, () => g('J1'))];
    expect(jaccardMatrix(['J1', 'J2'], groups).J1.J2.value).toBeCloseTo(
      0.1,
      10,
    );
  });

  it('cả hai không nêu gì ⇒ null, KHÔNG phải 1.0', () => {
    const m = jaccardMatrix(['J1', 'J2'], []);
    expect(m.J1.J2.value).toBeNull();
    expect(m.J1.J2.union).toBe(0);
  });

  it('đường chéo là 1.0 khi judge có nêu ít nhất một nhóm', () => {
    expect(jaccardMatrix(['J1'], [g('J1')]).J1.J1.value).toBe(1);
  });
});

describe('soloRates — chuẩn hoá theo khối lượng, không xếp theo độ nói nhiều', () => {
  const g = (...judges: string[]): GroupVote => ({
    severityByJudge: Object.fromEntries(judges.map((j) => [j, 'MAJOR'])),
  });

  it('judge nêu ít nhưng toàn đứng một mình xếp trên judge nêu nhiều', () => {
    // Đếm thô sẽ cho J1 (2 nhóm một mình) đứng trên J2 (1 nhóm một mình). Chuẩn hoá thì J2
    // mới đúng là "hay đứng một mình": 1/1 = 100% so với 2/10 = 20%.
    const groups = [
      ...Array.from({ length: 2 }, () => g('J1')),
      ...Array.from({ length: 8 }, () => g('J1', 'J3')),
      g('J2'),
    ];
    const [top] = soloRates(['J1', 'J2', 'J3'], groups);
    expect(top.judgeKey).toBe('J2');
    expect(top.rate).toBe(1);
    expect(top.raised).toBe(1);
  });

  it('judge không nêu nhóm nào ⇒ rate null, không chia cho 0', () => {
    const r = soloRates(['J1'], []);
    expect(r[0].rate).toBeNull();
  });
});

describe('severityBias — nặng tay / nhẹ tay, chỉ trên nhóm ≥2 người nêu', () => {
  it('judge chấm nặng hơn hẳn có bias dương và đứng đầu', () => {
    const groups: GroupVote[] = [
      { severityByJudge: { J1: 'CRITICAL', J2: 'MINOR' } },
      { severityByJudge: { J1: 'CRITICAL', J2: 'MINOR' } },
    ];
    const [top] = severityBias(['J1', 'J2'], groups);
    expect(top.judgeKey).toBe('J1');
    expect(top.bias).toBeCloseTo(2, 10); // CRITICAL(3) − MINOR(1)
    expect(top.n).toBe(2);
  });

  it('bỏ qua nhóm chỉ một người nêu — không có ai để so', () => {
    const r = severityBias(['J1'], [{ severityByJudge: { J1: 'CRITICAL' } }]);
    expect(r[0].bias).toBeNull();
    expect(r[0].n).toBe(0);
  });
});

describe('leaveOneOut — Δκ, đầu vào cho #8', () => {
  it('judge chấm ngược số đông thì bỏ ra làm κ TĂNG ⇒ Δ dương, đứng đầu', () => {
    const cardIds = ['c1', 'c2', 'c3', 'c4'];
    const votes: CardVote[] = [];
    // J1..J3 nhất trí: c1,c2 blocking; c3,c4 im lặng.
    for (const j of ['J1', 'J2', 'J3']) {
      votes.push({ judgeKey: j, cardId: 'c1', severity: 'MAJOR' });
      votes.push({ judgeKey: j, cardId: 'c2', severity: 'MAJOR' });
    }
    // J4 làm ngược hẳn.
    votes.push({ judgeKey: 'J4', cardId: 'c3', severity: 'MAJOR' });
    votes.push({ judgeKey: 'J4', cardId: 'c4', severity: 'MAJOR' });

    const [top] = leaveOneOut(cardIds, ['J1', 'J2', 'J3', 'J4'], votes);
    expect(top.judgeKey).toBe('J4');
    expect(top.delta).not.toBeNull();
    expect(top.delta as number).toBeGreaterThan(0);
  });
});

describe('judgeAgreement — báo cáo đầy đủ', () => {
  it('coverage đếm issue có gắn thẻ trên tổng issue', () => {
    const r = judgeAgreement({
      raters: ['J1', 'J2'],
      cardIds: ['c1', 'c2'],
      votes: [{ judgeKey: 'J1', cardId: 'c1', severity: 'MAJOR' }],
      totalIssues: 4,
      groups: [{ severityByJudge: { J1: 'MAJOR' } }],
    });
    expect(r.coverage).toBeCloseTo(0.25, 10);
  });

  it('không có issue nào ⇒ coverage null, không chia cho 0', () => {
    const r = judgeAgreement({
      raters: ['J1', 'J2'],
      cardIds: ['c1'],
      votes: [],
      totalIssues: 0,
      groups: [],
    });
    expect(r.coverage).toBeNull();
  });

  it('đếm nhóm mà MỌI judge hoàn thành đều nêu', () => {
    const r = judgeAgreement({
      raters: ['J1', 'J2', 'J3'],
      cardIds: ['c1', 'c2'],
      votes: [],
      totalIssues: 1,
      groups: [
        { severityByJudge: { J1: 'MAJOR', J2: 'MAJOR', J3: 'MINOR' } },
        { severityByJudge: { J1: 'MAJOR' } },
      ],
    });
    expect(r.unanimousGroups).toBe(1);
  });

  it('tất định — hai lần gọi ra cùng một báo cáo', () => {
    const input = {
      raters: ['J1', 'J2'],
      cardIds: ['c1', 'c2'],
      votes: [{ judgeKey: 'J1', cardId: 'c1', severity: 'MAJOR' }],
      totalIssues: 1,
      groups: [{ severityByJudge: { J1: 'MAJOR' } }],
    };
    expect(JSON.stringify(judgeAgreement(input))).toBe(
      JSON.stringify(judgeAgreement(input)),
    );
  });
});
