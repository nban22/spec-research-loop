import { Global, Module } from '@nestjs/common';
import { ExportService } from './export.service';
import { SpecController } from './spec.controller';
import { SpecService } from './spec.service';

@Global()
@Module({
  controllers: [SpecController],
  providers: [SpecService, ExportService],
  exports: [SpecService, ExportService],
})
export class SpecModule {}
