import { createHash } from 'node:crypto';
import { z } from 'zod';
import { mulberry32, seedFrom, shuffle } from './prng';

/**
 * B2a · #43 — xáo thứ tự thẻ theo từng judge, và giữ được bằng chứng độc lập.
 *
 * **Hàm thuần, 0 I/O, 0 lời gọi LLM.**
 *
 * ## Vấn đề
 *
 * Năm judge hiện nhận `spec_json` giống hệt nhau, **cùng thứ tự thẻ**. Thẻ đứng đầu được chú ý hơn
 * thẻ đứng cuối — đó là lệch vị trí, và nó miễn phí để triệt: xáo thứ tự riêng cho từng judge.
 *
 * ## Nhưng nó phá mất bằng chứng
 *
 * `input_digest` hiện băm **chuỗi** `spec_json` đã dựng một lần rồi đưa cho cả 5 judge. Năm dòng
 * `JudgeRun` cùng digest **chính là** bằng chứng "5 judge nhận cùng đầu vào" — thứ đề bài chấm
 * thẳng vào. Xáo thứ tự ⇒ mỗi judge một chuỗi khác ⇒ digest khác nhau ⇒ bằng chứng biến mất.
 *
 * ## Cách giữ, và làm nó MẠNH HƠN
 *
 * 1. Digest băm **dạng chuẩn hoá thứ tự** (`canonicalDigest`) — 5 judge vẫn cùng digest.
 * 2. Thứ tự thật của từng judge sinh ra bằng cách xáo **chính dạng chuẩn hoá đó** với seed suy
 *    tất định từ `(digest, judgeKey, round)`.
 *
 * Hệ quả: từ `(digest, judgeKey, round)` **dựng lại được từng byte** đầu vào của từng judge —
 * và vì seed **suy ra được**, người kiểm chứng tự tính lại được và đối chiếu với `shuffle_seed`
 * đã lưu. Không thể chọn seed có lợi rồi khai khống.
 *
 * Trước: chứng minh được *"cả 5 nhận cùng đầu vào"*.
 * Sau: chứng minh được *"đầu vào của judge này đúng là cái này, và nó không chứa đầu ra của ai"*.
 *
 * ## Vì sao chuẩn hoá theo NỘI DUNG, không theo `Card.id`
 *
 * Đề bài #8 đề nghị băm tập thẻ sắp theo id. Không làm được: `SpecService.buildSpecJson` **không
 * trả `Card.id`** — chỉ `title`/`type`/`status`/`body`/`payload`, và `card_sources` liên kết ngược
 * qua `card_title`. Sửa `buildSpecJson` để thêm id thì ra ngoài phạm vi #43 (`spec/**` không thuộc
 * làn B) và đổi đầu vào của prompt, tức đổi luôn hành vi judge.
 *
 * Nên chuẩn hoá theo **chuỗi JSON của từng thẻ**: tất định, không cần id, và bất biến với thứ tự
 * Postgres trả về — đúng tính chất cần thiết.
 */

/** Chỉ mô tả phần **được đụng tới**. Các khoá khác của `spec_json` đi qua nguyên vẹn. */
const shufflableSchema = z.object({
  cards: z.array(z.record(z.string(), z.unknown())),
  card_sources: z.array(z.record(z.string(), z.unknown())).optional(),
});

/** Khoá sắp xếp của một thẻ: chuỗi JSON của chính nó. Hai thẻ giống hệt nhau ⇒ khoá bằng nhau. */
function sortKey(card: Record<string, unknown>): string {
  return JSON.stringify(card);
}

/**
 * Sắp thẻ về **một** thứ tự tất định, không phụ thuộc thứ tự Postgres trả về.
 *
 * `card_sources` được sắp theo cùng nguyên tắc chứ không bám theo thứ tự thẻ: nó là danh sách
 * riêng, và bám theo thẻ thì thẻ trùng tiêu đề sẽ cho hai kết quả khác nhau.
 */
