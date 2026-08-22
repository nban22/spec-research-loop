import { markdownToHtml, wrapDocument } from './markdown-html';

describe('markdownToHtml & wrapDocument', () => {
  it('converts headers, bold, code, blockquotes, bullets, and tables to HTML', () => {
    const md = `
# Title
> Quote text
---
- Bullet item 1
  - Sub bullet item
**Bold** and \`code\`

| Col A | Col B |
| --- | --- |
| Val A | Val B |
`;

    const html = markdownToHtml(md);
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<blockquote>Quote text</blockquote>');
    expect(html).toContain('<hr />');
    expect(html).toContain('<li>Bullet item 1</li>');
    expect(html).toContain('<strong>Bold</strong>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<table><thead><tr>');
    expect(html).toContain('<th>Col A</th><th>Col B</th>');
    expect(html).toContain('<td>Val A</td>');
  });

  it('wraps HTML body in full document template with title', () => {
    const doc = wrapDocument('Test Spec', '<h1>Hello</h1>');
    expect(doc).toContain('<!doctype html>');
    expect(doc).toContain('<title>Test Spec</title>');
    expect(doc).toContain('<body><h1>Hello</h1></body>');
  });
});
