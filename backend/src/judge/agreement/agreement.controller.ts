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
    // `null` khi chưa chạy judge vòng nào — giao diện tự hiện trạng thái rỗng.
    return { agreement: await this.agreement.forLatestRound(id) };
  }

  /** Tính lại vòng mới nhất — dùng cho vòng đã chạy trước khi có tính năng này. */
  @Post('spec-versions/:id/judge-agreement')
  async recompute(@Param('id') id: string, @UserId() userId: string) {
    await this.spec.assertVersionOwned(id, userId);
    return { agreement: await this.agreement.forLatestRound(id) };
  }
}
