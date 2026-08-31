import { Global, Module } from '@nestjs/common';
import { EmbedderService } from './embedder.service';
import { FullTextService } from './fulltext.service';
import { VerifierService } from './verifier.service';

@Global()
@Module({
  providers: [EmbedderService, FullTextService, VerifierService],
  exports: [EmbedderService, FullTextService, VerifierService],
})
export class VerifierModule {}
