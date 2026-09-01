import { experimentOutputSchema } from '../contracts/llm-io/generator';
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
   * Kế hoạch thí nghiệm và ước lượng tài nguyên sinh ra cùng một lượt, nhưng **không phải kế
   * hoạch nào cũng có ước lượng**: `estimator_inputs` hỏi số tham số model và mức lượng tử hoá,
   * mà một thử nghiệm lâm sàng hay khảo sát người dùng thì không có model nào.
   *
   * Ba trạng thái phải **ghi xuống** `plan.estimate_status`, không để giao diện suy ra từ việc
   * `ResourceEstimate` vắng mặt — sự vắng mặt gộp bốn ca cần bốn câu nói khác nhau.
   *
   * Test ở đây đi qua **`experimentOutputSchema` thật**, không mock thẳng `completeJson` trả
   * `{ data }`. Bỏ qua schema là khoá một hành vi không tồn tại trong production: dữ liệu hỏng
   * ở tầng ngoài thì `LlmService` thử lại ba lượt rồi ném, không bao giờ chạm tới nhánh này.
   */
  describe('experimentPlan · trạng thái ước lượng', () => {
    const VALID_INPUTS = {
      model_params_b: 7,
      quantization: 'int8' as const,
      candidates: 8,
      rounds: 3,
      eval_samples: 500,
      avg_prompt_tokens: 1200,
      avg_output_tokens: 400,
    };

    const rawPlan = (over: Record<string, unknown>) => ({
      experiments: [
        { code: 'TN1', title: 'T', bullets: ['b'], linked_claim_title: 'c' },
      ],
      baselines_and_metrics: 'B',
      ablation_plan: 'A',
      risks_and_limitations: 'R',
      ...over,
    });

    /** Chạy JSON thô qua đúng schema mà production dùng, rồi mới đưa cho service. */
    const throughSchema = (raw: unknown) => {
      const parsed = experimentOutputSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(
          `schema từ chối: ${parsed.error.issues
            .map((i) => i.path.join('.'))
            .join(',')}`,
        );
      }
      llm.completeJson.mockResolvedValue({ data: parsed.data });
    };

    type SavedPlan = { estimate_status?: string; estimate_note?: string };
    const savedBlob = (): SavedPlan => {
      const calls = experimentPlanUpsert.mock.calls as unknown[][];
      const arg = calls[0][0] as { create: { plan: SavedPlan } };
      return arg.create.plan;
    };

    beforeEach(() => {
      spec.currentVersionOf.mockResolvedValue({ id: 'v-1' });
      spec.buildSpecJson.mockResolvedValue('{}');
      estimator.estimate.mockReturnValue({
        inputs: VALID_INPUTS,
        vram_gb: 10,
        hours_min: 1,
        hours_max: 2,
        tokens_est: 1000,
        cost_usd: 0.1,
        fits_rtx3090: true,
        downscale_suggestion: null,
      });
    });

    it('tham số hợp lệ ⇒ status OK, lưu cả kế hoạch lẫn ước lượng', async () => {
      throughSchema(rawPlan({ estimator_inputs: VALID_INPUTS }));
      await service.experimentPlan('p-1');

      expect(savedBlob().estimate_status).toBe('OK');
      expect(resourceEstimateUpsert).toHaveBeenCalled();
    });

    it('mô hình trả null ⇒ NOT_APPLICABLE, giữ nguyên câu giải thích của nó', async () => {
      throughSchema(
        rawPlan({
          estimator_inputs: null,
          estimator_note:
            'Nút thắt là tuyển người tham gia, không phải tính toán.',
        }),
      );
      await service.experimentPlan('p-1');

      expect(savedBlob().estimate_status).toBe('NOT_APPLICABLE');
      expect(savedBlob().estimate_note).toMatch(/tuyển người tham gia/);
      expect(resourceEstimateUpsert).not.toHaveBeenCalled();
    });

    it('null thì báo tiến độ nói "không chạy trên mô hình", KHÔNG nói tham số hỏng', async () => {
      throughSchema(rawPlan({ estimator_inputs: null }));
      const onProgress = jest.fn();
      await service.experimentPlan('p-1', onProgress);

      const last = onProgress.mock.calls.at(-1) as [number, number, string];
      expect(last[0]).toBe(2);
      expect(last[2]).toMatch(/does not run on any model/i);
      expect(last[2]).not.toMatch(/not valid/i);
    });

    /**
     * `model_params_b: 0` là **ca thật đã xảy ra** — mô hình trả 0 cho một RCT y khoa. Trước khi
     * dồn về một schema chung, giá trị này lọt schema ngoài (`z.number()`) rồi chết ở schema
     * trong (`.positive()`), sau khi kế hoạch đã lưu. Giờ schema ngoài từ chối ngay.
     */
    it('mô hình trả 0 thay vì null ⇒ schema output từ chối ngay, không lọt vào trong', () => {
      expect(() =>
        throughSchema(
          rawPlan({ estimator_inputs: { ...VALID_INPUTS, model_params_b: 0 } }),
        ),
      ).toThrow(/estimator_inputs\.model_params_b/);
    });

    /**
     * Lưới cuối: schema ngoài và trong giờ là **một**, nên nhánh `INVALID_PARAMS` về lý thuyết
     * không xảy ra. Giữ nó vì "về lý thuyết" không phải một bảo đảm, và cái giá của việc sai ở
     * đây là mất cả kế hoạch thí nghiệm. Test này cố ý gọi thẳng, bỏ qua schema.
     */
    it('lưới cuối: tham số lọt vào trong mà vẫn hỏng ⇒ INVALID_PARAMS, không ném', async () => {
      llm.completeJson.mockResolvedValue({
        data: rawPlan({
          estimator_inputs: { ...VALID_INPUTS, candidates: -1 },
          estimator_note: '',
        }),
      });

      await expect(service.experimentPlan('p-1')).resolves.toBeUndefined();
      expect(savedBlob().estimate_status).toBe('INVALID_PARAMS');
      expect(experimentPlanUpsert).toHaveBeenCalled();
      expect(resourceEstimateUpsert).not.toHaveBeenCalled();
    });

    it('INVALID_PARAMS thì mời tự nhập, không nói "không chạy trên mô hình"', async () => {
      llm.completeJson.mockResolvedValue({
        data: rawPlan({
          estimator_inputs: { ...VALID_INPUTS, candidates: -1 },
          estimator_note: '',
        }),
      });
      const onProgress = jest.fn();
      await service.experimentPlan('p-1', onProgress);

      const last = onProgress.mock.calls.at(-1) as [number, number, string];
      expect(last[2]).toMatch(/enter them yourself/i);
      expect(last[2]).not.toMatch(/does not run on any model/i);
    });

    it('kế hoạch được ghi ĐÚNG MỘT LẦN, đã kèm trạng thái', async () => {
      throughSchema(rawPlan({ estimator_inputs: null }));
      await service.experimentPlan('p-1');

      // Ghi hai lần nghĩa là có một cửa sổ DB đã có kế hoạch mà chưa có trạng thái.
      expect(experimentPlanUpsert).toHaveBeenCalledTimes(1);
      expect(savedBlob().estimate_status).toBeDefined();
    });
  });
});
