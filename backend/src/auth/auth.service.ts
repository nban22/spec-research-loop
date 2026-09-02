import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'node:crypto';
import { AppError } from '../common/app-error';
import type { Env } from '../common/env';
import { PrismaService } from '../common/prisma.service';
import type { LoginInput, RegisterInput } from './auth.contracts';

export type PublicUser = { id: string; email: string; display_name: string };
export type TokenPair = {
  access: string;
  refresh: string;
  refreshExpiresAt: Date;
};

const BCRYPT_COST = 10;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** "7d" | "15m" | "3600" → giây. */
function ttlToSeconds(ttl: string): number {
  const m = /^(\d+)\s*([smhd])?$/.exec(ttl.trim());
  if (!m) return 900;
  const n = Number(m[1]);
  switch (m[2]) {
    case 'd':
      return n * 86_400;
    case 'h':
      return n * 3_600;
    case 'm':
      return n * 60;
    default:
      return n;
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  get accessTtlSeconds(): number {
    return ttlToSeconds(this.config.get('JWT_ACCESS_TTL', { infer: true }));
  }

  get refreshTtlSeconds(): number {
    return ttlToSeconds(this.config.get('JWT_REFRESH_TTL', { infer: true }));
  }

  async register(
    input: RegisterInput,
  ): Promise<{ user: PublicUser; tokens: TokenPair }> {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    if (existing) {
      throw AppError.conflict(
        'EMAIL_ALREADY_USED',
        'This email is already registered.',
      );
    }
    const user = await this.prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        password_hash: await bcrypt.hash(input.password, BCRYPT_COST),
        display_name: input.display_name,
      },
      select: { id: true, email: true, display_name: true },
    });
    return { user, tokens: await this.issueTokens(user.id, user.email) };
  }

  /**
   * Sai email và sai mật khẩu trả **cùng một** mã lỗi và **cùng** thời gian phản hồi
   * (STACK §11.3 luật 3) — nên nhánh "không có user" vẫn phải chạy một lần bcrypt.
   */
  async login(
    input: LoginInput,
  ): Promise<{ user: PublicUser; tokens: TokenPair }> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    const hash =
      user?.password_hash ??
      '$2a$10$0000000000000000000000000000000000000000000000000000';
    const ok = await bcrypt.compare(input.password, hash);

    if (!user || !ok) {
      throw new AppError(
        'INVALID_CREDENTIALS',
        'That email or password is not correct.',
        401,
      );
    }
    return {
      user: { id: user.id, email: user.email, display_name: user.display_name },
      tokens: await this.issueTokens(user.id, user.email),
    };
  }

  async refresh(token: string | undefined): Promise<TokenPair> {
    if (!token) {
      throw new AppError(
        'REFRESH_TOKEN_INVALID',
        'Your session has expired.',
        401,
      );
    }
    try {
      await this.jwt.verifyAsync(token, {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      });
    } catch {
      throw new AppError(
        'REFRESH_TOKEN_INVALID',
        'Your session has expired.',
        401,
      );
    }

    const record = await this.prisma.refreshToken.findFirst({
      where: { token_hash: hashToken(token), revoked_at: null },
      include: { user: true },
    });
    if (!record || record.expires_at.getTime() < Date.now()) {
      throw new AppError(
        'REFRESH_TOKEN_INVALID',
        'Your session has expired.',
        401,
      );
    }

    // MVP không xoay vòng refresh token (STACK §11.1) — thu hồi bản cũ, phát bản mới.
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revoked_at: new Date() },
    });
    return this.issueTokens(record.user.id, record.user.email);
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.prisma.refreshToken.updateMany({
      where: { token_hash: hashToken(token), revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, display_name: true },
    });
    if (!user) throw AppError.notFound('Account not found.');
    return user;
  }

  private async issueTokens(userId: string, email: string): Promise<TokenPair> {
    const access = await this.jwt.signAsync(
      { sub: userId, email },
      {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        expiresIn: this.accessTtlSeconds,
      },
    );
    const refresh = await this.jwt.signAsync(
      { sub: userId, email, jti: randomUUID() },
      {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
        expiresIn: this.refreshTtlSeconds,
      },
    );
    const refreshExpiresAt = new Date(
      Date.now() + this.refreshTtlSeconds * 1000,
    );

    // Lưu **hash**, không lưu token — điều kiện để logout thu hồi được (ARCHITECTURE §2.4).
    await this.prisma.refreshToken.create({
      data: {
        user_id: userId,
        token_hash: hashToken(refresh),
        expires_at: refreshExpiresAt,
      },
    });
    return { access, refresh, refreshExpiresAt };
  }
}
