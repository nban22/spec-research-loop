import { Prisma } from '../generated/prisma/client';

/**
 * Prisma không nhận `null` cho cột `Json?` — phải dùng `Prisma.DbNull` (ghi NULL của SQL).
 * Gói lại một chỗ để không rải `as` khắp service (backend/CLAUDE.md §3: không ép kiểu bừa).
 */
export function jsonOrDbNull(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value === null || value === undefined) return Prisma.DbNull;
  return value;
}

/** Cột `Json` NOT NULL — chỉ cần ép kiểu, không có nhánh null. */
export function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
