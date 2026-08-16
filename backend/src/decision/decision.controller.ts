import { Body, Controller, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { AppError } from '../common/app-error';
import { UserId } from '../common/http.decorators';
import { PrismaService } from '../common/prisma.service';
import { ZodBody } from '../common/zod-body.pipe';
import { projectStepSchema } from '../contracts/enums';
import { DecisionService } from './decision.service';

const optionSchema = z.object({
  key: z.string(),
  label: z.string(),
  explain: z.string().default(''),
  example: z.string().default(''),
  recommended: z.boolean().optional(),
});

const decisionSchema = z
  .object({
    project_id: z.string().min(1),
    decision_id: z.string().optional(),
    spec_version_id: z.string().optional(),
    step: projectStepSchema.optional(),
    issue_group_id: z.string().nullable().optional(),
    question: z.string().optional(),
    options: z.array(optionSchema).optional(),
    chosen_key: z.string().min(1),
    custom_text: z.string().nullable().optional(),
  })
  .refine(
    (v) =>
      v.decision_id || (v.spec_version_id && v.step && v.question && v.options),
    {
      message:
        'Cần `decision_id`, hoặc đủ `spec_version_id` + `step` + `question` + `options`.',
    },
  );
type DecisionInput = z.infer<typeof decisionSchema>;

@Controller()
export class DecisionController {
  constructor(
    private readonly decisions: DecisionService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Trả **thẳng** `options[]`, không mở job — một lời gọi ~10s và người dùng đang đứng chờ
   * (SYSTEM_DESIGN_ANALYSIS §4.4 #1). Quy ước "gọi LLM thì trả jobId" có ba ngoại lệ:
   * `/estimate`, `/decisions` và `/options`.
   */
  @Post('issue-groups/:id/options')
  async options(@Param('id') id: string, @UserId() userId: string) {
    const owned = await this.prisma.issueGroup.findFirst({
      where: { id, spec_version: { project: { user_id: userId } } },
      select: { id: true },
    });
    if (!owned) throw AppError.notFound('Không tìm thấy nhóm vấn đề.');
    return this.decisions.optionsForIssueGroup(id);
  }

  @Post('decisions')
  async record(
    @UserId() userId: string,
    @Body(new ZodBody(decisionSchema)) body: DecisionInput,
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: body.project_id, user_id: userId },
      select: { id: true },
    });
    if (!project) throw AppError.notFound('Không tìm thấy dự án.');

    return this.decisions.record(project.id, {
      decisionId: body.decision_id,
      specVersionId: body.spec_version_id,
      step: body.step,
      issueGroupId: body.issue_group_id ?? null,
      question: body.question,
      options: body.options,
      chosenKey: body.chosen_key,
      customText: body.custom_text ?? null,
      actor: 'USER',
    });
  }

  @Post('decisions/:id/apply')
  async apply(@Param('id') id: string, @UserId() userId: string) {
    const decision = await this.prisma.decision.findFirst({
      where: { id, project: { user_id: userId } },
      select: { project_id: true },
    });
    if (!decision) throw AppError.notFound('Không tìm thấy quyết định.');
    const version = await this.decisions.apply(decision.project_id, id);
    return { version };
  }
}
