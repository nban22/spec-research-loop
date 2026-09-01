import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { createTwoFilesPatch } from 'diff';
import { z } from 'zod';
import { AppError } from '../common/app-error';
import { jsonOrDbNull } from '../common/prisma-json';
import { PrismaService } from '../common/prisma.service';
import { UserId } from '../common/http.decorators';
import { ZodBody } from '../common/zod-body.pipe';
import { cardStatusSchema, cardTypeSchema } from '../contracts/enums';
import { JobsService } from '../jobs/jobs.service';
import { JudgeService } from '../judge/judge.service';
import { VerifierService } from '../verifier/verifier.service';
import { ExportService } from './export.service';
import { SpecService } from './spec.service';

const patchCardSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  body: z.string().max(6000).optional(),
  status: cardStatusSchema.optional(),
  type: cardTypeSchema.optional(),
  payload: z.record(z.string(), z.unknown()).nullable().optional(),
});
type PatchCardInput = z.infer<typeof patchCardSchema>;

@Controller()
export class SpecController {
  constructor(
    private readonly spec: SpecService,
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly judge: JudgeService,
    private readonly verifier: VerifierService,
    private readonly exporter: ExportService,
  ) {}

  @Get('spec-versions/:id')
  async version(@Param('id') id: string, @UserId() userId: string) {
    const version = await this.spec.assertVersionOwned(id, userId);
    const sections = await this.spec.buildSections(id);
    return {
      version: {
        id: version.id,
        version_no: version.version_no,
        status: version.status,
        label: version.label,
        parent_version_id: version.parent_version_id,
        created_by_decision_id: version.created_by_decision_id,
        meta: version.meta,
        project_id: version.project_id,
      },
      sections,
      completeness: sections.filter((s) => s.present).length,
    };
  }

  @Get('spec-versions/:id/related-work')
  async relatedWork(@Param('id') id: string, @UserId() userId: string) {
    await this.spec.assertVersionOwned(id, userId);
    return this.prisma.relatedWorkRow.findMany({
      where: { spec_version_id: id },
      include: { source: true },
      orderBy: { order_index: 'asc' },
    });
  }

  @Get('spec-versions/:id/cards')
  async cards(
    @Param('id') id: string,
    @UserId() userId: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    await this.spec.assertVersionOwned(id, userId);
    return { cards: await this.spec.cards(id, { type, status }) };
  }

  /** Kế hoạch thí nghiệm + ước lượng tài nguyên của một version — đầu vào của cột phải B3. */
  @Get('spec-versions/:id/plan')
  async plan(@Param('id') id: string, @UserId() userId: string) {
    await this.spec.assertVersionOwned(id, userId);
    const [plan, estimate] = await Promise.all([
      this.spec.experimentPlan(id),
      this.prisma.resourceEstimate.findUnique({
        where: { spec_version_id: id },
      }),
    ]);
    return { plan, estimate };
  }

  @Get('spec-versions/:id/markdown')
  async markdown(@Param('id') id: string, @UserId() userId: string) {
    await this.spec.assertVersionOwned(id, userId);
    return { markdown: await this.spec.buildMarkdown(id) };
  }

  @Patch('cards/:id')
  async patchCard(
    @Param('id') id: string,
    @UserId() userId: string,
    @Body(new ZodBody(patchCardSchema)) body: PatchCardInput,
  ) {
    const card = await this.prisma.card.findFirst({
      where: { id, spec_version: { project: { user_id: userId } } },
    });
    if (!card) throw AppError.notFound('Card not found.');
    const updated = await this.prisma.card.update({
      where: { id },
      data: {
        ...(body.title ? { title: body.title } : {}),
        ...(body.body !== undefined ? { body: body.body } : {}),
        ...(body.status ? { status: body.status } : {}),
        ...(body.type ? { type: body.type } : {}),
        ...(body.payload !== undefined
          ? { payload: jsonOrDbNull(body.payload) }
          : {}),
        origin: 'USER',
      },
    });
    return { card: updated };
  }

