import { Global, Module } from '@nestjs/common';
import { CritiqueController } from './critique.controller';
import { CritiqueService } from './critique.service';

@Global()
@Module({
  controllers: [CritiqueController],
  providers: [CritiqueService],
  exports: [CritiqueService],
})
export class CritiqueModule {}
