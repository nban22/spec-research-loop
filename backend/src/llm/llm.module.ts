import { Global, Module } from '@nestjs/common';
import { DeepseekProvider } from './deepseek.provider';
import { LLM_PROVIDER } from './llm-provider.interface';
import { LlmService } from './llm.service';

@Global()
@Module({
  providers: [
    DeepseekProvider,
    { provide: LLM_PROVIDER, useExisting: DeepseekProvider },
    LlmService,
  ],
  exports: [LlmService],
})
export class LlmModule {}
