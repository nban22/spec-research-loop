import { Global, Module } from '@nestjs/common';
import { GeneratorService } from './generator.service';

@Global()
@Module({
  providers: [GeneratorService],
  exports: [GeneratorService],
})
export class GeneratorModule {}
