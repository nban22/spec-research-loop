import {
  MIN_OCCURRENCES,
  consensusOf,
  judgeToRepeat,
} from './self-consistency';

/**
 * #45 — tự nhất quán. Tính chất gánh cả issue: **issue xuất hiện 1/3 lần bị loại, 2/3 lần được
 * giữ**. Và các chốt chặn: k=1 thì không lọc gì, lần chạy lỗi không vào mẫu số.
 */

/** Hình dạng đúng như schema output của judge — để test đi qua cùng đường với production. */
const issue = (
  title: string,
  severity = 'MAJOR',
  target_card_title: string | null = 'Claim A',
) => ({
  title,
  reason: `lý do cho ${title}`,
  suggestion: `đề xuất cho ${title}`,
  severity,
  target_card_title,
});

describe('consensusOf — tính chất chính', () => {
  it('1/3 lần ⇒ LOẠI · 2/3 lần ⇒ GIỮ · 3/3 lần ⇒ giữ', () => {
    const r = consensusOf([
      [
        issue('Missing baseline comparison'),
        issue('Chunking strategy undefined'),
      ],
      [issue('Missing baseline comparison'), issue('Threat model absent')],
      [
        issue('Missing baseline comparison'),
        issue('Chunking strategy undefined'),
      ],
    ]);

    const titles = r.issues.map((i) => i.title);
    expect(titles).toContain('Missing baseline comparison');
    expect(titles).toContain('Chunking strategy undefined');
    // Chỉ xuất hiện 1/3 ⇒ bị loại.
    expect(titles).not.toContain('Threat model absent');
    expect(r.dropped).toBe(1);
    expect(r.attempts).toBe(3);
    expect(r.filtered).toBe(true);
  });

  it('đếm đúng số lần xuất hiện, kèm mẫu số', () => {
    const r = consensusOf([
      [issue('Missing baseline comparison')],
      [issue('Missing baseline comparison')],
      [issue('Missing baseline comparison')],
    ]);
    expect(r.issues[0].occurrences).toBe(3);
    expect(r.issues[0].attempts).toBe(3);
  });

  it('sắp theo số lần xuất hiện giảm dần', () => {
    const r = consensusOf([
      [
        issue('Missing baseline comparison'),
        issue('Chunking strategy undefined'),
      ],
      [
        issue('Missing baseline comparison'),
        issue('Chunking strategy undefined'),
      ],
      [issue('Missing baseline comparison')],
    ]);
    expect(r.issues.map((i) => i.occurrences)).toEqual([3, 2]);
  });

  it('MIN_OCCURRENCES là 2 — ghim con số, không để nó âm thầm đổi', () => {
    expect(MIN_OCCURRENCES).toBe(2);
  });
});

describe('consensusOf — các chốt chặn', () => {
  it('k = 1 ⇒ KHÔNG lọc gì, filtered = false', () => {
    // Lọc với k=1 là loại sạch mọi issue: một lỗi hạ tầng biến thành "judge không tìm ra gì".
    const r = consensusOf([[issue('Missing baseline comparison')]]);
    expect(r.issues).toHaveLength(1);
    expect(r.filtered).toBe(false);
    expect(r.dropped).toBe(0);
  });

  it('không lần chạy nào thành công ⇒ rỗng, không nổ', () => {
    const r = consensusOf([]);
    expect(r).toEqual({ issues: [], attempts: 0, dropped: 0, filtered: false });
  });

  it('mẫu số chỉ đếm lần chạy THÀNH CÔNG', () => {
    // Gọi bên ngoài đã loại lần lỗi; ở đây kiểm rằng 2 lần thành công cho mẫu số 2, không phải 3.
    const r = consensusOf([
      [issue('Missing baseline comparison')],
      [issue('Missing baseline comparison')],
    ]);
    expect(r.attempts).toBe(2);
    expect(r.issues[0].occurrences).toBe(2);
  });

  it('lần chạy rỗng vẫn tính vào mẫu số', () => {
    // Judge chạy được nhưng không nêu gì là một kết quả thật, không phải một lỗi.
    const r = consensusOf([
      [issue('Missing baseline comparison')],
      [],
      [issue('Missing baseline comparison')],
    ]);
    expect(r.attempts).toBe(3);
    expect(r.issues[0].occurrences).toBe(2);
  });
});

describe('consensusOf — "cùng một issue" là gì', () => {
  it('tiêu đề diễn đạt khác nhưng cùng ý ⇒ CÙNG một issue', () => {
    const r = consensusOf([
      [issue('Missing baseline comparison against retrieval')],
      [issue('Missing baseline comparison retrieval against')],
    ]);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].occurrences).toBe(2);
  });

  it('CÙNG tiêu đề nhưng KHÁC thẻ ⇒ HAI issue khác nhau', () => {
    // Trong một lần chạy của một judge, hai issue trên hai thẻ là hai phát hiện khác nhau.
    const r = consensusOf([
      [issue('Undefined metric', 'MAJOR', 'Claim A')],
      [issue('Undefined metric', 'MAJOR', 'Claim B')],
    ]);
    // Mỗi cái chỉ 1/2 lần ⇒ cả hai bị loại.
    expect(r.issues).toHaveLength(0);
    expect(r.dropped).toBe(2);
  });

  it('thẻ null cũng là một giá trị, khớp với null', () => {
    const r = consensusOf([
      [issue('Whole document lacks structure', 'MAJOR', null)],
      [issue('Whole document lacks structure', 'MAJOR', null)],
    ]);
    expect(r.issues).toHaveLength(1);
  });

  it('mức khác nhau giữa các lần ⇒ lấy NẶNG NHẤT, cùng luật groupIssues', () => {
    const r = consensusOf([
      [issue('Missing baseline comparison', 'MINOR')],
      [issue('Missing baseline comparison', 'CRITICAL')],
      [issue('Missing baseline comparison', 'MAJOR')],
    ]);
    expect(r.issues[0].severity).toBe('CRITICAL');
  });

  it('một judge nêu HAI issue giống nhau trong CÙNG một lần ⇒ vẫn chỉ đếm là 1 lần', () => {
    // Nếu đếm theo số issue thay vì số lần chạy thì một judge lặp lại chính nó sẽ tự vượt ngưỡng.
    const r = consensusOf([
      [
        issue('Missing baseline comparison'),
        issue('Missing baseline comparison'),
      ],
      [issue('Threat model absent')],
    ]);
    expect(r.issues).toHaveLength(0);
    expect(r.dropped).toBe(2);
  });
});

describe('judgeToRepeat — chọn judge nào chạy k lần', () => {
  it('có Δκ đáng kể ⇒ chọn judge đó', () => {
    expect(judgeToRepeat({ judgeKey: 'J5', significant: true })).toBe('J5');
  });

  it('Δκ KHÔNG đáng kể ⇒ không bật cho ai', () => {
    // Đoán sai là trả giá gấp ba cho một judge không có vấn đề.
    expect(judgeToRepeat({ judgeKey: 'J5', significant: false })).toBeNull();
  });

  it('chưa có số đo ⇒ không bật cho ai, KHÔNG đoán', () => {
    expect(judgeToRepeat(null)).toBeNull();
    expect(judgeToRepeat(undefined)).toBeNull();
  });
});
