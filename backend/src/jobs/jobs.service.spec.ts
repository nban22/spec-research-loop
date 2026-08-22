import { AppError } from '../common/app-error';
import { JobsService } from './jobs.service';

describe('JobsService', () => {
  const create = jest.fn();
  const findFirst = jest.fn();
  const update = jest.fn();
  const jobEventCreate = jest.fn();
  const jobEventFindMany = jest.fn();

  const prisma = {
    jobRun: { create, findFirst, update },
    jobEvent: { create: jobEventCreate, findMany: jobEventFindMany },
  };

  const service = new JobsService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('rejects a duplicate active job of the same kind for a project', async () => {
      findFirst.mockResolvedValue({ id: 'active-job' });

      await expect(
        service.create('ANALYZE', { projectId: 'project-1' }),
      ).rejects.toMatchObject({
        code: 'JOB_ALREADY_RUNNING',
        details: { jobId: 'active-job' },
      });
      expect(findFirst).toHaveBeenCalledWith({
        where: {
          project_id: 'project-1',
          kind: 'ANALYZE',
          status: { in: ['QUEUED', 'RUNNING'] },
        },
        select: { id: true },
      });
      expect(create).not.toHaveBeenCalled();
    });

    it('creates a job when no matching active job exists', async () => {
      findFirst.mockResolvedValue(null);
      create.mockResolvedValue({ id: 'job-1' });

      await expect(
        service.create('ANALYZE', { projectId: 'project-1' }),
      ).resolves.toBe('job-1');
      expect(create).toHaveBeenCalledTimes(1);
    });
  });

  describe('emit & progress & finish', () => {
    it('emits events with incrementing sequence number', async () => {
      findFirst.mockResolvedValue(null);
      create.mockResolvedValue({ id: 'job-1' });
      jobEventCreate.mockResolvedValue({ id: 'e-1' });

      await service.create('ANALYZE', { projectId: 'p-1' });
      await service.emit('job-1', 'test.event', { foo: 'bar' });

      expect(jobEventCreate).toHaveBeenCalled();
      const mockCall = jobEventCreate.mock.calls[0] as [
        { data: { job_id: string; seq: number; type: string } },
      ];
      expect(mockCall[0].data.job_id).toBe('job-1');
      expect(mockCall[0].data.seq).toBe(1);
      expect(mockCall[0].data.type).toBe('test.event');
    });

    it('progress updates jobRun progress and emits progress event', async () => {
      update.mockResolvedValue({ id: 'job-1' });
      jobEventCreate.mockResolvedValue({ id: 'e-1' });

      await service.progress('job-1', 5, 10, 'Halfway done');

      expect(update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: { progress: { done: 5, total: 10 }, message: 'Halfway done' },
      });
    });

    it('finish sets finished_at and status DONE', async () => {
      update.mockResolvedValue({ id: 'job-1' });
      jobEventCreate.mockResolvedValue({ id: 'e-1' });

      await service.finish('job-1', 'DONE');

      expect(update).toHaveBeenCalled();
      const updateCall = update.mock.calls[0] as [
        { where: { id: string }; data: { status: string; finished_at: Date } },
      ];
      expect(updateCall[0].data.status).toBe('DONE');
      expect(updateCall[0].data.finished_at).toBeInstanceOf(Date);
    });
  });

  describe('runInBackground', () => {
    it('runs background work and finishes with DONE on success', async () => {
      update.mockResolvedValue({ id: 'job-1' });
      jobEventCreate.mockResolvedValue({ id: 'e-1' });

      const work = jest.fn().mockResolvedValue(undefined);
      service.runInBackground('job-1', work);

      await new Promise((r) => setTimeout(r, 10));
      expect(work).toHaveBeenCalled();
      expect(update).toHaveBeenCalled();
      const updateCall = update.mock.calls[0] as [
        { where: { id: string }; data: { status: string; finished_at: Date } },
      ];
      expect(updateCall[0].data.status).toBe('DONE');
      expect(updateCall[0].data.finished_at).toBeInstanceOf(Date);
    });

    it('catches error and finishes with FAILED and error code', async () => {
      update.mockResolvedValue({ id: 'job-1' });
      jobEventCreate.mockResolvedValue({ id: 'e-1' });

      const work = jest
        .fn()
        .mockRejectedValue(AppError.badRequest('INVALID_INPUT', 'Bad data'));
      service.runInBackground('job-1', work);

      await new Promise((r) => setTimeout(r, 10));
      expect(update).toHaveBeenCalled();
      const updateCall = update.mock.calls[0] as [
        { where: { id: string }; data: { status: string; error_code: string } },
      ];
      expect(updateCall[0].data.status).toBe('FAILED');
      expect(updateCall[0].data.error_code).toBe('INVALID_INPUT');
    });
  });

  describe('get & assertOwned & stream', () => {
    it('get returns job detail when owned', async () => {
      findFirst.mockResolvedValue({
        id: 'job-1',
        kind: 'ANALYZE',
        status: 'RUNNING',
      });
      const job = await service.get('job-1', 'user-1');
      expect(job.id).toBe('job-1');
    });

    it('get throws 404 if not found or not owned', async () => {
      findFirst.mockResolvedValue(null);
      await expect(service.get('job-1', 'user-2')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('assertOwned throws 404 if job not found', async () => {
      findFirst.mockResolvedValue(null);
      await expect(
        service.assertOwned('job-1', 'user-2'),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('stream replays past events from lastEventId', (done) => {
      jobEventFindMany.mockResolvedValue([
        { seq: 1, type: 'job.progress', payload: { done: 1, total: 2 } },
      ]);

      const stream$ = service.stream('job-1', 0);
      stream$.subscribe({
        next: (event) => {
          expect(event.id).toBe('1');
          expect(event.type).toBe('job.progress');
          done();
        },
      });
    });
  });
});
