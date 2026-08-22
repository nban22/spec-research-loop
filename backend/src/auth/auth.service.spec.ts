import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

const config = {
  get: jest.fn(
    (key: string) =>
      ({
        JWT_ACCESS_TTL: '15m',
        JWT_REFRESH_TTL: '7d',
        JWT_ACCESS_SECRET: 'a'.repeat(32),
        JWT_REFRESH_SECRET: 'b'.repeat(32),
      })[key],
  ),
};

describe('AuthService', () => {
  const prisma = {
    user: { findUnique: jest.fn(), create: jest.fn() },
    refreshToken: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const jwt = { signAsync: jest.fn(), verifyAsync: jest.fn() };
  const service = new AuthService(
    prisma as never,
    jwt as never,
    config as never,
  );

  beforeEach(() => jest.clearAllMocks());

  describe('TTL Getters', () => {
    it('parses access and refresh TTL correctly', () => {
      expect(service.accessTtlSeconds).toBe(900);
      expect(service.refreshTtlSeconds).toBe(604800);
    });

    it('parses hours, minutes, seconds, and invalid string fallback TTL', () => {
      const customConfig = {
        get: jest.fn((key: string) => {
          if (key === 'JWT_ACCESS_TTL') return '2h';
          if (key === 'JWT_REFRESH_TTL') return '15m';
          return 'invalid';
        }),
      };
      const customService = new AuthService(
        prisma as never,
        jwt as never,
        customConfig as never,
      );
      expect(customService.accessTtlSeconds).toBe(7200);
      expect(customService.refreshTtlSeconds).toBe(900);
    });
  });

  describe('register', () => {
    it('rejects registration with an existing email', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      await expect(
        service.register({
          email: 'a@example.com',
          password: 'password1',
          display_name: 'A',
        }),
      ).rejects.toMatchObject({ code: 'EMAIL_ALREADY_USED' });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('issues and stores hashed token records when registering', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: 'a@example.com',
        display_name: 'A',
      });
      jwt.signAsync
        .mockResolvedValueOnce('access')
        .mockResolvedValueOnce('refresh');
      prisma.refreshToken.create.mockResolvedValue({ id: 'token-1' });

      await expect(
        service.register({
          email: 'A@Example.com',
          password: 'password1',
          display_name: 'A',
        }),
      ).resolves.toMatchObject({ user: { email: 'a@example.com' } });
      expect(prisma.refreshToken.create).toHaveBeenCalled();
      const createMock = prisma.refreshToken.create;
      const createCalls = createMock.mock.calls as [
        { data: { token_hash: string } },
      ][];
      expect(createCalls[0][0].data.token_hash).not.toContain('refresh');
    });
  });

  describe('login', () => {
    it('returns the same credential error for an unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'missing@example.com', password: 'wrong' }),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    });

    it('rejects login with wrong password for existing email', async () => {
      const passwordHash = await bcrypt.hash('correctpass', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@example.com',
        password_hash: passwordHash,
      });

      await expect(
        service.login({ email: 'a@example.com', password: 'wrongpass' }),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    });

    it('authenticates successfully with correct password', async () => {
      const passwordHash = await bcrypt.hash('correctpass', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@example.com',
        display_name: 'User One',
        password_hash: passwordHash,
      });
      jwt.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const result = await service.login({
        email: 'a@example.com',
        password: 'correctpass',
      });

      expect(result.user).toEqual({
        id: 'user-1',
        email: 'a@example.com',
        display_name: 'User One',
      });
      expect(result.tokens.access).toBe('access-token');
    });
  });

  describe('refresh', () => {
    it('rejects missing refresh token', async () => {
      await expect(service.refresh(undefined)).rejects.toMatchObject({
        code: 'REFRESH_TOKEN_INVALID',
      });
    });

    it('rejects invalid/expired JWT refresh token', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));
      await expect(service.refresh('expired-token')).rejects.toMatchObject({
        code: 'REFRESH_TOKEN_INVALID',
      });
    });

    it('rejects when token record is not in database', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      prisma.refreshToken.findFirst.mockResolvedValue(null);

      await expect(service.refresh('unknown-token')).rejects.toMatchObject({
        code: 'REFRESH_TOKEN_INVALID',
      });
    });

    it('rejects when token record is expired in database', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      prisma.refreshToken.findFirst.mockResolvedValue({
        id: 'old',
        expires_at: new Date(Date.now() - 60_000),
        user: { id: 'user-1', email: 'a@example.com' },
      });

      await expect(service.refresh('expired-db-token')).rejects.toMatchObject({
        code: 'REFRESH_TOKEN_INVALID',
      });
    });

    it('revokes the old refresh token before issuing a replacement', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      prisma.refreshToken.findFirst.mockResolvedValue({
        id: 'old',
        expires_at: new Date(Date.now() + 60_000),
        user: { id: 'user-1', email: 'a@example.com' },
      });
      jwt.signAsync
        .mockResolvedValueOnce('new-access')
        .mockResolvedValueOnce('new-refresh');
      prisma.refreshToken.create.mockResolvedValue({ id: 'new' });

      await expect(service.refresh('old-refresh')).resolves.toMatchObject({
        access: 'new-access',
        refresh: 'new-refresh',
      });
      expect(prisma.refreshToken.update).toHaveBeenCalled();
      const updateMock = prisma.refreshToken.update;
      const updateCalls = updateMock.mock.calls as [
        { where: { id: string }; data: { revoked_at: Date } },
      ][];
      expect(updateCalls[0][0].where.id).toBe('old');
      expect(updateCalls[0][0].data.revoked_at).toBeInstanceOf(Date);
    });
  });

  describe('logout', () => {
    it('handles undefined token gracefully without database calls', async () => {
      await service.logout(undefined);
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('revokes active refresh tokens matching token hash', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      await service.logout('valid-token');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
      const updateManyMock = prisma.refreshToken.updateMany;
      const calls = updateManyMock.mock.calls as [
        {
          where: { token_hash: string; revoked_at: null };
          data: { revoked_at: Date };
        },
      ][];
      expect(typeof calls[0][0].where.token_hash).toBe('string');
      expect(calls[0][0].data.revoked_at).toBeInstanceOf(Date);
    });
  });

  describe('me', () => {
    it('returns user profile when found', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@example.com',
        display_name: 'User One',
      });

      const user = await service.me('user-1');
      expect(user).toEqual({
        id: 'user-1',
        email: 'a@example.com',
        display_name: 'User One',
      });
    });

    it('throws NOT_FOUND when user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.me('missing-user')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });
});
