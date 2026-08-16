import { Global, Module } from '@nestjs/common';
import { EstimatorService } from './estimator.service';

@Global()
@Module({
  providers: [EstimatorService],
  exports: [EstimatorService],
})
export class EstimatorModule {}
