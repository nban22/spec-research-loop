import { Global, Module } from '@nestjs/common';
import { EmbedderService } from './embedder.service';
import { VerifierService } from './verifier.service';

@Global()
@Module({
  providers: [EmbedderService, VerifierService],
  exports: [EmbedderService, VerifierService],
})
export class VerifierModule {}
