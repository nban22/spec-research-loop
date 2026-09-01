import { Module } from '@nestjs/common';
import { CardLinkController } from './card-link.controller';
import { CardLinkService } from './card-link.service';

/**
 * Module cho ba lệnh ghi của bản đồ claim–evidence (#15).
 *
 * Tách riêng thay vì nhét vào `SpecModule` hay `SourcesModule` để phần vượt ranh giới sở hữu của
 * làn C gọn lại còn ba file mới cộng một dòng ở `app.module.ts` — xem chú thích đầu
 * `card-link.service.ts`.
 */
@Module({
  controllers: [CardLinkController],
  providers: [CardLinkService],
})
export class CardLinkModule {}
