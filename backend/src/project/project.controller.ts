import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { UserId } from '../common/http.decorators';
import { ZodBody } from '../common/zod-body.pipe';
import { DecisionService } from '../decision/decision.service';
import {
  EstimatorService,
  estimatorInputSchema,
} from '../estimator/estimator.service';
import { GeneratorService } from '../generator/generator.service';
import { JobsService } from '../jobs/jobs.service';
import { SourcesService } from '../sources/sources.service';
import { SpecService } from '../spec/spec.service';
import {
  ProjectService,
  createProjectSchema,
  patchProjectSchema,
  type CreateProjectInput,
  type PatchProjectInput,
} from './project.service';

const searchSchema = z.object({
  queries: z.array(z.string().min(2)).min(1).max(6),
});
type SearchInput = z.infer<typeof searchSchema>;

@Controller('projects')
export class ProjectController {
  constructor(
    private readonly projects: ProjectService,
    private readonly generator: GeneratorService,
    private readonly sources: SourcesService,
    private readonly jobs: JobsService,
    private readonly spec: SpecService,
    private readonly estimator: EstimatorService,
    private readonly decisions: DecisionService,
  ) {}

  @Post()
  async create(
    @UserId() userId: string,
    @Body(new ZodBody(createProjectSchema)) body: CreateProjectInput,
  ) {
    return { project: await this.projects.create(userId, body) };
  }

  @Get()
  async list(@UserId() userId: string) {
    return { projects: await this.projects.list(userId) };
  }

  @Get(':id')
  async detail(@Param('id') id: string, @UserId() userId: string) {
    return this.projects.detail(id, userId);
  }

  @Patch(':id')
  async patch(
    @Param('id') id: string,
    @UserId() userId: string,
    @Body(new ZodBody(patchProjectSchema)) body: PatchProjectInput,
  ) {
    return { project: await this.projects.patch(id, userId, body) };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @UserId() userId: string) {
    await this.projects.remove(id, userId);
  }

  // ── các bước gọi LLM: trả `{ jobId }`, FE mở EventSource (ARCHITECTURE §5) ──

  @Post(':id/analyze')
  async analyze(@Param('id') id: string, @UserId() userId: string) {
    await this.projects.assertOwned(id, userId);
    const jobId = await this.jobs.create('ANALYZE', {
      projectId: id,
      total: 1,
      message: 'Analysing your idea…',
    });
    this.jobs.runInBackground(jobId, () =>
      this.generator.analyze(id, (d, t, m) =>
        this.jobs.progress(jobId, d, t, m),
      ),
    );
    return { jobId };
  }

  @Post(':id/sources/search')
  async search(
    @Param('id') id: string,
    @UserId() userId: string,
    @Body(new ZodBody(searchSchema)) body: SearchInput,
  ) {
    await this.projects.assertOwned(id, userId);
    const jobId = await this.jobs.create('SEARCH', {
      projectId: id,
      total: body.queries.length,
      message: 'Searching for real sources…',
    });
    this.jobs.runInBackground(jobId, async () => {
      await this.sources.searchAndStore(id, body.queries, (d, t, m) =>
        this.jobs.progress(jobId, d, t, m),
      );
    });
    return { jobId };
  }

  @Get(':id/sources')
  async listSources(@Param('id') id: string, @UserId() userId: string) {
    await this.projects.assertOwned(id, userId);
    return { sources: await this.sources.list(id) };
  }

  @Delete(':id/sources/:sourceId')
  @HttpCode(204)
  async removeSource(
    @Param('id') id: string,
    @Param('sourceId') sourceId: string,
    @UserId() userId: string,
  ) {
    await this.projects.assertOwned(id, userId);
    await this.sources.remove(id, sourceId);
  }

  @Post(':id/related-work')
  async relatedWork(@Param('id') id: string, @UserId() userId: string) {
    await this.projects.assertOwned(id, userId);
    const jobId = await this.jobs.create('RELATED_WORK', {
      projectId: id,
      total: 1,
    });
    this.jobs.runInBackground(jobId, () =>
      this.generator.relatedWork(id, (d, t, m) =>
        this.jobs.progress(jobId, d, t, m),
      ),
    );
    return { jobId };
  }

  @Post(':id/gap')
  async gap(@Param('id') id: string, @UserId() userId: string) {
    await this.projects.assertOwned(id, userId);
    const jobId = await this.jobs.create('GENERATE', {
      projectId: id,
      total: 1,
    });
    this.jobs.runInBackground(jobId, () =>
      this.generator.gap(id, (d, t, m) => this.jobs.progress(jobId, d, t, m)),
    );
    return { jobId };
  }

  @Post(':id/contributions')
  async contributions(@Param('id') id: string, @UserId() userId: string) {
    await this.projects.assertOwned(id, userId);
    const jobId = await this.jobs.create('GENERATE', {
      projectId: id,
      total: 1,
    });
    this.jobs.runInBackground(jobId, () =>
      this.generator.contributions(id, (d, t, m) =>
        this.jobs.progress(jobId, d, t, m),
      ),
    );
    return { jobId };
  }

  @Post(':id/experiment-plan')
  async experimentPlan(@Param('id') id: string, @UserId() userId: string) {
    await this.projects.assertOwned(id, userId);
    const jobId = await this.jobs.create('GENERATE', {
      projectId: id,
      total: 2,
    });
    this.jobs.runInBackground(jobId, () =>
      this.generator.experimentPlan(id, (d, t, m) =>
        this.jobs.progress(jobId, d, t, m),
      ),
    );
    return { jobId };
  }

  /** Ngoại lệ của quy ước job: thuần công thức, **không gọi LLM**, trả về trong vài ms (S4 · F.4). */
  @Post(':id/estimate')
  async estimate(
    @Param('id') id: string,
    @UserId() userId: string,
    @Body(new ZodBody(estimatorInputSchema))
    body: z.infer<typeof estimatorInputSchema>,
  ) {
    await this.projects.assertOwned(id, userId);
    const version = await this.spec.currentVersionOf(id);
    const result = await this.generator.saveEstimate(version.id, body);
    return { estimate: result };
  }

  @Get(':id/estimate/preview')
  preview(@Query() query: Record<string, string>) {
    const parsed = estimatorInputSchema.parse({
      model_params_b: Number(query.model_params_b),
      quantization: query.quantization,
      candidates: Number(query.candidates),
      rounds: Number(query.rounds),
      eval_samples: Number(query.eval_samples),
      avg_prompt_tokens: Number(query.avg_prompt_tokens),
      avg_output_tokens: Number(query.avg_output_tokens),
    });
    return { estimate: this.estimator.estimate(parsed) };
  }

  @Get(':id/versions')
  async versions(@Param('id') id: string, @UserId() userId: string) {
    return { versions: await this.projects.versions(id, userId) };
  }

  @Get(':id/decisions')
  async decisionLog(@Param('id') id: string, @UserId() userId: string) {
    await this.projects.assertOwned(id, userId);
    return { decisions: await this.decisions.list(id) };
  }

  @Get(':id/pending-decisions')
  async pendingDecisions(
    @Param('id') id: string,
    @UserId() userId: string,
    @Query('step') step?: string,
  ) {
    await this.projects.assertOwned(id, userId);
    return {
      decisions: await this.decisions.pending(
        id,
        step as 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | undefined,
      ),
    };
  }
}
