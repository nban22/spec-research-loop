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

  /**
   * Ở local, FE và BE **cùng origin** nhờ `rewrites()` của Next.js nên CORS gần như không dùng tới.
   * Khi deploy tách `app.example.com` / `api.example.com` thì nó trở thành bắt buộc.
   *
   * `CORS_ORIGINS` để trống ⇒ phản chiếu origin của request (tiện lúc dev). Khi deploy **phải**
   * liệt kê rõ: CORS có `credentials: true` mà để mở nghĩa là **bất kỳ trang web nào** cũng gọi
   * được API kèm cookie của người dùng đang đăng nhập.
   */
  const allowedOrigins = config.get('CORS_ORIGINS', { infer: true });
  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
  });
  if (
    allowedOrigins.length === 0 &&
    config.get('NODE_ENV', { infer: true }) === 'production'
  ) {
    new Logger('Bootstrap').warn(
      'CORS_ORIGINS đang để trống ở production — API nhận cookie từ mọi origin. Hãy khai báo danh sách origin.',
    );
  }

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  new Logger('Bootstrap').log(
    `SpecResearch Loop API đang chạy ở http://localhost:${port}`,
  );
}

void bootstrap();
