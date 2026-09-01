import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Chốt chống LỆCH HỢP ĐỒNG giữa hai package.
 *
 * `KappaReason` ở frontend là **bản chép tay** kiểu của backend — không có type dùng chung, nên
 * TypeScript không thể biết hai bên đã lệch. Loại lỗi này đã cắn **ba lần** trong cùng tính năng:
 *
 * 1. `degenerate` đổi tên ở backend, frontend vẫn so tên cũ ⇒ phần giải thích κ suy biến không bao
 *    giờ hiện trên sản phẩm.
 * 2. `MIN_UNION` khai lại bằng tay ở frontend, không gì bắt buộc hai số khớp nhau.
 * 3. `MALFORMED_COUNTS` bị bỏ sót ⇒ lỗi dữ liệu hiện thành "Chưa có thẻ nào để đo".
 *
 * Test này đọc thẳng mã nguồn backend. Hơi thô, nhưng nó là thứ **rẻ nhất** phát hiện được lệch:
 * cách chữa gốc là gói type dùng chung, và việc đó nằm ngoài phạm vi #9.
 */
function unionFrom(source: string, typeName: string): string[] {
  const m = new RegExp(`export type ${typeName} =([\\s\\S]*?);`).exec(source);
  if (!m) throw new Error(`không tìm thấy type ${typeName}`);
  return [...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]).sort();
}

describe('hợp đồng KappaReason giữa backend và frontend', () => {
  it('hai bên khai ĐÚNG cùng một tập lý do', () => {
    const be = readFileSync(
      join(__dirname, '../../../backend/src/judge/agreement/agreement.ts'),
      'utf8',
    );
    const fe = readFileSync(join(__dirname, 'use-judge-agreement.ts'), 'utf8');

    const backend = unionFrom(be, 'KappaReason');
    const frontend = unionFrom(fe, 'KappaReason');

    expect(backend.length).toBeGreaterThan(0);
    // Thông báo lỗi nêu đích danh giá trị lệch, để lần sau sửa được ngay mà không phải dò.
    expect(frontend, `backend có: ${backend.join(', ')}`).toEqual(backend);
  });
});
