import { Controller, Get, Param } from '@nestjs/common';
import { UserId } from '../common/http.decorators';
import { ErrorAnalysisService } from './error-analysis.service';

/** Chỉ `GET` — `analytics/` không có endpoint ghi nào, kiểm được bằng cách đọc một file. */
@Controller('projects')
export class ErrorAnalysisController {
  constructor(private readonly errors: ErrorAnalysisService) {}

  @Get(':id/error-analysis')
  async errorAnalysis(@Param('id') id: string, @UserId() userId: string) {
    return this.errors.errorAnalysis(id, userId);
  }
}
