import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { AppError } from '../../common/app-error';
import { UserId } from '../../common/http.decorators';
import { PrismaService } from '../../common/prisma.service';
import { ZodBody } from '../../common/zod-body.pipe';
import { overclaimExitSchema } from '../../contracts/llm-io/overclaim';
import { SpecService } from '../../spec/spec.service';
import { OVERCLAIM_OPTIONS, OverclaimService } from './overclaim.service';

const chooseExitSchema = z.object({
  exit: overclaimExitSchema,
  custom_text: z.string().max(2000).optional(),
});
type ChooseExitInput = z.infer<typeof chooseExitSchema>;

/**
 * Route của B1 nằm trong `src/judge/**` chứ không gộp vào `SpecController`: ranh giới sở hữu
 * của làn B (#22) không bao gồm `src/spec/**`, và `spec.controller.ts` là chỗ ba làn dễ đụng
 * nhau nhất. Nest gom route theo `@Controller()` rỗng nên đường dẫn vẫn liền mạch với phần còn lại.
 */
@Controller()
export class OverclaimController {
  constructor(
    private readonly overclaim: OverclaimService,
    private readonly spec: SpecService,
    private readonly prisma: PrismaService,
  ) {}

  /** Quét lại toàn bộ claim của version. Chạy đồng bộ: tầng luật tức thời, tầng LLM chỉ chạm vùng xám. */
  @Post('spec-versions/:id/overclaim')
  async scan(@Param('id') id: string, @UserId() userId: string) {
    await this.spec.assertVersionOwned(id, userId);
    return this.overclaim.scanVersion(id);
  }

  @Get('spec-versions/:id/overclaim')
  async list(@Param('id') id: string, @UserId() userId: string) {
    await this.spec.assertVersionOwned(id, userId);
    return {
      flags: await this.overclaim.listForVersion(id),
      options: OVERCLAIM_OPTIONS,
    };
  }

  /** Ba đường ra của Bước 10. Lựa chọn được ghi thành `Decision`. */
  @Post('overclaim-flags/:flagId/exit')
  async chooseExit(
    @Param('flagId') flagId: string,
    @Body(new ZodBody(chooseExitSchema)) body: ChooseExitInput,
    @UserId() userId: string,
  ) {
    const flag = await this.prisma.overclaimFlag.findUnique({
      where: { id: flagId },
      select: { spec_version_id: true },
    });
    // Cờ của user khác → 404, không phải 403 (backend/CLAUDE.md §4).
    if (!flag) {
      throw AppError.notFound('That overclaim flag was not found.');
    }
    await this.spec.assertVersionOwned(flag.spec_version_id, userId);
    return this.overclaim.chooseExit(flagId, body.exit, body.custom_text);
  }
}
