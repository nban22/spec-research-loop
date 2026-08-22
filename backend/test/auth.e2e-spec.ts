import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';
import { cleanDatabase } from './helpers/database';
import { applyTestOverrides } from './helpers/mock-providers';

describe('Auth API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    let builder = Test.createTestingModule({
      imports: [AppModule],
    });
    builder = applyTestOverrides(builder);

    const moduleFixture: TestingModule = await builder.compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    prisma = app.get(PrismaService);
    await cleanDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/register creates user and sets auth cookies', async () => {
    const server = app.getHttpServer() as request.Test;
    const res = await request(server)
      .post('/auth/register')
      .send({
        email: 'user1@example.com',
        password: 'Password123!',
        display_name: 'User One',
      })
      .expect(201);

    const body = res.body as { user: { email: string } };
    expect(body.user.email).toBe('user1@example.com');
    expect(res.get('Set-Cookie')).toBeDefined();
  });

  it('POST /auth/register rejects duplicate email', async () => {
    const server = app.getHttpServer() as request.Test;
    await request(server)
      .post('/auth/register')
      .send({
        email: 'user1@example.com',
        password: 'Password123!',
        display_name: 'User One Dup',
      })
      .expect(409);
  });

  it('POST /auth/login fails on incorrect password', async () => {
    const server = app.getHttpServer() as request.Test;
    await request(server)
      .post('/auth/login')
      .send({
        email: 'user1@example.com',
        password: 'WrongPassword!',
      })
      .expect(401);
  });

  it('POST /auth/login succeeds with correct password', async () => {
    const server = app.getHttpServer() as request.Test;
    const res = await request(server)
      .post('/auth/login')
      .send({
        email: 'user1@example.com',
        password: 'Password123!',
      })
      .expect(200);

    const body = res.body as { user: { email: string } };
    expect(body.user.email).toBe('user1@example.com');
    expect(res.get('Set-Cookie')).toBeDefined();
  });
});
