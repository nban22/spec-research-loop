import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import type { Env } from './common/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService<Env, true>);

  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  // **Không** dùng `ValidationPipe` của Nest: nó đòi `class-validator`, mà STACK §8 đã loại gói đó.
  // Zod là hệ validation duy nhất, gắn tại từng handler bằng `ZodBody` (backend/CLAUDE.md §3).

  // FE và BE **cùng origin** nhờ `rewrites()` của Next.js, nên không cần CORS ở local.
  // Vẫn bật `credentials` cho trường hợp gọi thẳng :3001 lúc dev/curl.
  app.enableCors({ origin: true, credentials: true });

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  new Logger('Bootstrap').log(
    `SpecResearch Loop API đang chạy ở http://localhost:${port}`,
  );
}

void bootstrap();
