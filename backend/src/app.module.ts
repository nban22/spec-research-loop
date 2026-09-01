import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { HealthController } from './common/health.controller';
import { PrismaModule } from './common/prisma.module';
import { validateEnv } from './common/env';
import { DecisionModule } from './decision/decision.module';
import { EstimatorModule } from './estimator/estimator.module';
import { GeneratorModule } from './generator/generator.module';
import { JobsModule } from './jobs/jobs.module';
import { JudgeModule } from './judge/judge.module';
import { LlmModule } from './llm/llm.module';
import { ProjectModule } from './project/project.module';
import { PromptsModule } from './prompts/prompts.module';
import { SourcesModule } from './sources/sources.module';
import { SpecModule } from './spec/spec.module';
import { VerifierModule } from './verifier/verifier.module';
import { CritiqueModule } from './critique/critique.module';
import { ConflictModule } from './conflict/conflict.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    PrismaModule,
    PromptsModule,
    LlmModule,
    JobsModule,
    SourcesModule,
    VerifierModule,
    EstimatorModule,
    SpecModule,
    GeneratorModule,
    JudgeModule,
    DecisionModule,
    AuthModule,
    ProjectModule,
    AnalyticsModule,
    CritiqueModule,
    ConflictModule,
  ],
  controllers: [HealthController],
  providers: [
    // Guard bật **global**; mở ra bằng `@Public()`. Quên đánh dấu thì endpoint bị khoá, không hở.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
