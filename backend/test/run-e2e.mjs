import { spawnSync } from 'node:child_process';

if (!process.env.DATABASE_URL_TEST) {
  console.error('DATABASE_URL_TEST bắt buộc cho test:e2e; không dùng DATABASE_URL để tránh chạm nhầm dữ liệu.');
  process.exit(1);
}

const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL_TEST },
});
if (result.status !== 0) process.exit(result.status ?? 1);

const jest = spawnSync('npx', ['jest', '--config', './test/jest-e2e.json'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL_TEST,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY ?? 'test-key',
    OPENALEX_MAILTO: process.env.OPENALEX_MAILTO ?? 'tests@example.com',
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? 'a'.repeat(32),
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'b'.repeat(32),
  },
});
process.exit(jest.status ?? 1);
