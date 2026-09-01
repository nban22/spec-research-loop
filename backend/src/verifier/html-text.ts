import { splitSentences } from '../common/text';

/**
 * Bóc chữ khỏi HTML và cắt thành đoạn — **hàm thuần, 0 dependency**.
 *
 * Không cài `cheerio`/`jsdom`: STACK §8 cấm thêm dependency khi tự viết được, và ở đây ta không
 * cần một cây DOM đúng đắn — chỉ cần đủ chữ liền mạch để embedding và LLM đọc. Trang arXiv/ar5iv
 * là HTML do LaTeXML sinh, cấu trúc rất đều, nên regex đủ dùng.
 */

/** ≈10k từ ≈ một bài 8 trang sau khi đã bỏ tài liệu tham khảo. */
export const MAX_FULLTEXT_CHARS = 60_000;

/** Dưới mức này thì trang tải về là trang lỗi/landing, không phải toàn văn. */
export const MIN_FULLTEXT_CHARS = 4_000;

/**
 * Dòng ngắn hơn ngần này gần như chắc chắn là nav, số mục, caption, tên tác giả hay affiliation.
 * Đây là mẹo thay cho DOM: bỏ dòng ngắn giết được phần lớn rác mà không cần biết thẻ nào là gì.
 */
const MIN_LINE_CHARS = 40;

/** Mốc bắt đầu phần tài liệu tham khảo — chiếm 30–50% ký tự và hoàn toàn nhiễu với entailment. */
const BIBLIOGRAPHY_MARKERS: RegExp[] = [
  /<(?:h2|section)[^>]*(?:id="bib|class="[^"]*ltx_bibliography)/i,
  /<h2[^>]*>(?:<[^>]*>|\s)*references\b/i,
  /<h2[^>]*>(?:<[^>]*>|\s)*bibliography\b/i,
];

/**
 * Khối bị bỏ **nguyên cả nội dung**, không chỉ bỏ thẻ.
 * `math` là cái quan trọng nhất: MathML là một rừng thẻ mà text bên trong chỉ là từng chữ cái rời,
 * để lại thì mỗi công thức biến thành một chuỗi ký tự vô nghĩa dài hơn cả đoạn văn quanh nó.
 */
const DROP_BLOCKS =
  /<(script|style|noscript|svg|math|table|figure|nav|header|footer|form|select)\b[^>]*>[\s\S]*?<\/\1>/gi;

const BLOCK_END = /<\/(p|div|h[1-6]|li|blockquote|section)>/gi;
const LINE_BREAK = /<br\s*\/?>/gi;

const NAMED_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&mdash;': '—',
  '&ndash;': '–',
};

function cutBibliography(html: string): string {
  let cut = html.length;
  for (const marker of BIBLIOGRAPHY_MARKERS) {
    const m = marker.exec(html);
    if (m && m.index < cut) cut = m.index;
  }
  return html.slice(0, cut);
}

function decodeEntities(text: string): string {
  let out = text;
  for (const [entity, char] of Object.entries(NAMED_ENTITIES)) {
    out = out.split(entity).join(char);
  }
  return out.replace(/&#(\d+);/g, (_, code: string) => {
    const n = Number(code);
    return Number.isFinite(n) && n > 0 && n < 0x110000
      ? String.fromCodePoint(n)
      : '';
  });
}

export function htmlToText(
  html: string,
  maxChars: number = MAX_FULLTEXT_CHARS,
): string {
  let s = cutBibliography(html);
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  // Chạy hai lượt: LaTeXML thỉnh thoảng lồng `figure` trong `figure`, một lượt bỏ sót lớp ngoài.
  s = s.replace(DROP_BLOCKS, ' ').replace(DROP_BLOCKS, ' ');
  s = s.replace(BLOCK_END, '\n').replace(LINE_BREAK, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);

  const lines = s
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= MIN_LINE_CHARS);

  return lines.join('\n').slice(0, maxChars);
}

export type Passage = {
  text: string;
  /** Vị trí trong văn bản **đã bóc thẻ** — để mở lại đúng chỗ ở trang "vì sao nhãn này". */
  charStart: number;
};

export type ToPassagesOptions = {
  sentencesPerPassage?: number;
  overlap?: number;
  max?: number;
};

/**
 * Ba câu một đoạn, chồng lấn một câu.
 *
 * - **3 câu** ≈ 350–450 ký tự: vừa cửa sổ 256 token của MiniLM, và đủ dài để một con số còn mang
 *   theo tên metric ở câu bên cạnh — thứ mà tầng L2 cần để đối chiếu.
 * - **chồng lấn 1 câu** để một khẳng định nằm vắt qua ranh giới không bị cắt đôi.
 * - **tối đa 150 đoạn** chốt chi phí ở ~13 batch embedder mỗi nguồn. Đây là toàn bộ câu chuyện
 *   chi phí của #2: token LLM không đổi, chỉ CPU tăng.
 */
export function toPassages(
  text: string,
  opts: ToPassagesOptions = {},
): Passage[] {
  const size = Math.max(1, opts.sentencesPerPassage ?? 3);
  const overlap = Math.min(Math.max(0, opts.overlap ?? 1), size - 1);
  const max = Math.max(1, opts.max ?? 150);

  const sentences = splitSentences(text);
  if (sentences.length === 0) return [];

  const passages: Passage[] = [];
  const step = size - overlap;
  let cursor = 0;

  for (let i = 0; i < sentences.length && passages.length < max; i += step) {
    const slice = sentences.slice(i, i + size);
    if (slice.length === 0) break;
    const body = slice.join(' ');
    // `indexOf` từ `cursor` trở đi ⇒ `charStart` luôn tăng, kể cả khi một câu lặp lại trong bài.
    const at = text.indexOf(slice[0], cursor);
    const charStart = at >= 0 ? at : cursor;
    cursor = charStart + 1;
    passages.push({ text: body, charStart });
    if (i + size >= sentences.length) break;
  }
  return passages;
}
