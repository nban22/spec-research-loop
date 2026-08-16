/* eslint-disable @typescript-eslint/no-implied-eval */
/**
 * `import()` **thật**, không bị TypeScript hạ cấp thành `require()`.
 *
 * Cần vì hai phụ thuộc nạp lười của hệ thống — `@xenova/transformers` (ESM-only) và `puppeteer`
 * (nặng, chỉ nạp khi thật sự xuất PDF) — phải nạp được từ một bundle CommonJS.
 * Đóng gói ở đúng một chỗ để chỉ có **một** dòng tắt lint trong toàn repo, và để phía gọi
 * khai kiểu tường minh thay vì làm việc với `any`.
 */
const importer = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<unknown>;

export async function dynamicImport<T>(specifier: string): Promise<T> {
  return (await importer(specifier)) as T;
}
