import { Controller, Get, Param } from '@nestjs/common';
import { UserId } from '../common/http.decorators';
import { SourceMapService } from './source-map.service';

/**
 * Chỉ `GET`, cùng lý do với `AnalyticsController`: ràng buộc "không ghi gì" của làn C kiểm được
 * bằng cách đọc một file, không phải bằng cách đọc cả module.
 */
@Controller('projects')
export class SourceMapController {
  constructor(private readonly sourceMap: SourceMapService) {}

  @Get(':id/source-map')
  async map(@Param('id') id: string, @UserId() userId: string) {
    return this.sourceMap.sourceMap(id, userId);
  }
}
