import { Controller, Get, Param, Post } from '@nestjs/common';
import { UserId } from '../../common/http.decorators';
import { SpecService } from '../../spec/spec.service';
import { AgreementService } from './agreement.service';

/**
 * Route của B3. Đặt trong `src/judge/**` với `@Controller()` rỗng — cùng lý do
 * `overclaim.controller.ts`: `spec.controller.ts` là chỗ ba làn dễ va nhau nhất, mà đường dẫn
 * vẫn phẳng như các route khác.
 *
 * **Chỉ đọc, 0 lời gọi LLM.** `POST` ở đây không sinh nội dung, nó chỉ buộc tính lại.
 */
@Controller()
export class AgreementController {
  constructor(
    private readonly agreement: AgreementService,
    private readonly spec: SpecService,
  ) {}

  @Get('spec-versions/:id/judge-agreement')
  async latest(@Param('id') id: string, @UserId() userId: string) {
    await this.spec.assertVersionOwned(id, userId);
    // `agreement` là `null` khi chưa chạy judge vòng nào. Không có cờ bật/tắt — xem lý do ở
    // `AgreementService.forDisplay`.
    return this.agreement.forDisplay(id);
  }

  /**
   * **Tính lại và ghi đè** vòng mới nhất.
   *
   * Bản trước gọi `forLatestRound`, mà hàm đó trả bản đã lưu nếu có — nên `POST` không tính lại
   * gì, và `recompute()` không với tới được từ HTTP. Hệ quả: **không có đường sửa** cho một bản
   * ghi đã lỗi thời, mà lỗi thời là chuyện chắc chắn xảy ra — `POST /projects/:id/analyze` xoá
   * sạch thẻ, `Issue.target_card_id` bị `ON DELETE SET NULL`, và số đo cũ thành sai vĩnh viễn.
   */
  @Post('spec-versions/:id/judge-agreement')
  async recompute(@Param('id') id: string, @UserId() userId: string) {
    await this.spec.assertVersionOwned(id, userId);
    return { agreement: await this.agreement.recomputeLatest(id) };
  }
}
