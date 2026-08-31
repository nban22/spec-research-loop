import { Controller, Get, Param } from '@nestjs/common';
import { UserId } from '../common/http.decorators';
import { SpecService } from '../spec/spec.service';
import { ConflictService } from './conflict.service';

/**
 * Route đọc của #3. Đặt trong `src/conflict/**` — module riêng của làn A, không đụng
 * `spec.controller.ts` là file ba làn dễ va nhau nhất.
 *
 * Không có route ghi: người dùng xử lý xung đột bằng đúng bốn đường ra `GATE_OPTIONS` đã có ở
 * `POST /card-sources/:id/gate-decision`, nên không cần thêm một đường quyết định thứ hai.
 */
@Controller()
export class ConflictController {
  constructor(
    private readonly conflict: ConflictService,
    private readonly spec: SpecService,
  ) {}

  @Get('spec-versions/:id/conflicts')
  async list(@Param('id') id: string, @UserId() userId: string) {
    await this.spec.assertVersionOwned(id, userId);
    return { conflicts: await this.conflict.listForVersion(id) };
  }
}
