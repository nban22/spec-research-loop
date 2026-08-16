import { Global, Module } from '@nestjs/common';
import { SourceClient } from './source.client';
import { SourcesService } from './sources.service';

@Global()
@Module({
  providers: [SourceClient, SourcesService],
  exports: [SourceClient, SourcesService],
})
export class SourcesModule {}
