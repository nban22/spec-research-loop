import { Global, Module } from '@nestjs/common';
import { ConflictController } from './conflict.controller';
import { ConflictService } from './conflict.service';

@Global()
@Module({
  controllers: [ConflictController],
  providers: [ConflictService],
  exports: [ConflictService],
})
export class ConflictModule {}
