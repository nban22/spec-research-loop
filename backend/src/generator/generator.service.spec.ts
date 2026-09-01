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
  const experimentPlanUpsert = jest.fn();
  const resourceEstimateUpsert = jest.fn();

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
    experimentPlan: { upsert: experimentPlanUpsert },
    resourceEstimate: { upsert: resourceEstimateUpsert },
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

  /**
   * Kế hoạch thí nghiệm được lưu **trước** khi ước lượng tài nguyên chạy. Nếu bước ước lượng ném
   * lỗi thì job chết sau khi kế hoạch đã vào DB, để lại trạng thái kẹt: có kế hoạch, không có
   * ước lượng, và giao diện không phân biệt được nó với "đang tính".
   *
   * Đã xảy ra thật: 5 job `GENERATE` chết với `INTERNAL_ERROR` đúng tại chuỗi tiến độ
   * "Đang ước lượng tài nguyên…", để lại 3 kế hoạch mồ côi. Nguyên nhân là `estimator_inputs`
   * hỏi số tham số model và mức lượng tử hoá — một RCT y khoa thì không có model nào, nên mô
   * hình buộc phải bịa và cái nó bịa rơi ra ngoài schema.
   */
  describe('experimentPlan · ước lượng tài nguyên', () => {
    const planOutput = (estimatorInputs: unknown) => ({
      data: {
        experiments: [
          { code: 'TN1', title: 'T', bullets: ['b'], linked_claim_title: 'c' },
        ],
        baselines_and_metrics: 'B',
        ablation_plan: 'A',
        risks_and_limitations: 'R',
        estimator_inputs: estimatorInputs,
      },
    });

    const VALID = {
      model_params_b: 7,
      quantization: 'int8',
      candidates: 8,
      rounds: 3,
      eval_samples: 500,
      avg_prompt_tokens: 1200,
      avg_output_tokens: 400,
    };

    beforeEach(() => {
      spec.currentVersionOf.mockResolvedValue({ id: 'v-1' });
      spec.buildSpecJson.mockResolvedValue('{}');
      estimator.estimate.mockReturnValue({
        inputs: VALID,
        vram_gb: 10,
        hours_min: 1,
        hours_max: 2,
        tokens_est: 1000,
        cost_usd: 0.1,
        fits_rtx3090: true,
        downscale_suggestion: null,
      });
    });

    it('tham số hợp lệ thì lưu cả kế hoạch lẫn ước lượng', async () => {
      llm.completeJson.mockResolvedValue(planOutput(VALID));
      await service.experimentPlan('p-1');
      expect(experimentPlanUpsert).toHaveBeenCalled();
      expect(resourceEstimateUpsert).toHaveBeenCalled();
    });

    it('tham số không hợp lệ thì GIỮ kế hoạch, bỏ ước lượng, và KHÔNG ném', async () => {
      // Một RCT y khoa: không có model, không có lượng tử hoá.
      llm.completeJson.mockResolvedValue(
        planOutput({ ...VALID, model_params_b: 0, quantization: 'none' }),
      );

      await expect(service.experimentPlan('p-1')).resolves.toBeUndefined();
      expect(experimentPlanUpsert).toHaveBeenCalled();
      expect(resourceEstimateUpsert).not.toHaveBeenCalled();
    });

    it('thiếu hẳn estimator_inputs cũng không làm chết job', async () => {
      llm.completeJson.mockResolvedValue(planOutput(undefined));
      await expect(service.experimentPlan('p-1')).resolves.toBeUndefined();
      expect(experimentPlanUpsert).toHaveBeenCalled();
      expect(resourceEstimateUpsert).not.toHaveBeenCalled();
    });

    it('báo tiến độ nói rõ vì sao không có ước lượng, không im lặng', async () => {
      llm.completeJson.mockResolvedValue(
        planOutput({ ...VALID, candidates: -1 }),
      );
      const onProgress = jest.fn();
      await service.experimentPlan('p-1', onProgress);

      const last = onProgress.mock.calls.at(-1) as [number, number, string];
      expect(last[0]).toBe(2);
      expect(last[2]).toMatch(/không ước lượng/i);
    });
  });
});
