import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { z } from 'zod';
import { UserId } from '../common/http.decorators';
import { ZodBody } from '../common/zod-body.pipe';
import { PrismaService } from '../common/prisma.service';
import { ProjectService } from '../project/project.service';

const debiasBodySchema = z.object({ enabled: z.boolean() });

/**
 * B2a · #43 — bật/tắt cờ khử lệch `Project.judge_debias`.
 *
 * ## Vì sao endpoint này phải tồn tại
 *
 * Bản đầu của #43 nối `judge_debias` vào `runRound` nhưng **không có đường nào ghi cờ**:
 * `patchProjectSchema` là `.strict()` và chỉ nhận `title`/`raw_idea`/`step`
 * (`project/project.service.ts`), nên `PATCH /projects/:id { judge_debias: true }` bị **reject**;
 * không UI nào, không seed script nào đặt nó. Hệ quả: **phép xáo thứ tự thẻ chưa bao giờ chạy** —
 * code có, test có, đường bật thì không.
 *
 * Đây đúng là loại lỗi mà review PR #32 đã bắt ở #9, chỉ soi ngược: lần đó cờ **được ghi mà không
 * ai đọc**, lần này cờ **được đọc mà không ai ghi được**. Cả hai đều làm tính năng thành vô hình,
 * và cả hai đều không có test nào phát hiện — vì test mock Prisma thì cờ nào cũng "đọc được".
 *
 * ## Vì sao đặt ở `judge/**` chứ không sửa `project.service.ts`
 *
 * Phạm vi sở hữu của #43 là `backend/src/judge/**` + hai cột. `project/**` thuộc phần dùng chung,
 * và mở `patchProjectSchema` cho cờ này thì mở luôn cho mọi cờ của ba làn — một quyết định vượt
 * quá một issue. Đặt route ở đây giữ đúng ranh giới, theo tiền lệ `overclaim.controller.ts` và
 * `agreement.controller.ts` (`@Controller()` rỗng, đường dẫn vẫn phẳng).
 *
 * ## Ghi chú cho #13 (ablation)
 *
 * `eval/harness.ts` đặt cờ **thẳng bằng Prisma** lúc tạo project (khuôn
 * `verifier_gate: arm === 'SYS'`), không đi qua HTTP — nên endpoint này là để **người** bật, còn
 * ablation thì không cần nó.
 */
@Controller()
export class DebiasController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly project: ProjectService,
  ) {}

  @Get('projects/:id/judge-debias')
  async read(@Param('id') id: string, @UserId() userId: string) {
    await this.project.assertOwned(id, userId);
    const row = await this.prisma.project.findUniqueOrThrow({
      where: { id },
      select: { judge_debias: true },
    });
    return { enabled: row.judge_debias };
  }

  /**
   * Đổi cờ. **Không** chạy lại vòng judge nào: cờ chỉ ảnh hưởng các vòng chạy **sau** đó, vì
   * `input_digest` và `shuffle_seed` đã chốt cùng lúc với `JudgeRun`. Bật cờ rồi mong số cũ đổi
   * theo là hiểu sai — và đó là hành vi đúng, vì số đo phải cố định (NFR-JDG-6).
   */
  @Patch('projects/:id/judge-debias')
  async set(
    @Param('id') id: string,
    @Body(new ZodBody(debiasBodySchema))
    body: z.infer<typeof debiasBodySchema>,
    @UserId() userId: string,
  ) {
    await this.project.assertOwned(id, userId);
    const row = await this.prisma.project.update({
      where: { id },
      data: { judge_debias: body.enabled },
      select: { judge_debias: true },
    });
    return { enabled: row.judge_debias };
  }
}
