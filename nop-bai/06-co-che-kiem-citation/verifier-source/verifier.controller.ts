import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { UserId } from '../common/http.decorators';
import { ZodBody } from '../common/zod-body.pipe';
import { supportLabelSchema } from '../contracts/enums';
import { SpecService } from '../spec/spec.service';
import { EvidenceService } from './evidence.service';
import { HumanCheckService } from './human-check.service';

const humanCheckSchema = z.object({
  human_label: supportLabelSchema,
  note: z.string().max(500).nullish(),
});

/**
 * Route đọc của #5 và route gán nhãn của #4.
 *
 * Đặt ở `src/verifier/**` — ranh giới sở hữu của làn A — thay vì thêm dòng vào
 * `spec.controller.ts`, file mà ba làn đều đụng tới.
 */
@Controller()
export class VerifierController {
  constructor(
    private readonly evidence: EvidenceService,
    private readonly humanCheck: HumanCheckService,
    private readonly spec: SpecService,
  ) {}

  /** #5 · toàn bộ đường đi 5 tầng của từng cặp, kèm ngưỡng của chính lần chạy đó. */
  @Get('spec-versions/:id/evidence-trace')
  async trace(@Param('id') id: string, @UserId() userId: string) {
    await this.spec.assertVersionOwned(id, userId);
    return this.evidence.trace(id);
  }

  /** #4 · hàng đợi chấm **mù** — response cố ý không chứa nhãn máy. */
  @Get('spec-versions/:id/label-queue')
  async labelQueue(@Param('id') id: string, @UserId() userId: string) {
    await this.spec.assertVersionOwned(id, userId);
    return this.humanCheck.queue(id);
  }

  @Post('card-sources/:id/human-check')
  async record(
    @Param('id') id: string,
    @Body(new ZodBody(humanCheckSchema))
    body: z.infer<typeof humanCheckSchema>,
    @UserId() userId: string,
  ) {
    // Không có `assertCardSourceOwned` ở `SpecService`; service tự lọc theo `userId`, đúng
    // khuôn `decision.controller.ts` đang dùng cho chính bảng này.
    return this.humanCheck.record(
      id,
      userId,
      body.human_label,
      body.note ?? null,
    );
  }
}
