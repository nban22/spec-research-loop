import { Body, Controller, Delete, Param, Post } from '@nestjs/common';
import { UserId } from '../common/http.decorators';
import { ZodBody } from '../common/zod-body.pipe';
import {
  CardLinkService,
  linkSourceSchema,
  type LinkSourceInput,
} from './card-link.service';

/**
 * Ba lệnh ghi cho bản đồ claim–evidence (#15).
 *
 * Controller **mỏng** đúng theo backend/CLAUDE.md §2: parse input → gọi service → trả DTO, không
 * một câu Prisma nào. `PATCH /cards/:id` đang có làm khác (truy vấn thẳng trong controller);
 * không bắt chước chỗ đó, và cũng không sửa nó — nó thuộc làn khác.
 *
 * `userId` **chỉ** đến từ `@UserId()`, tức `req.user.sub`. Không đọc chủ sở hữu từ body hay
 * param dưới bất kỳ hình thức nào (§5).
 */
@Controller()
export class CardLinkController {
  constructor(private readonly cardLink: CardLinkService) {}

  @Post('cards/:id/sources')
  async link(
    @Param('id') id: string,
    @UserId() userId: string,
    @Body(new ZodBody(linkSourceSchema)) body: LinkSourceInput,
  ) {
    return { card_source: await this.cardLink.linkSource(id, userId, body) };
  }

  @Delete('card-sources/:id')
  async unlink(@Param('id') id: string, @UserId() userId: string) {
    return this.cardLink.unlinkSource(id, userId);
  }

  @Delete('cards/:id')
  async remove(@Param('id') id: string, @UserId() userId: string) {
    return this.cardLink.deleteCard(id, userId);
  }
}
