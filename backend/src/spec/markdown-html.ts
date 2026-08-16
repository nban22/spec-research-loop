/**
 * Markdown → HTML tối giản, đủ cho **đúng** tập cú pháp mà `SpecService.buildMarkdown` sinh ra:
 * heading, bullet lồng một cấp, bảng, `**đậm**`, `_nghiêng_`, `` `code` ``, `---`.
 *
 * Cố ý không thêm dependency: STACK §8 yêu cầu hỏi trước khi cài gì ngoài danh sách, và một
 * renderer 80 dòng cho một tập cú pháp do chính ta sinh ra thì rẻ hơn một thư viện markdown đầy đủ.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inline(s: string): string {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|\s)_([^_]+)_/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

export function markdownToHtml(md: string): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let listDepth = 0;
  let inTable = false;

  const closeLists = () => {
    while (listDepth > 0) {
      out.push('</ul>');
      listDepth--;
    }
  };
  const closeTable = () => {
    if (inTable) {
      out.push('</tbody></table>');
      inTable = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      closeLists();
      closeTable();
      continue;
    }

    if (/^\|.*\|$/.test(trimmed)) {
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());
      const isSeparator = cells.every((c) => /^:?-{2,}:?$/.test(c));
      if (isSeparator) continue;
      if (!inTable) {
        closeLists();
        out.push('<table><thead><tr>');
        out.push(cells.map((c) => `<th>${inline(c)}</th>`).join(''));
        out.push('</tr></thead><tbody>');
        inTable = true;
        continue;
      }
      out.push(
        `<tr>${cells.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`,
      );
      continue;
    }
    closeTable();

    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      closeLists();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      closeLists();
      out.push('<hr />');
      continue;
    }

    const bullet = /^(\s*)[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      const depth = bullet[1].length >= 2 ? 2 : 1;
      while (listDepth < depth) {
        out.push('<ul>');
        listDepth++;
      }
      while (listDepth > depth) {
        out.push('</ul>');
        listDepth--;
      }
      out.push(`<li>${inline(bullet[2])}</li>`);
      continue;
    }

    if (trimmed.startsWith('>')) {
      closeLists();
      out.push(
        `<blockquote>${inline(trimmed.replace(/^>\s?/, ''))}</blockquote>`,
      );
      continue;
    }

    closeLists();
    out.push(`<p>${inline(trimmed)}</p>`);
  }

  closeLists();
  closeTable();
  return out.join('\n');
}

export function wrapDocument(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 20mm 18mm; }
  body { font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif; font-size: 10.5pt;
         line-height: 1.55; color: #1e293b; }
  h1 { font-size: 20pt; margin: 0 0 4pt; color: #0f172a; }
  h2 { font-size: 13pt; margin: 18pt 0 6pt; padding-bottom: 3pt;
       border-bottom: 1px solid #cbd5e1; color: #0f172a; }
  h3 { font-size: 11.5pt; margin: 12pt 0 4pt; }
  p { margin: 4pt 0; }
  ul { margin: 4pt 0 4pt 16pt; padding: 0; }
  li { margin: 2pt 0; }
  blockquote { margin: 6pt 0; padding-left: 10pt; border-left: 2px solid #94a3b8; color: #475569; }
  table { border-collapse: collapse; width: 100%; margin: 6pt 0; font-size: 9pt; }
  th, td { border: 1px solid #cbd5e1; padding: 4pt 6pt; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; }
  code { font-family: Consolas, "Courier New", monospace; font-size: 9pt;
         background: #f1f5f9; padding: 1pt 3pt; border-radius: 3px; }
  hr { border: none; border-top: 1px solid #cbd5e1; margin: 10pt 0; }
</style></head>
<body>${bodyHtml}</body></html>`;
}
