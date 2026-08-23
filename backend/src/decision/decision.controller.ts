import { Body, Controller, Get, Logger, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { AppError } from '../common/app-error';
import { UserId } from '../common/http.decorators';
import { PrismaService } from '../common/prisma.service';
import { ZodBody } from '../common/zod-body.pipe';
import { projectStepSchema } from '../contracts/enums';
import { JobsService } from '../jobs/jobs.service';
import { VerifierService } from '../verifier/verifier.service';
import { DecisionService, GATE_OPTIONS } from './decision.service';

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

const gateDecisionSchema = z.object({
  chosen_key: z.string().min(1),
  custom_text: z.string().nullable().optional(),
});
type GateDecisionInput = z.infer<typeof gateDecisionSchema>;

@Controller()
export class DecisionController {
  private readonly logger = new Logger(DecisionController.name);

  constructor(
    private readonly decisions: DecisionService,
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly verifier: VerifierService,
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

  /**
   * Bốn đường ra của verifier gate — **hằng số, không gọi LLM**, nên là `GET`: khác
   * `/issue-groups/:id/options` (POST vì lời gọi đó tốn tiền và sinh dữ liệu mới).
   */
  @Get('card-sources/:id/gate-options')
  async gateOptions(@Param('id') id: string, @UserId() userId: string) {
    const pair = await this.prisma.cardSource.findFirst({
      where: { id, card: { spec_version: { project: { user_id: userId } } } },
      include: {
        card: { select: { title: true } },
        source: { select: { title: true } },
      },
    });
    if (!pair) throw AppError.notFound('Không tìm thấy cặp khẳng định–nguồn.');
    return {
      question: `Khẳng định “${pair.card.title}” đang trích “${pair.source.title}”, nhưng nguồn đó không chống lưng được nội dung khẳng định. Bạn muốn xử lý thế nào?`,
      options: GATE_OPTIONS,
    };
  }

  @Post('card-sources/:id/gate-decision')
  async gateDecision(
    @Param('id') id: string,
    @UserId() userId: string,
    @Body(new ZodBody(gateDecisionSchema)) body: GateDecisionInput,
  ) {
    const pair = await this.prisma.cardSource.findFirst({
      where: { id, card: { spec_version: { project: { user_id: userId } } } },
      select: {
        card: { select: { spec_version: { select: { project_id: true } } } },
      },
    });
    if (!pair) throw AppError.notFound('Không tìm thấy cặp khẳng định–nguồn.');

    return this.decisions.gateDecision(pair.card.spec_version.project_id, {
      cardSourceId: id,
      chosenKey: body.chosen_key,
      customText: body.custom_text ?? null,
      actor: 'USER',
    });
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

  /**
   * Áp dụng quyết định **rồi chạy lại verifier ngay** trên đúng phần bị đụng — đề Bước 10:
   * *"Sửa spec → Hiển thị phần thay đổi → Chạy lại verifier liên quan → Judge kiểm tra lại"*.
   *
   * Trước đây bước "chạy lại verifier" phải người dùng tự sang bước 5 bấm tay, trong khi hộp
   * thoại xác nhận ở bước 4 lại nói hệ thống tự làm.
   */
  @Post('decisions/:id/apply')
  async apply(@Param('id') id: string, @UserId() userId: string) {
    const decision = await this.prisma.decision.findFirst({
      where: { id, project: { user_id: userId } },
      select: { project_id: true },
    });
    if (!decision) throw AppError.notFound('Không tìm thấy quyết định.');

    const { version, revalidateCardIds } = await this.decisions.apply(
      decision.project_id,
      id,
    );

    return {
      version,
      verifyJobId: await this.startRevalidation(
        decision.project_id,
        version.id,
        revalidateCardIds,
      ),
    };
  }

  /**
   * Mở job VERIFY cho version mới. Luôn chạy, **kể cả khi không thẻ nào bị đụng**: verifier gate
   * là fail-closed theo số `VerifierRun` của version (`ExportService.checkGate`), nên version
   * không có lần chạy nào sẽ bị chặn xuất bản dù nhãn đã được chép sang đầy đủ.
   *
   * Không để lỗi ở đây làm `apply` thất bại — version đã ghi xong và không rollback được;
   * người dùng còn nút "Chạy lại kiểm chứng cứ" ở bước 5.
   */
  private async startRevalidation(
    projectId: string,
    specVersionId: string,
    cardIds: string[],
  ): Promise<string | null> {
    try {
      const jobId = await this.jobs.create('VERIFY', {
        projectId,
        specVersionId,
        total: Math.max(1, cardIds.length),
        message: 'Đang kiểm lại chứng cứ của phần vừa sửa…',
      });
      this.jobs.runInBackground(jobId, async () => {
        await this.verifier.verifySpecVersion(specVersionId, {
          projectId,
          cardIds,
          onProgress: (d, t, m) => this.jobs.progress(jobId, d, t, m),
        });
      });
      return jobId;
    } catch (err) {
      // `JOB_ALREADY_RUNNING` là trường hợp thường gặp nhất (bấm áp dụng hai lần liền).
      this.logger.warn(
        `Không mở được job kiểm lại chứng cứ cho ${specVersionId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }
}
