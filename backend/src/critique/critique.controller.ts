import { Controller, Get, Param, Post } from '@nestjs/common';
import { UserId } from '../common/http.decorators';
import { SpecService } from '../spec/spec.service';
import { CritiqueService } from './critique.service';

/**
 * Route của B6. Đặt trong `src/critique/**` — ranh giới sở hữu của làn B (#22) cho phép module
 * `critique/` mới, và `spec.controller.ts` là chỗ ba làn dễ đụng nhau nhất.
 */
@Controller()
export class CritiqueController {
  constructor(
    private readonly critique: CritiqueService,
    private readonly spec: SpecService,
  ) {}

  /** Quét lại toàn bộ thẻ của version. Đồng bộ — tầng luật 0 token nên trả về tức thì. */
  @Post('spec-versions/:id/ambiguity')
  async scan(@Param('id') id: string, @UserId() userId: string) {
    await this.spec.assertVersionOwned(id, userId);
    return this.critique.scanVersion(id);
  }

  @Get('spec-versions/:id/ambiguity')
  async list(@Param('id') id: string, @UserId() userId: string) {
    await this.spec.assertVersionOwned(id, userId);
    return { flags: await this.critique.listForVersion(id) };
  }
}
