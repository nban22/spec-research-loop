import { ProjectService, patchProjectSchema } from './project.service';

describe('ProjectService & patchProjectSchema', () => {
  const prisma = {
    project: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    specVersion: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    source: { count: jest.fn() },
  };

  const service = new ProjectService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('patchProjectSchema', () => {
    it('only accepts editable project fields', () => {
      expect(
        patchProjectSchema.safeParse({
          title: 'Tên mới',
          raw_idea: 'Một ý tưởng nghiên cứu đủ dài để hợp lệ.',
        }).success,
      ).toBe(true);
    });

    it('rejects workflow and verification-gate fields from clients', () => {
      expect(patchProjectSchema.safeParse({ step: 'S5' }).success).toBe(false);
      expect(
        patchProjectSchema.safeParse({ verifier_gate: false }).success,
      ).toBe(false);
    });
  });

  describe('ProjectService methods', () => {
    it('assertOwned throws 404 if project is missing or owned by another user', async () => {
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(service.assertOwned('p-1', 'user-2')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('assertOwned returns project when owned', async () => {
      prisma.project.findFirst.mockResolvedValue({
        id: 'p-1',
        user_id: 'user-1',
      });
      await expect(service.assertOwned('p-1', 'user-1')).resolves.toEqual({
        id: 'p-1',
        user_id: 'user-1',
      });
    });

    it('create initializes a project and first spec version', async () => {
      prisma.project.create.mockResolvedValue({ id: 'p-1', title: 'Idea' });
      prisma.specVersion.create.mockResolvedValue({ id: 'v-1' });
      prisma.project.update.mockResolvedValue({
        id: 'p-1',
        current_spec_version_id: 'v-1',
      });

      const result = await service.create('u-1', {
        raw_idea: 'A valid raw idea for research project proposal text.',
      });
      expect(result.current_spec_version_id).toBe('v-1');
      expect(prisma.project.create).toHaveBeenCalled();
      expect(prisma.specVersion.create).toHaveBeenCalled();
    });

    it('list returns formatted project summary for user', async () => {
      prisma.project.findMany.mockResolvedValue([
        {
          id: 'p-1',
          title: 'Project 1',
          raw_idea: 'Idea 1',
          domain: 'NLP',
          step: 'S1',
          status: 'DRAFT',
          arm: 'STANDARD',
          updated_at: new Date(),
          created_at: new Date(),
          _count: { spec_versions: 2, decisions: 1 },
        },
      ]);

      const list = await service.list('u-1');
      expect(list.length).toBe(1);
      expect(list[0].version_count).toBe(2);
      expect(list[0].decision_count).toBe(1);
    });

    it('detail returns project, current version, and source count', async () => {
      prisma.project.findFirst.mockResolvedValue({
        id: 'p-1',
        user_id: 'u-1',
        title: 'Project 1',
        raw_idea: 'Idea',
        domain: 'NLP',
        step: 'S1',
        status: 'DRAFT',
        arm: 'STANDARD',
        verifier_gate: true,
        judge_round: 1,
        current_spec_version_id: 'v-1',
        created_at: new Date(),
        updated_at: new Date(),
      });
      prisma.specVersion.findFirst.mockResolvedValue({
        id: 'v-1',
        version_no: 1,
        status: 'DRAFT',
        label: 'V1',
        meta: null,
        _count: { cards: 5, related_work_rows: 2, issue_groups: 1 },
        experiment_plan: null,
        resource_estimate: null,
      });
      prisma.source.count.mockResolvedValue(3);

      const res = await service.detail('p-1', 'u-1');
      expect(res.project.id).toBe('p-1');
      expect(res.currentVersion?.card_count).toBe(5);
      expect(res.source_count).toBe(3);
    });

    it('patch updates title and raw_idea after checking ownership', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'p-1', user_id: 'u-1' });
      prisma.project.update.mockResolvedValue({
        id: 'p-1',
        title: 'New Title',
      });

      const updated = await service.patch('p-1', 'u-1', { title: 'New Title' });
      expect(updated.title).toBe('New Title');
      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: 'p-1' },
        data: { title: 'New Title' },
      });
    });

    it('versions returns spec version history for project', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'p-1', user_id: 'u-1' });
      prisma.specVersion.findMany.mockResolvedValue([
        {
          id: 'v-2',
          version_no: 2,
          status: 'DRAFT',
          label: 'V2',
          _count: { cards: 3, judge_runs: 1, export_artifacts: 0 },
        },
        {
          id: 'v-1',
          version_no: 1,
          status: 'DRAFT',
          label: 'V1',
          _count: { cards: 2, judge_runs: 0, export_artifacts: 0 },
        },
      ]);

      const versions = await service.versions('p-1', 'u-1');
      expect(versions.length).toBe(2);
      expect(versions[0].version_no).toBe(2);
    });

    it('remove calls delete after verifying ownership', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'p-1', user_id: 'u-1' });
      prisma.project.delete.mockResolvedValue({ id: 'p-1' });

      await service.remove('p-1', 'u-1');
      expect(prisma.project.delete).toHaveBeenCalledWith({
        where: { id: 'p-1' },
      });
    });
  });
});
