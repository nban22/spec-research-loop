import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { ErrorAnalysisController } from './error-analysis.controller';
import { ErrorAnalysisService } from './error-analysis.service';
import { SourceMapController } from './source-map.controller';
import { SourceMapService } from './source-map.service';

/**
 * Module **chỉ đọc** của làn C. Không `@Global()`: không service nào khác cần nó, và để nó
 * toàn cục là mời gọi người khác nối vào rồi vô tình ghi qua đây.
 *
 * Mỗi tính năng một cặp service/controller riêng:
 *
 * | Cặp | Issue | Đọc gì |
 * | --- | --- | --- |
 * | `Analytics*` | #17 | `LlmCall` · `ResourceEstimate` → bảng token/thời gian/chi phí |
 * | `ErrorAnalysis*` | #19 | `VerifierRun` · `CardSource` → ma trận cờ/nhãn, so ngưỡng |
 * | `SourceMap*` | #16 | `Source` · `CardSource` → timeline, similarity map, độ thưa |
 *
 * Tách file như vậy để hai nhánh phát triển song song chỉ đụng nhau ở **file này**, và
 * conflict là hai dòng import cộng hai phần tử mảng — đúng như đã xảy ra khi #19 rebase lên
 * `main` sau khi #17 merge.
 */
@Module({
  controllers: [
    AnalyticsController,
    ErrorAnalysisController,
    SourceMapController,
  ],
  providers: [AnalyticsService, ErrorAnalysisService, SourceMapService],
})
export class AnalyticsModule {}
