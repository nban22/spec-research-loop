import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';
import { cleanDatabase } from './helpers/database';
import { applyTestOverrides } from './helpers/mock-providers';

describe('Security Isolation Cross-User (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let tokenA: string;
  let tokenB: string;
  let projectAId: string;

  beforeAll(async () => {
    let builder = Test.createTestingModule({ imports: [AppModule] });
    builder = applyTestOverrides(builder);

    const moduleFixture: TestingModule = await builder.compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    prisma = app.get(PrismaService);
    await cleanDatabase(prisma);

    const server = app.getHttpServer() as request.Test;

    // Register User A
    const resA = await request(server).post('/auth/register').send({
      email: 'usera@example.com',
      password: 'Password123!',
      display_name: 'User A',
    });
    const bodyA = resA.body as { access_token: string };
    tokenA = bodyA.access_token;

    // Register User B
    const resB = await request(server).post('/auth/register').send({
      email: 'userb@example.com',
      password: 'Password123!',
      display_name: 'User B',
    });
    const bodyB = resB.body as { access_token: string };
    tokenB = bodyB.access_token;

    // Create Project for User A
    const projRes = await request(server)
      .post('/projects')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ raw_idea: 'User A research project proposal raw idea text.' });
    const projBody = projRes.body as { id: string };
    projectAId = projBody.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 404 when User B tries to view User A project detail', async () => {
    const server = app.getHttpServer() as request.Test;
    await request(server)
      .get(`/projects/${projectAId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it('returns 404 when User B tries to patch User A project', async () => {
    const server = app.getHttpServer() as request.Test;
    await request(server)
      .patch(`/projects/${projectAId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ title: 'Hacked Title' })
      .expect(404);
  });

  it('returns 404 when User B tries to delete User A project', async () => {
    const server = app.getHttpServer() as request.Test;
    await request(server)
      .delete(`/projects/${projectAId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });
});
