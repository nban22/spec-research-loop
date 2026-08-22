import { JUDGE_DEFS } from '../contracts/enums';
import { JudgeService } from './judge.service';

describe('JudgeService', () => {
  const prisma = {
    specVersion: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
    judgeRun: { count: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    issueGroup: { create: jest.fn(), findMany: jest.fn() },
    issue: {
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    card: { findMany: jest.fn() },
    project: { update: jest.fn() },
  };

  const llm = { completeJson: jest.fn() };
  const spec = { buildSpecJson: jest.fn() };
  const sources = { sourcesForPrompt: jest.fn() };

  const service = new JudgeService(
    prisma as never,
    llm as never,
    spec as never,
    sources as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws JUDGE_ROUND_LIMIT when round exceeds max allowed', async () => {
    prisma.specVersion.findUniqueOrThrow.mockResolvedValue({
      id: 'v-1',
      project: { judge_round: 3 },
    });

    await expect(service.runRound('v-1')).rejects.toMatchObject({
      code: 'JUDGE_ROUND_LIMIT',
    });
  });

  it('throws JUDGE_ROUND_EXISTS when round runs already exist', async () => {
    prisma.specVersion.findUniqueOrThrow.mockResolvedValue({
      id: 'v-1',
      project: { judge_round: 0 },
    });
    prisma.judgeRun.count.mockResolvedValue(1);

    await expect(service.runRound('v-1')).rejects.toMatchObject({
      code: 'JUDGE_ROUND_EXISTS',
    });
  });

  it('executes 5 independent judge calls and aggregates results', async () => {
    prisma.specVersion.findUniqueOrThrow.mockResolvedValue({
      id: 'v-1',
      project_id: 'p-1',
      project: { judge_round: 0 },
    });
    prisma.judgeRun.count.mockResolvedValue(0);
    spec.buildSpecJson.mockResolvedValue({ title: 'Spec' });
    sources.sourcesForPrompt.mockResolvedValue([]);
    prisma.card.findMany.mockResolvedValue([]);
    prisma.issue.findMany.mockResolvedValue([]);
    prisma.issue.createMany.mockResolvedValue({ count: 1 });

    llm.completeJson.mockResolvedValue({
      promptHash: 'phash',
      attempts: 1,
      data: {
        issues: [
          {
            title: 'Gap Issue',
            severity: 'HIGH',
            reason: 'Reason text',
            suggestion: 'Suggestion text',
          },
        ],
      },
    });

    prisma.judgeRun.create.mockResolvedValue({ id: 'jr-1' });
    prisma.issueGroup.create.mockResolvedValue({ id: 'ig-1' });

    const result = await service.runRound('v-1');

    expect(result.round).toBe(1);
    expect(result.completed.length).toBe(JUDGE_DEFS.length);
    expect(prisma.judgeRun.create).toHaveBeenCalledTimes(JUDGE_DEFS.length);
  });

  it('listIssueGroups returns sorted issue groups with child issues', async () => {
    prisma.issueGroup.findMany.mockResolvedValue([
      {
        id: 'ig-1',
        round: 1,
        canonical_title: 'Title',
        max_severity: 'CRITICAL',
        judge_keys: ['gap_finder'],
        agreement_count: 1,
        judges_completed: 5,
        disagreement_score: 0.8,
        status: 'OPEN',
        issues: [
          {
            id: 'i-1',
            severity: 'CRITICAL',
            title: 'Title',
            reason: 'Reason',
            suggestion: 'Sugg',
            target_card_id: null,
            judge_run: { judge_key: 'gap_finder' },
          },
        ],
      },
    ]);

    const groups = await service.listIssueGroups('v-1');
    expect(groups).toHaveLength(1);
    expect(groups[0].max_severity).toBe('CRITICAL');
  });

  it('listJudgeRuns returns audit runs list', async () => {
    prisma.judgeRun.findMany.mockResolvedValue([
      {
        id: 'jr-1',
        judge_key: 'gap_finder',
        round: 1,
        model: 'deepseek-v4-pro',
        prompt_id: 'judge_gap',
        prompt_hash: 'phash',
        input_digest: 'digest',
        raw_output: {},
        parse_attempts: 1,
        status: 'DONE',
        error_code: null,
        started_at: new Date(),
        finished_at: new Date(),
      },
    ]);

    const runs = await service.listJudgeRuns('v-1');
    expect(runs).toHaveLength(1);
    expect(runs[0].judge_key).toBe('gap_finder');
  });
});
