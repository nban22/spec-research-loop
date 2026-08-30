import { Controller, Get, Param } from '@nestjs/common';
import { UserId } from '../common/http.decorators';
import { AnalyticsService } from './analytics.service';

/**
 * Chỉ `GET`. Module này không có một endpoint ghi nào — đó là ràng buộc của issue #17,
 * và giữ nó ở tầng controller làm việc kiểm tra thành chuyện đọc một file.
 */
@Controller('projects')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get(':id/cost')
  async cost(@Param('id') id: string, @UserId() userId: string) {
    return this.analytics.costOverview(id, userId);
  }
}
