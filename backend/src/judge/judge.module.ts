import { Global, Module } from '@nestjs/common';
import { AgreementController } from './agreement/agreement.controller';
import { AgreementService } from './agreement/agreement.service';
import { JudgeService } from './judge.service';
import { OverclaimController } from './overclaim/overclaim.controller';
import { OverclaimService } from './overclaim/overclaim.service';

@Global()
@Module({
  controllers: [OverclaimController, AgreementController],
  providers: [JudgeService, OverclaimService, AgreementService],
  exports: [JudgeService, OverclaimService, AgreementService],
})
export class JudgeModule {}
