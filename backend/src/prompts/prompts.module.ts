import { Global, Module } from '@nestjs/common';
import { PromptLoaderService } from './prompt-loader.service';

@Global()
@Module({
  providers: [PromptLoaderService],
  exports: [PromptLoaderService],
})
export class PromptsModule {}
