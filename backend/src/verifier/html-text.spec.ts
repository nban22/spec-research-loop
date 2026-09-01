import { htmlToText, MIN_FULLTEXT_CHARS, toPassages } from './html-text';

/** Câu dài hơn ngưỡng bỏ-dòng-ngắn, để test đo đúng thứ nó định đo. */
const LONG = (n: number) =>
  `This is body sentence number ${n} and it is deliberately long enough to survive the short line filter.`;

describe('bóc chữ khỏi HTML', () => {
  it('bỏ nguyên nội dung script, style và math', () => {
    const html = `<p>${LONG(1)}</p><script>var evil = 1;</script><style>.a{color:red}</style><math><mi>x</mi><mi>y</mi></math>`;
    const out = htmlToText(html);
    expect(out).toContain('body sentence number 1');
    expect(out).not.toContain('evil');
    expect(out).not.toContain('color:red');
    expect(out).not.toContain('mi');
  });

  it('cắt bỏ toàn bộ phần tài liệu tham khảo', () => {
    const html = `<p>${LONG(1)}</p><h2 id="bib">References</h2><p>${LONG(99)}</p>`;
    const out = htmlToText(html);
    expect(out).toContain('number 1');
    expect(out).not.toContain('number 99');
  });

  it('giải mã entity, cả tên lẫn số', () => {
    const html = `<p>Latency &lt; 10ms &amp; throughput &#62; 1000 qps, which is a properly long line.</p>`;
    const out = htmlToText(html);
    expect(out).toContain('<');
    expect(out).toContain('&');
    expect(out).toContain('>');
  });

  it('bỏ dòng ngắn — nav, số mục và caption biến mất mà không cần DOM', () => {
    const html = `<nav><a>Home</a></nav><h2>3.1</h2><p>${LONG(1)}</p><div>Fig. 2</div>`;
    const out = htmlToText(html).split('\n');
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('body sentence number 1');
  });

  it('cắt ở đúng giới hạn ký tự', () => {
    const html = Array.from(
      { length: 200 },
      (_, i) => `<p>${LONG(i)}</p>`,
    ).join('');
    expect(htmlToText(html, 500)).toHaveLength(500);
  });

  it('ngưỡng "đủ dài" đủ chặt để loại trang landing', () => {
    expect(htmlToText('<p>Short landing page.</p>').length).toBeLessThan(
      MIN_FULLTEXT_CHARS,
    );
  });
});

describe('cắt toàn văn thành đoạn', () => {
  const text = Array.from({ length: 9 }, (_, i) => `${LONG(i)}`).join(' ');

  it('gộp 3 câu một đoạn và chồng lấn 1 câu', () => {
    const p = toPassages(text, { sentencesPerPassage: 3, overlap: 1 });
    expect(p[0].text).toContain('number 0');
    expect(p[0].text).toContain('number 2');
    // Chồng lấn: câu cuối của đoạn trước là câu đầu của đoạn sau.
    expect(p[1].text).toContain('number 2');
  });

  it('charStart tăng dần để mở lại đúng chỗ trong toàn văn', () => {
    const p = toPassages(text);
    const starts = p.map((x) => x.charStart);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(starts[0]).toBe(0);
  });

  it('tôn trọng trần số đoạn — đây là chỗ chốt chi phí CPU', () => {
    const many = Array.from({ length: 400 }, (_, i) => LONG(i)).join(' ');
    expect(toPassages(many, { max: 12 })).toHaveLength(12);
  });

  it('văn bản rỗng trả mảng rỗng chứ không ném lỗi', () => {
    expect(toPassages('')).toEqual([]);
  });
});
