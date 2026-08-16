import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env';
import { Public } from './http.decorators';
import { PrismaService } from './prisma.service';
import { EmbedderService } from '../verifier/embedder.service';
import { SourceClient } from '../sources/source.client';

@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embedder: EmbedderService,
    private readonly sources: SourceClient,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Get('health')
  async health() {
    let db = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = true;
    } catch {
      db = false;
    }
    return {
      ok: db,
      db,
      embedder_ready: this.embedder.isAvailable,
      embedder_failed: this.embedder.hasFailed,
      semantic_scholar_key: this.sources.hasSemanticScholarKey,
      env: this.config.get('NODE_ENV', { infer: true }),
    };
  }
}
