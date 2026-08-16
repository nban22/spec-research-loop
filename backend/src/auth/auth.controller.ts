import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { readCookie } from '../common/cookies';
import type { Env } from '../common/env';
import { Public, UserId } from '../common/http.decorators';
import { ZodBody } from '../common/zod-body.pipe';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput,
} from './auth.contracts';
import { AuthService, type TokenPair } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Post('register')
  async register(
    @Body(new ZodBody(registerSchema)) body: RegisterInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, tokens } = await this.auth.register(body);
    this.setCookies(res, tokens);
    return { user };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodBody(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, tokens } = await this.auth.login(body);
    this.setCookies(res, tokens);
    return { user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.auth.refresh(readCookie(req, REFRESH_COOKIE));
    this.setCookies(res, tokens);
    return { ok: true };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(readCookie(req, REFRESH_COOKIE));
    // Phải xoá bằng **đúng** bộ thuộc tính đã set (nhất là `domain`), nếu không trình duyệt
    // coi đó là một cookie khác và cookie cũ vẫn nằm nguyên đó.
    const attrs = this.cookieBase();
    res.clearCookie(ACCESS_COOKIE, attrs);
    res.clearCookie(REFRESH_COOKIE, attrs);
  }

  @Get('me')
  async me(@UserId() userId: string) {
    return { user: await this.auth.me(userId) };
  }

  /**
   * Cookie **thích ứng theo môi trường** (xem `common/env.ts`).
   *
   * Khi FE và BE nằm ở hai subdomain của **cùng một registrable domain**, chỉ cần đặt
   * `COOKIE_DOMAIN=.example.com`: trình duyệt vẫn coi hai host là *same-site*, nên `SameSite=Lax`
   * tiếp tục hoạt động và ta **không phải** hạ xuống `None`. Giữ `Lax` là giữ luôn lớp chống
   * CSRF mà STACK §11.2 dựa vào.
   *
   * `SameSite=None` **bắt buộc** đi kèm `Secure` — ép lại ở đây thay vì để trình duyệt lặng lẽ
   * vứt cookie đi khi cấu hình lệch.
   */
  private cookieBase() {
    const sameSite = this.config.get('COOKIE_SAMESITE', { infer: true });
    const secure =
      this.config.get('COOKIE_SECURE', { infer: true }) ??
      this.config.get('NODE_ENV', { infer: true }) === 'production';
    const domain = this.config.get('COOKIE_DOMAIN', { infer: true });
    return {
      httpOnly: true,
      sameSite,
      secure: sameSite === 'none' ? true : secure,
      path: '/',
      ...(domain ? { domain } : {}),
    } as const;
  }

  private setCookies(res: Response, tokens: TokenPair): void {
    const base = this.cookieBase();
    res.cookie(ACCESS_COOKIE, tokens.access, {
      ...base,
      maxAge: this.auth.accessTtlSeconds * 1000,
    });
    res.cookie(REFRESH_COOKIE, tokens.refresh, {
      ...base,
      maxAge: this.auth.refreshTtlSeconds * 1000,
    });
  }
}
