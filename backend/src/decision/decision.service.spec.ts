import { DecisionService, OTHER_OPTION } from './decision.service';

describe('DecisionService', () => {
  const prisma = {
    issueGroup: { findUniqueOrThrow: jest.fn() },
    decision: {
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    project: { update: jest.fn() },
    specVersion: { create: jest.fn(), findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
    specCard: { createMany: jest.fn() },
  };
  const llm = { completeJson: jest.fn() };
  const spec = {
    buildSpecJson: jest.fn(),
    buildMarkdown: jest.fn(),
    renderMarkdown: jest.fn(),
  };
  const service = new DecisionService(
    prisma as never,
    llm as never,
    spec as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('includes OTHER_OPTION in optionsForIssueGroup', async () => {
    prisma.issueGroup.findUniqueOrThrow.mockResolvedValue({
      id: 'ig-1',
      canonical_title: 'Title',
      max_severity: 'HIGH',
      agreement_count: 2,
      judges_completed: 2,
      issues: [],
      spec_version: { id: 'v-1', project_id: 'p-1' },
    });
    spec.buildSpecJson.mockResolvedValue({ title: 'Spec' });
    llm.completeJson.mockResolvedValue({
      data: {
        question: 'Choose option',
        options: [
          { key: 'A', label: 'Option A', explain: 'Exp', example: 'Ex' },
        ],
      },
    });

    const result = await service.optionsForIssueGroup('ig-1');
    expect(result.question).toBe('Choose option');
    expect(result.options).toEqual([
      { key: 'A', label: 'Option A', explain: 'Exp', example: 'Ex' },
      OTHER_OPTION,
    ]);
  });

  it('rejects OTHER option without custom text', async () => {
    await expect(
      service.record('p-1', {
        chosenKey: 'OTHER',
        customText: '   ',
      }),
    ).rejects.toThrow('Chọn "Khác" thì bắt buộc nhập lý do.');
  });

  it('records decision and returns preview for issue group', async () => {
    prisma.decision.create.mockResolvedValue({
      id: 'd-1',
      project_id: 'p-1',
      spec_version_id: 'v-1',
      issue_group_id: 'ig-1',
      chosen_key: 'OTHER',
      custom_text: 'Custom reason',
    });
    prisma.decision.findUniqueOrThrow.mockResolvedValue({
      id: 'd-1',
      project_id: 'p-1',
      spec_version_id: 'v-1',
      issue_group_id: 'ig-1',
      question: 'Question',
      options: [],
      chosen_key: 'OTHER',
      custom_text: 'Custom reason',
      issue_group: {
        canonical_title: 'Group title',
        max_severity: 'HIGH',
        issues: [],
      },
    });
    prisma.specVersion.findUniqueOrThrow.mockResolvedValue({
      id: 'v-1',
      version_no: 1,
      cards: [],
    });
    prisma.decision.findUnique.mockResolvedValue({
      id: 'd-1',
      project_id: 'p-1',
      spec_version_id: 'v-1',
      question: 'Question',
      options: [],
      chosen_key: 'OTHER',
      custom_text: 'Custom reason',
      actor: 'USER',
      applied: false,
      issue_group_id: 'ig-1',
      resulting_spec_version_id: null,
      created_at: new Date(),
    });
    spec.buildSpecJson.mockResolvedValue({ title: 'Spec' });
    spec.buildMarkdown.mockResolvedValue('# Before');
    spec.renderMarkdown.mockResolvedValue('# After');
    llm.completeJson.mockResolvedValue({
      data: {
        changes: [],
        summary: 'Revise summary',
      },
    });
    prisma.decision.update.mockResolvedValue({});

    const result = await service.record('p-1', {
      specVersionId: 'v-1',
      step: 'S5',
      issueGroupId: 'ig-1',
      question: 'Question',
      options: [],
      chosenKey: 'OTHER',
      customText: 'Custom reason',
    });

    expect(prisma.decision.create).toHaveBeenCalled();
    expect(result.preview).toBeDefined();
    expect(result.preview?.summary).toBe('Revise summary');
  });

  it('creates and auto-applies a decision without an issue group', async () => {
    prisma.decision.create.mockResolvedValue({
      id: 'd-2',
      project_id: 'p-1',
      spec_version_id: 'v-1',
      step: 'S1',
      issue_group_id: null,
      chosen_key: 'A',
    });
    prisma.decision.update.mockResolvedValue({});
    prisma.decision.count.mockResolvedValue(0);
    prisma.project.update.mockResolvedValue({});
    prisma.decision.findUnique.mockResolvedValue({
      id: 'd-2',
      project_id: 'p-1',
      spec_version_id: 'v-1',
      step: 'S1',
      question: 'Question',
      options: [{ key: 'A', label: 'Option A', explain: 'Exp', example: 'Ex' }],
      chosen_key: 'A',
      custom_text: null,
      actor: 'USER',
      applied: true,
      issue_group_id: null,
      resulting_spec_version_id: 'v-1',
      created_at: new Date(),
    });

    const result = await service.record('p-1', {
      specVersionId: 'v-1',
      step: 'S1',
      question: 'Question',
      options: [{ key: 'A', label: 'Option A', explain: 'Exp', example: 'Ex' }],
      chosenKey: 'A',
    });

    expect(prisma.decision.update).toHaveBeenCalledWith({
      where: { id: 'd-2' },
      data: {
        applied: true,
        resulting_spec_version_id: 'v-1',
      },
    });
    expect(prisma.project.update).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      data: { step: 'S2' },
    });
    expect(result.preview).toBeNull();
  });
});
