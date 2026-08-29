import { Global, Module } from '@nestjs/common';
import { JudgeService } from './judge.service';
import { OverclaimController } from './overclaim/overclaim.controller';
import { OverclaimService } from './overclaim/overclaim.service';

@Global()
@Module({
  controllers: [OverclaimController],
  providers: [JudgeService, OverclaimService],
  exports: [JudgeService, OverclaimService],
})
export class JudgeModule {}
