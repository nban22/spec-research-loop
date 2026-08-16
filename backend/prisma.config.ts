// Prisma 7 không tự nạp `.env` nữa. Nạp bằng tay ở đây thay vì thêm `dotenv` —
// vài dòng fs rẻ hơn một dependency ngoài STACK §0.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'prisma/config';

function loadEnvFile(): void {
  let raw: string;
  try {
    raw = readFileSync(join(__dirname, '.env'), 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    if (process.env[key] !== undefined) continue;
    process.env[key] = m[2].trim().replace(/^["'](.*)["']$/, '$1');
  }
}

loadEnvFile();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
