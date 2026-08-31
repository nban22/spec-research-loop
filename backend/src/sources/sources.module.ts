import { Global, Module } from '@nestjs/common';
import { ProjectModule } from '../project/project.module';
import { CredibilityService } from './credibility.service';
import { SourceClient } from './source.client';
import { SourcesController } from './sources.controller';
import { SourcesService } from './sources.service';

@Global()
@Module({
  // `ProjectModule` chỉ để dùng lại `assertOwned` — không khai lại luật "tài nguyên của người
  // khác trả 404" ở đây. `ProjectModule` không import ngược `SourcesModule` (module này `@Global`)
  // nên không có vòng lặp phụ thuộc.
  imports: [ProjectModule],
  controllers: [SourcesController],
  providers: [SourceClient, SourcesService, CredibilityService],
  exports: [SourceClient, SourcesService, CredibilityService],
})
export class SourcesModule {}
