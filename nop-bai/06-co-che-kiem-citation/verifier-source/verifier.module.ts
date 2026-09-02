import { Global, Module } from '@nestjs/common';
import { EmbedderService } from './embedder.service';
import { EvidenceService } from './evidence.service';
import { FullTextService } from './fulltext.service';
import { HumanCheckService } from './human-check.service';
import { VerifierController } from './verifier.controller';
import { VerifierService } from './verifier.service';

@Global()
@Module({
  controllers: [VerifierController],
  providers: [
    EmbedderService,
    EvidenceService,
    FullTextService,
    HumanCheckService,
    VerifierService,
  ],
  exports: [
    EmbedderService,
    EvidenceService,
    FullTextService,
    HumanCheckService,
    VerifierService,
  ],
})
export class VerifierModule {}
