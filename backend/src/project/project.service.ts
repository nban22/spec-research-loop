import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppError } from '../common/app-error';
import { PrismaService } from '../common/prisma.service';
import { projectStepSchema } from '../contracts/enums';
import type { AnalysisMeta } from '../generator/generator.service';

export const createProjectSchema = z.object({
  raw_idea: z
    .string()
    .min(20, 'The idea needs at least 20 characters to be analysed')
    .max(4000),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const patchProjectSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    raw_idea: z.string().min(20).max(4000).optional(),
    step: projectStepSchema.optional(),
  })
  .strict();
export type PatchProjectInput = z.infer<typeof patchProjectSchema>;

@Injectable()
export class ProjectService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * **Mọi** truy vấn `Project` kèm `where: { user_id }` lấy từ token; hỏi tài nguyên của người
   * khác trả **404** chứ không 403 — 403 xác nhận rằng tài nguyên đó tồn tại (STACK §11.3).
   */
  async assertOwned(projectId: string, userId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, user_id: userId },
    });
    if (!project) throw AppError.notFound('Project not found.');
    return project;
  }

  async create(userId: string, input: CreateProjectInput) {
    const project = await this.prisma.project.create({
      data: {
        user_id: userId,
        title: firstLine(input.raw_idea),
        raw_idea: input.raw_idea,
        step: 'S1',
        status: 'DRAFT',
      },
    });
    const version = await this.prisma.specVersion.create({
      data: {
        project_id: project.id,
        version_no: 1,
        status: 'DRAFT',
        label: 'First draft',
      },
    });
    return this.prisma.project.update({
      where: { id: project.id },
      data: { current_spec_version_id: version.id },
    });
  }

  async list(userId: string) {
    const projects = await this.prisma.project.findMany({
      where: { user_id: userId },
      orderBy: { updated_at: 'desc' },
      include: { _count: { select: { spec_versions: true, decisions: true } } },
    });
    return projects.map((p) => ({
      id: p.id,
      title: p.title,
      raw_idea: p.raw_idea,
      domain: p.domain,
      step: p.step,
      status: p.status,
      arm: p.arm,
      version_count: p._count.spec_versions,
      decision_count: p._count.decisions,
      updated_at: p.updated_at,
      created_at: p.created_at,
    }));
  }

  async detail(projectId: string, userId: string) {
    const project = await this.assertOwned(projectId, userId);
    const currentVersion = await this.prisma.specVersion.findFirst({
      where: { project_id: projectId },
      orderBy: { version_no: 'desc' },
      include: {
        _count: {
          select: { cards: true, related_work_rows: true, issue_groups: true },
        },
        experiment_plan: true,
        resource_estimate: true,
      },
    });
    const sourceCount = await this.prisma.source.count({
      where: { project_id: projectId },
    });

    return {
      project: {
        id: project.id,
        title: project.title,
        raw_idea: project.raw_idea,
        domain: project.domain,
        step: project.step,
        status: project.status,
        arm: project.arm,
        verifier_gate: project.verifier_gate,
        judge_round: project.judge_round,
        judge_rounds_total: project.judge_rounds_total,
        current_spec_version_id: project.current_spec_version_id,
        created_at: project.created_at,
        updated_at: project.updated_at,
      },
      currentVersion: currentVersion
        ? {
            id: currentVersion.id,
            version_no: currentVersion.version_no,
            status: currentVersion.status,
            label: currentVersion.label,
            meta: (currentVersion.meta as AnalysisMeta | null) ?? null,
            card_count: currentVersion._count.cards,
            related_work_count: currentVersion._count.related_work_rows,
            issue_group_count: currentVersion._count.issue_groups,
            has_experiment_plan: currentVersion.experiment_plan !== null,
            has_estimate: currentVersion.resource_estimate !== null,
          }
        : null,
      source_count: sourceCount,
    };
  }

  async patch(projectId: string, userId: string, input: PatchProjectInput) {
    await this.assertOwned(projectId, userId);
    return this.prisma.project.update({
      where: { id: projectId },
      data: {
        ...(input.title ? { title: input.title } : {}),
        ...(input.raw_idea ? { raw_idea: input.raw_idea } : {}),
        ...(input.step ? { step: input.step } : {}),
      },
    });
  }

  async remove(projectId: string, userId: string): Promise<void> {
    await this.assertOwned(projectId, userId);
    await this.prisma.project.delete({ where: { id: projectId } });
  }

  async versions(projectId: string, userId: string) {
    await this.assertOwned(projectId, userId);
    return this.prisma.specVersion.findMany({
      where: { project_id: projectId },
      orderBy: { version_no: 'desc' },
      select: {
        id: true,
        version_no: true,
        status: true,
        label: true,
        parent_version_id: true,
        created_by_decision_id: true,
        created_at: true,
        _count: {
          select: { cards: true, judge_runs: true, export_artifacts: true },
        },
      },
    });
  }
}

function firstLine(text: string): string {
  const line = text.trim().split(/\r?\n/)[0] ?? text;
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}
