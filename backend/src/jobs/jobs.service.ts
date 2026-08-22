import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import { EMPTY, Observable, Subject, concat, from } from 'rxjs';
import { concatMap, filter, map } from 'rxjs/operators';
import { AppError } from '../common/app-error';
import { json } from '../common/prisma-json';
import { PrismaService } from '../common/prisma.service';
import type { JobKind, JobStatus } from '../generated/prisma/enums';

export type JobEventPayload = Record<string, unknown>;

type LiveEvent = { seq: number; type: string; payload: JobEventPayload };

/**
 * `JobRun` + SSE. Nguyên tắc nền: **SSE là đường tăng tốc, không phải nguồn sự thật**
 * (SYSTEM_DESIGN_ANALYSIS S5 · F.8). Mọi sự kiện được ghi xuống `JobEvent` với `seq` tăng dần,
 * nên `Last-Event-ID` phát lại được và `GET /jobs/:id` luôn trả được trạng thái cuối.
 */
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private readonly channels = new Map<string, Subject<LiveEvent>>();
  private readonly seqCounters = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  async create(
    kind: JobKind,
    opts: {
      projectId?: string | null;
      specVersionId?: string | null;
      total?: number;
      message?: string;
    } = {},
  ): Promise<string> {
    if (opts.projectId) {
      const active = await this.prisma.jobRun.findFirst({
        where: {
          project_id: opts.projectId,
          kind,
          status: { in: ['QUEUED', 'RUNNING'] },
        },
        select: { id: true },
      });
      if (active) {
        throw AppError.conflict(
          'JOB_ALREADY_RUNNING',
          'Một tiến trình cùng loại đang chạy cho dự án này.',
          { jobId: active.id },
        );
      }
    }
    const job = await this.prisma.jobRun.create({
      data: {
        kind,
        project_id: opts.projectId ?? null,
        spec_version_id: opts.specVersionId ?? null,
        status: 'RUNNING',
        progress: { done: 0, total: opts.total ?? 1 },
        message: opts.message ?? null,
      },
      select: { id: true },
    });
    this.seqCounters.set(job.id, 0);
    this.channels.set(job.id, new Subject<LiveEvent>());
    return job.id;
  }

  async emit(
    jobId: string,
    type: string,
    payload: JobEventPayload = {},
  ): Promise<void> {
    const seq = (this.seqCounters.get(jobId) ?? 0) + 1;
    this.seqCounters.set(jobId, seq);
    try {
      await this.prisma.jobEvent.create({
        data: { job_id: jobId, seq, type, payload: json(payload) },
      });
    } catch (err) {
      this.logger.error(
        `Không ghi được JobEvent ${jobId}#${seq}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    this.channels.get(jobId)?.next({ seq, type, payload });
  }

  async progress(
    jobId: string,
    done: number,
    total: number,
    message?: string,
  ): Promise<void> {
    await this.prisma.jobRun.update({
      where: { id: jobId },
      data: { progress: { done, total }, message: message ?? undefined },
    });
    await this.emit(jobId, 'job.progress', {
      done,
      total,
      message: message ?? null,
    });
  }

  async finish(
    jobId: string,
    status: JobStatus,
    errorCode?: string | null,
  ): Promise<void> {
    await this.prisma.jobRun.update({
      where: { id: jobId },
      data: { status, error_code: errorCode ?? null, finished_at: new Date() },
    });
    await this.emit(jobId, status === 'DONE' ? 'job.done' : 'job.failed', {
      error_code: errorCode ?? null,
    });
    // Đóng kênh sau một nhịp để client đang nối kịp nhận sự kiện cuối.
    setTimeout(() => {
      this.channels.get(jobId)?.complete();
      this.channels.delete(jobId);
      this.seqCounters.delete(jobId);
    }, 2_000).unref?.();
  }

  /**
   * Chạy job ở nền. Không có endpoint huỷ job: job dài nhất ~90 giây, thêm cơ chế huỷ là
   * thêm một trạng thái phải xử (C3 · F.4).
   */
  runInBackground(jobId: string, work: () => Promise<void>): void {
    void (async () => {
      try {
        await work();
        await this.finish(jobId, 'DONE');
      } catch (err) {
        const code =
          err instanceof AppError ? err.code : ('INTERNAL_ERROR' as const);
        this.logger.error(
          `Job ${jobId} thất bại: ${err instanceof Error ? err.message : String(err)}`,
          err instanceof Error ? err.stack : undefined,
        );
        await this.finish(jobId, 'FAILED', code);
      }
    })();
  }

  async get(jobId: string, userId: string) {
    const job = await this.prisma.jobRun.findFirst({
      where: { id: jobId, project: { user_id: userId } },
      select: {
        id: true,
        kind: true,
        status: true,
        progress: true,
        message: true,
        error_code: true,
        created_at: true,
        finished_at: true,
        project_id: true,
        spec_version_id: true,
      },
    });
    if (!job) throw AppError.notFound('Không tìm thấy tiến trình.');
    return job;
  }

  /** Phát lại từ `Last-Event-ID` rồi nối vào luồng trực tiếp. */
  stream(jobId: string, lastEventId: number): Observable<MessageEvent> {
    const replay = from(
      this.prisma.jobEvent.findMany({
        where: { job_id: jobId, seq: { gt: lastEventId } },
        orderBy: { seq: 'asc' },
      }),
    ).pipe(
      concatMap((rows) =>
        from(
          rows.map((r): LiveEvent => ({
            seq: r.seq,
            type: r.type,
            payload: r.payload as JobEventPayload,
          })),
        ),
      ),
    );

    const channel = this.channels.get(jobId);
    const live: Observable<LiveEvent> = channel
      ? channel.pipe(filter((e) => e.seq > lastEventId))
      : EMPTY;

    return concat(replay, live).pipe(
      map((e): MessageEvent => ({
        id: String(e.seq),
        type: e.type,
        data: JSON.stringify(e.payload),
      })),
    );
  }

  /** Ownership check tách riêng, vì `@Sse()` không đi qua pipe body. */
  async assertOwned(jobId: string, userId: string): Promise<void> {
    const found = await this.prisma.jobRun.findFirst({
      where: { id: jobId, project: { user_id: userId } },
      select: { id: true },
    });
    if (!found) throw AppError.notFound('Không tìm thấy tiến trình.');
  }
}