  /** Diff là **hàm thuần của hai version**, tính lúc đọc, không lưu (C4 · F.5). */
  @Get('spec-versions/:id/diff')
  async diff(
    @Param('id') id: string,
    @UserId() userId: string,
    @Query('against') against?: string,
  ) {
    const version = await this.spec.assertVersionOwned(id, userId);
    const otherId = against ?? version.parent_version_id;
    if (!otherId) {
      throw AppError.badRequest(
        'VALIDATION_FAILED',
        'This version has no earlier version to compare against.',
      );
    }
    const other = await this.spec.assertVersionOwned(otherId, userId);

    const [newer, older] =
      version.version_no >= other.version_no
        ? [version, other]
        : [other, version];
    const [newMd, oldMd] = await Promise.all([
      this.spec.buildMarkdown(newer.id),
      this.spec.buildMarkdown(older.id),
    ]);

    return {
      from: { id: older.id, version_no: older.version_no, label: older.label },
      to: { id: newer.id, version_no: newer.version_no, label: newer.label },
      old_markdown: oldMd,
      new_markdown: newMd,
      patch: createTwoFilesPatch(
        `v${older.version_no}.md`,
        `v${newer.version_no}.md`,
        oldMd,
        newMd,
      ),
    };
  }

  @Post('spec-versions/:id/judge')
  async runJudge(@Param('id') id: string, @UserId() userId: string) {
    const version = await this.spec.assertVersionOwned(id, userId);
    const jobId = await this.jobs.create('JUDGE', {
      projectId: version.project_id,
      specVersionId: id,
      total: 5,
      message: 'Running the 5 independent judges…',
    });
    this.jobs.runInBackground(jobId, async () => {
      await this.jobs.emit(jobId, 'judge.started', { total: 5 });
      const result = await this.judge.runRound(id, {
        onProgress: (d, t, m) => this.jobs.progress(jobId, d, t, m),
      });
      await this.jobs.emit(jobId, 'judge.summary', {
        round: result.round,
        completed: result.completed,
        failed: result.failed.map((f) => f.key),
        input_digest: result.inputDigest,
        group_count: result.groupCount,
      });
    });
    return { jobId };
  }

  /** Endpoint **bằng chứng** cho ràng buộc "5 judge không thấy nhau", không phải endpoint debug. */
  @Get('spec-versions/:id/judge-runs')
  async judgeRuns(@Param('id') id: string, @UserId() userId: string) {
    await this.spec.assertVersionOwned(id, userId);
    return { runs: await this.judge.listJudgeRuns(id) };
  }

  @Get('spec-versions/:id/issues')
  async issues(@Param('id') id: string, @UserId() userId: string) {
    await this.spec.assertVersionOwned(id, userId);
    return { groups: await this.judge.listIssueGroups(id) };
  }

  @Post('spec-versions/:id/verify')
  async verify(@Param('id') id: string, @UserId() userId: string) {
    const version = await this.spec.assertVersionOwned(id, userId);
    const jobId = await this.jobs.create('VERIFY', {
      projectId: version.project_id,
      specVersionId: id,
      total: 1,
      message: 'Verifying the evidence…',
    });
    this.jobs.runInBackground(jobId, async () => {
      await this.verifier.verifySpecVersion(id, {
        projectId: version.project_id,
        onProgress: (d, t, m) => this.jobs.progress(jobId, d, t, m),
      });
    });
    return { jobId };
  }

  @Get('spec-versions/:id/verification')
  async verification(@Param('id') id: string, @UserId() userId: string) {
    await this.spec.assertVersionOwned(id, userId);
    return this.verifier.getVerification(id);
  }

  @Get('spec-versions/:id/gate')
  async gate(@Param('id') id: string, @UserId() userId: string) {
    await this.spec.assertVersionOwned(id, userId);
    return this.exporter.checkGate(id);
  }

  @Post('spec-versions/:id/export')
  async exportSpec(
    @Param('id') id: string,
    @UserId() userId: string,
    @Query('format') format: string,
  ) {
    await this.spec.assertVersionOwned(id, userId);
    const fmt = format?.toUpperCase() === 'PDF' ? 'PDF' : 'MD';
    const result = await this.exporter.export(id, fmt);
    return {
      artifactId: result.artifactId,
      format: result.format,
      filename: result.filename,
      byte_size: result.body.byteLength,
      checksum: result.checksum,
    };
  }

  /** Tải file: sinh lại từ version bất biến — DB không lưu blob (S6 · F.5). */
  @Get('spec-versions/:id/export/:artifactId')
  async download(
    @Param('id') id: string,
    @Param('artifactId') artifactId: string,
    @UserId() userId: string,
    @Res() res: Response,
  ) {
    await this.spec.assertVersionOwned(id, userId);
    const artifact = await this.prisma.exportArtifact.findFirst({
      where: { id: artifactId, spec_version_id: id },
    });
    if (!artifact) throw AppError.notFound('Export not found.');

    const result = await this.exporter.export(id, artifact.format);
    res
      .status(200)
      .setHeader('Content-Type', result.contentType)
      .setHeader(
        'Content-Disposition',
        `attachment; filename="${result.filename}"`,
      )
      .send(result.body);
  }
}
