import { JUDGE_DEFS } from '../contracts/enums';
import {
  canonicalDigest,
  canonicalise,
  legacyDigest,
  seedFor,
  shuffleForJudge,
} from './card-shuffle';

/**
 * #43 — xáo thứ tự thẻ mà **không** mất bằng chứng độc lập.
 *
 * Hai tính chất gánh cả issue, và cả hai đều phải kiểm bằng dữ liệu chứ không bằng lời:
 * 1. Năm judge thấy **năm thứ tự khác nhau** nhưng **cùng một digest**.
 * 2. Từ `(digest, judgeKey, round)` **dựng lại được từng byte** đầu vào của một judge.
 */

const card = (title: string, type = 'CLAIM') => ({
  title,
  type,
  status: 'PROPOSED',
  body: `nội dung của ${title}`,
  payload: null,
});

const SPEC = {
  title: 'Reference-aware retrieval',
  domain: 'Vietnamese legal QA',
  version_no: 1,
  cards: [card('A'), card('B'), card('C'), card('D'), card('E'), card('F')],
  card_sources: [
    { card_title: 'A', source_id: 's1', support_label: 'SUPPORTED' },
    { card_title: 'B', source_id: 's2', support_label: 'WEAK' },
    { card_title: 'C', source_id: 's3', support_label: 'UNSUPPORTED' },
  ],
};
const SOURCES = [{ source_id: 's1', title: 'A paper' }];

const titles = (spec: Record<string, unknown>): string[] => {
  const cards = spec.cards;
  if (!Array.isArray(cards)) return [];
  return cards.map((c) => {
    const t = (c as { title?: unknown }).title;
    return typeof t === 'string' ? t : '?';
  });
};

describe('canonicalise', () => {
  it('thứ tự thẻ vào khác nhau ⇒ dạng chuẩn hoá GIỐNG NHAU', () => {
    // Đây là tính chất làm phản biện "digest của anh phụ thuộc thứ tự Postgres trả về" tan biến.
    const reversed = { ...SPEC, cards: [...SPEC.cards].reverse() };
    expect(titles(canonicalise(SPEC))).toEqual(titles(canonicalise(reversed)));
  });

  it('KHÔNG sửa đối tượng gốc', () => {
    const before = JSON.stringify(SPEC);
    canonicalise(SPEC);
    expect(JSON.stringify(SPEC)).toBe(before);
  });

  it('spec không có `cards` ⇒ trả nguyên vẹn, không nổ', () => {
    // Digest vẫn phải tính được cho spec rỗng, không thì vòng judge đầu tiên không chạy nổi.
    const empty = { title: 'x' };
    expect(canonicalise(empty)).toEqual(empty);
  });

  it('giữ nguyên mọi khoá khác của spec_json', () => {
    const out = canonicalise(SPEC);
    expect(out.title).toBe(SPEC.title);
    expect(out.domain).toBe(SPEC.domain);
    expect(out.version_no).toBe(1);
  });
});

describe('legacyDigest — đường cờ TẮT', () => {
  it('băm đúng chuỗi gốc, KHÔNG chuẩn hoá', () => {
    // Chốt chặn quan trọng nhất của #43: cờ tắt thì digest không đổi một byte so với các vòng
    // judge đã chạy trước đây. Nếu hàm này âm thầm chuẩn hoá thì mọi bản ghi cũ thành không
    // đối chiếu được, mà không ai nhận ra vì digest vẫn "trông đúng".
    const reversed = { ...SPEC, cards: [...SPEC.cards].reverse() };
    expect(legacyDigest(SPEC, SOURCES)).not.toBe(
      legacyDigest(reversed, SOURCES),
    );
  });

  it('cùng đầu vào ⇒ cùng digest', () => {
    expect(legacyDigest(SPEC, SOURCES)).toBe(legacyDigest(SPEC, SOURCES));
  });
});

describe('canonicalDigest — đường cờ BẬT', () => {
  it('thứ tự thẻ vào khác nhau ⇒ CÙNG digest', () => {
    const reversed = { ...SPEC, cards: [...SPEC.cards].reverse() };
    expect(canonicalDigest(SPEC, SOURCES)).toBe(
      canonicalDigest(reversed, SOURCES),
    );
  });

  it('đổi NỘI DUNG một thẻ ⇒ digest đổi', () => {
    // Bất biến với thứ tự **không được** thành bất biến với nội dung, không thì digest vô dụng.
    const edited = {
      ...SPEC,
      cards: [{ ...card('A'), body: 'đã sửa' }, ...SPEC.cards.slice(1)],
    };
    expect(canonicalDigest(edited, SOURCES)).not.toBe(
      canonicalDigest(SPEC, SOURCES),
    );
  });

  it('đổi sources ⇒ digest đổi', () => {
    expect(canonicalDigest(SPEC, [{ source_id: 's9' }])).not.toBe(
      canonicalDigest(SPEC, SOURCES),
    );
  });

  it('thứ tự vào KHÔNG chuẩn ⇒ hai chế độ cho hai con số khác nhau', () => {
    // Fixture `SPEC` tình cờ đã ở đúng thứ tự chuẩn hoá (A→F), nên với nó hai digest **trùng
    // nhau** — và đó là hành vi ĐÚNG, không phải lỗi. Muốn ghim sự khác biệt giữa hai chế độ thì
    // phải cấp đầu vào lệch thứ tự. Bản trước của test này assert trên `SPEC` nên nó đo fixture
    // chứ không đo code.
    const reversed = { ...SPEC, cards: [...SPEC.cards].reverse() };
    expect(canonicalDigest(reversed, SOURCES)).not.toBe(
      legacyDigest(reversed, SOURCES),
    );
    // Và với đầu vào đã chuẩn thì chúng bằng nhau — chuẩn hoá không được tự ý đổi gì thêm.
    expect(canonicalDigest(SPEC, SOURCES)).toBe(legacyDigest(SPEC, SOURCES));
  });
});

