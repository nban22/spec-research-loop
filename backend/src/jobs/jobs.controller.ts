import { Controller, Get, MessageEvent, Param, Req, Sse } from '@nestjs/common';
import type { Request } from 'express';
import { Observable, from } from 'rxjs';
import { concatMap } from 'rxjs/operators';
import { UserId } from '../common/http.decorators';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get(':id')
  async get(@Param('id') id: string, @UserId() userId: string) {
    return { job: await this.jobs.get(id, userId) };
  }

  @Sse(':id/stream')
  stream(
    @Param('id') id: string,
    @UserId() userId: string,
    @Req() req: Request,
  ): Observable<MessageEvent> {
    const header = req.headers['last-event-id'];
    const lastEventId =
      Number(Array.isArray(header) ? header[0] : (header ?? 0)) || 0;
    // Check quyền trước rồi mới mở luồng; `@Sse()` không đi qua pipe body được.
    return from(this.jobs.assertOwned(id, userId)).pipe(
      concatMap(() => this.jobs.stream(id, lastEventId)),
    );
  }
}