export function canonicalise(
  specJson: Record<string, unknown>,
): Record<string, unknown> {
  const parsed = shufflableSchema.safeParse(specJson);
  // Không có `cards` thì không có gì để chuẩn hoá — trả nguyên vẹn thay vì ném lỗi, vì digest vẫn
  // phải tính được cho một spec rỗng.
  if (!parsed.success) return specJson;

  const out: Record<string, unknown> = {
    ...specJson,
    cards: [...parsed.data.cards].sort((a, b) =>
      sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0,
    ),
  };
  if (parsed.data.card_sources) {
    out.card_sources = [...parsed.data.card_sources].sort((a, b) =>
      sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0,
    );
  }
  return out;
}

/**
 * Digest **của bản gốc, không chuẩn hoá** — đúng bằng cách tính hiện tại.
 *
 * Giữ lại nguyên si để khi cờ `judge_debias` **tắt** thì `input_digest` không đổi **một byte** so
 * với mọi vòng judge đã chạy trước đây. Tiêu chí hoàn thành của #43 đòi đúng điều đó, và nó là
 * cách duy nhất chứng minh tính năng mới không âm thầm đổi dữ liệu cũ.
 */
export function legacyDigest(
  specJson: Record<string, unknown>,
  sourcesJson: unknown,
): string {
  return createHash('sha256')
    .update(JSON.stringify({ spec_json: specJson, sources_json: sourcesJson }))
    .digest('hex');
}

/**
 * Digest của **dạng chuẩn hoá thứ tự**. Năm judge thấy năm thứ tự khác nhau nhưng cùng con số này.
 *
 * `sources_json` **không** chuẩn hoá: nó do `SourceService` dựng, luôn cùng thứ tự trong một lượt
 * chạy, và không nằm trong phạm vi xáo của #43. Chuẩn hoá nó ở đây là mở rộng phạm vi âm thầm.
 */
export function canonicalDigest(
  specJson: Record<string, unknown>,
  sourcesJson: unknown,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        spec_json: canonicalise(specJson),
        sources_json: sourcesJson,
      }),
    )
    .digest('hex');
}

/**
 * Seed của một judge — **suy ra được**, không phải ngẫu nhiên rồi lưu lại.
 *
 * Đây là chỗ khiến `shuffle_seed` là *bằng chứng* chứ chỉ là *một con số trong DB*: bất kỳ ai có
 * `(digest, judgeKey, round)` cũng tính lại được và đối chiếu với giá trị đã lưu. Nếu seed sinh
 * ngẫu nhiên thì không có cách nào biết nó có bị chọn cho có lợi hay không.
 *
 * Có `round` trong khoá để hai vòng trên cùng một spec không lặp lại đúng thứ tự — nếu lặp thì
 * "chạy lại vòng hai" không còn là một phép thử độc lập về lệch vị trí.
 */
export function seedFor(
  digest: string,
  judgeKey: string,
  round: number,
): string {
  return createHash('sha256')
    .update(`${digest}:${judgeKey}:${round}`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Thứ tự mà một judge thật sự thấy: xáo **dạng chuẩn hoá** bằng seed đã cho.
 *
 * Xáo từ dạng chuẩn hoá chứ không từ thứ tự DB là điều kiện để dựng lại được — nếu xáo từ thứ tự
 * DB thì muốn tái tạo phải biết cả thứ tự DB lúc đó, mà thứ tự đó không được ghi ở đâu cả.
 */
export function shuffleForJudge(
  specJson: Record<string, unknown>,
  seed: string,
): Record<string, unknown> {
  const canonical = canonicalise(specJson);
  const parsed = shufflableSchema.safeParse(canonical);
  if (!parsed.success) return canonical;

  const rnd = mulberry32(seedFrom(seed));
  const out: Record<string, unknown> = {
    ...canonical,
    cards: shuffle(parsed.data.cards, rnd),
  };
  // `card_sources` xáo bằng **cùng** dòng PRNG, sau `cards` — nên thứ tự của nó cũng tất định.
  // Không xáo nó thì danh sách nguồn giữ nguyên một thứ tự cho cả 5 judge, và lệch vị trí chỉ bị
  // triệt một nửa.
  if (parsed.data.card_sources) {
    out.card_sources = shuffle(parsed.data.card_sources, rnd);
  }
  return out;
}
