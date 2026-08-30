import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

/**
 * Module **chỉ đọc** của làn C. Không `@Global()`: không service nào khác cần nó, và để nó
 * toàn cục là mời gọi người khác nối vào rồi vô tình ghi qua đây.
 */
@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
