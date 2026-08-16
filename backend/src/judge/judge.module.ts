import { Global, Module } from '@nestjs/common';
import { JudgeService } from './judge.service';

@Global()
@Module({
  providers: [JudgeService],
  exports: [JudgeService],
})
export class JudgeModule {}