describe('seedFor', () => {
  it('suy ra được: cùng (digest, judge, vòng) ⇒ cùng seed', () => {
    const d = canonicalDigest(SPEC, SOURCES);
    expect(seedFor(d, 'J1', 1)).toBe(seedFor(d, 'J1', 1));
  });

  it('khác judge ⇒ khác seed', () => {
    const d = canonicalDigest(SPEC, SOURCES);
    const seeds = JUDGE_DEFS.map((def) => seedFor(d, def.key, 1));
    expect(new Set(seeds).size).toBe(5);
  });

  it('khác VÒNG ⇒ khác seed', () => {
    // Vòng hai lặp đúng thứ tự vòng một thì "chạy lại" không còn là phép thử độc lập về lệch vị trí.
    const d = canonicalDigest(SPEC, SOURCES);
    expect(seedFor(d, 'J1', 1)).not.toBe(seedFor(d, 'J1', 2));
  });

  it('khác digest ⇒ khác seed', () => {
    expect(seedFor('a'.repeat(64), 'J1', 1)).not.toBe(
      seedFor('b'.repeat(64), 'J1', 1),
    );
  });
});

describe('shuffleForJudge', () => {
  const digest = canonicalDigest(SPEC, SOURCES);

  it('NĂM judge, NĂM thứ tự khác nhau', () => {
    const orders = JUDGE_DEFS.map((def) =>
      titles(shuffleForJudge(SPEC, seedFor(digest, def.key, 1))).join(','),
    );
    expect(new Set(orders).size).toBe(5);
  });

  it('năm thứ tự khác nhau nhưng CÙNG TẬP THẺ — không mất, không thêm', () => {
    const want = [...titles(SPEC)].sort();
    for (const def of JUDGE_DEFS) {
      const got = titles(shuffleForJudge(SPEC, seedFor(digest, def.key, 1)));
      expect([...got].sort()).toEqual(want);
    }
  });

  it('DỰNG LẠI được: cùng seed ⇒ cùng thứ tự, từng byte', () => {
    // Tiêu chí hoàn thành của #43. Không có tính chất này thì `shuffle_seed` chỉ là rác trong DB.
    const seed = seedFor(digest, 'J3', 1);
    expect(JSON.stringify(shuffleForJudge(SPEC, seed))).toBe(
      JSON.stringify(shuffleForJudge(SPEC, seed)),
    );
  });

  it('dựng lại được từ thứ tự thẻ vào KHÁC — vì xáo từ dạng chuẩn hoá', () => {
    // Đây là lý do phải xáo từ dạng chuẩn hoá chứ không từ thứ tự DB: nếu xáo từ thứ tự DB thì
    // muốn tái tạo phải biết cả thứ tự DB lúc đó, mà thứ tự đó không được ghi ở đâu cả.
    const seed = seedFor(digest, 'J3', 1);
    const reversed = { ...SPEC, cards: [...SPEC.cards].reverse() };
    expect(JSON.stringify(shuffleForJudge(reversed, seed))).toBe(
      JSON.stringify(shuffleForJudge(SPEC, seed)),
    );
  });

  it('có xáo thật — ít nhất một judge KHÁC thứ tự chuẩn hoá', () => {
    // Nếu `shuffle` bị thay bằng hàm đồng nhất thì mọi test trên vẫn xanh trừ test này.
    const canon = titles(canonicalise(SPEC)).join(',');
    const anyDifferent = JUDGE_DEFS.some(
      (def) =>
        titles(shuffleForJudge(SPEC, seedFor(digest, def.key, 1))).join(',') !==
        canon,
    );
    expect(anyDifferent).toBe(true);
  });

  it('card_sources cũng được xáo — nếu không thì lệch vị trí chỉ triệt một nửa', () => {
    const orders = JUDGE_DEFS.map((def) => {
      const out = shuffleForJudge(SPEC, seedFor(digest, def.key, 1));
      const cs = out.card_sources;
      return Array.isArray(cs)
        ? cs
            .map((x) => (x as { source_id?: string }).source_id ?? '?')
            .join(',')
        : '';
    });
    expect(new Set(orders).size).toBeGreaterThan(1);
  });

  it('KHÔNG sửa đối tượng gốc', () => {
    const before = JSON.stringify(SPEC);
    shuffleForJudge(SPEC, seedFor(digest, 'J1', 1));
    expect(JSON.stringify(SPEC)).toBe(before);
  });

  it('một thẻ ⇒ không nổ, thứ tự duy nhất', () => {
    const one = { ...SPEC, cards: [card('A')], card_sources: [] };
    expect(titles(shuffleForJudge(one, seedFor(digest, 'J1', 1)))).toEqual([
      'A',
    ]);
  });
});
