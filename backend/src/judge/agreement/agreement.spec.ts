import {
  AgreementInput,
  CardVote,
  GroupVote,
  bucketOf,
  cardLabelCounts,
  fleissKappa,
  jaccardMatrix,
  judgeAgreement,
  leaveOneOut,
  permutationNull,
  seedFrom,
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
    expect(r.degenerate).toBe('IDENTICAL_ROWS');
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

  it('unanimous vẫn đúng khi trả null vì INSUFFICIENT_ITEMS', () => {
    // Comment trong code lập luận phải tính `unanimous` TRƯỚC chốt `items < 2`. Nhánh
    // NO_VARIANCE có test, nhánh này thì chưa — cùng một ý định, test một nửa.
    expect(fleissKappa([[5, 0, 0]], 5).unanimous).toBe(true);
    expect(fleissKappa([[3, 0, 2]], 5).unanimous).toBe(false);
  });

  it('unanimous là MỌI mục đồng thuận, không phải CÓ mục nào đồng thuận', () => {
    // Bảng Fleiss công bố có mục 1 = [0,0,0,0,14] (đồng thuận hoàn toàn) nhưng các mục khác thì
    // không. `every → some` sẽ cho true và trước đây không gì bắt được.
    const published = [
      [0, 0, 0, 0, 14],
      [0, 2, 6, 4, 2],
    ];
    expect(fleissKappa(published, 14).unanimous).toBe(false);
  });

  it('ma trận méo ⇒ null MALFORMED_COUNTS, không trả số trông hợp lý', () => {
    // Hàng không tổng bằng raters cho ra −0.3333 rất hợp lý mà sai; hàng ngắn hơn cho NaN lọt
    // vào cột Float của Prisma.
    expect(
      fleissKappa(
        [
          [3, 0, 2],
          [3, 0, 2],
        ],
        4,
      ).reason,
    ).toBe('MALFORMED_COUNTS');
    const ragged = fleissKappa(
      [
        [3, 0, 2],
        [3, 0],
      ],
      5,
    );
    expect(ragged.reason).toBe('MALFORMED_COUNTS');
    expect(ragged.kappa).toBeNull();
  });

  it('0 mục ⇒ null NO_ITEMS', () => {
    expect(fleissKappa([], 5).reason).toBe('NO_ITEMS');
  });

  it('dưới 2 người chấm ⇒ null INSUFFICIENT_RATERS', () => {
    expect(fleissKappa([[1, 0, 0]], 1).reason).toBe('INSUFFICIENT_RATERS');
  });

  it('κ BẤT BIẾN theo thứ tự mục và thứ tự nhãn — không chỉ là "hàm thuần"', () => {
    // Bản trước gọi hai lần trên CÙNG một mảng, tức chỉ chứng minh hàm thuần — đúng cái khuyết
    // điểm mà PR này chỉ ra ở test cũ của `groupIssues` rồi lặp lại y nguyên. Bất biến thật là:
    // đảo thứ tự mục, hoặc hoán vị nhãn, thì κ không đổi.
    const counts = [
      [3, 1, 1],
      [1, 2, 2],
      [0, 5, 0],
    ];
    const base = fleissKappa(counts, 5).kappa as number;
    expect(fleissKappa([...counts].reverse(), 5).kappa).toBeCloseTo(base, 12);
    // Hoán vị cột (đổi tên nhãn) cũng không được đổi κ.
    const permuted = counts.map(([a, b, c]) => [c, a, b]);
    expect(fleissKappa(permuted, 5).kappa).toBeCloseTo(base, 12);
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

  it('MINOR ra nhãn MINOR — ba nhãn thật sự phân biệt được', () => {
    // Mutation chỉ ra: gộp ternary thành `rank===0 ? NONE : BLOCKING` vẫn xanh, vì KHÔNG fixture
    // nào có phiếu mà mức nặng nhất là MINOR. Cả lập luận "ba nhãn, không phải bốn" của PR dựa
    // trên một phân biệt mà test không nhìn thấy.
    expect(
      cardLabelCounts(
        ['c1'],
        ['J1'],
        [{ judgeKey: 'J1', cardId: 'c1', severity: 'MINOR' }],
      ),
    ).toEqual([[0, 1, 0]]);
    expect(
      cardLabelCounts(
        ['c1'],
        ['J1'],
        [{ judgeKey: 'J1', cardId: 'c1', severity: 'MAJOR' }],
      ),
    ).toEqual([[0, 0, 1]]);
  });

  it('severity lạ ⇒ BLOCKING (giả định xấu nhất), có phiếu là có phiếu', () => {
    // `bucketOf` coi mọi thứ khác MINOR là BLOCKING, nên chuỗi lạ rơi vào BLOCKING chứ không
    // biến mất. Hướng an toàn: thà đánh dấu quá còn hơn im lặng bỏ một phiếu. Thực tế không
    // xảy ra vì `Issue.severity` là enum Prisma — đây là hành vi biên, ghi lại cho rõ.
    expect(
      cardLabelCounts(
        ['c1'],
        ['J1'],
        [{ judgeKey: 'J1', cardId: 'c1', severity: 'BLOCKER' }],
      ),
    ).toEqual([[0, 0, 1]]);
  });

  it('mọi hàng luôn tổng bằng số người chấm', () => {
    const counts = cardLabelCounts(
      ['c1', 'c2'],
      ['J1', 'J2', 'J3'],
      [
        { judgeKey: 'J1', cardId: 'c1', severity: 'MINOR' },
        { judgeKey: 'J9', cardId: 'c2', severity: 'MAJOR' },
      ],
    );
    for (const row of counts) {
      expect(row.reduce((a, b) => a + b, 0)).toBe(3);
    }
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
    // CRITICAL(3) − mean(3,1)=2 ⇒ +1. So với trung bình CẢ NHÓM, không phải của "người khác".
    expect(top.bias).toBeCloseTo(1, 10);
    expect(top.n).toBe(2);
  });

  it('độ lớn SO ĐƯỢC giữa các judge dù cỡ nhóm khác nhau', () => {
    // Đây là lỗi thật của bản trước: so với trung bình "những người khác" là bộ khuếch đại
    //   r_j − mean(khác) = m/(m−1) · (r_j − mean(cả nhóm))
    // nên nhóm 2 người nhân 2×, nhóm 5 người chỉ 1.25×. JP lệch +0.8 so với trung bình nhóm 5
    // và JQ lệch +0.5 so với trung bình nhóm 2 khi đó ra CÙNG một số — hai mức nặng tay khác
    // nhau bị san bằng chỉ vì cỡ nhóm. Giao diện xếp hạng theo đúng con số này.
    const pair = severityBias(
      ['JQ', 'JR'],
      [{ severityByJudge: { JQ: 'CRITICAL', JR: 'MAJOR' } }],
    );
    const five = severityBias(
      ['JP', 'A', 'B', 'C', 'D'],
      [
        {
          severityByJudge: {
            JP: 'CRITICAL',
            A: 'MAJOR',
            B: 'MAJOR',
            C: 'MAJOR',
            D: 'MAJOR',
          },
        },
      ],
    );
    // JQ lệch +0.5 so với trung bình nhóm; JP lệch +0.8. JP phải LỚN HƠN.
    const jq = pair.find((b) => b.judgeKey === 'JQ');
    const jp = five.find((b) => b.judgeKey === 'JP');
    expect(jq?.bias).toBeCloseTo(0.5, 10);
    expect(jp?.bias).toBeCloseTo(0.8, 10);
  });

  it('judge KHÔNG nêu nhóm nào thì không thành "judge ma" nhẹ tay nhất', () => {
    // Bỏ chốt `mine === undefined` là sinh ra người không chấm gì mà bị xếp nhẹ tay nhất.
    const r = severityBias(
      ['J1', 'J2', 'J3'],
      [
        { severityByJudge: { J1: 'CRITICAL', J2: 'CRITICAL' } },
        { severityByJudge: { J1: 'CRITICAL', J2: 'CRITICAL' } },
      ],
    );
    const ghost = r.find((b) => b.judgeKey === 'J3');
    expect(ghost?.n).toBe(0);
    expect(ghost?.bias).toBeNull();
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

    const all = leaveOneOut(cardIds, ['J1', 'J2', 'J3', 'J4'], votes);
    const [top] = all;
    expect(top.judgeKey).toBe('J4');
    // Ghi thẳng giá trị. `toBeGreaterThan(0)` là dạng yếu nhất và để lọt ba mutant: bỏ phép
    // trừ baseline, fallback null→0, và dùng R thay vì R−1 cho bảng đã bỏ một người.
    expect(top.delta).toBeCloseTo(1, 10);
    expect(top.kappaWithout).toBeCloseTo(1, 10);
  });

  it('bảng đã bỏ một judge phải tính với R−1, không phải R', () => {
    // Đây chính là lập luận "mọi phép bỏ đều còn R−1 người nên các Δ so được với nhau". Dùng
    // sai R là mọi Δ tính trên một cái sàn sai.
    const cardIds = ['c1', 'c2', 'c3'];
    const votes = [
      { judgeKey: 'J1', cardId: 'c1', severity: 'MAJOR' },
      { judgeKey: 'J2', cardId: 'c1', severity: 'MAJOR' },
      { judgeKey: 'J3', cardId: 'c2', severity: 'MAJOR' },
    ];
    const out = leaveOneOut(cardIds, ['J1', 'J2', 'J3'], votes);
    // Bỏ J3 còn J1+J2, cả hai nêu c1 và cùng im trên c2,c3 ⇒ đồng thuận hoàn hảo ⇒ κ = 1.
    expect(out.find((l) => l.judgeKey === 'J3')?.kappaWithout).toBeCloseTo(
      1,
      10,
    );
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

  it('nối đúng dây: κ của báo cáo tính theo SỐ NGƯỜI CHẤM, không theo số thẻ', () => {
    // Mutation `fleissKappa(..., cardIds.length)` sống sót vì describe này chưa bao giờ assert
    // `.kappa` — tức phần nối giữa các mảnh đã test thì lại không được test.
    const r = judgeAgreement({
      raters: ['J1', 'J2'],
      cardIds: ['c1', 'c2'],
      votes: [
        { judgeKey: 'J1', cardId: 'c1', severity: 'MAJOR' },
        { judgeKey: 'J2', cardId: 'c1', severity: 'MAJOR' },
      ],
      totalIssues: 2,
      groups: [{ severityByJudge: { J1: 'MAJOR', J2: 'MAJOR' } }],
    });
    expect(r.kappa.raters).toBe(2);
    expect(r.kappa.items).toBe(2);
    expect(r.kappa.kappa).toBeCloseTo(1, 10);
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

/* ------------------------------------------------------------------ null hoán vị */

/**
 * Hai dòng "gây nhiễu nhất" / "chấm nặng tay nhất" luôn tìm ra một người, vì cực đại của năm số
 * thực gần như chắc chắn dương. Không có kiểm định này thì panel **luôn** chỉ ra một kẻ có tội,
 * và #8 dồn tài nguyên đắt vào đó kể cả khi năm judge giống nhau hoàn toàn.
 */
describe('permutationNull', () => {
  const RATERS = ['J1', 'J2', 'J3', 'J4', 'J5'];

  /** Năm judge **thống kê giống nhau**: nhãn rải đều, không ai gây nhiễu, không ai nặng tay. */
  function nullData(): AgreementInput {
    const cardIds = Array.from({ length: 12 }, (_, i) => `c${i}`);
    const votes: CardVote[] = [];
    // Mỗi thẻ đúng 2 judge nêu, cuốn vòng tròn cho mọi judge nêu số lần bằng nhau và mức bằng nhau.
    cardIds.forEach((cardId, i) => {
      votes.push({
        cardId,
        judgeKey: RATERS[i % 5],
        severity: i % 2 === 0 ? 'MAJOR' : 'MINOR',
      });
      votes.push({
        cardId,
        judgeKey: RATERS[(i + 1) % 5],
        severity: i % 2 === 0 ? 'MINOR' : 'MAJOR',
      });
    });
    return {
      raters: RATERS,
      cardIds,
      votes,
      totalIssues: votes.length,
      groups: [],
    };
  }

  it('năm judge giống nhau ⇒ KHÔNG nêu tên ai (p không đáng kể)', () => {
    const r = permutationNull(nullData(), 200, 'seed-a');
    // Có thể vẫn có một judge dẫn đầu — điều bắt buộc là nó **không** được gắn cờ đáng kể.
    expect(r.disruptive?.significant ?? false).toBe(false);
  });

  it('một judge gây nhiễu THẬT ⇒ p đáng kể (kiểm định có LỰC, không phải luôn-âm)', () => {
    // J5 nêu đúng những thẻ không ai nêu và im ở thẻ mọi người nêu — bất đồng cực đại.
    // Không có ca này thì `significant` luôn `false` cũng làm mọi test kia xanh, tức là đã đổi
    // "luôn buộc tội" thành "không bao giờ buộc tội" — vẫn vô dụng, chỉ theo chiều khác.
    const cardIds = Array.from({ length: 12 }, (_, i) => `c${i}`);
    const votes: CardVote[] = [];
    cardIds.forEach((cardId, i) => {
      if (i % 2 === 0) {
        for (const j of ['J1', 'J2', 'J3', 'J4'])
          votes.push({ cardId, judgeKey: j, severity: 'MAJOR' });
      } else votes.push({ cardId, judgeKey: 'J5', severity: 'MAJOR' });
    });
    const r = permutationNull(
      { raters: RATERS, cardIds, votes, totalIssues: votes.length, groups: [] },
      300,
      'seed-sig',
    );
    expect(r.disruptive?.judgeKey).toBe('J5');
    expect(r.disruptive?.value).toBeCloseTo(0.8, 2);
    expect(r.disruptive?.significant).toBe(true);
  });

  it('Δκ nhỏ nhưng dẫn đầu ⇒ KHÔNG đáng kể — đây là cả lý do tồn tại của kiểm định', () => {
    // Δκ ≈ 0.011 trên năm judge giống nhau. Nó dương và nó dẫn đầu, nên panel cũ in nó ra như
    // "kẻ gây nhiễu nhất". Kiểm định nói p ≈ 0.87 — chỉ là cực đại của năm số nhiễu.
    const r = permutationNull(nullData(), 300, 'seed-weak');
    expect(r.disruptive!.value).toBeGreaterThan(0);
    expect(r.disruptive!.p).toBeGreaterThan(0.5);
    expect(r.disruptive!.significant).toBe(false);
  });

  it('một judge chấm nặng tay THẬT ⇒ p đáng kể', () => {
    // J4 luôn CRITICAL, bốn người còn lại luôn MINOR, trên 12 nhóm. Đây là tín hiệu thật.
    const groups: GroupVote[] = Array.from({ length: 12 }, (_, i) => ({
      groupId: `g${i}`,
      severityByJudge: {
        J1: 'MINOR',
        J2: 'MINOR',
        J3: 'MINOR',
        J4: 'CRITICAL',
      },
    }));
    const r = permutationNull({ ...nullData(), groups }, 200, 'seed-b');
    expect(r.harsh?.judgeKey).toBe('J4');
    expect(r.harsh?.significant).toBe(true);
  });

  it('MỌI judge đều nhẹ tay ⇒ không có ứng viên nặng tay, harsh = null', () => {
    // Chốt dấu nằm ở đây, không ở panel. Bỏ nó là một judge **nhẹ tay** thành "nặng tay nhất"
    // chỉ vì là người nhẹ ít nhất trong năm.
    const groups: GroupVote[] = Array.from({ length: 6 }, (_, i) => ({
      groupId: `g${i}`,
      severityByJudge: { J1: 'MINOR', J2: 'MINOR', J3: 'MINOR' },
    }));
    const r = permutationNull({ ...nullData(), groups }, 50, 'seed-lenient');
    expect(r.harsh).toBeNull();
  });

  it('p không bao giờ bằng 0 — dạng cộng-một', () => {
    const groups: GroupVote[] = Array.from({ length: 12 }, (_, i) => ({
      groupId: `g${i}`,
      severityByJudge: {
        J1: 'MINOR',
        J2: 'MINOR',
        J3: 'MINOR',
        J4: 'CRITICAL',
      },
    }));
    const r = permutationNull({ ...nullData(), groups }, 100, 'seed-c');
    // `0/100` nghĩa là "chưa thấy trong 100 lượt", không phải "không thể".
    expect(r.harsh!.p).toBeGreaterThan(0);
    expect(r.harsh!.p).toBeCloseTo(1 / 101, 10);
  });

  it('CÙNG seed ⇒ cùng p (NFR-JDG-6: F5 hai lần không được ra hai số)', () => {
    const d = nullData();
    const a = permutationNull(d, 150, 'v-1:2');
    const b = permutationNull(d, 150, 'v-1:2');
    expect(a).toEqual(b);
  });

  it('KHÁC seed ⇒ p được phép khác — chứng minh seed thật sự vào PRNG', () => {
    // Nếu seed bị bỏ qua thì hai lượt dưới ra y hệt nhau và mọi test tất định ở trên thành vô nghĩa.
    const groups: GroupVote[] = Array.from({ length: 8 }, (_, i) => ({
      groupId: `g${i}`,
      severityByJudge: { J1: 'MINOR', J2: 'MAJOR', J3: 'CRITICAL' },
    }));
    const d = { ...nullData(), groups };
    const seeds = ['s1', 's2', 's3', 's4', 's5', 's6'].map(
      (s) => permutationNull(d, 60, s).harsh?.p,
    );
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });

  it('hoán vị KHÔNG làm đổi dữ liệu gốc của lời gọi', () => {
    const d = nullData();
    const before = JSON.stringify(d);
    permutationNull(d, 50, 'seed-d');
    expect(JSON.stringify(d)).toBe(before);
  });

  it('thiếu mục ⇒ không có phán quyết nào, không nổ', () => {
    const r = permutationNull(
      { raters: RATERS, cardIds: [], votes: [], totalIssues: 0, groups: [] },
      50,
      'seed-e',
    );
    expect(r.disruptive).toBeNull();
    expect(r.harsh).toBeNull();
  });

  it('seedFrom tản đều và ổn định giữa các lần chạy', () => {
    expect(seedFrom('v-1:1')).toBe(seedFrom('v-1:1'));
    expect(seedFrom('v-1:1')).not.toBe(seedFrom('v-1:2'));
  });
});
