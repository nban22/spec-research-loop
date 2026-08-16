import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthUser } from '../common/http.decorators';
import type { Env } from '../common/env';
import { readCookie } from '../common/cookies';
import { ACCESS_COOKIE } from './auth.contracts';

type JwtPayload = { sub: string; email: string };

/**
 * Token đi bằng **cookie httpOnly** chứ không phải header `Authorization`, vì `EventSource`
 * của trình duyệt không set được header mà SSE là đường xem tiến độ 5 judge (STACK §11.2).
 * Vẫn nhận cả header Bearer để test bằng curl cho tiện.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => readCookie(req, ACCESS_COOKIE) ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_ACCESS_SECRET', { infer: true }),
    });
  }

  validate(payload: JwtPayload): AuthUser {
    return { id: payload.sub, email: payload.email };
  }
}
