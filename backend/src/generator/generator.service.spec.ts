import { GeneratorService } from './generator.service';

describe('GeneratorService', () => {
  const findUniqueOrThrow = jest.fn();
  const update = jest.fn();
  const specVersionFindFirst = jest.fn();
  const specVersionCreate = jest.fn();
  const specVersionUpdate = jest.fn();
  const cardDeleteMany = jest.fn();
  const cardCreateMany = jest.fn();
  const cardCreate = jest.fn().mockResolvedValue({ id: 'c-1' });
  const cardFindMany = jest.fn();
  const relatedWorkRowCreateMany = jest.fn();
  const decisionDeleteMany = jest.fn();
  const decisionCreate = jest.fn();

  const prisma = {
    project: { findUniqueOrThrow, update },
    specVersion: {
      findFirst: specVersionFindFirst,
      create: specVersionCreate,
      update: specVersionUpdate,
    },
    card: {
      create: cardCreate,
      deleteMany: cardDeleteMany,
      createMany: cardCreateMany,
      findMany: cardFindMany,
    },
    relatedWorkRow: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn(),
      createMany: relatedWorkRowCreateMany,
    },
    decision: { deleteMany: decisionDeleteMany, create: decisionCreate },
    $transaction: jest.fn((cb: (tx: unknown) => Promise<unknown>) =>
      cb(prisma),
    ),
  };

  const llm = { completeJson: jest.fn() };
  const sources = { sourcesForPrompt: jest.fn() };
  const spec = { currentVersionOf: jest.fn(), buildSpecJson: jest.fn() };
  const estimator = { estimate: jest.fn() };

  const service = new GeneratorService(
    prisma as never,
    llm as never,
    sources as never,
    spec as never,
    estimator as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('analyze generates cards, clarifies questions, and updates project title', async () => {
    findUniqueOrThrow.mockResolvedValue({
      id: 'p-1',
      raw_idea: 'Detailed research idea text for analysis.',
    });
    specVersionFindFirst.mockResolvedValue({
      id: 'v-1',
      status: 'DRAFT',
    });

    llm.completeJson.mockResolvedValue({
      data: {
        title: 'Project Title',
        domain: 'Computer Vision',
        paraphrase_en: 'Para EN',
        paraphrase_vi: 'Para VI',
        confidence: 'HIGH',
        key_problems: ['P1'],
        topics: ['T1'],
        search_keywords: ['KW1'],
        cards: [
          {
            type: 'PROBLEM',
            status: 'UNVERIFIED',
            title: 'Title',
            body: 'Body',
            payload: null,
          },
        ],
        clarifying_questions: [],
      },
    });

    await service.analyze('p-1');

    expect(llm.completeJson).toHaveBeenCalledWith(
      expect.objectContaining({ promptId: 'generator' }),
    );
    expect(cardCreateMany).toHaveBeenCalled();
  });

  it('relatedWork throws NO_SOURCES_YET if no sources exist', async () => {
    spec.currentVersionOf.mockResolvedValue({ id: 'v-1' });
    sources.sourcesForPrompt.mockResolvedValue([]);

    await expect(service.relatedWork('p-1')).rejects.toMatchObject({
      code: 'NO_SOURCES_YET',
    });
  });

  it('relatedWork succeeds and creates RELATED_WORK cards when sources exist', async () => {
    spec.currentVersionOf.mockResolvedValue({ id: 'v-1' });
    sources.sourcesForPrompt.mockResolvedValue([
      {
        id: 's-1',
        source_id: 's-1',
        title: 'Source Paper 1',
        abstract: 'Abstract 1',
      },
    ]);
    spec.buildSpecJson.mockResolvedValue({ title: 'Spec Title' });
    llm.completeJson.mockResolvedValue({
      data: {
        rows: [
          {
            source_id: 's-1',
            title: 'Related Work 1',
            body: 'Analysis body',
            citation_keys: ['s-1'],
            supported_status: 'SUPPORTED',
          },
        ],
      },
    });

    await service.relatedWork('p-1');
    expect(relatedWorkRowCreateMany).toHaveBeenCalled();
  });

  it('gap generates GAP cards from current spec version', async () => {
    spec.currentVersionOf.mockResolvedValue({ id: 'v-1' });
    sources.sourcesForPrompt.mockResolvedValue([
      { id: 's-1', title: 'Source Paper 1' },
    ]);
    spec.buildSpecJson.mockResolvedValue({ title: 'Spec Title' });
    llm.completeJson.mockResolvedValue({
      data: {
        gaps: [
          {
            title: 'Research Gap 1',
            body: 'Gap description body.',
            addressed_by: 'Proposed approach',
            prior_work: 'Prior work text',
            limitation: 'Limitation text',
            why_it_matters: 'Why it matters text',
            testable_experiment: 'Experiment text',
          },
        ],
      },
    });

    await service.gap('p-1');
    expect(cardCreate).toHaveBeenCalled();
  });
});
