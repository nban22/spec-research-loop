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
    },
    specVersion: { create: jest.fn(), findUnique: jest.fn() },
    specCard: { createMany: jest.fn() },
  };
  const llm = { completeJson: jest.fn() };
  const spec = { buildSpecJson: jest.fn(), renderMarkdown: jest.fn() };
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
    ).rejects.toMatchObject({ code: 'OTHER_REASON_REQUIRED' });
  });

  it('rejects missing required inputs when creating decision without decisionId', async () => {
    await expect(
      service.record('p-1', {
        chosenKey: 'A',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rejects non-existent decisionId when recording', async () => {
    prisma.decision.findFirst.mockResolvedValue(null);
    await expect(
      service.record('p-1', {
        decisionId: 'd-missing',
        chosenKey: 'A',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects unknown decision options', async () => {
    prisma.decision.findFirst.mockResolvedValue({
      id: 'd-1',
      project_id: 'p-1',
      applied: false,
      options: [{ key: 'A', label: 'Option A' }],
    });

    await expect(
      service.record('p-1', {
        decisionId: 'd-1',
        chosenKey: 'INVALID_KEY',
      }),
    ).rejects.toMatchObject({ code: 'DECISION_OPTION_UNKNOWN' });
  });

  it('rejects updating an already applied decision', async () => {
    prisma.decision.findFirst.mockResolvedValue({
      id: 'd-1',
      project_id: 'p-1',
      applied: true,
      resulting_spec_version_id: 'v-2',
    });

    await expect(
      service.record('p-1', {
        decisionId: 'd-1',
        chosenKey: 'A',
      }),
    ).rejects.toMatchObject({ code: 'DECISION_ALREADY_APPLIED' });
  });

  it('creates and auto-applies a decision without an issue group', async () => {
    prisma.decision.create.mockResolvedValue({
      id: 'd-1',
      project_id: 'p-1',
      spec_version_id: 'v-1',
      step: 'S1',
      issue_group_id: null,
      options: [{ key: 'A', label: 'Option A' }],
      chosen_key: 'A',
    });
    prisma.decision.update.mockResolvedValue({ id: 'd-1', applied: true });
    prisma.decision.findUnique.mockResolvedValue({ id: 'd-1', applied: true });

    const result = await service.record('p-1', {
      specVersionId: 'v-1',
      step: 'S1',
      question: 'Question?',
      options: [{ key: 'A', label: 'Option A', explain: 'Exp', example: 'Ex' }],
      chosenKey: 'A',
    });

    expect(result.preview).toBeNull();
    expect(prisma.decision.create).toHaveBeenCalled();
  });

  it('lists pending decisions and retrieves a single decision', async () => {
    prisma.decision.findMany.mockResolvedValue([
      { id: 'd-1', project_id: 'p-1', chosen_key: '' },
    ]);
    prisma.decision.findUniqueOrThrow.mockResolvedValue({
      id: 'd-1',
      question: 'Q?',
      chosen_key: 'A',
    });

    const pending = await service.pending('p-1');
    const item = await service.get('d-1');

    expect(pending).toHaveLength(1);
    expect(item.id).toBe('d-1');
  });
});
