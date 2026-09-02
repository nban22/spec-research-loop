import { Global, Module } from '@nestjs/common';
import { ProjectModule } from '../project/project.module';
import { AgreementController } from './agreement/agreement.controller';
import { AgreementService } from './agreement/agreement.service';
import { DebiasController } from './debias.controller';
import { JudgeService } from './judge.service';
import { OverclaimController } from './overclaim/overclaim.controller';
import { OverclaimService } from './overclaim/overclaim.service';

@Global()
@Module({
  // `ProjectModule` cho `DebiasController` dùng `ProjectService.assertOwned` — giữ đúng ngữ nghĩa
  // 404-không-403 của luật nhà thay vì cài lại phép kiểm quyền lần thứ hai.
  // `ProjectModule` không import gì nên không có phụ thuộc vòng.
  imports: [ProjectModule],
  controllers: [OverclaimController, AgreementController, DebiasController],
  providers: [JudgeService, OverclaimService, AgreementService],
  exports: [JudgeService, OverclaimService, AgreementService],
})
export class JudgeModule {}
