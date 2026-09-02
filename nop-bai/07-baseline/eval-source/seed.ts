/**
 * Tạo tài khoản hệ thống `eval@local` (STACK §7).
 * Script eval chạy **in-process**, không qua HTTP và không cần đăng nhập — nhưng vẫn truyền
 * `user_id` của tài khoản này để dữ liệu đi đúng một đường ghi (STACK §11.3 luật 5).
 */
import { boot, ensureEvalUser, log } from './harness';

async function main() {
  const s = await boot();
  const userId = await ensureEvalUser(s.prisma);
  log(`Tài khoản hệ thống eval@local sẵn sàng: ${userId}`);
  await s.app.close();
}

void main();
