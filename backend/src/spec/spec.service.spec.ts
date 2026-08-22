import { SpecService } from './spec.service';

describe('SpecService', () => {
  const prisma = {
    specVersion: { findFirst: jest.fn(), findUniqueOrThrow: jest.fn() },
    card: { findMany: jest.fn() },
    experimentPlan: { findUnique: jest.fn() },
    resourceEstimate: { findUnique: jest.fn() },
    relatedWorkRow: { findMany: jest.fn() },
    decision: { findMany: jest.fn() },
  };

  const service = new SpecService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('assertVersionOwned throws 404 when version is not owned by user', async () => {
    prisma.specVersion.findFirst.mockResolvedValue(null);
    await expect(
      service.assertVersionOwned('v-1', 'user-2'),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('assertVersionOwned returns version when owned by user', async () => {
    prisma.specVersion.findFirst.mockResolvedValue({
      id: 'v-1',
      project_id: 'p-1',
    });
    await expect(service.assertVersionOwned('v-1', 'user-1')).resolves.toEqual({
      id: 'v-1',
      project_id: 'p-1',
    });
  });

  it('currentVersionOf returns latest version ordered by version_no desc', async () => {
    prisma.specVersion.findFirst.mockResolvedValue({
      id: 'v-2',
      version_no: 2,
    });
    await expect(service.currentVersionOf('p-1')).resolves.toEqual({
      id: 'v-2',
      version_no: 2,
    });
    expect(prisma.specVersion.findFirst).toHaveBeenCalledWith({
      where: { project_id: 'p-1' },
      orderBy: { version_no: 'desc' },
    });
  });

  it('buildSections returns 14 sections with calculated present field', async () => {
    prisma.specVersion.findUniqueOrThrow.mockResolvedValue({
      id: 'v-1',
      project_id: 'p-1',
      title: 'Test Spec',
    });
    prisma.card.findMany.mockResolvedValue([
      {
        id: 'c-1',
        type: 'PROBLEM',
        status: 'UNVERIFIED',
        title: 'Problem 1',
        body: 'Description 1',
        payload: null,
        order_index: 0,
        card_sources: [],
      },
    ]);
    prisma.experimentPlan.findUnique.mockResolvedValue(null);
    prisma.resourceEstimate.findUnique.mockResolvedValue(null);
    prisma.relatedWorkRow.findMany.mockResolvedValue([]);
    prisma.decision.findMany.mockResolvedValue([]);

    const sections = await service.buildSections('v-1');
    expect(sections.length).toBe(14);
    const problemSection = sections.find((s) => s.key === 'problem_statement');
    expect(problemSection?.present).toBe(true);
    const computeSection = sections.find((s) => s.key === 'compute_budget');
    expect(computeSection?.present).toBe(false);
  });

  it('buildMarkdown returns formatted markdown specification string', async () => {
    prisma.specVersion.findUniqueOrThrow.mockResolvedValue({
      id: 'v-1',
      version_no: 1,
      label: 'Draft 1',
      project: { title: 'Multimodal Spec', raw_idea: 'Idea' },
    });
    prisma.card.findMany.mockResolvedValue([]);
    prisma.experimentPlan.findUnique.mockResolvedValue(null);
    prisma.resourceEstimate.findUnique.mockResolvedValue(null);
    prisma.relatedWorkRow.findMany.mockResolvedValue([]);
    prisma.decision.findMany.mockResolvedValue([]);

    const markdown = await service.buildMarkdown('v-1');
    expect(markdown).toContain('# Multimodal Spec');
    expect(markdown).toContain(
      '> Research Specification · version 1 · Draft 1',
    );
  });

  it('buildSpecJson constructs structural digest for judge input', async () => {
    prisma.specVersion.findUniqueOrThrow.mockResolvedValue({
      id: 'v-1',
      version_no: 1,
      project: { title: 'Multimodal Spec', raw_idea: 'Idea', domain: 'AI' },
    });
    prisma.card.findMany.mockResolvedValue([
      {
        id: 'c-1',
        type: 'PROBLEM',
        status: 'UNVERIFIED',
        title: 'Title',
        body: 'Body',
        payload: null,
        card_sources: [],
      },
    ]);
    prisma.experimentPlan.findUnique.mockResolvedValue(null);
    prisma.resourceEstimate.findUnique.mockResolvedValue(null);
    prisma.relatedWorkRow.findMany.mockResolvedValue([]);
    prisma.decision.findMany.mockResolvedValue([]);

    const specJson = await service.buildSpecJson('v-1');
    expect(specJson.title).toBe('Multimodal Spec');
    expect(specJson.domain).toBe('AI');
    expect(specJson.cards).toHaveLength(1);
  });
});
